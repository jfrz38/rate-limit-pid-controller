import { RejectedRequestException } from '@jfrz38/pid-controller-core';
import { ArgumentsHost, Catch, ExceptionFilter, Inject } from '@nestjs/common';
import { Response } from 'express';
import { PidModuleOptions } from '../types/pid-module-options';
import { HttpResponse } from './response/http/http-response';

@Catch(RejectedRequestException)
export class PidExceptionFilter implements ExceptionFilter {

  constructor(@Inject('PID_CONTROLLER_OPTIONS') private options: PidModuleOptions) { }

  catch(exception: RejectedRequestException, host: ArgumentsHost) {
    if (host.getType() !== 'http') {
      throw exception;
    }

    const response = host.switchToHttp().getResponse<Response>();

    return new HttpResponse(exception, this.options?.rules?.error).createResponse(response);
  }
}
