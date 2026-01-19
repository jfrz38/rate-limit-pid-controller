import { ErrorContext } from "../../../types/error-context";
import { FilterResponse } from "../filter-response";
import { NativeWsErrorEmitter } from "./native-ws-error-emitter";
import { SocketIoErrorEmitter } from "./socket-io-error-emitter";
import { WsError } from "./ws-error";
import { WsErrorEmitter } from "./ws-error-emitter";

export class WsResponse extends FilterResponse {

    private static readonly DEFAULT_RESPONSE = (message: string) => {
        return { message };
    };

    protected code: string | number | undefined;
    protected response: object | undefined;

    private error: WsError;

    constructor(protected readonly errorContext: ErrorContext | undefined) {
        super(errorContext);

        this.response = errorContext?.response || WsResponse.DEFAULT_RESPONSE(this.message);

        this.error = {
            code: errorContext?.code,
            message: this.message,
            meta: errorContext?.response || WsResponse.DEFAULT_RESPONSE(this.message)
        } as WsError;
    }

    public sendResponse(client: any): any {
        return this.getTransport(client).emitError(this.title.toLocaleLowerCase(), this.error);
    }

    private getTransport(client: any): WsErrorEmitter {
        if (typeof client.emit === 'function') {
            return new SocketIoErrorEmitter(client);
        }
        if (typeof client.send === 'function') {
            return new NativeWsErrorEmitter(client);
        }
        throw new Error('Unsupported WS client');
    }
}
