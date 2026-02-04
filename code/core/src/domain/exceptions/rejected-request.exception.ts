export class RejectedRequestException extends Error {
    constructor(public readonly priority: number, public readonly threshold: number) {
        super(`Request rejected due to low priority: Priority: ${priority} over threshold: ${threshold}`);
    }
}
