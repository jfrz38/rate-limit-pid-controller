import { RejectedRequestException } from '@jfrz38/pid-controller-core';
import { HttpErrorResponse, ResponseError } from '@jfrz38/pid-controller-shared';
import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { Response } from 'express';

@Catch(RejectedRequestException)
export class PidExceptionFilter implements ExceptionFilter {

  constructor(private error?: ResponseError) { }

  catch(exception: RejectedRequestException, host: ArgumentsHost) {
    if (host.getType() !== 'http') {
      throw exception;
    }

    const response = host.switchToHttp().getResponse<Response>();

    return new HttpErrorResponse(exception, this.error).format(response);
  }
}
