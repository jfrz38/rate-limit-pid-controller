import { Capacity } from "./capacity";
import { Log } from "./log";
import { Pid } from "./pid";
import { Statistics } from "./statistics";
import { Threshold } from "./threshold";
import { Timeout } from "./timeout";

/**
 * Configuration options for the PID controller and related components.
 */
export type RequiredParameters = {
    /** Dynamic threshold configuration used by the PID controller. */
    threshold: Threshold,
    /** Logging configuration. */
    log: Log,
    /** PID controller parameters. */
    pid: Pid
    /** Timeout configuration for requests. */
    timeout: Timeout,
    /** Capacity configuration for request processing. */
    capacity: Capacity,
    /** Statistics configuration. */
    statistics: Statistics
}

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object
    ? DeepPartial<T[K]>
    : T[K];
};

export type Parameters = DeepPartial<RequiredParameters>;

export function deepMerge<T>(base: T, override?: DeepPartial<T>): T {
  if (!override) { return base; }

  const result: any = { ...base };
  for (const key in override) {
    const value = override[key];
    if (value === undefined) { continue; }
    result[key] =
      typeof value === 'object' && value !== null
        ? deepMerge((base as any)[key], value)
        : value;
  }
  return result;
}
