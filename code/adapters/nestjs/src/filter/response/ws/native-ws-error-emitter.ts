import { WsError } from "./ws-error";
import { WsErrorEmitter } from "./ws-error-emitter";

export class NativeWsErrorEmitter implements WsErrorEmitter {
    constructor(private readonly client: any) { }

    emitError(event: string, error: WsError): void {
        this.client.send(JSON.stringify({ event, ...error }));
    }
}
