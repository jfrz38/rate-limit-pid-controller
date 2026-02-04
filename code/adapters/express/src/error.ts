import { RejectedRequestException } from "@jfrz38/pid-controller-core";
import { HttpErrorResponse, ResponseError } from "@jfrz38/pid-controller-shared";
import { NextFunction, Request, Response } from "express";

export const pidControllerErrorHandler = (responseOptions: ResponseError = {}) => {
    return (error: any, _: Request, res: Response, next: NextFunction) => {
        if (res.headersSent) {
            return next(error);
        }

        if (error instanceof RejectedRequestException) {
            return new HttpErrorResponse(error, responseOptions).format(res);
        }

        next(error);
    };
};
