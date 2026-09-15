import { Event } from "../events";
import { Request } from "../request";
import { RequestInterval } from "./request-interval";

export class IntervalQueue {
    private readonly priorities: number[] = [];
    private latencies: number[] = [];
    private successfulRequests = 0;
    private latencyTotal = 0;
    private bucketStartedAt = performance.now();
    private bucketId = 0;

    constructor(
        private readonly requestInterval: RequestInterval,
        private readonly maxRequests: number
    ) { }

    public add(request: Request): void {
        if (this.priorities.length >= this.maxRequests) {
            this.priorities.shift();
        }
        this.priorities.push(request.priority);
    }

    public recordSuccessful(request: Request): void {
        const launched = request.getEventTimestamp(Event.LAUNCHED);
        const completed = request.getEventTimestamp(Event.COMPLETED);
        if (launched === undefined || completed === undefined) {
            return;
        }

        const latency = completed - launched;
        if (!Number.isFinite(latency) || latency < 0) {
            return;
        }

        this.successfulRequests++;
        this.latencyTotal += latency;
        if (this.latencies.length >= this.maxRequests) {
            this.latencies.shift();
        }
        this.latencies.push(latency);
    }

    public closeExecutionBucket(minRequests: number): ExecutionBucket | null | undefined {
        const now = performance.now();
        const elapsed = now - this.bucketStartedAt;
        const isReady = elapsed >= this.requestInterval.minimumMilliseconds && this.successfulRequests >= minRequests;
        const hasExpired = elapsed >= this.requestInterval.maximumMilliseconds;

        if (!isReady && !hasExpired) {
            return undefined;
        }

        if (this.successfulRequests === 0) {
            this.resetExecutionBucket(now);
            return null;
        }

        const bucket: ExecutionBucket = {
            id: this.bucketId++,
            latencies: [...this.latencies],
            successfulRequests: this.successfulRequests,
            averageLatency: this.latencyTotal / this.successfulRequests,
            minimumLatency: Math.min(...this.latencies),
            durationSeconds: elapsed / 1000,
        };
        this.resetExecutionBucket(now);
        return bucket;
    }

    public getAverageLatency(minRequests: number): number | undefined {
        const elapsed = performance.now() - this.bucketStartedAt;
        if (elapsed < this.requestInterval.minimumMilliseconds || this.successfulRequests < minRequests) {
            return undefined;
        }
        return this.latencyTotal / this.successfulRequests;
    }

    public getPriorities(): number[] {
        return [...this.priorities];
    }

    private resetExecutionBucket(now: number): void {
        this.bucketStartedAt = now;
        this.latencies = [];
        this.successfulRequests = 0;
        this.latencyTotal = 0;
    }
}

export type ExecutionBucket = {
    id: number;
    latencies: number[];
    successfulRequests: number;
    averageLatency: number;
    minimumLatency: number;
    durationSeconds: number;
};
