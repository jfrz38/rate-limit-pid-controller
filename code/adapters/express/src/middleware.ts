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
    return async (req: Request, _: Response, next: NextFunction) => {
        const priority = getPriority(req, options);
        try {
            await controller.run(async () => {
                next();

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
