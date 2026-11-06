import {
  AdmissionRequestError,
  CancelledRequestError,
} from '@jfrz38/adaptive-admission-node';
import {
  admissionHttpErrorDescriptor,
  type ResponseError,
} from '@jfrz38/pid-controller-shared';
import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { Response } from 'express';

@Catch(AdmissionRequestError)
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
    const descriptor = admissionHttpErrorDescriptor(exception, this.error);
    if (!descriptor) {
      throw exception;
    }

    response.set(descriptor.headers);
    return response.status(descriptor.statusCode).json(descriptor.body);
  }
}
