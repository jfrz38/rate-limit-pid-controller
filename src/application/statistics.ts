import { Event } from "../domain/events";
import { NotEnoughStatsException } from "../domain/exceptions/not-enough-stats.exception";
import { Request } from "../domain/request";


export class Statistics {
  private static readonly MINIMUM_REQUESTS_FOR_STATS = 5;
  private static readonly MINIMUM_REQUESTS_FOR_LATENCY_PERCENTILE = 5;
  private static readonly LATENCY_PERCENTILE = 90;
  private static readonly INTERVAL_WIDTH_SECONDS = 5;

  private readonly maxRequests = 1000;
  private requests: Request[] = [];

  constructor() { }

  add(request: Request): void {
    if (this.requests.length >= this.maxRequests) {
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

  private computePercentile(arr: number[], percentile: number): number {
    const sorted = arr.slice().sort((a, b) => a - b);
    const k = (percentile / 100) * (sorted.length - 1);
    const f = Math.floor(k);
    const c = Math.ceil(k);
    if (f === c) return sorted[f];
    return sorted[f] + (k - f) * (sorted[c] - sorted[f]);
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

  private  calculateIntervalStart(intervalEnd: Date): Date {
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
    const priorities = this.requests.map((r) => r.priority).sort((a, b) => a - b);
    const index = Math.floor(((100 - threshold) / 100) * priorities.length);
    return priorities[Math.min(index, priorities.length - 1)] ?? 0;
  }
}
