import { Parameters } from "@jfrz38/pid-controller-core";
import { PidHttpRules } from "../error/pid-error-response";

/**
 * Configuration options for the PidControllerModule.
 */
export interface PidModuleOptions {
  /**
   * The core PID algorithm parameters.
   * Defines how the controller reacts to latency changes.
   * @example
   * ```ts
   * pidConfig: { pid: { KI: 0.1 }, threshold: { initial: 400 } }
   * ```
   * @see {@link Parameters}
   */
  pidConfig?: Parameters;
  /**
   * HTTP-specific rules for the middleware.
   * Includes status codes, custom bodies, and route filtering.
   * @see {@link PidHttpRules}
   */
  rules?: PidHttpRules;
  /**
   * Optional function to extract priority from the incoming request.
   * Lower numbers represent higher priority in the PID queue.
   * @param req - The incoming Express/NestJS request object.
   * @returns A number representing the priority. Undefined will generate the lowest priority
   * @example
   * ```ts
   * getPriority: (req) => req.get('x-priority')
   * ```
   */
  getPriority?: (req: any) => number;
}
