import {
  AdaptiveAdmissionController,
  CancelledRequestError,
  QueueFullError,
} from '@jfrz38/adaptive-admission-node';
import { EventEmitter } from 'node:events';
import { describe, expect, test, vi } from 'vitest';

import { pidControllerMiddleware } from '../src/middleware';
import { PidControllerMiddlewareHandler } from '../src/pid-controller-middleware-handler';

function httpObjects() {
  const req = Object.assign(new EventEmitter(), { aborted: false });
  const res = Object.assign(new EventEmitter(), {
    destroyed: false,
    writableFinished: false,
    statusCode: 200,
  });
  return { req: req as any, res: res as any };
}

function controlledHandler() {
  let outcome: 'success' | 'failure' | undefined;
  const run = vi.fn(async (task: () => Promise<void>) => {
    try {
      await task();
      outcome = 'success';
    } catch (error) {
      outcome = 'failure';
      throw error;
    }
  });
  const controller = { run } as unknown as AdaptiveAdmissionController;
  return {
    handler: new PidControllerMiddlewareHandler(controller, undefined),
    run,
    outcome: () => outcome,
  };
}

describe('Express adaptive admission middleware lifecycle', () => {
  test('completes a finished response as success and removes every listener', async () => {
    const controlled = controlledHandler();
    const { req, res } = httpObjects();
    const next = vi.fn(() => {
      res.writableFinished = true;
      res.emit('finish');
    });

    await controlled.handler.use(req, res, next);

    expect(controlled.outcome()).toBe('success');
    expect(next).toHaveBeenCalledOnce();
    expect(req.listenerCount('aborted')).toBe(0);
    expect(res.eventNames()).toEqual([]);
  });

  test('treats close after a fully written response as success', async () => {
    const controlled = controlledHandler();
    const { req, res } = httpObjects();
    res.writableFinished = true;

    await controlled.handler.use(req, res, () => res.emit('close'));

    expect(controlled.outcome()).toBe('success');
  });

  test('treats a premature disconnected close as failure without a late next call', async () => {
    const controlled = controlledHandler();
    const { req, res } = httpObjects();
    res.destroyed = true;
    const next = vi.fn(() => res.emit('close'));

    await controlled.handler.use(req, res, next);

    expect(controlled.outcome()).toBe('failure');
    expect(next).toHaveBeenCalledOnce();
    expect(res.eventNames()).toEqual([]);
  });

  test('settles once when close follows finish', async () => {
    const controlled = controlledHandler();
    const { req, res } = httpObjects();

    await controlled.handler.use(req, res, () => {
      res.writableFinished = true;
      res.emit('finish');
      res.emit('close');
    });

    expect(controlled.outcome()).toBe('success');
    expect(controlled.run).toHaveBeenCalledOnce();
    expect(res.eventNames()).toEqual([]);
  });

  test('marks a response error as failure and delegates it while the connection is alive', async () => {
    const controlled = controlledHandler();
    const { req, res } = httpObjects();
    const failure = new Error('socket failed');
    const next = vi.fn()
      .mockImplementationOnce(() => res.emit('error', failure))
      .mockImplementationOnce(() => undefined);

    await controlled.handler.use(req, res, next);

    expect(controlled.outcome()).toBe('failure');
    expect(next).toHaveBeenLastCalledWith(failure);
    expect(next).toHaveBeenCalledTimes(2);
  });

  test.each([400, 500])('treats a completed %i response as success', async (statusCode) => {
    const controlled = controlledHandler();
    const { req, res } = httpObjects();
    res.statusCode = statusCode;

    await controlled.handler.use(req, res, () => res.emit('finish'));

    expect(controlled.outcome()).toBe('success');
  });

  test('delegates an admission rejection while the connection is alive', async () => {
    const error = new QueueFullError(1n);
    const run = vi.fn().mockRejectedValue(error);
    const handler = new PidControllerMiddlewareHandler(
      { run } as unknown as AdaptiveAdmissionController,
      undefined,
    );
    const { req, res } = httpObjects();
    const next = vi.fn();

    await handler.use(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledWith(error);
  });

  test('does not delegate queued cancellation after the request aborts', async () => {
    const error = new CancelledRequestError(1n, 'requested');
    const run = vi.fn().mockRejectedValue(error);
    const handler = new PidControllerMiddlewareHandler(
      { run } as unknown as AdaptiveAdmissionController,
      undefined,
    );
    const { req, res } = httpObjects();
    req.aborted = true;
    const next = vi.fn();

    await handler.use(req, res, next);

    expect(run.mock.calls[0][2].signal.aborted).toBe(true);
    expect(next).not.toHaveBeenCalled();
    expect(req.listenerCount('aborted')).toBe(0);
  });

  test('delegates a synchronous downstream failure and cleans response listeners', async () => {
    const controlled = controlledHandler();
    const { req, res } = httpObjects();
    const failure = new Error('route failed');
    const next = vi.fn()
      .mockImplementationOnce(() => { throw failure; })
      .mockImplementationOnce(() => undefined);

    await controlled.handler.use(req, res, next);

    expect(controlled.outcome()).toBe('failure');
    expect(next).toHaveBeenLastCalledWith(failure);
    expect(res.eventNames()).toEqual([]);
  });
});

describe('pidControllerMiddleware', () => {
  test('executes an admitted request using the real Rust host', async () => {
    const { middleware, shutdown } = pidControllerMiddleware({
      pid: { config: { maxConcurrentRequests: 1 }, priority: { getPriority: () => 0 } },
    });
    const { req, res } = httpObjects();
    const next = vi.fn(() => res.emit('finish'));

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    shutdown();
  });

  test('exposes idempotent shutdown', () => {
    const controller = pidControllerMiddleware();
    expect(() => { controller.shutdown(); controller.shutdown(); }).not.toThrow();
  });
});
