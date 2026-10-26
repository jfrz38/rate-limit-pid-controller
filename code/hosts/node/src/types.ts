export type U64Input = number | bigint;

export interface StatisticsOptions {
  minWindowMs?: U64Input;
  maxWindowMs?: U64Input;
  minSamples?: U64Input;
  minPercentileSamples?: U64Input;
  maxSamples?: U64Input;
  latencyPercentile?: number;
}

export interface PidOptions {
  proportionalGain?: number;
  integralGain?: number;
  derivativeGain?: number;
  intervalMs?: U64Input;
  maxDeltaPercentage?: number;
  integralDecay?: number;
}

export interface ControllerOptions {
  initialThreshold?: number;
  maxConcurrentRequests?: U64Input;
  maxQueuedRequests?: U64Input;
  queueTimeoutMs?: U64Input;
  queueTimeoutRatio?: number;
  statistics?: StatisticsOptions;
  pid?: PidOptions;
}

export interface StatisticsSnapshot {
  id: bigint;
  startedAtMs: bigint;
  endedAtMs: bigint;
  percentileLatencyMs: bigint;
  minimumLatencyMs: bigint;
  averageLatencyMs: number;
  successfulRequests: bigint;
  throughputPerSecond: number;
  maxInFlight: bigint;
}

export type ControllerDiagnosticEvent =
  | {
    type: 'threshold-changed';
    previous: number;
    current: number;
  }
  | {
    type: 'concurrency-changed';
    previous: bigint;
    current: bigint;
  }
  | {
    type: 'statistics-published';
    snapshot: StatisticsSnapshot;
  };

export type ControllerDiagnosticListener = (event: ControllerDiagnosticEvent) => void;

export type ConfigurationErrorPayload = { tag: string; val?: unknown };
export type ControllerErrorPayload = { tag: string; val?: unknown };
