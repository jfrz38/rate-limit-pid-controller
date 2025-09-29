import { Event } from "../domain/events";
import { NotEnoughStatsException } from "../domain/exceptions/not-enough-stats.exception";
import { MathUtils } from "../domain/math/math-utils";
import { Request } from "../domain/request";

export class Statistics {
  private static readonly MINIMUM_REQUESTS_FOR_STATS = 5;
  private static readonly MINIMUM_REQUESTS_FOR_LATENCY_PERCENTILE = 5;
  private static readonly LATENCY_PERCENTILE = 90;
  private static readonly INTERVAL_WIDTH_SECONDS = 5;
  private readonly MAX_REQUESTS = 1000;

  private requests: Request[] = [];

  constructor() { }

  add(request: Request): void {
    if (this.requests.length >= this.MAX_REQUESTS) {
      this.requests.shift();
    }
    this.requests.push(request);
  }

  getAverageProcessingTime(): number {
    const validRequests = this.requests.filter((request: Request) => request.hasEventCreatedAndCompleted());

    if (validRequests.length < Statistics.MINIMUM_REQUESTS_FOR_STATS) {
      throw new NotEnoughStatsException();
    }

    const average = validRequests.reduce((accumulator, request: Request) => {
      const completed = request.getEventByType(Event.COMPLETED)!;
      const created = request.getEventByType(Event.CREATED)!;
      return accumulator + (completed.getTime() - created.getTime());
    }, 0) / validRequests.length;

    return average;
  }

  getPercentileLatencySuccessfulRequests(intervalEnd: Date): number {
    const latencies = this.getLatencySuccessfulRequestsForInterval(intervalEnd);

    if (latencies.length < Statistics.MINIMUM_REQUESTS_FOR_LATENCY_PERCENTILE) {
      throw new NotEnoughStatsException();
    }

    return this.computePercentile(latencies, Statistics.LATENCY_PERCENTILE);
  }

  private computePercentile(values: number[], percentile: number): number {
    const sorted = values.slice().sort((a, b) => a - b);
    const index = (percentile / 100) * (sorted.length - 1);
    const lowerIndex = Math.floor(index);
    const upperIndex = Math.ceil(index);
    if (lowerIndex === upperIndex) return sorted[lowerIndex];
    return sorted[lowerIndex] + (index - lowerIndex) * (sorted[upperIndex] - sorted[lowerIndex]);
  }

  getThroughputForInterval(intervalEnd: Date): number {
    return this.filterSuccessfulRequestsInInterval(this.calculateIntervalStart(intervalEnd)).length;
  }

  getLowestLatencyForInterval(intervalEnd: Date): number {
    const latencies = this.getLatencySuccessfulRequestsForInterval(intervalEnd);
    return latencies.length ? Math.min(...latencies) : 0;
  }

  private getLatencySuccessfulRequestsForInterval(intervalEnd: Date): number[] {
    return this.getSuccessfulRequestsForInterval(intervalEnd).map((request) => {
      const launched = request.getEventByType(Event.LAUNCHED)!;
      const completed = request.getEventByType(Event.COMPLETED)!;
      return completed.getTime() - launched.getTime();
    });
  }

  private getSuccessfulRequestsForInterval(intervalEnd: Date): Request[] {
    return this.filterSuccessfulRequestsInInterval(this.calculateIntervalStart(intervalEnd));
  }

  private calculateIntervalStart(intervalEnd: Date): Date {
    return new Date(intervalEnd.getTime() - Statistics.INTERVAL_WIDTH_SECONDS * 1000);
  }

  private filterSuccessfulRequestsInInterval(intervalStart: Date): Request[] {
    return this.requests.filter(
      (request: Request) =>
        request.hasEventCompletedAndLaunched() &&
        request.getEventByType(Event.LAUNCHED)!.getTime() > intervalStart.getTime()
    )
  }

  calculateCumulativePriorityDistribution(threshold: number): number {
    const priorities = this.requests.map((request) => request.priority);
    const percentile = 100 - threshold;
    return MathUtils.percentile(priorities, percentile);
  }
}
