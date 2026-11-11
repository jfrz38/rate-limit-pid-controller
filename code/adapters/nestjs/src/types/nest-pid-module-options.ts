import { HttpPidControllerOptions } from "@jfrz38/pid-controller-shared";
import { PidRoutesConfig } from "../error/routes/pid-routes-config";

/**
 * Configuration options for the PidControllerModule.
 */
export interface NestPidModuleOptions<Request = any> extends HttpPidControllerOptions<Request> {
  /**
   * HTTP-routes rules for the middleware.
   * @see {@link PidRoutesConfig}
   */
  routes?: PidRoutesConfig,
}
