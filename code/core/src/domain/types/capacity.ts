export type Capacity = {
    /** Maximum number of concurrent request to be processed. Default is 10. */
    maxConcurrentRequests: number,
    /** Maximum number of cores to use. Default is maximum available. */
    cores: number
}
