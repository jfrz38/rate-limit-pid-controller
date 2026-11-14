import 'reflect-metadata';

import {
  Controller,
  Get,
  Header,
  HttpCode,
  Module,
  Param,
  StreamableFile,
  type INestApplication,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { request as httpRequest } from 'node:http';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, test } from 'vitest';

import { PidControllerModule } from '../../src/module/pid-controller.module';

let scenario = createScenario();

@Controller()
class CharacterizationController {
  @Get('resource')
  @HttpCode(201)
  @Header('x-controller', 'characterization')
  resource() {
    return { admitted: true };
  }

  @Get('failure')
  failure() {
    throw new Error('application failed');
  }

  @Get('health')
  health() {
    return { status: 'up' };
  }

  @Get('limited')
  limited() {
    return { admitted: true };
  }

  @Get('hold')
  async hold() {
    scenario.started.resolve();
    await scenario.release.promise;
    return { held: true };
  }

  @Get('queued/:name')
  queued(@Param('name') name: string) {
    scenario.order.push(name);
    return { name };
  }

  @Get('stream')
  stream() {
    scenario.started.resolve();
    return new StreamableFile(scenario.stream, { type: 'text/plain' });
  }
}

const platforms = [
  { name: 'Express', adapter: undefined },
  { name: 'Fastify', adapter: () => new FastifyAdapter() },
] as const;

describe.each(platforms)('NestJS adapter on $name', ({ adapter }) => {
  const applications: INestApplication[] = [];

  afterEach(async () => {
    await Promise.all(applications.splice(0).map((application) => application.close()));
    scenario.stream.destroy();
    scenario = createScenario();
  });

  test('preserves an admitted response from a real Nest application', async () => {
    const url = await startApplication(PidControllerModule.forRoot({}), applications, adapter);

    const response = await fetch(`${url}/resource`);

    expect(response.status).toBe(201);
    expect(response.headers.get('x-controller')).toBe('characterization');
    await expect(response.json()).resolves.toEqual({ admitted: true });
  });

  test('maps an admission rejection without executing the controller route', async () => {
    const url = await startApplication(PidControllerModule.forRoot({
      pid: {
        config: { initialThreshold: 1 },
        priority: { getPriority: () => 1 },
      },
    }), applications, adapter);

    const response = await fetch(`${url}/limited`);

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({
      error: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests, please try again later.',
    });
  });

  test('applies custom status, body, and Retry-After to admission errors', async () => {
    const url = await startApplication(PidControllerModule.forRoot({
      pid: { config: { initialThreshold: 1 } },
      http: {
        error: {
          code: 529,
          retryAfter: 3,
          response: { unavailable: true },
        },
      },
    }), applications, adapter);

    const response = await fetch(`${url}/limited`);

    expect(response.status).toBe(529);
    expect(response.headers.get('retry-after')).toBe('3');
    await expect(response.json()).resolves.toEqual({ unavailable: true });
  });

  test('does not convert an application failure into an admission error', async () => {
    const url = await startApplication(PidControllerModule.forRoot({}), applications, adapter);

    const response = await fetch(`${url}/failure`);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      statusCode: 500,
      message: 'Internal server error',
    });
  });

  test('keeps an excluded route outside admission control', async () => {
    const url = await startApplication(PidControllerModule.forRoot({
      pid: {
        config: { initialThreshold: 1 },
        priority: { getPriority: () => 1 },
      },
      routes: { excludeRoutes: ['health'] },
    }), applications, adapter);

    const health = await fetch(`${url}/health`);
    const limited = await fetch(`${url}/limited`);

    expect(health.status).toBe(200);
    await expect(health.json()).resolves.toEqual({ status: 'up' });
    expect(limited.status).toBe(429);
  });

  test('keeps a second request queued until the first response finishes', async () => {
    const url = await startApplication(PidControllerModule.forRoot(slowControllerOptions()), applications, adapter);

    const first = fetch(`${url}/hold`);
    await scenario.started.promise;
    const second = fetch(`${url}/queued/second`);

    await expect(settlesWithin(second, 50)).resolves.toBe(false);
    expect(scenario.order).toEqual([]);

    scenario.release.resolve();
    await expect(first.then((response) => response.json())).resolves.toEqual({ held: true });
    await expect(second.then((response) => response.json())).resolves.toEqual({ name: 'second' });
  });

  test('serves queued requests by priority', async () => {
    const options = slowControllerOptions();
    options.pid.priority = {
      getPriority: (request) => request.headers['x-priority'] as string,
    };
    const url = await startApplication(PidControllerModule.forRoot(options), applications, adapter);

    const first = fetch(`${url}/hold`);
    await scenario.started.promise;
    const low = fetch(`${url}/queued/low`, { headers: { 'x-priority': '5' } });
    const high = fetch(`${url}/queued/high`, { headers: { 'x-priority': '0' } });
    await new Promise((resolve) => setTimeout(resolve, 20));
    scenario.release.resolve();

    await Promise.all([first, low, high]);
    expect(scenario.order).toEqual(['high', 'low']);
  });

  test('returns 503 when the admission queue is full', async () => {
    const options = slowControllerOptions();
    options.pid.config.maxQueuedRequests = 1;
    const url = await startApplication(PidControllerModule.forRoot(options), applications, adapter);

    const first = fetch(`${url}/hold`);
    await scenario.started.promise;
    const queued = fetch(`${url}/queued/queued`);
    await new Promise((resolve) => setTimeout(resolve, 20));
    const overflow = await fetch(`${url}/queued/overflow`);

    expect(overflow.status).toBe(503);
    await expect(overflow.json()).resolves.toMatchObject({ error: 'ADMISSION_QUEUE_FULL' });
    scenario.release.resolve();
    await Promise.all([first, queued]);
  });

  test('returns 503 when a queued request reaches its deadline', async () => {
    const options = slowControllerOptions();
    options.pid.config.queueTimeoutMs = 20;
    const url = await startApplication(PidControllerModule.forRoot(options), applications, adapter);

    const first = fetch(`${url}/hold`);
    await scenario.started.promise;
    const evicted = await fetch(`${url}/queued/evicted`);

    expect(evicted.status).toBe(503);
    await expect(evicted.json()).resolves.toMatchObject({ error: 'REQUEST_EVICTED' });
    scenario.release.resolve();
    await first;
  });

  test('cancels a queued request when its client disconnects', async () => {
    const url = await startApplication(PidControllerModule.forRoot(slowControllerOptions()), applications, adapter);
    const first = fetch(`${url}/hold`);
    await scenario.started.promise;

    const queuedRequest = httpRequest(`${url}/queued/disconnected`);
    queuedRequest.on('error', () => undefined);
    queuedRequest.end();
    await new Promise((resolve) => setTimeout(resolve, 20));
    queuedRequest.destroy();
    await new Promise<void>((resolve) => queuedRequest.once('close', resolve));

    scenario.release.resolve();
    await first;
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(scenario.order).toEqual([]);
  });

  test('holds the permit until a streaming response finishes', async () => {
    const url = await startApplication(PidControllerModule.forRoot(slowControllerOptions()), applications, adapter);

    const first = fetch(`${url}/stream`);
    await scenario.started.promise;
    scenario.stream.write('first');
    const second = fetch(`${url}/queued/second`);

    await expect(settlesWithin(second, 50)).resolves.toBe(false);
    expect(scenario.order).toEqual([]);

    scenario.stream.end('last');
    await expect(first.then((response) => response.text())).resolves.toBe('firstlast');
    await expect(second.then((response) => response.json())).resolves.toEqual({ name: 'second' });
  });
});

