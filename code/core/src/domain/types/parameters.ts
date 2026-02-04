import { Capacity } from "./capacity";
import { Interval } from "./interval";
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
    statistics: Statistics,
    /** Interval queue configuration. */
    interval: Interval
}

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object
    ? DeepPartial<T[K]>
    : T[K];
};

export type Parameters = DeepPartial<RequiredParameters>;

export function deepMerge<T>(base: T, override?: any): T {
  if (override === undefined || override === null) {
     return base;
  }

  if (typeof base === 'object' && base !== null && (typeof override !== 'object' || override === null)) {
    return base;
  }

  const result: any = Array.isArray(base) ? [...base] : { ...base };

  for (const key in override) {
    if (!Object.prototype.hasOwnProperty.call(override, key)) {
       continue;
    }

    const value = override[key];
    if (value === undefined) {
       continue;
    }

    const baseValue = (base as any)[key];

    if (baseValue !== null && typeof baseValue === 'object' && !Array.isArray(baseValue)) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        result[key] = deepMerge(baseValue, value);
      } else {
        result[key] = baseValue;
      }
    } else {
      result[key] = value;
    }
  }
  return result;
}
