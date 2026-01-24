import { RejectedRequestException } from "@jfrz38/pid-controller-core";
import { ResponseError } from "./error/response-error";
import { FilterResponse } from "./filter-response";

export class HttpErrorResponse extends FilterResponse {
    private static readonly DEFAULT_CODE = 429;
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
        readonly exception: RejectedRequestException,
        protected readonly responseError: ResponseError | undefined
    ) {
        super(responseError);

        this.code = responseError?.code ?? HttpErrorResponse.DEFAULT_CODE;
        this.response = responseError?.response ?? HttpErrorResponse.DEFAULT_RESPONSE_BODY(this.title, this.message);
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
