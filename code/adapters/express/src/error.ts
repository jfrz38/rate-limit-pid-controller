import { RejectedRequestException } from "@jfrz38/pid-controller-core";
import { NextFunction, Request, Response } from "express";

const defaultMessage = 'Too many requests, please try again later.';

export interface PidControllerErrorHandlerOptions {
    message?: string;
    retryAfter?: number;
}

export const pidControllerErrorHandler = (options: PidControllerErrorHandlerOptions = {}) => {
    return (error: any, _: Request, res: Response, next: NextFunction) => {
        if (res.headersSent) {
            return next(error);
        }

        if (error instanceof RejectedRequestException) {
            const message = options.message || defaultMessage;
            
            if (options.retryAfter) {
                res.set('Retry-After', String(options.retryAfter));
            }

            return res.status(429).json({
                error: 'RATE_LIMIT_EXCEEDED',
                message: message
            });
        }
        
        next(error);
    };
};
