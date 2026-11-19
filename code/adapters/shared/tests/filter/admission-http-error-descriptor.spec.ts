import {
  CancelledRequestError,
  ConfigurationError,
  ControllerShutdownError,
  EvictedRequestError,
  QueueFullError,
  ThresholdRejectedError,
} from '@jfrz38/adaptive-admission-node';
import { describe, expect, test } from 'vitest';

import { admissionHttpErrorDescriptor } from '../../src/filter/admission-http-error-descriptor';

describe('admissionHttpErrorDescriptor', () => {
  test.each([
    [new ThresholdRejectedError(1n, 700, 500), 429, 'RATE_LIMIT_EXCEEDED'],
    [new QueueFullError(1n), 503, 'ADMISSION_QUEUE_FULL'],
    [new EvictedRequestError(1n), 503, 'REQUEST_EVICTED'],
    [new ControllerShutdownError(1n), 503, 'CONTROLLER_UNAVAILABLE'],
    [new CancelledRequestError(1n, 'requested'), 499, 'REQUEST_CANCELLED'],
  ])('maps %s to neutral HTTP data', (error, statusCode, title) => {
    expect(admissionHttpErrorDescriptor(error)).toEqual({
      statusCode,
      headers: {},
      body: expect.objectContaining({ error: title }),
    });
  });

  test('applies response overrides without exposing the internal error by default', () => {
    const descriptor = admissionHttpErrorDescriptor(new QueueFullError(1n), {
      code: 429,
      retryAfter: 2,
      title: 'BUSY',
      message: 'Later',
    });

    expect(descriptor).toEqual({
      statusCode: 429,
      headers: { 'Retry-After': '2' },
      body: { error: 'BUSY', message: 'Later' },
    });
  });

  test('copies a custom body before exposing an explicitly requested internal message', () => {
    const response = { reason: 'overloaded' };
    const error = new QueueFullError(1n);

    const descriptor = admissionHttpErrorDescriptor(error, {
      response,
      hideError: false,
    });

    expect(descriptor?.body).toEqual({ reason: 'overloaded', message: error.message });
    expect(response).toEqual({ reason: 'overloaded' });
  });

  test('does not classify configuration errors', () => {
    expect(admissionHttpErrorDescriptor(new ConfigurationError({ tag: 'invalid' }))).toBeUndefined();
  });
});
