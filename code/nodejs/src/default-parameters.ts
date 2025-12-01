import { Parameters, RequiredParameters } from "./domain/types/parameters";

export class DefaultOptions {
    private static readonly DEFAULT_VALUES: RequiredParameters = {
        threshold: {
            initial: 768
        },
        log: {
            level: 'warn',
        },
        pid: {
            KP: 0.1,
            KI: 1.4,
            interval: 500
        },
        timeout: {
            priorityQueue: {
                value: 500,
                ratio: 0.33
            }
        },
        capacity: {
            maxConcurrentRequests: 10,
            cores: require('os').cpus().length
        },
        statistics: {
            maxRequests: 1000,
            minRequestsForStats: 5,
            minRequestsForLatencyPercentile: 250,
            latencyPercentile: 90,
            requestInterval: {
                minIntervalTime: 2,
                maxIntervalTime: 30
            }
        }
    }

    static get values(): RequiredParameters {
        return DefaultOptions.DEFAULT_VALUES;
    }

    static getRequiredOptions(options: Parameters): RequiredParameters {
        return { ...DefaultOptions.DEFAULT_VALUES, ...options };
    }
}
