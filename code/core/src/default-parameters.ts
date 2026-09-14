import { Parameters, RequiredParameters, deepMerge } from "./domain/types/parameters";
import { Priority } from "./domain/priority";

export class DefaultOptions {
    private static readonly DEFAULT_VALUES: RequiredParameters = {
        threshold: {
            initial: Priority.ALLOW_ALL_THRESHOLD
        },
        log: {
            level: 'warn',
        },
        pid: {
            KP: 0.2,
            KI: 0.5,
            KD: 0,
            interval: 500,
            delta: 10,
            decayRatio: 0.5
        },
        timeout: {
            priorityQueue: {
                value: 500,
                ratio: 0.33
            }
        },
        capacity: {
            maxConcurrentRequests: 10
        },
        statistics: {
            minRequestsForStats: 5,
            minRequestsForLatencyPercentile: 250,
            latencyPercentile: 90
        },
        interval: {
            maxRequests: 1000,
            requestInterval: {
                minIntervalTime: 2,
                maxIntervalTime: 30
            }
        }
    };

    static get values(): RequiredParameters {
        return DefaultOptions.DEFAULT_VALUES;
    }

    static getRequiredOptions(options: Parameters): RequiredParameters {
        const parameters = deepMerge(DefaultOptions.DEFAULT_VALUES, options);
        validateParameters(parameters);
        return parameters;
    }

}

function validateParameters(parameters: RequiredParameters): void {
    const logLevels = new Set(['trace', 'debug', 'info', 'warn', 'error', 'fatal']);
    const finite = (name: string, value: number): void => {
        if (!Number.isFinite(value)) {
            throw new RangeError(`${name} must be finite`);
        }
    };
    const positiveInteger = (name: string, value: number): void => {
        finite(name, value);
        if (!Number.isInteger(value) || value <= 0) {
            throw new RangeError(`${name} must be a positive integer`);
        }
    };
    const range = (name: string, value: number, min: number, max: number): void => {
        finite(name, value);
        if (value < min || value > max) {
            throw new RangeError(`${name} must be between ${min} and ${max}`);
        }
    };

    if (!logLevels.has(parameters.log.level)) {
        throw new RangeError('log.level must be one of trace, debug, info, warn, error, fatal');
    }
    range('threshold.initial', parameters.threshold.initial, 0, Priority.ALLOW_ALL_THRESHOLD);
    finite('pid.KP', parameters.pid.KP);
    finite('pid.KI', parameters.pid.KI);
    finite('pid.KD', parameters.pid.KD);
    if (parameters.pid.KP < 0 || parameters.pid.KI < 0 || parameters.pid.KD < 0) {
        throw new RangeError('PID gains must be non-negative');
    }
    positiveInteger('pid.interval', parameters.pid.interval);
    range('pid.delta', parameters.pid.delta, 0, 100);
    range('pid.decayRatio', parameters.pid.decayRatio, 0, 1);
    positiveInteger('timeout.priorityQueue.value', parameters.timeout.priorityQueue.value);
    range('timeout.priorityQueue.ratio', parameters.timeout.priorityQueue.ratio, 0, 1);
    if (parameters.timeout.priorityQueue.ratio === 0) {
        throw new RangeError('timeout.priorityQueue.ratio must be greater than 0');
    }
    positiveInteger('capacity.maxConcurrentRequests', parameters.capacity.maxConcurrentRequests);
    positiveInteger('statistics.minRequestsForStats', parameters.statistics.minRequestsForStats);
    positiveInteger('statistics.minRequestsForLatencyPercentile', parameters.statistics.minRequestsForLatencyPercentile);
    range('statistics.latencyPercentile', parameters.statistics.latencyPercentile, 0, 100);
    positiveInteger('interval.maxRequests', parameters.interval.maxRequests);
    finite('interval.requestInterval.minIntervalTime', parameters.interval.requestInterval.minIntervalTime);
    finite('interval.requestInterval.maxIntervalTime', parameters.interval.requestInterval.maxIntervalTime);
    if (parameters.interval.requestInterval.minIntervalTime <= 0 ||
        parameters.interval.requestInterval.maxIntervalTime <= parameters.interval.requestInterval.minIntervalTime) {
        throw new RangeError('request interval must have 0 < minIntervalTime < maxIntervalTime');
    }
    if (parameters.statistics.minRequestsForStats > parameters.interval.maxRequests ||
        parameters.statistics.minRequestsForLatencyPercentile > parameters.interval.maxRequests) {
        throw new RangeError('statistical sample requirements cannot exceed interval.maxRequests');
    }
}
