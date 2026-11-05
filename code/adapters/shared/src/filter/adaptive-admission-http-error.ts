import {
  CancelledRequestError,
  ControllerShutdownError,
  EvictedRequestError,
  QueueFullError,
  ThresholdRejectedError,
} from '@jfrz38/adaptive-admission-node';

export interface AdaptiveAdmissionHttpPolicy {
  code: number;
  title: string;
  message: string;
}

export function adaptiveAdmissionHttpError(error: unknown): AdaptiveAdmissionHttpPolicy | undefined {
  if (error instanceof ThresholdRejectedError) {
    return { code: 429, title: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests, please try again later.' };
  }
  if (error instanceof QueueFullError) {
    return { code: 503, title: 'ADMISSION_QUEUE_FULL', message: 'The service is temporarily overloaded.' };
  }
  if (error instanceof EvictedRequestError) {
    return { code: 503, title: 'REQUEST_EVICTED', message: 'The request could not be processed before its deadline.' };
  }
  if (error instanceof ControllerShutdownError) {
    return { code: 503, title: 'CONTROLLER_UNAVAILABLE', message: 'The service is shutting down.' };
  }
  if (error instanceof CancelledRequestError) {
    return { code: 499, title: 'REQUEST_CANCELLED', message: 'The request was cancelled.' };
  }
  return undefined;
}
