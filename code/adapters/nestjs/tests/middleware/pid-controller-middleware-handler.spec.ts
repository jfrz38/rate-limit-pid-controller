import {
  AdaptiveAdmissionController,
  CancelledRequestError,
} from '@jfrz38/adaptive-admission-node';
import { EventEmitter } from 'node:events';
import { describe, expect, test, vi } from 'vitest';

import { PidControllerMiddlewareHandler } from '../../src/middleware/pid-controller-middleware-handler';

function httpObjects() {
  const request = Object.assign(new EventEmitter(), { aborted: false });
  const response = Object.assign(new EventEmitter(), {
    destroyed: false,
    writableFinished: false,
  });
  return { request: request as any, response: response as any };
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
  return {
    handler: new PidControllerMiddlewareHandler(
      { run } as unknown as AdaptiveAdmissionController,
      undefined,
    ),
    outcome: () => outcome,
  };
}

describe('NestJS Express middleware lifecycle', () => {
  test('completes a finished response as success and removes listeners', async () => {
    const controlled = controlledHandler();
    const { request, response } = httpObjects();

    await controlled.handler.use(request, response, () => response.emit('finish'));

    expect(controlled.outcome()).toBe('success');
    expect(request.listenerCount('aborted')).toBe(0);
    expect(response.eventNames()).toEqual([]);
  });

  test('completes a disconnected premature close as failure without delegating it', async () => {
    const controlled = controlledHandler();
    const { request, response } = httpObjects();
    response.destroyed = true;
    const next = vi.fn(() => response.emit('close'));

    await controlled.handler.use(request, response, next);

    expect(controlled.outcome()).toBe('failure');
    expect(next).toHaveBeenCalledOnce();
    expect(response.eventNames()).toEqual([]);
  });

  test('does not delegate queued cancellation after the request aborts', async () => {
    const error = new CancelledRequestError(1n, 'requested');
    const run = vi.fn().mockRejectedValue(error);
    const handler = new PidControllerMiddlewareHandler(
      { run } as unknown as AdaptiveAdmissionController,
      undefined,
    );
    const { request, response } = httpObjects();
    request.aborted = true;
    const next = vi.fn();

    await handler.use(request, response, next);

    expect(run.mock.calls[0][2].signal.aborted).toBe(true);
    expect(next).not.toHaveBeenCalled();
  });
});
