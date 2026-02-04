import { RequestInterval } from "./request-interval";

export type Interval = {
    /** Maximum number of requests allowed into interval queue. @default 1000 */
    maxRequests: number,
    /** Time window in seconds used for statistics calculation. */
    requestInterval: RequestInterval
}
