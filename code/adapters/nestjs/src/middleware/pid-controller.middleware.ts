import { Inject, Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

import { PidControllerMiddlewareHandler } from './pid-controller-middleware-handler';

@Injectable()
export class PidControllerMiddleware implements NestMiddleware {

  constructor(
    @Inject(PidControllerMiddlewareHandler)
    private readonly handler: PidControllerMiddlewareHandler,
  ) { }

  async use(req: Request, res: Response, next: NextFunction) {
    await this.handler.use(req, res, next);
  }
}
