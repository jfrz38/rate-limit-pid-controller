export type Timeout = {
    /** Configuration for priority queue timeout adjustments. */
    priorityQueue: {
        /**
         * Initial number of milliseconds to consider a request as evicted. Typically is 33% (modified by ratio value) of average request. 
         * @default 500
        */
        value: number,
        /**
         * Multiplier applied to the base timeout for adjustments. Typically is 0.33 (33%)
         * @default 0.33
        */
        ratio: number
    }
} 
