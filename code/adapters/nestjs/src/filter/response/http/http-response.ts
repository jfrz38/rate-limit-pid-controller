import { Response } from "express";
import { ErrorContext } from "../../../types/error-context";
import { FilterResponse } from "../filter-response";

export class HttpResponse extends FilterResponse {
    private static readonly DEFAULT_CODE = 429;
    private static readonly DEFAULT_RESPONSE_BODY = (message: string) => {
        return {
            error: 'RATE_LIMIT_EXCEEDED',
            message
        };
    };

    private retryAfter: number | undefined;
    protected code: number;
    protected response: object;

    constructor(protected readonly errorContext: ErrorContext | undefined) {
        super(errorContext);

        this.code = errorContext?.code || HttpResponse.DEFAULT_CODE;
        this.response = errorContext?.response || HttpResponse.DEFAULT_RESPONSE_BODY(this.message);
        this.retryAfter = errorContext?.retryAfter;
    }

    public createResponse(response: Response): Response {
        this.addHeader(response);
        return response.status(this.code).json(this.response);
    }

    private addHeader(response: Response) {
        if(!this.retryAfter) {
            return;
        }

        const name = 'Retry-After';
        const time =  String(this.retryAfter);

        if(typeof response.header === 'function') {
            response.header(name, time);
        } else if (typeof response.set === 'function') {
            response.set(name, time);
        }

        throw new Error('Unsupported HTTP client');
    }

}
