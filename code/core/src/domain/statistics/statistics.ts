import { Event } from "../events";
import { NotEnoughStatsException } from "../exceptions/not-enough-stats.exception";
import { IntervalQueue } from "../interval/interval-queue";
import { MathUtils } from "../math/math-utils";
import { Request } from "../request";
import { Statistics as StatisticsType } from "../types/statistics";

export class Statistics {
  private readonly minRequestsForStats: number;
  private readonly minRequestsForLatencyPercentile: number;
  private readonly latencyPercentile: number;

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

  public getAverageProcessingTime(): number {
    const validRequests = this.intervalQueue.getCompletedRequests();

    if (validRequests.length < this.minRequestsForStats) {
      throw new NotEnoughStatsException();
    }

    const durations = validRequests.map(request => {
      const completed = request.getEventTimestamp(Event.COMPLETED)!;
      const created = request.getEventTimestamp(Event.CREATED)!;
      return completed - created;
    });

    return MathUtils.average(durations);
  }

  public getPercentileLatencySuccessfulRequests(): number {
    const latencies = this.intervalQueue.getLatencies();

    if (latencies.length < this.minRequestsForLatencyPercentile) {
      throw new NotEnoughStatsException();
    }

    return MathUtils.percentile(latencies, this.latencyPercentile);
  }

  public getSuccessfulThroughput(): number {
    return this.intervalQueue.getLaunchedRequests().length;
  }

  public getLowestLatencyForInterval(): number {
    const latencies = this.intervalQueue.getLatencies();
    if (latencies.length === 0) {
      return 0;
    }

    return latencies.reduce((min, val) => val < min ? val : min, latencies[0] || 0);
  }

  public calculateCumulativePriorityDistribution(threshold: number): number {
    const priorities = this.intervalQueue.getPriorities();

    if (priorities.length < this.minRequestsForStats) {
      throw new NotEnoughStatsException();
    }

    return MathUtils.percentile(priorities, threshold);
  }
}
