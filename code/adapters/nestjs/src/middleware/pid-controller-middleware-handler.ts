import {
  AdaptiveAdmissionController,
  CancelledRequestError,
} from '@jfrz38/adaptive-admission-node';
import {
  normalizePriority,
  type PidControllerPriority,
} from '@jfrz38/pid-controller-shared';
import type { IncomingMessage, ServerResponse } from 'node:http';

export type NestMiddlewareRequest = IncomingMessage & {
  originalUrl?: string;
};

export type NestMiddlewareResponse = ServerResponse;
export type NestMiddlewareNext = (error?: unknown) => void;

class PrematureResponseCloseError extends Error {
  constructor() {
    super('The response closed before it finished');
    this.name = 'PrematureResponseCloseError';
  }
}

export class PidControllerMiddlewareHandler {
  constructor(
    private readonly controller: AdaptiveAdmissionController,
    private readonly priority?: PidControllerPriority<any>,
  ) {}

  async use(
    req: NestMiddlewareRequest,
    res: NestMiddlewareResponse,
    next: NestMiddlewareNext,
  ): Promise<void> {
    const abortController = new AbortController();
    const onAborted = () => abortController.abort();
    req.once('aborted', onAborted);
    if (req.aborted) {
      abortController.abort();
    }

    try {
      await this.controller.run(
        () => this.observeResponse(res, next),
        normalizePriority(req, this.priority),
        { signal: abortController.signal },
      );
    } catch (error) {
      if (this.isDisconnected(error, req, res)) {
        return;
      }
      next(error);
    } finally {
      req.removeListener('aborted', onAborted);
    }
  }

  private observeResponse(
    res: NestMiddlewareResponse,
    next: NestMiddlewareNext,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let terminal = false;

      const cleanup = () => {
        res.removeListener('finish', onFinish);
        res.removeListener('close', onClose);
        res.removeListener('error', onError);
      };
      const settle = (complete: () => void) => {
        if (terminal) {
          return;
        }
        terminal = true;
        cleanup();
        complete();
      };
      const onFinish = () => settle(resolve);
      const onClose = () => settle(() => {
        if (res.writableFinished) {
          resolve();
        } else {
          reject(new PrematureResponseCloseError());
        }
      });
      const onError = (error: Error) => settle(() => reject(error));

      res.once('finish', onFinish);
      res.once('close', onClose);
      res.once('error', onError);

      try {
        next();
      } catch (error) {
        settle(() => reject(error));
      }
    });
  }

  private isDisconnected(
    error: unknown,
    req: NestMiddlewareRequest,
    res: NestMiddlewareResponse,
  ): boolean {
    return (error instanceof CancelledRequestError || error instanceof PrematureResponseCloseError)
      && (req.aborted || req.destroyed || req.socket?.destroyed || res.destroyed);
  }
}
