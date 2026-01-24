import { PidControllerOptions, PidHttpRules } from "@jfrz38/pid-controller-shared";
import { NestPidHttpRules } from "../error/nest-pid-http-rules";

/**
 * Configuration options for the PidControllerModule.
 */
export interface NestPidModuleOptions extends PidControllerOptions {
  /**
   * HTTP-specific rules for the middleware.
   * Includes status codes, custom bodies, and route filtering.
   * @see {@link PidHttpRules}
   */
  rules?: NestPidHttpRules;
}
