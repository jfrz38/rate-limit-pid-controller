export type Pid = {
    /** 
     * Proportional gain.
     * @default 0.1
     * */
    KP: number,
    /**
     * Integral gain.
     * @default 1.4
     * */
    KI: number,
    /**
     * Derivative gain.
     * @default 0
     * */
    KD: number
    /**
     * Interval for PID sampling in milliseconds.
     * dt value will be this value in seconds
     * @default 500
     * */
    interval: number,
    /**
     * Maximum allowed change of the controller output per iteration, in percentage points.
     * Limits abrupt threshold changes.
     * Range: 0..100
     * @default 10
     */
    delta: number;
    /**
     * Decay factor applied to the integral term on each update.
     * Used to mitigate integral windup by gradually forgetting past error.
     * Range: 0..1 (0 = full reset each step, 1 = no decay).
     * @default 0.5
     */
    decayRatio: number;
}
