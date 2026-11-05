import type { ControllerOptions } from '@jfrz38/adaptive-admission-node';
import { PidControllerMiddlewarePriority } from "../../middleware/types/pid-controller-middleware-options";

/**
 * Configuration options for PidController.
 */
export interface PidControllerOptions {
  /**
   * Native Rust adaptive admission controller configuration.
   * @example
   * ```ts
   * config: { pid: { integralGain: 0.1 }, initialThreshold: 400 }
   * ```
   * @see {@link ControllerOptions}
   */
  config?: ControllerOptions;
  /**
   * Request priority.
   */
  priority?: PidControllerMiddlewarePriority
}
