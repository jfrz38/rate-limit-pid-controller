import type { AdaptiveAdmissionError } from '@jfrz38/adaptive-admission-node';
import { adaptiveAdmissionHttpError } from './adaptive-admission-http-error';
import { ResponseError } from "./error/response-error";
import { FilterResponse } from "./filter-response";

export class HttpErrorResponse extends FilterResponse {
    private static readonly DEFAULT_RESPONSE_BODY = (error: string, message: string) => {
        return {
            error,
            message
        };
    };
    private static readonly DEFAULT_HIDE_PID_MESSAGE = true;

    private retryAfter: number | undefined;
    private hidePidMessage: boolean;
    protected code: number;
    protected response: any;

    constructor(
        readonly exception: AdaptiveAdmissionError,
        protected readonly responseError: ResponseError | undefined
    ) {
        super(responseError);

        const policy = adaptiveAdmissionHttpError(exception);
        if (!policy) {
            throw new TypeError(`Unsupported adaptive admission error: ${exception.name}`);
        }
        this.title = responseError?.title ?? policy.title;
        this.message = responseError?.message ?? policy.message;
        this.code = responseError?.code ?? policy.code;
        this.response = responseError?.response
            ? { ...responseError.response }
            : HttpErrorResponse.DEFAULT_RESPONSE_BODY(this.title, this.message);
        this.retryAfter = responseError?.retryAfter;
        this.hidePidMessage = responseError?.hideError ?? HttpErrorResponse.DEFAULT_HIDE_PID_MESSAGE;

        if (!this.hidePidMessage) {
            this.response.message = exception.message;
        }
    }

    public format(response: any) {
        if (this.retryAfter) {
            response.set('Retry-After', String(this.retryAfter));
        }

        return response
            .status(this.code)
            .json(this.response);
    }

}
