import { PidControllerRateLimit, Parameters } from "@jfrz38/pid-controller-core";
import { Request, Response, NextFunction } from "express";

export const pidControllerMiddleware = (
    options: PidControllerMiddlewareOptions | undefined,
    config?: Parameters
) => {
    const controller = new PidControllerRateLimit(config);
    const middleware = createPidControllerMiddleware(controller, options);
    return {
        middleware
    };
};

export interface PidControllerMiddlewareOptions {
    priority: (req: Request) => number;
}

const createPidControllerMiddleware = (
    controller: PidControllerRateLimit,
    options: PidControllerMiddlewareOptions | undefined
) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        const priority = getPriority(req, options);
        try {
            await controller.run(() => {
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
    };
};

function getPriority(req: Request, options: PidControllerMiddlewareOptions | undefined): number | undefined {
    if (!options?.priority) {
        return undefined;
    }

    try {
        const value = options.priority(req);
        if (typeof value === 'number' && Number.isFinite(value)) {
            return value;
        }
        return undefined;
    } catch (error) {
        return undefined;
    }
}
