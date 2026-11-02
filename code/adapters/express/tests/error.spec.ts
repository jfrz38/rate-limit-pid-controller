import { CancelledRequestError, ConfigurationError, QueueFullError, ThresholdRejectedError } from '@jfrz38/adaptive-admission-node';
import { describe, expect, test, vi } from 'vitest';

import { pidControllerErrorHandler } from '../src/error';

function context(aborted = false) {
  const json = vi.fn();
  const response = { headersSent: false, destroyed: false, set: vi.fn(), status: vi.fn(() => ({ json })) };
  return { request: { aborted }, response, json, next: vi.fn() };
}

describe('Express adaptive admission error handler', () => {
  test.each([
    [new ThresholdRejectedError(1n, 700, 500), 429],
    [new QueueFullError(1n), 503],
  ])('formats controlled host errors', (error, status) => {
    const ctx = context();
    pidControllerErrorHandler()(error, ctx.request as any, ctx.response as any, ctx.next);
    expect(ctx.response.status).toHaveBeenCalledWith(status);
    expect(ctx.next).not.toHaveBeenCalled();
  });

  test('does not write a cancellation response after the client disconnects', () => {
    const ctx = context(true);
    pidControllerErrorHandler()(new CancelledRequestError(1n, 'requested'), ctx.request as any, ctx.response as any, ctx.next);
    expect(ctx.response.status).not.toHaveBeenCalled();
    expect(ctx.next).not.toHaveBeenCalled();
  });

  test('propagates configuration and application errors', () => {
    const ctx = context();
    const error = new ConfigurationError({ tag: 'invalid' });
    pidControllerErrorHandler()(error, ctx.request as any, ctx.response as any, ctx.next);
    expect(ctx.next).toHaveBeenCalledWith(error);
  });
});
