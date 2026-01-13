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

export type Parameters = Partial<RequiredParameters>;
