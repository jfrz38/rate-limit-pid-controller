import { EventEmitter } from 'node:events';
import { describe, expect, test, vi } from 'vitest';

import { pidControllerMiddleware } from '../src/middleware';

describe('Express adaptive admission middleware', () => {
  test('executes an admitted request using the real Rust host', async () => {
    const { middleware, shutdown } = pidControllerMiddleware({
      pid: { config: { maxConcurrentRequests: 1 }, priority: { getPriority: () => 0 } },
    });
    const req = Object.assign(new EventEmitter(), { aborted: false });
    const res = Object.assign(new EventEmitter(), { destroyed: false });
    const next = vi.fn(() => res.emit('finish'));

    await middleware(req as any, res as any, next);

    expect(next).toHaveBeenCalledOnce();
    shutdown();
  });

  test('exposes idempotent shutdown', () => {
    const controller = pidControllerMiddleware();
    expect(() => { controller.shutdown(); controller.shutdown(); }).not.toThrow();
  });
});
