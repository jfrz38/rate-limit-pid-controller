import { ResponseError } from "./response-error";
import { PidRoutesConfig } from "./routes/pid-routes-config";

/**
 * Defines the operational boundaries and HTTP policies for the PID controller.
 * This interface groups both the response behavior and the route filtering logic.
 */
export interface PidHttpRules {
    /**
   * Configuration for the HTTP response sent when a request is rejected.
   * Allows customizing status codes, headers (like Retry-After), and the response body.
   * @see {@link ResponseError}
   */
    error?: ResponseError;
    /**
   * Rules to determine which incoming requests should be processed or ignored
   * by the PID controller based on their path and HTTP method.
   * @see {@link PidRoutesConfig}
   */
    routes?: PidRoutesConfig,
}
