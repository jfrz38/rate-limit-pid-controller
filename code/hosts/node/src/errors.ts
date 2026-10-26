import type { ConfigurationErrorPayload, ControllerErrorPayload } from './types.js';

export class AdaptiveAdmissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class ConfigurationError extends AdaptiveAdmissionError {
  constructor(readonly payload: ConfigurationErrorPayload) {
    super(`Invalid adaptive admission configuration: ${payload.tag}`);
  }
}

export class ControllerProtocolError extends AdaptiveAdmissionError {
  constructor(readonly payload: ControllerErrorPayload) {
    super(`Adaptive admission controller error: ${payload.tag}`);
  }
}

export class RejectedRequestError extends AdaptiveAdmissionError {
  constructor(readonly requestId: bigint | undefined, message: string) {
    super(message);
  }
}

export class ThresholdRejectedError extends RejectedRequestError {
  constructor(
    requestId: bigint,
    readonly priority: number,
    readonly threshold: number,
  ) {
    super(requestId, `Request ${requestId} was rejected because priority ${priority} is outside threshold ${threshold}`);
  }
}

export class QueueFullError extends RejectedRequestError {
  constructor(requestId: bigint) {
    super(requestId, `Request ${requestId} was rejected because the admission queue is full`);
  }
}

export class ControllerShutdownError extends RejectedRequestError {
  constructor(requestId?: bigint) {
    super(
      requestId,
      requestId === undefined
        ? 'The controller is shut down'
        : `Request ${requestId} was rejected because the controller is shut down`,
    );
  }
}

export class EvictedRequestError extends AdaptiveAdmissionError {
  constructor(readonly requestId: bigint) {
    super(`Request ${requestId} was evicted after exceeding its queue deadline`);
  }
}

export class CancelledRequestError extends AdaptiveAdmissionError {
  constructor(readonly requestId: bigint, readonly reason: 'requested' | 'shutdown') {
    super(`Request ${requestId} was cancelled: ${reason}`);
  }
}
