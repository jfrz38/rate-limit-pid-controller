import { AdaptiveAdmissionController } from '@jfrz38/adaptive-admission-node';
import type { HttpPidControllerOptions } from '@jfrz38/pid-controller-shared';
import type { NextFunction, Request, Response } from 'express';

import { PidControllerMiddlewareHandler } from './pid-controller-middleware-handler';


export const pidControllerMiddleware = (options?: HttpPidControllerOptions) => {
    const controller = new AdaptiveAdmissionController(options?.pid?.config);
    const handler = new PidControllerMiddlewareHandler(controller, options?.pid?.priority);
    const middleware = createPidControllerMiddleware(handler);
    return {
        middleware,
        shutdown: () => controller.shutdown()
    };
};

const createPidControllerMiddleware = (handler: PidControllerMiddlewareHandler) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        await handler.use(req, res, next);
    };
};
