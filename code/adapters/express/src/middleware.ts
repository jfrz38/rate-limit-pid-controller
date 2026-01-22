import { PidControllerRateLimit } from "@jfrz38/pid-controller-core";
import { PidControllerMiddlewareHandler, PidControllerOptions } from '@jfrz38/pid-controller-shared';
import { NextFunction, Request, Response } from "express";


export const pidControllerMiddleware = (options?: PidControllerOptions) => {
    const controller = new PidControllerRateLimit(options?.pidConfig);
    const handler = new PidControllerMiddlewareHandler(controller, options?.priority);
    const middleware = createPidControllerMiddleware(handler);
    return {
        middleware
    };
};

const createPidControllerMiddleware = (handler: PidControllerMiddlewareHandler) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        handler.use(req, res, next);
    };
};
