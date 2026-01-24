import { Parameters } from "@jfrz38/pid-controller-core";
import { PidControllerMiddlewarePriority } from "../../middleware/types/pid-controller-middleware-options";

/**
 * Configuration options for the PidControllerModule.
 */
export interface PidControllerOptions {
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
   * Request priority.
   */
  priority?: PidControllerMiddlewarePriority
}
