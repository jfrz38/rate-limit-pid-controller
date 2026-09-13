export class ControllerShutdownException extends Error {
    constructor() {
        super('PID controller has been shut down');
        this.name = 'ControllerShutdownException';
    }
}
