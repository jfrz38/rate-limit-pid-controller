import { ResponseError } from "../../error/response-error";

export abstract class FilterResponse {
    private static readonly DEFAULT_TITLE = 'ERROR_RATE_LIMIT_EXCEEDED';
    private static readonly DEFAULT_MESSAGE = 'Too many requests, please try again later.';

    protected title: string;
    protected message: string;
    protected abstract code: string | number | undefined;
    protected abstract response: object | undefined;

    constructor(protected readonly responseError: ResponseError | undefined) {
        this.title = responseError?.title || FilterResponse.DEFAULT_TITLE;
        this.message = responseError?.message || FilterResponse.DEFAULT_MESSAGE;
    }
}
