export interface WsError {
    code: string | number;
    message: string;
    meta?: unknown;
}
