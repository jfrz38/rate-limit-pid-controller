import { PidControllerMiddlewareHandler } from '@jfrz38/pid-controller-shared';
import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

@Injectable()
export class PidControllerMiddleware implements NestMiddleware {

  constructor(private readonly handler: PidControllerMiddlewareHandler) { }

  async use(req: Request, res: Response, next: NextFunction) {
    await this.handler.use(req, res, next);
  }
}
