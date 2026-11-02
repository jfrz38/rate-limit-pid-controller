import { AdaptiveAdmissionController, Priority } from '@jfrz38/adaptive-admission-node';
import type { NextFunction, Request, Response } from 'express';
import type { PidControllerMiddlewarePriority } from './types/pid-controller-middleware-options';

export class PidControllerMiddlewareHandler {
    constructor(
        private readonly controller: AdaptiveAdmissionController,
        private readonly priority: PidControllerMiddlewarePriority | undefined
    ) { }

    async use(req: Request, res: Response, next: NextFunction): Promise<void> {
        const priority = this.getPriority(req);
        const abortController = new AbortController();
        const onAborted = () => abortController.abort();
        req.once('aborted', onAborted);
        if (req.aborted) {
            abortController.abort();
        }

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
                        cleanup();
                        reject(err);
                    }
                });
            }, priority ?? Priority.default(), { signal: abortController.signal });
        } catch (error) {
            next(error);
        } finally {
            req.removeListener('aborted', onAborted);
        }
    }

    private getPriority(req: Request): Priority | undefined {
        if (!this.priority?.getPriority) {
            return undefined;
        }

        try {
            const value = Number(this.priority.getPriority(req));
            if (typeof value === 'number' && Number.isFinite(value)) {
                return Priority.fromTier(value);
            }
        } catch { /* Invalid application priorities use the default tier. */ }

        return undefined;
    }
}
