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

  // TODO: Hay que ver si alguna de la lógica debería volver aquí
  // TODO: o quedarse en el interval queue
  // TODO: Por ejemplo, todos los cálculos de filtrar eventos... ¿no deberían
  // TODO: ir aquí y en el interval queue dejar únicamente la cola con los tiempos?
  // TODO: es decir, el interval queue te va a dar los eventos filtrados siempre en
  // TODO: el intervalo, pero no te va a dar filtrados por complete, requested...
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
      // TODO: Esto es lo mismo que latencies pero cambiando launched y completed
      const completed = request.getEventByType(Event.COMPLETED)!;
      const created = request.getEventByType(Event.CREATED)!;
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
    if (latencies.length === 0) return 0;
    // return Math.min(...latencies)
    return latencies.reduce((min, val) => val < min ? val : min, latencies[0] || 0);
  }

  public calculateCumulativePriorityDistribution(threshold: number): number {
    const priorities = this.intervalQueue.getPriorities();
    const percentile = 100 - threshold;
    return MathUtils.percentile(priorities, percentile);
  }
}
