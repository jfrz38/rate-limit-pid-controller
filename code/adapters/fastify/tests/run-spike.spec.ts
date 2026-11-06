import { request as httpRequest } from 'node:http';

import {
  AdaptiveAdmissionController,
  Priority,
} from '@jfrz38/adaptive-admission-node';
import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from 'fastify';
import { afterEach, describe, expect, test, vi } from 'vitest';

describe('Fastify run() integration spike', () => {
  const applications: FastifyInstance[] = [];

  afterEach(async () => {
    await Promise.all(applications.splice(0).map((application) => application.close()));
  });

  test('cannot await run() in an entry hook while the task represents the response lifetime', async () => {
    const application = Fastify();
    applications.push(application);
    const controller = controllerWithSlowControlLoops();
    const completeResponseLifetime = deferred<void>();
    const handler = vi.fn(() => ({ admitted: true }));

    application.addHook('onRequest', async () => {
      await controller.run(() => completeResponseLifetime.promise, Priority.fromValue(0));
    });
    application.get('/', handler);

    const response = application.inject({ method: 'GET', url: '/' });

    await expect(settlesWithin(response, 50)).resolves.toBe(false);
    expect(handler).not.toHaveBeenCalled();

    completeResponseLifetime.resolve();
    await expect(response).resolves.toMatchObject({ statusCode: 200 });
    controller.shutdown();
  });

  test('admits a request when a callback hook deliberately leaves run() unawaited', async () => {
    const application = Fastify();
    applications.push(application);
    registerRunBridge(application, controllerWithSlowControlLoops());
    application.get('/', () => ({ admitted: true }));

    const response = await application.inject({ method: 'GET', url: '/' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ admitted: true });
  });

  test('keeps a second request queued until the first response finishes', async () => {
    const application = Fastify();
    applications.push(application);
    registerRunBridge(application, controllerWithSlowControlLoops());
    const firstStarted = deferred<void>();
    const releaseFirst = deferred<void>();
    const secondHandler = vi.fn(() => ({ request: 'second' }));
    application.get('/first', async () => {
      firstStarted.resolve();
      await releaseFirst.promise;
      return { request: 'first' };
    });
    application.get('/second', secondHandler);
    await application.listen({ port: 0, host: '127.0.0.1' });

    const firstResponse = fetch(`${application.listeningOrigin}/first`);
    await firstStarted.promise;
    const secondResponse = fetch(`${application.listeningOrigin}/second`);
    const secondSettledEarly = await settlesWithin(secondResponse, 50);
    if (secondSettledEarly) {
      const response = await secondResponse;
      throw new Error(`second request settled early with ${response.status}: ${await response.text()}`);
    }
    expect(secondHandler).not.toHaveBeenCalled();

    releaseFirst.resolve();

    await expect(firstResponse.then((response) => response.json())).resolves.toEqual({ request: 'first' });
    await expect(secondResponse.then((response) => response.json())).resolves.toEqual({ request: 'second' });
    expect(secondHandler).toHaveBeenCalledOnce();
  });

  test('rejects before the route handler executes', async () => {
    const application = Fastify();
    applications.push(application);
    registerRunBridge(application, new AdaptiveAdmissionController({ initialThreshold: 1 }));
    const handler = vi.fn(() => ({ admitted: true }));
    application.get('/', handler);

    const response = await application.inject({ method: 'GET', url: '/' });

    expect(response.statusCode).toBe(500);
    expect(handler).not.toHaveBeenCalled();
  });

  test('cancels a queued request when its client disconnects', async () => {
    const application = Fastify();
    applications.push(application);
    const firstStarted = deferred<void>();
    const releaseFirst = deferred<void>();
    const queuedSubmitted = deferred<void>();
    const queuedAborted = deferred<void>();
    const queuedHandler = vi.fn(() => ({ request: 'queued' }));
    registerRunBridge(application, controllerWithSlowControlLoops(), {
      submitted: (request) => {
        if (request.url === '/queued') {
          queuedSubmitted.resolve();
        }
      },
      aborted: (request) => {
        if (request.url === '/queued') {
          queuedAborted.resolve();
        }
      },
    });
    application.get('/first', async () => {
      firstStarted.resolve();
      await releaseFirst.promise;
      return { request: 'first' };
    });
    application.get('/queued', queuedHandler);
    await application.listen({ port: 0, host: '127.0.0.1' });

    const firstResponse = fetch(`${application.listeningOrigin}/first`);
    await firstStarted.promise;
    const queuedRequest = httpRequest(`${application.listeningOrigin}/queued`);
    queuedRequest.on('error', () => undefined);
    queuedRequest.end();
    await queuedSubmitted.promise;
    queuedRequest.destroy();
    await queuedAborted.promise;

    releaseFirst.resolve();

    await expect(firstResponse.then((response) => response.json())).resolves.toEqual({ request: 'first' });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(queuedHandler).not.toHaveBeenCalled();
  });

  test('shuts the controller down when Fastify closes', async () => {
    const application = Fastify();
    applications.push(application);
    const controller = controllerWithSlowControlLoops();
    const shutdown = vi.spyOn(controller, 'shutdown');
    registerRunBridge(application, controller);
    application.get('/', () => ({ admitted: true }));
    await application.ready();

    await application.close();

    expect(shutdown).toHaveBeenCalledOnce();
  });
});

