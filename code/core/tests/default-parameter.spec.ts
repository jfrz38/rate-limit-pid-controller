import * as os from 'os';
import { DefaultOptions } from '../src/default-parameters';
import { LogLevel } from '../src/domain/types/log-level';
import { deepMerge } from '../src/domain/types/parameters';

describe('DefaultOptions', () => {

    describe('values', () => {
        test('should return the full set of default values', () => {
            const defaults = DefaultOptions.values;

            expect(defaults.threshold.initial).toBe(DefaultOptions.values.threshold.initial);
            expect(defaults.pid.KP).toBe(DefaultOptions.values.pid.KP);
            expect(defaults.capacity.cores).toBe(os.cpus().length);
            expect(defaults.log.level).toBe('warn');
        });

        test('should be immutable (static check)', () => {
            const defaults1 = DefaultOptions.values;
            const defaults2 = DefaultOptions.values;

            expect(defaults1).toEqual(defaults2);
        });
    });

    describe('getRequiredOptions', () => {
        test('should return default values when no options are provided', () => {
            const options = DefaultOptions.getRequiredOptions({});

            expect(options).toEqual(DefaultOptions.values);
        });

        test('should override top-level properties correctly', () => {
            const newLogLevel = 'error' as LogLevel;
            const overrides = {
                log: { level: newLogLevel }
            };
            const options = DefaultOptions.getRequiredOptions(overrides);

            expect(options.log.level).toBe(newLogLevel);
            expect(options.threshold.initial).toBe(DefaultOptions.values.threshold.initial);
        });

        test('should perform a deep merge on nested objects', () => {
            const newKP = 0.5;
            const overrides = {
                pid: {
                    KP: newKP
                }
            };
            const options = DefaultOptions.getRequiredOptions(overrides);

            expect(options.pid.KP).toBe(newKP);
            expect(options.pid.KI).toBe(DefaultOptions.values.pid.KI);
            expect(options.pid.interval).toBe(DefaultOptions.values.pid.interval);
        });

        test('should override deeply nested properties (statistics)', () => {
            const newMinIntervalTime = 30;
            const overrides = {
                statistics: {
                    requestInterval: {
                        minIntervalTime: newMinIntervalTime
                    }
                }
            };
            const options = DefaultOptions.getRequiredOptions(overrides);

            expect(options.statistics.requestInterval.minIntervalTime).toBe(newMinIntervalTime);
            expect(options.statistics.requestInterval.maxIntervalTime).toBe(DefaultOptions.values.statistics.requestInterval.maxIntervalTime);
            expect(options.statistics.maxRequests).toBe(DefaultOptions.values.statistics.maxRequests);
        });

        test('should ignore undefined values in overrides', () => {
            const overrides = {
                threshold: {
                    initial: undefined
                }
            };
            const options = DefaultOptions.getRequiredOptions(overrides);

            expect(options.threshold.initial).toBe(DefaultOptions.values.threshold.initial);
        });

        test('should handle completely new structures or nulls gracefully via deepMerge', () => {
            const options = DefaultOptions.getRequiredOptions({ timeout: {} });

            expect(options.timeout.priorityQueue.value).toBe(DefaultOptions.values.timeout.priorityQueue.value);
        });
    });

    describe('Deep merge', () => {
        test('should return base when override is undefined', () => {
            const base = { a: 1 };
            const result = deepMerge(base, undefined as any);

            expect(result).toBe(base);
            expect(result).toEqual({ a: 1 });
        });

        test('should return base when override is null', () => {
            const base = { a: 1 };
            const result = deepMerge(base, null as any);

            expect(result).toBe(base);
        });
    });
});
