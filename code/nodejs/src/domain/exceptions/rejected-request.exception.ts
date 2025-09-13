export class RejectedRequestException extends Error {
    constructor(priority: number, threshold: number) {
        super(`Request rejected due to low priority: Priority: ${priority} over threshold: ${threshold}`)
    }
}
