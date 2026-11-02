import { describe, expect, test } from 'vitest';

import {
  AdmissionRequestError,
  CancelledRequestError,
  ConfigurationError,
  ControllerProtocolError,
  ControllerShutdownError,
  EvictedRequestError,
  QueueFullError,
  RejectedRequestError,
  ThresholdRejectedError,
} from '../src/index.js';

describe('adaptive admission error hierarchy', () => {
  test.each([
    new ThresholdRejectedError(1n, 700, 500),
    new QueueFullError(1n),
    new ControllerShutdownError(1n),
    new EvictedRequestError(1n),
    new CancelledRequestError(1n, 'requested'),
  ])('%s is an admission request error', (error) => {
    expect(error).toBeInstanceOf(AdmissionRequestError);
  });

  test.each([
    new ThresholdRejectedError(1n, 700, 500),
    new QueueFullError(1n),
    new ControllerShutdownError(1n),
  ])('%s preserves the rejected request hierarchy', (error) => {
    expect(error).toBeInstanceOf(RejectedRequestError);
  });

  test.each([
    new ConfigurationError({ tag: 'invalid' }),
    new ControllerProtocolError({ tag: 'invalid' }),
  ])('%s is not an admission request error', (error) => {
    expect(error).not.toBeInstanceOf(AdmissionRequestError);
  });
});
