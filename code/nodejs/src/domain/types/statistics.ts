import { RequestInterval } from "./request-interval";

export type Statistics = {
    /** Maximum number of requests considered in statistics calculation per interval. Default is 1000. */
    maxRequests: number,
    /** Minimum number of requests required to generate reliable statistics. Default is  250. */
    minRequestsForStats: number,
    /** Minimum number of requests required to calculate latency percentiles. Default is 250. */
    minRequestsForLatencyPercentile: number,
    /** Latency percentile to use for aggregation (e.g., 90 for P90). Default is 90. */
    latencyPercentile: number
    /** Time window in seconds used for statistics calculation. */
    requestInterval: RequestInterval
}
