import { PidControllerRateLimit } from '@jfrz38/pid-controller-core';
import { Inject, Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { PidModuleOptions } from '../types/options';

@Injectable()
export class PidControllerMiddleware implements NestMiddleware {

  constructor(
    @Inject('PID_CONTROLLER') private readonly controller: PidControllerRateLimit,
    @Inject('PID_CONTROLLER_OPTIONS') private readonly options: PidModuleOptions
  ) { }

  async use(req: Request, res: Response, next: NextFunction) {
    const priority = this.getPriority(req);

    try {
      await this.controller.run(() => {
        return new Promise<void>((resolve, reject) => {
          const cleanup = () => {
            res.removeListener('finish', onFinish);
            res.removeListener('close', onClose);
            res.removeListener('error', onError);
          };
          const onFinish = () => { cleanup(); resolve(); };
          const onClose = () => { cleanup(); resolve(); };
          const onError = (err: any) => { cleanup(); reject(err); };

          res.once('finish', onFinish);
          res.once('close', onClose);
          res.once('error', onError);

          try {
            next();
          } catch (err) {
            reject(err);
          }
        });
      }, priority);
    } catch (error) {
      next(error);
    }
  }

  private getPriority(req: Request): number | undefined {
    if (!this.options.getPriority) {
      return undefined;
    }

    try {
      const value = Number(this.options.getPriority(req));
      return (typeof value === 'number' && Number.isFinite(value)) ? value : undefined;
    } catch {
      return undefined;
    }
  }
}