async function startApplication(
  pidControllerModule: ReturnType<typeof PidControllerModule.forRoot>,
  applications: INestApplication[],
  adapter?: () => FastifyAdapter,
): Promise<string> {
  @Module({
    imports: [pidControllerModule],
    controllers: [CharacterizationController],
  })
  class CharacterizationModule {}

  const application = adapter
    ? await NestFactory.create(CharacterizationModule, adapter(), { logger: false })
    : await NestFactory.create(CharacterizationModule, { logger: false });
  applications.push(application);
  await application.listen(0, '127.0.0.1');
  return application.getUrl();
}

function slowControllerOptions() {
  return {
    pid: {
      config: {
        maxConcurrentRequests: 1,
        queueTimeoutMs: 10_000,
        pid: { intervalMs: 10_000 },
        statistics: { minWindowMs: 10_000, maxWindowMs: 20_000 },
      },
      priority: undefined as { getPriority: (request: any) => number | string | undefined } | undefined,
    },
  };
}

async function settlesWithin(promise: Promise<unknown>, milliseconds: number): Promise<boolean> {
  return Promise.race([
    promise.then(() => true),
    new Promise<false>((resolve) => setTimeout(() => resolve(false), milliseconds)),
  ]);
}

function createScenario() {
  return {
    started: deferred<void>(),
    release: deferred<void>(),
    order: [] as string[],
    stream: new PassThrough(),
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
