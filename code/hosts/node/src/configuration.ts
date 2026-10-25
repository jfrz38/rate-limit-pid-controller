import {
  componentErrorPayload,
  createComponentController,
  defaultComponentConfig,
  type ComponentConfig,
} from './component-runtime.js';
import { ConfigurationError } from './errors.js';
import type { ConfigurationErrorPayload, ControllerOptions, U64Input } from './types.js';

const MAX_U64 = (1n << 64n) - 1n;

function toU64(field: string, value: U64Input): bigint {
  let converted: bigint;
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw new RangeError(`${field} must be a safe integer or bigint`);
    }
    converted = BigInt(value);
  } else {
    converted = value;
  }
  if (converted < 0n || converted > MAX_U64) {
    throw new RangeError(`${field} must be between 0 and 2^64 - 1`);
  }
  return converted;
}

export function resolveConfiguration(options: ControllerOptions = {}): ComponentConfig {
  const defaults = defaultComponentConfig();
  return {
    initialThreshold: options.initialThreshold ?? defaults.initialThreshold,
    maxConcurrentRequests: options.maxConcurrentRequests === undefined
      ? defaults.maxConcurrentRequests
      : toU64('maxConcurrentRequests', options.maxConcurrentRequests),
    maxQueuedRequests: options.maxQueuedRequests === undefined
      ? defaults.maxQueuedRequests
      : toU64('maxQueuedRequests', options.maxQueuedRequests),
    queueTimeoutMs: options.queueTimeoutMs === undefined
      ? defaults.queueTimeoutMs
      : toU64('queueTimeoutMs', options.queueTimeoutMs),
    queueTimeoutRatio: options.queueTimeoutRatio ?? defaults.queueTimeoutRatio,
    statistics: {
      minWindowMs: options.statistics?.minWindowMs === undefined
        ? defaults.statistics.minWindowMs
        : toU64('statistics.minWindowMs', options.statistics.minWindowMs),
      maxWindowMs: options.statistics?.maxWindowMs === undefined
        ? defaults.statistics.maxWindowMs
        : toU64('statistics.maxWindowMs', options.statistics.maxWindowMs),
      minSamples: options.statistics?.minSamples === undefined
        ? defaults.statistics.minSamples
        : toU64('statistics.minSamples', options.statistics.minSamples),
      minPercentileSamples: options.statistics?.minPercentileSamples === undefined
        ? defaults.statistics.minPercentileSamples
        : toU64('statistics.minPercentileSamples', options.statistics.minPercentileSamples),
      maxSamples: options.statistics?.maxSamples === undefined
        ? defaults.statistics.maxSamples
        : toU64('statistics.maxSamples', options.statistics.maxSamples),
      latencyPercentile: options.statistics?.latencyPercentile ?? defaults.statistics.latencyPercentile,
    },
    pid: {
      proportionalGain: options.pid?.proportionalGain ?? defaults.pid.proportionalGain,
      integralGain: options.pid?.integralGain ?? defaults.pid.integralGain,
      derivativeGain: options.pid?.derivativeGain ?? defaults.pid.derivativeGain,
      intervalMs: options.pid?.intervalMs === undefined
        ? defaults.pid.intervalMs
        : toU64('pid.intervalMs', options.pid.intervalMs),
      maxDeltaPercentage: options.pid?.maxDeltaPercentage ?? defaults.pid.maxDeltaPercentage,
      integralDecay: options.pid?.integralDecay ?? defaults.pid.integralDecay,
    },
  };
}

export function createValidatedComponentController(options: ControllerOptions = {}) {
  try {
    return createComponentController(resolveConfiguration(options));
  } catch (error) {
    const payload = componentErrorPayload(error);
    if (isErrorPayload(payload)) {
      throw new ConfigurationError(payload);
    }
    throw error;
  }
}

function isErrorPayload(payload: unknown): payload is ConfigurationErrorPayload {
  return typeof payload === 'object'
    && payload !== null
    && 'tag' in payload
    && typeof (payload as { tag: unknown }).tag === 'string';
}
