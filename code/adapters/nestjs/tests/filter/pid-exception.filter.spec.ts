import {
  AdmissionRequestError,
  CancelledRequestError,
  ConfigurationError,
  ControllerShutdownError,
  EvictedRequestError,
  QueueFullError,
  ThresholdRejectedError,
} from '@jfrz38/adaptive-admission-node';
import { describe, expect, test, vi } from 'vitest';

import { PidExceptionFilter } from '../../src/filter/pid-exception.filter';

function context(type = 'http') {
  const json = vi.fn();
  const response = { destroyed: false, set: vi.fn(), status: vi.fn(() => ({ json })) };
  const host = {
    getType: vi.fn(() => type),
    switchToHttp: vi.fn(() => ({ getResponse: () => response })),
  };
  return { host: host as any, response, json };
}

describe('PidExceptionFilter', () => {
  test.each([
    [new ThresholdRejectedError(1n, 700, 500), 429],
    [new QueueFullError(1n), 503],
    [new EvictedRequestError(1n), 503],
    [new ControllerShutdownError(1n), 503],
    [new CancelledRequestError(1n, 'requested'), 499],
  ])('formats operational host errors', (error, status) => {
    expect(error).toBeInstanceOf(AdmissionRequestError);
    const ctx = context();
    new PidExceptionFilter().catch(error, ctx.host);
    expect(ctx.response.status).toHaveBeenCalledWith(status);
  });

  test('does not write a cancellation response after the connection is destroyed', () => {
    const ctx = context();
    ctx.response.destroyed = true;
    new PidExceptionFilter().catch(new CancelledRequestError(1n, 'requested'), ctx.host);
    expect(ctx.response.status).not.toHaveBeenCalled();
  });

  test('rethrows errors outside HTTP contexts', () => {
    const error = new QueueFullError(1n);
    expect(() => new PidExceptionFilter().catch(error, context('rpc').host)).toThrow(error);
  });

  test('does not convert host configuration failures', () => {
    const error = new ConfigurationError({ tag: 'invalid' });
    expect(() => new PidExceptionFilter().catch(error, context().host)).toThrow(error);
  });

  test('applies configured response overrides', () => {
    const ctx = context();
    new PidExceptionFilter({ code: 429, title: 'BUSY' }).catch(new QueueFullError(1n), ctx.host);
    expect(ctx.response.status).toHaveBeenCalledWith(429);
    expect(ctx.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'BUSY' }));
  });
});
