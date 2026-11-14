import { Inject, Injectable, NestMiddleware } from '@nestjs/common';

import {
  PidControllerMiddlewareHandler,
  type NestMiddlewareNext,
  type NestMiddlewareRequest,
  type NestMiddlewareResponse,
} from './pid-controller-middleware-handler';

@Injectable()
export class PidControllerMiddleware implements NestMiddleware {

  constructor(
    @Inject(PidControllerMiddlewareHandler)
    private readonly handler: PidControllerMiddlewareHandler,
  ) { }

  async use(
    req: NestMiddlewareRequest,
    res: NestMiddlewareResponse,
    next: NestMiddlewareNext,
  ): Promise<void> {
    await this.handler.use(req, res, next);
  }
}
