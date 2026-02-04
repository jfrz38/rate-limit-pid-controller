import { Parameters } from "@jfrz38/pid-controller-core";
import { PidControllerMiddlewarePriority } from "../../middleware/types/pid-controller-middleware-options";

/**
 * Configuration options for PidController.
 */
export interface PidControllerOptions {
  /**
   * The core PID algorithm parameters.
   * Defines how the controller reacts to latency changes.
   * @example
   * ```ts
   * config: { pid: { KI: 0.1 }, threshold: { initial: 400 } }
   * ```
   * @see {@link Parameters}
   */
  config?: Parameters;
  /**
   * Request priority.
   */
  priority?: PidControllerMiddlewarePriority
}
