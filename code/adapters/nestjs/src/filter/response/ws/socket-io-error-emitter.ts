import { WsError } from "./ws-error";
import { WsErrorEmitter } from "./ws-error-emitter";

export class SocketIoErrorEmitter implements WsErrorEmitter {
    constructor(private readonly client: any) { }

    emitError(event: string, error: WsError): void {
        this.client.emit(event, error);
    }
}
