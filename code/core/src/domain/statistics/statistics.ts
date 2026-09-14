import { NotEnoughStatsException } from "../exceptions/not-enough-stats.exception";
import { ExecutionBucket, IntervalQueue } from "../interval/interval-queue";
import { MathUtils } from "../math/math-utils";
import { Request } from "../request";
import { Statistics as StatisticsType } from "../types/statistics";

export class Statistics {
  private readonly minRequestsForStats: number;
  private readonly minRequestsForLatencyPercentile: number;
  private readonly latencyPercentile: number;
  private latestSnapshot?: StatisticsSnapshot;

  constructor(
    private readonly intervalQueue: IntervalQueue,
    options: StatisticsType
  ) {
    this.minRequestsForStats = options.minRequestsForStats;
    this.minRequestsForLatencyPercentile = options.minRequestsForLatencyPercentile;
    this.latencyPercentile = options.latencyPercentile;
  }

  public add(request: Request): void {
    this.intervalQueue.add(request);
  }

  public recordSuccessful(request: Request): void {
    this.intervalQueue.recordSuccessful(request);
  }

  public takeSnapshot(): StatisticsSnapshot | null | undefined {
    const bucket = this.intervalQueue.closeExecutionBucket(this.minRequestsForLatencyPercentile);
    if (bucket === undefined) {
      return undefined;
    }
    if (bucket === null || bucket.successfulRequests < this.minRequestsForStats) {
      return null;
    }

    this.latestSnapshot = this.toSnapshot(bucket);
    return this.latestSnapshot;
  }

  public getLatestSnapshot(): StatisticsSnapshot | undefined {
    return this.latestSnapshot;
  }

  public getAverageProcessingTime(): number {
    const averageLatency = this.intervalQueue.getAverageLatency(this.minRequestsForStats);
    if (averageLatency === undefined) {
      throw new NotEnoughStatsException();
    }
    return averageLatency;
  }

  public getPercentileLatencySuccessfulRequests(): number {
    if (!this.latestSnapshot) {
      throw new NotEnoughStatsException();
    }
    return this.latestSnapshot.percentileLatency;
  }

  public getSuccessfulThroughput(): number {
    return this.latestSnapshot?.successfulRequests ?? 0;
  }

  public getSuccessfulThroughputPerSecond(): number {
    return this.latestSnapshot?.throughputPerSecond ?? 0;
  }

  public getLowestLatencyForInterval(): number {
    return this.latestSnapshot?.minimumLatency ?? 0;
  }

  public calculateCumulativePriorityDistribution(threshold: number): number {
    const priorities = this.intervalQueue.getPriorities();

    if (priorities.length < this.minRequestsForStats) {
      throw new NotEnoughStatsException();
    }

    return MathUtils.percentile(priorities, threshold);
  }

  private toSnapshot(bucket: ExecutionBucket): StatisticsSnapshot {
    return {
      id: bucket.id,
      percentileLatency: MathUtils.percentile(bucket.latencies, this.latencyPercentile),
      minimumLatency: bucket.minimumLatency,
      averageLatency: bucket.averageLatency,
      successfulRequests: bucket.successfulRequests,
      throughputPerSecond: bucket.successfulRequests / bucket.durationSeconds,
    };
  }
}

export type StatisticsSnapshot = {
  id: number;
  percentileLatency: number;
  minimumLatency: number;
  averageLatency: number;
  successfulRequests: number;
  throughputPerSecond: number;
};
