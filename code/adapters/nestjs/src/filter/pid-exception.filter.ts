import {
  CancelledRequestError,
  ControllerShutdownError,
  EvictedRequestError,
  QueueFullError,
  ThresholdRejectedError,
} from '@jfrz38/adaptive-admission-node';
import { adaptiveAdmissionHttpError, HttpErrorResponse, ResponseError } from '@jfrz38/pid-controller-shared';
import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { Response } from 'express';

@Catch(ThresholdRejectedError, QueueFullError, EvictedRequestError, ControllerShutdownError, CancelledRequestError)
export class PidExceptionFilter implements ExceptionFilter {

  constructor(private error?: ResponseError) { }

  catch(exception: unknown, host: ArgumentsHost) {
    if (host.getType() !== 'http') {
      throw exception;
    }

    const response = host.switchToHttp().getResponse<Response>();
    if (exception instanceof CancelledRequestError && response.destroyed) {
      return;
    }
    if (!adaptiveAdmissionHttpError(exception)) {
      throw exception;
    }

    return new HttpErrorResponse(exception, this.error).format(response);
  }
}
