import { AdaptiveAdmissionController, Priority } from '@jfrz38/adaptive-admission-node';
import { EventEmitter } from 'node:events';
import { describe, expect, test, vi } from 'vitest';

import { PidControllerMiddlewareHandler } from '../../src/middleware/pid-controller-middleware-handler';

function httpObjects() {
  const req = Object.assign(new EventEmitter(), { aborted: false });
  const res = Object.assign(new EventEmitter(), { destroyed: false });
  return { req: req as any, res: res as any };
}

describe('PidControllerMiddlewareHandler', () => {
  test('runs admitted middleware with a host priority tier', async () => {
    const controller = new AdaptiveAdmissionController();
    const run = vi.spyOn(controller, 'run');
    const handler = new PidControllerMiddlewareHandler(controller, { getPriority: () => 2 });
    const { req, res } = httpObjects();
    const next = vi.fn(() => res.emit('finish'));

    await handler.use(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(run).toHaveBeenCalledOnce();
    expect(run.mock.calls[0][1]).toEqual(Priority.fromValue(256 + run.mock.calls[0][1].value % 128));
    expect(req.listenerCount('aborted')).toBe(0);
    expect(res.eventNames()).toEqual([]);
    controller.shutdown();
  });

  test('uses the default priority when extraction is invalid', async () => {
    const controller = new AdaptiveAdmissionController();
    const run = vi.spyOn(controller, 'run');
    const handler = new PidControllerMiddlewareHandler(controller, { getPriority: () => 'invalid' });
    const { req, res } = httpObjects();

    await handler.use(req, res, () => res.emit('finish'));

    expect(run.mock.calls[0][1].value).toBeGreaterThanOrEqual(640);
    controller.shutdown();
  });

  test('forwards task failures and removes response listeners', async () => {
    const controller = new AdaptiveAdmissionController();
    const handler = new PidControllerMiddlewareHandler(controller, undefined);
    const { req, res } = httpObjects();
    const failure = new Error('route failed');
    const next = vi.fn()
      .mockImplementationOnce(() => { throw failure; })
      .mockImplementationOnce(() => undefined);

    await handler.use(req, res, next);

    expect(next).toHaveBeenLastCalledWith(failure);
    expect(res.eventNames()).toEqual([]);
    controller.shutdown();
  });

  test('passes an aborted request signal to the host', async () => {
    const controller = new AdaptiveAdmissionController();
    const run = vi.spyOn(controller, 'run');
    const handler = new PidControllerMiddlewareHandler(controller, undefined);
    const { req, res } = httpObjects();
    req.aborted = true;
    const next = vi.fn();

    await handler.use(req, res, next);

    expect(run.mock.calls[0][2].signal.aborted).toBe(true);
    expect(next.mock.calls[0][0].name).toBe('CancelledRequestError');
    controller.shutdown();
  });
});
