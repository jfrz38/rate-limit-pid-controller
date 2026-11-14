import { CancelledRequestError } from '@jfrz38/adaptive-admission-node';
import {
    admissionHttpErrorDescriptor,
    type ResponseError,
} from '@jfrz38/pid-controller-shared';
import type { NextFunction, Request, Response } from 'express';

export const pidControllerErrorHandler = (responseOptions: ResponseError = {}) => {
    return (error: any, req: Request, res: Response, next: NextFunction) => {
        if (res.headersSent) {
            return next(error);
        }

        if (error instanceof CancelledRequestError && (req.aborted || res.destroyed)) {
            return;
        }

        const descriptor = admissionHttpErrorDescriptor(error, responseOptions);
        if (descriptor) {
            res.set(descriptor.headers);
            return res.status(descriptor.statusCode).json(descriptor.body);
        }

        next(error);
    };
};
