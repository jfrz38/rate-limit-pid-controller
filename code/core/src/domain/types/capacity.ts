export type Capacity = {
    /**
     * Maximum number of concurrent request to be processed.
     * @default 10
     */
    maxConcurrentRequests: number,
    /** 
     * Maximum number of cores to use.
     * @default maximum available in current machine
     * */
    cores: number
}
