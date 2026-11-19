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
  const response = { destroyed: false };
  const adapter = {
    isHeadersSent: vi.fn(() => false),
    setHeader: vi.fn(),
    reply: vi.fn(),
  };
  const adapterHost = { httpAdapter: adapter };
  const host = {
    getType: vi.fn(() => type),
    switchToHttp: vi.fn(() => ({ getResponse: () => response })),
  };
  return { adapter, adapterHost: adapterHost as any, host: host as any, response };
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
    new PidExceptionFilter(ctx.adapterHost).catch(error, ctx.host);
    expect(ctx.adapter.reply).toHaveBeenCalledWith(
      ctx.response,
      expect.any(Object),
      status,
    );
  });

  test('does not write a cancellation response after the connection is destroyed', () => {
    const ctx = context();
    ctx.response.destroyed = true;
    new PidExceptionFilter(ctx.adapterHost).catch(
      new CancelledRequestError(1n, 'requested'),
      ctx.host,
    );
    expect(ctx.adapter.reply).not.toHaveBeenCalled();
  });

  test('rethrows errors outside HTTP contexts', () => {
    const error = new QueueFullError(1n);
    const ctx = context('rpc');
    expect(() => new PidExceptionFilter(ctx.adapterHost).catch(error, ctx.host)).toThrow(error);
  });

  test('does not convert host configuration failures', () => {
    const error = new ConfigurationError({ tag: 'invalid' });
    const ctx = context();
    expect(() => new PidExceptionFilter(ctx.adapterHost).catch(error, ctx.host)).toThrow(error);
  });

  test('applies configured response overrides', () => {
    const ctx = context();
    new PidExceptionFilter(ctx.adapterHost, { code: 429, title: 'BUSY' }).catch(
      new QueueFullError(1n),
      ctx.host,
    );
    expect(ctx.adapter.reply).toHaveBeenCalledWith(
      ctx.response,
      expect.objectContaining({ error: 'BUSY' }),
      429,
    );
  });
});
