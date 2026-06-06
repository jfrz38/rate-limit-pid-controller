export class EvictedRequestException extends Error {
    constructor(public readonly priority: number) {
        super(`Request evicted from priority queue due to timeout: Priority: ${priority}`);
    }
}
