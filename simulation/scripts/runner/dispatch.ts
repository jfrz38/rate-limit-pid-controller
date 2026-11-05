export interface DispatchLagSummary {
  samples: number;
  delayedRequests: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
}

export function dispatchDelayMs(targetTime: number, currentTime: number): number {
  return Math.max(0, targetTime - currentTime);
}

export class DispatchLagMetrics {
  private readonly lags: number[] = [];

  record(scheduledArrivalMs: number, actualArrivalMs: number): number {
    const lag = Math.max(0, actualArrivalMs - scheduledArrivalMs);
    this.lags.push(lag);
    return lag;
  }

  summarize(): DispatchLagSummary {
    if (this.lags.length === 0) return { samples: 0, delayedRequests: 0, p50Ms: 0, p95Ms: 0, maxMs: 0 };
    const sorted = [...this.lags].sort((left, right) => left - right);
    return {
      samples: sorted.length,
      delayedRequests: sorted.filter((lag) => lag > 1).length,
      p50Ms: percentile(sorted, 0.5),
      p95Ms: percentile(sorted, 0.95),
      maxMs: sorted.at(-1) ?? 0,
    };
  }
}

function percentile(values: number[], percentileValue: number): number {
  return values[Math.floor((values.length - 1) * percentileValue)];
}
