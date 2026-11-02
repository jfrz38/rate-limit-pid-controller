import { CancelledRequestError } from '@jfrz38/adaptive-admission-node';
import { adaptiveAdmissionHttpError, HttpErrorResponse, ResponseError } from '@jfrz38/pid-controller-shared';
import type { NextFunction, Request, Response } from 'express';

export const pidControllerErrorHandler = (responseOptions: ResponseError = {}) => {
    return (error: any, req: Request, res: Response, next: NextFunction) => {
        if (res.headersSent) {
            return next(error);
        }

        if (error instanceof CancelledRequestError && (req.aborted || res.destroyed)) {
            return;
        }

        if (adaptiveAdmissionHttpError(error)) {
            return new HttpErrorResponse(error, responseOptions).format(res);
        }

        next(error);
    };
};
