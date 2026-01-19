import { WsError } from "./ws-error";

export interface WsErrorEmitter {
  emitError(event: string, error: WsError): void;
}
