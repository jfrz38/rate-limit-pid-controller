import {
  AdmissionRequestError,
  CancelledRequestError,
} from '@jfrz38/adaptive-admission-node';
import {
  admissionHttpErrorDescriptor,
  type ResponseError,
} from '@jfrz38/pid-controller-shared';
import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

type PlatformResponse = {
  destroyed?: boolean;
  raw?: {
    destroyed?: boolean;
    socket?: { destroyed?: boolean };
  };
  socket?: { destroyed?: boolean };
};

@Catch(AdmissionRequestError)
export class PidExceptionFilter implements ExceptionFilter {

  constructor(
    private readonly adapterHost: HttpAdapterHost,
    private readonly error?: ResponseError,
  ) { }

  catch(exception: unknown, host: ArgumentsHost) {
    if (host.getType() !== 'http') {
      throw exception;
    }

    const response = host.switchToHttp().getResponse<PlatformResponse>();
    if (exception instanceof CancelledRequestError && this.isDisconnected(response)) {
      return;
    }
    const descriptor = admissionHttpErrorDescriptor(exception, this.error);
    if (!descriptor) {
      throw exception;
    }
    const adapter = this.adapterHost.httpAdapter;

    if (adapter.isHeadersSent(response)) {
      return;
    }

    for (const [name, value] of Object.entries(descriptor.headers)) {
      adapter.setHeader(response, name, value);
    }
    return adapter.reply(response, descriptor.body, descriptor.statusCode);
  }

  private isDisconnected(response: PlatformResponse): boolean {
    return response.destroyed === true
      || response.socket?.destroyed === true
      || response.raw?.destroyed === true
      || response.raw?.socket?.destroyed === true;
  }
}
