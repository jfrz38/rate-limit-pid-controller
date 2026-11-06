import { type AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import express, { type Express } from 'express';
import { afterEach, describe, expect, test } from 'vitest';

import { pidControllerMiddleware } from '../src/middleware';

describe('Express adapter integration', () => {
  const servers: Server[] = [];
  const shutdownControllers: Array<() => void> = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => closeServer(server)));
    for (const shutdown of shutdownControllers.splice(0)) {
      shutdown();
    }
  });

  test('preserves the response from an admitted handler', async () => {
    const app = express();
    const controller = pidControllerMiddleware({
      pid: { config: { maxConcurrentRequests: 1 }, priority: { getPriority: () => 0 } },
    });
    shutdownControllers.push(controller.shutdown);
    app.use(controller.middleware);
    app.get('/resource', (_request, response) => {
      response.status(201).set('x-adapter', 'express').json({ admitted: true });
    });
    const url = await listen(app, servers);

    const response = await fetch(`${url}/resource`);

    expect(response.status).toBe(201);
    expect(response.headers.get('x-adapter')).toBe('express');
    await expect(response.json()).resolves.toEqual({ admitted: true });
  });

  test('keeps a second request queued until a streaming response finishes', async () => {
    const app = express();
    const controller = pidControllerMiddleware({
      pid: {
        config: {
          maxConcurrentRequests: 1,
          queueTimeoutMs: 10_000,
          pid: { intervalMs: 10_000 },
          statistics: { minWindowMs: 10_000, maxWindowMs: 20_000 },
        },
        priority: { getPriority: () => 0 },
      },
    });
    shutdownControllers.push(controller.shutdown);
    app.use(controller.middleware);

    const firstStarted = deferred<void>();
    const finishFirst = deferred<void>();
    const secondStarted = deferred<void>();
    app.get('/stream/:request', async (request, response) => {
      if (request.params.request === 'first') {
        response.write('first-');
        firstStarted.resolve();
        await finishFirst.promise;
        response.end('complete');
        return;
      }
      secondStarted.resolve();
      response.end('second');
    });
    const url = await listen(app, servers);

    const firstResponse = fetch(`${url}/stream/first`);
    await firstStarted.promise;
    const secondResponse = fetch(`${url}/stream/second`);
    await expect(settlesWithin(secondStarted.promise, 50)).resolves.toBe(false);

    finishFirst.resolve();

    await expect((await firstResponse).text()).resolves.toBe('first-complete');
    await expect((await secondResponse).text()).resolves.toBe('second');
  });

  test('delegates application failures to the consumer error handler', async () => {
    const app = express();
    const controller = pidControllerMiddleware();
    shutdownControllers.push(controller.shutdown);
    app.use(controller.middleware);
    app.get('/failure', () => {
      throw new Error('application failed');
    });
    app.use((error: Error, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
      response.status(502).json({ message: error.message });
    });
    const url = await listen(app, servers);

    const response = await fetch(`${url}/failure`);

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ message: 'application failed' });
  });
});

async function listen(app: Express, servers: Server[]): Promise<string> {
  const server = app.listen(0, '127.0.0.1');
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
  });
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
