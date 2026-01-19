import { RejectedRequestException } from '@jfrz38/pid-controller-core';
import { ArgumentsHost, Catch, ContextType, ExceptionFilter, Inject } from '@nestjs/common';
import { Response } from 'express';
import { PidModuleOptions } from '../types/options';
import { HttpResponse } from './response/http/http-response';
import { WsResponse } from './response/ws/ws-response';

@Catch(RejectedRequestException)
export class PidExceptionFilter implements ExceptionFilter {

  private readonly defaultMessage = 'Too many requests, please try again later.';

  constructor(
    @Inject('PID_CONTROLLER_OPTIONS') private options: PidModuleOptions
  ) { }

  catch(exception: RejectedRequestException, host: ArgumentsHost) {

    // TODO: GraphQL?

    // TODO: Comprobar el mensaje -> esto es común a express también
    // const message = this.options?.errorContext?.message || this.defaultMessage;
    // const code = this.options?.errorContext?.code ?? 429;

    const type: ContextType = host.getType();

    if (type === 'http') {
      const response = host.switchToHttp().getResponse<Response>();
      const httpResponse = new HttpResponse(this.options?.errorContext);
      return httpResponse.createResponse(response);
    }

    if (type === 'rpc') {

      // const response = host.switchToRpc();
      // const rpcError = {
      //   code,
      //   message
      // };
    }

    if (type === 'ws') {
      const client = host.switchToWs().getClient<Response>();
      const wsResponse = new WsResponse(this.options?.errorContext);
      return wsResponse.sendResponse(client);
    }

    return exception;
  }
}
