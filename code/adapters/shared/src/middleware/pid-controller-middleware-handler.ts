import { PidControllerRateLimit } from "@jfrz38/pid-controller-core";
import { NextFunction, Request, Response } from 'express';
import { PidControllerMiddlewarePriority } from "./types/pid-controller-middleware-options";

export class PidControllerMiddlewareHandler {
    constructor(
        private readonly controller: PidControllerRateLimit,
        private readonly priority: PidControllerMiddlewarePriority | undefined
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
        if (!this.priority?.getPriority) {
            return undefined;
        }

        try {
            const value = Number(this.priority.getPriority(req));
            if (typeof value === 'number' && Number.isFinite(value)) {
                return value;
            }
        } catch { }

        return undefined;
    }
}
