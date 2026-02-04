import { FilterResponse } from "../../src/filter/filter-response";

class TestResponse extends FilterResponse {
    protected code = 200;
    protected response = {};
}

describe('FilterResponse (Base)', () => {

    const defaultTitle = 'RATE_LIMIT_EXCEEDED';
    const defaultMessage = 'Too many requests, please try again later.';
    
    test('when created with undefined values should create with default values', () => {
        const res = new TestResponse(undefined);
        expect((res as any).title).toBe(defaultTitle);
        expect((res as any).message).toBe(defaultMessage);
    });
});
