import { RejectedRequestException } from "@jfrz38/pid-controller-core";
import { ResponseError } from "../../../error/response-error";
import { FilterResponse } from "../filter-response";

export class HttpResponse extends FilterResponse {
    private static readonly DEFAULT_CODE = 429;
    private static readonly DEFAULT_RESPONSE_BODY = (message: string) => {
        return {
            error: 'RATE_LIMIT_EXCEEDED',
            message
        };
    };
    private static readonly HIDE_PID_MESSAGE = true;

    private retryAfter: number | undefined;
    protected code: number;
    protected response: any;

    constructor(
        readonly exception: RejectedRequestException,
        protected readonly responseError: ResponseError | undefined) {
        super(responseError);

        this.code = responseError?.code || HttpResponse.DEFAULT_CODE;
        this.response = responseError?.response || HttpResponse.DEFAULT_RESPONSE_BODY(this.message);
        this.retryAfter = responseError?.retryAfter;
        if (!HttpResponse.HIDE_PID_MESSAGE) {
            this.response.message = exception.message;
        }
    }

    public createResponse(response: any) {
        if (this.retryAfter) {
            response.set('Retry-After', String(this.retryAfter));
        }

        return response
            .status(this.code)
            .json(this.response);
    }

}
