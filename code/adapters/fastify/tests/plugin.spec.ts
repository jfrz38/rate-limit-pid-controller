import { request as httpRequest } from 'node:http';
import { PassThrough } from 'node:stream';

import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { pidControllerPlugin } from '../src';

describe('pidControllerPlugin', () => {
  const applications = new Set<FastifyInstance>();

  afterEach(async () => {
    await Promise.all([...applications].map(async (application) => {
      applications.delete(application);
      await application.close();
    }));
  });

  test('protects routes registered after the plugin in the current scope', async () => {
    const application = createApplication();
    await application.register(pidControllerPlugin, slowControllerOptions());
    application.get('/', () => ({ admitted: true }));

    const response = await application.inject({ method: 'GET', url: '/' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ admitted: true });
  });

  test('rejects by threshold with 429 without running the route handler', async () => {
    const application = createApplication();
    await application.register(pidControllerPlugin, {
      pid: { config: { initialThreshold: 1 } },
    });
    const handler = vi.fn(() => ({ admitted: true }));
    application.get('/', handler);

    const response = await application.inject({ method: 'GET', url: '/' });

    expect(response.statusCode).toBe(429);
    expect(response.json()).toMatchObject({ error: 'RATE_LIMIT_EXCEEDED' });
    expect(handler).not.toHaveBeenCalled();
  });

  test('applies custom status, body, and Retry-After to admission errors', async () => {
    const application = createApplication();
    await application.register(pidControllerPlugin, {
      pid: { config: { initialThreshold: 1 } },
      http: {
        error: {
          code: 529,
          retryAfter: 3,
          response: { unavailable: true },
        },
      },
    });
    application.get('/', () => ({ admitted: true }));

    const response = await application.inject({ method: 'GET', url: '/' });

    expect(response.statusCode).toBe(529);
    expect(response.headers['retry-after']).toBe('3');
    expect(response.json()).toEqual({ unavailable: true });
  });

  test('preserves the consumer error handler and its rendered response', async () => {
    const application = createApplication();
    application.setErrorHandler((error, _request, reply) => {
      void reply.code(418).send({ applicationError: error.message });
    });
    await application.register(pidControllerPlugin, slowControllerOptions());
    application.get('/', () => {
      throw new Error('route failed');
    });

    const response = await application.inject({ method: 'GET', url: '/' });

    expect(response.statusCode).toBe(418);
    expect(response.json()).toEqual({ applicationError: 'route failed' });
  });

  test('keeps a second request queued until the first response finishes', async () => {
    const application = createApplication();
    await application.register(pidControllerPlugin, slowControllerOptions());
    const firstStarted = deferred<void>();
    const releaseFirst = deferred<void>();
    const secondHandler = vi.fn(() => ({ request: 'second' }));
    application.get('/first', async () => {
      firstStarted.resolve();
      await releaseFirst.promise;
      return { request: 'first' };
    });
    application.get('/second', secondHandler);
    await listen(application);

    const firstResponse = fetch(`${application.listeningOrigin}/first`);
    await firstStarted.promise;
    const secondResponse = fetch(`${application.listeningOrigin}/second`);

    await expect(settlesWithin(secondResponse, 50)).resolves.toBe(false);
    expect(secondHandler).not.toHaveBeenCalled();

    releaseFirst.resolve();
    await expect(firstResponse.then((response) => response.json())).resolves.toEqual({ request: 'first' });
    await expect(secondResponse.then((response) => response.json())).resolves.toEqual({ request: 'second' });
  });

  test('serves queued requests by priority', async () => {
    const application = createApplication();
    await application.register(pidControllerPlugin, {
      ...slowControllerOptions(),
      pid: {
        ...slowControllerOptions().pid,
        priority: { getPriority: (request) => request.headers['x-priority'] as string },
      },
    });
    const firstStarted = deferred<void>();
    const releaseFirst = deferred<void>();
    const order: string[] = [];
    application.get('/first', async () => {
      firstStarted.resolve();
      await releaseFirst.promise;
      return { request: 'first' };
    });
    application.get('/queued/:name', (request) => {
      const { name } = request.params as { name: string };
      order.push(name);
      return { name };
    });
    await listen(application);

    const firstResponse = fetch(`${application.listeningOrigin}/first`, {
      headers: { 'x-priority': '0' },
    });
    await firstStarted.promise;
    const low = fetch(`${application.listeningOrigin}/queued/low`, {
      headers: { 'x-priority': '5' },
    });
    const high = fetch(`${application.listeningOrigin}/queued/high`, {
      headers: { 'x-priority': '0' },
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    releaseFirst.resolve();

    await Promise.all([firstResponse, low, high]);
    expect(order).toEqual(['high', 'low']);
  });

  test('returns 503 when the admission queue is full', async () => {
    const application = createApplication();
    await application.register(pidControllerPlugin, {
      pid: {
        config: {
          maxConcurrentRequests: 1,
          maxQueuedRequests: 1,
          queueTimeoutMs: 10_000,
          pid: { intervalMs: 10_000 },
          statistics: { minWindowMs: 10_000, maxWindowMs: 20_000 },
        },
      },
    });
    const firstStarted = deferred<void>();
    const releaseFirst = deferred<void>();
    application.get('/hold', async () => {
      firstStarted.resolve();
      await releaseFirst.promise;
      return { held: true };
    });
    application.get('/queued', () => ({ queued: true }));
    application.get('/overflow', () => ({ overflow: false }));
    await listen(application);

    const first = fetch(`${application.listeningOrigin}/hold`);
    await firstStarted.promise;
    const queued = fetch(`${application.listeningOrigin}/queued`);
    await new Promise((resolve) => setTimeout(resolve, 20));
    const overflow = await fetch(`${application.listeningOrigin}/overflow`);

    expect(overflow.status).toBe(503);
    expect(await overflow.json()).toMatchObject({ error: 'ADMISSION_QUEUE_FULL' });

    releaseFirst.resolve();
    await Promise.all([first, queued]);
  });

  test('returns 503 when a queued request reaches its deadline', async () => {
    const application = createApplication();
    await application.register(pidControllerPlugin, {
      pid: {
        config: {
          maxConcurrentRequests: 1,
          queueTimeoutMs: 20,
          pid: { intervalMs: 10_000 },
          statistics: { minWindowMs: 10_000, maxWindowMs: 20_000 },
        },
      },
    });
    const firstStarted = deferred<void>();
    const releaseFirst = deferred<void>();
    application.get('/hold', async () => {
      firstStarted.resolve();
      await releaseFirst.promise;
      return { held: true };
    });
    application.get('/evicted', () => ({ shouldNotRun: true }));
    await listen(application);

    const first = fetch(`${application.listeningOrigin}/hold`);
    await firstStarted.promise;
    const evicted = await fetch(`${application.listeningOrigin}/evicted`);

    expect(evicted.status).toBe(503);
    expect(await evicted.json()).toMatchObject({ error: 'REQUEST_EVICTED' });

    releaseFirst.resolve();
    await first;
  });

  test('cancels a queued request when its client disconnects', async () => {
    const application = createApplication();
    await application.register(pidControllerPlugin, slowControllerOptions());
    const firstStarted = deferred<void>();
    const releaseFirst = deferred<void>();
    const queuedSubmitted = deferred<void>();
    const queuedSocketClosed = deferred<void>();
    const queuedHandler = vi.fn(() => ({ queued: true }));
    application.server.on('request', (request) => {
      if (request.url === '/queued') {
        queuedSubmitted.resolve();
        request.socket.once('close', () => queuedSocketClosed.resolve());
      }
    });
    application.get('/hold', async () => {
      firstStarted.resolve();
      await releaseFirst.promise;
      return { held: true };
    });
    application.get('/queued', queuedHandler);
    await listen(application);

    const first = fetch(`${application.listeningOrigin}/hold`);
    await firstStarted.promise;
    const queuedRequest = httpRequest(`${application.listeningOrigin}/queued`);
    queuedRequest.on('error', () => undefined);
    queuedRequest.end();
    await queuedSubmitted.promise;
    queuedRequest.destroy();
    await queuedSocketClosed.promise;

    releaseFirst.resolve();
    await first;
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(queuedHandler).not.toHaveBeenCalled();
  });

  test('holds the permit until a streaming response finishes', async () => {
    const application = createApplication();
    await application.register(pidControllerPlugin, slowControllerOptions());
    const stream = new PassThrough();
    const streamStarted = deferred<void>();
    const secondHandler = vi.fn(() => ({ second: true }));
    application.get('/stream', (_request, reply) => {
      streamStarted.resolve();
      void reply.type('text/plain').send(stream);
      return reply;
    });
    application.get('/second', secondHandler);
    await listen(application);

    const first = fetch(`${application.listeningOrigin}/stream`);
    await streamStarted.promise;
    stream.write('first');
    const second = fetch(`${application.listeningOrigin}/second`);

    await expect(settlesWithin(second, 50)).resolves.toBe(false);
    expect(secondHandler).not.toHaveBeenCalled();

    stream.end('last');
    await expect(first.then((response) => response.text())).resolves.toBe('firstlast');
    await expect(second.then((response) => response.json())).resolves.toEqual({ second: true });
  });

  test('releases the permit as failure when a client aborts a streaming response', async () => {
    const application = createApplication();
    await application.register(pidControllerPlugin, slowControllerOptions());
    const stream = new PassThrough();
    const streamStarted = deferred<void>();
    const chunkReceived = deferred<void>();
    const socketClosed = deferred<void>();
    application.server.on('request', (request) => {
      if (request.url === '/stream') {
        request.socket.once('close', () => socketClosed.resolve());
      }
    });
    application.get('/stream', (_request, reply) => {
      streamStarted.resolve();
      void reply.type('text/plain').send(stream);
      return reply;
    });
    application.get('/healthy', () => ({ healthy: true }));
    await listen(application);

    const streamingRequest = httpRequest(`${application.listeningOrigin}/stream`, (response) => {
      response.once('data', () => {
        chunkReceived.resolve();
        response.destroy();
      });
    });
    streamingRequest.on('error', () => undefined);
    streamingRequest.end();
    await streamStarted.promise;
    stream.write('partial');
    await chunkReceived.promise;
    await socketClosed.promise;

    const healthy = await fetch(`${application.listeningOrigin}/healthy`);

    expect(healthy.status).toBe(200);
    expect(await healthy.json()).toEqual({ healthy: true });
    stream.end();
  });

  test('releases an acquired permit when Fastify times out the connection', async () => {
    const application = Fastify({ connectionTimeout: 50 });
    applications.add(application);
    await application.register(pidControllerPlugin, slowControllerOptions());
    const timedRouteStarted = deferred<void>();
    const releaseTimedRoute = deferred<void>();
    application.get('/timeout', async () => {
      timedRouteStarted.resolve();
      await releaseTimedRoute.promise;
      return { late: true };
    });
    application.get('/healthy', () => ({ healthy: true }));
    await listen(application);

    const socketClosed = new Promise<void>((resolve) => {
      const request = httpRequest(`${application.listeningOrigin}/timeout`);
      request.on('error', () => undefined);
      request.on('close', () => resolve());
      request.end();
    });
    await timedRouteStarted.promise;
    await socketClosed;

    const healthy = await fetch(`${application.listeningOrigin}/healthy`);

    expect(healthy.status).toBe(200);
    expect(await healthy.json()).toEqual({ healthy: true });
    releaseTimedRoute.resolve();
  });

  test('isolates controllers registered in separate encapsulated scopes', async () => {
    const application = createApplication();
    const firstStarted = deferred<void>();
    const releaseFirst = deferred<void>();
    await application.register(async (scope) => {
      await scope.register(pidControllerPlugin, slowControllerOptions());
      scope.get('/a', async () => {
        firstStarted.resolve();
        await releaseFirst.promise;
        return { scope: 'a' };
      });
    });
    await application.register(async (scope) => {
      await scope.register(pidControllerPlugin, slowControllerOptions());
      scope.get('/b', () => ({ scope: 'b' }));
    });
    await listen(application);

    const first = fetch(`${application.listeningOrigin}/a`);
    await firstStarted.promise;
    const second = await fetch(`${application.listeningOrigin}/b`);

    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ scope: 'b' });

    releaseFirst.resolve();
    await first;
  });

  test('shuts down cleanly when Fastify closes', async () => {
    const application = createApplication();
    await application.register(pidControllerPlugin, slowControllerOptions());
    application.get('/', () => ({ admitted: true }));
    await application.ready();

    await application.close();
    applications.delete(application);

    await expect(application.close()).resolves.toBeUndefined();
  });

  function createApplication(): FastifyInstance {
    const application = Fastify();
    applications.add(application);
    return application;
  }
});

function slowControllerOptions() {
  return {
    pid: {
      config: {
        maxConcurrentRequests: 1,
        queueTimeoutMs: 10_000,
        pid: { intervalMs: 10_000 },
        statistics: { minWindowMs: 10_000, maxWindowMs: 20_000 },
      },
    },
  };
}

async function listen(application: FastifyInstance): Promise<void> {
  await application.listen({ port: 0, host: '127.0.0.1' });
}

async function settlesWithin(promise: Promise<unknown>, milliseconds: number): Promise<boolean> {
  return Promise.race([
    promise.then(() => true),
    new Promise<false>((resolve) => setTimeout(() => resolve(false), milliseconds)),
  ]);
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
