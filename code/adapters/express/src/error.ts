import { RejectedRequestException } from "@jfrz38/pid-controller-core";
import { NextFunction, Request, Response } from "express";

const defaultMessage = 'Too many requests, please try again later.';
const defaultCode = 429;
const defaultBody = (message: string) => {
    return { error: 'RATE_LIMIT_EXCEEDED', message };
};

// TODO: in iss-22 shared package will be created ; since a similar interface is necessary for
// TODO: NestJS ; maybe this interface will be in a common package
// TODO: Also default values in parameters is a common logic
// TODO: And hidePidMessage property will be added.
export interface PidControllerErrorHandlerOptions {
    message?: string;
    retryAfter?: number;
    code?: number;
    responseBody?: any
}

export const pidControllerErrorHandler = (options: PidControllerErrorHandlerOptions = {}) => {
    return (error: any, _: Request, res: Response, next: NextFunction) => {
        if (res.headersSent) {
            return next(error);
        }

        if (error instanceof RejectedRequestException) {
            const message = options.message ?? defaultMessage;
            const code = options.code ?? defaultCode;
            const responseBody = options.responseBody ?? defaultBody(message);

            if (options.retryAfter) {
                res.set('Retry-After', String(options.retryAfter));
            }

            return res.status(code).json(responseBody);
        }

        next(error);
    };
};
