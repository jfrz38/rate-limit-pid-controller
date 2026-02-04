export type Statistics = {
    /** Minimum number of requests required to generate reliable statistics. @default 250 */
    minRequestsForStats: number,
    /** Minimum number of requests required to calculate latency percentiles. @default 250 */
    minRequestsForLatencyPercentile: number,
    /** Latency percentile to use for aggregation (e.g., 90 for P90). @default 90 */
    latencyPercentile: number
}
