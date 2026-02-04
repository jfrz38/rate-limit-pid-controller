export class CalculationException extends Error {
    constructor(message: string) {
        super(`Error while calculating: ${message}`);
    }
}
