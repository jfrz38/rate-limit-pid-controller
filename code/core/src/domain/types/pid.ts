export type Pid = {
    /** Proportional gain. Default is 0.1 */
    KP: number,
    /** Integral gain Default is 1.4 */
    KI: number
    /** Interval for PID sampling in milliseconds. Default is 500. */
    interval: number
}
