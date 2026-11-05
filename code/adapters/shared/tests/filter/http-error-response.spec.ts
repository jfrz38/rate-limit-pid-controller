import {
  ControllerShutdownError,
  EvictedRequestError,
  QueueFullError,
  ThresholdRejectedError,
} from '@jfrz38/adaptive-admission-node';
import { describe, expect, test, vi } from 'vitest';

import { HttpErrorResponse } from '../../src/filter/http-error-response';

function response() {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const set = vi.fn();
  return { response: { status, set }, status, json, set };
}

describe('HttpErrorResponse', () => {
  test.each([
    [new ThresholdRejectedError(1n, 700, 500), 429, 'RATE_LIMIT_EXCEEDED'],
    [new QueueFullError(1n), 503, 'ADMISSION_QUEUE_FULL'],
    [new EvictedRequestError(1n), 503, 'REQUEST_EVICTED'],
    [new ControllerShutdownError(1n), 503, 'CONTROLLER_UNAVAILABLE'],
  ])('maps %s to its HTTP policy', (error, code, title) => {
    const target = response();
    new HttpErrorResponse(error, undefined).format(target.response);
    expect(target.status).toHaveBeenCalledWith(code);
    expect(target.json).toHaveBeenCalledWith(expect.objectContaining({ error: title }));
  });

  test('allows response overrides without exposing the internal error by default', () => {
    const target = response();
    new HttpErrorResponse(new QueueFullError(1n), { code: 429, retryAfter: 2, message: 'Later' })
      .format(target.response);
    expect(target.set).toHaveBeenCalledWith('Retry-After', '2');
    expect(target.status).toHaveBeenCalledWith(429);
    expect(target.json).toHaveBeenCalledWith({ error: 'ADMISSION_QUEUE_FULL', message: 'Later' });
  });
});