function registerRunBridge(
  application: FastifyInstance,
  controller: AdaptiveAdmissionController,
  probe: {
    submitted?: (request: FastifyRequest) => void;
    aborted?: (request: FastifyRequest) => void;
  } = {},
): void {
  const queuedAbortControllers = new WeakMap<FastifyRequest, AbortController>();
  application.addHook('onRequest', (
    request: FastifyRequest,
    reply: FastifyReply,
    done: (error?: Error) => void,
  ) => {
    const abortController = new AbortController();
    let aborted = false;
    const abortQueuedRequest = () => {
      if (aborted) {
        return;
      }
      aborted = true;
      probe.aborted?.(request);
      abortController.abort();
    };
    const onRequestAborted = () => abortQueuedRequest();
    request.raw.once('aborted', onRequestAborted);
    queuedAbortControllers.set(request, abortController);
    let pipelineStarted = false;

    const run = controller.run(() => {
      pipelineStarted = true;
      done();
      return observeResponse(reply);
    }, Priority.default(), { signal: abortController.signal });
    probe.submitted?.(request);
    void run.catch((error: unknown) => {
      if (!pipelineStarted) {
        done(error instanceof Error ? error : new Error(String(error)));
      }
    }).finally(() => {
      request.raw.removeListener('aborted', onRequestAborted);
      queuedAbortControllers.delete(request);
    });
  });

  application.addHook('onRequestAbort', (request, done) => {
    const abortController = queuedAbortControllers.get(request);
    if (abortController && !abortController.signal.aborted) {
      probe.aborted?.(request);
      abortController.abort();
    }
    done();
  });

  application.addHook('onClose', (_instance, done) => {
    controller.shutdown();
    done();
  });
}

function observeResponse(reply: FastifyReply): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      reply.raw.removeListener('finish', onFinish);
      reply.raw.removeListener('close', onClose);
      reply.raw.removeListener('error', onError);
    };
    const settle = (outcome: 'success' | 'failure', error?: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      if (outcome === 'success') {
        resolve();
      } else {
        reject(error ?? new Error('response closed before finish'));
      }
    };
    const onFinish = () => settle('success');
    const onClose = () => settle(reply.raw.writableFinished ? 'success' : 'failure');
    const onError = (error: Error) => settle('failure', error);

    reply.raw.once('finish', onFinish);
    reply.raw.once('close', onClose);
    reply.raw.once('error', onError);
  });
}

function controllerWithSlowControlLoops(): AdaptiveAdmissionController {
  return new AdaptiveAdmissionController({
    maxConcurrentRequests: 1,
    queueTimeoutMs: 10_000,
    pid: { intervalMs: 10_000 },
    statistics: { minWindowMs: 10_000, maxWindowMs: 20_000 },
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
