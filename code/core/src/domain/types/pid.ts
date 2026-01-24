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
    KD?: number
    /**
     * Interval for PID sampling in milliseconds.
     * @default 500
     * */
    interval: number
}
