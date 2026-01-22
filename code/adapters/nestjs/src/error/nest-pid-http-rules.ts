import { PidHttpRules } from "@jfrz38/pid-controller-shared";
import { PidRoutesConfig } from "./routes/pid-routes-config";

/**
 * Defines the operational boundaries and HTTP policies for the PID controller.
 * This interface groups both the response behavior and the route filtering logic.
 */
export interface NestPidHttpRules extends PidHttpRules {
    /**
   * Rules to determine which incoming requests should be processed or ignored
   * by the PID controller based on their path and HTTP method.
   * @see {@link PidRoutesConfig}
   */
    routes?: PidRoutesConfig,
}
