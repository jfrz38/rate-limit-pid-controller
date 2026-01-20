import { ResponseError } from "./response-error";
import { PidRoutesConfig } from "./routes/pid-routes-config";

export interface PidErrorResponse {
    error?: ResponseError;
    routes?: PidRoutesConfig,
}
