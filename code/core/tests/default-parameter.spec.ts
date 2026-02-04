import * as os from 'os';
import { DefaultOptions } from '../src/default-parameters';
import { LogLevel } from '../src/domain/types/log-level';
import { deepMerge } from '../src/domain/types/parameters';

describe('DefaultOptions', () => {

    describe('static values getter', () => {
        test('should provide the exact hardcoded defaults', () => {
            const defaults = DefaultOptions.values;

            expect(defaults.threshold.initial).toBe(768);
            expect(defaults.log.level).toBe('warn');
            expect(defaults.pid.KP).toBe(0.2);
            expect(defaults.pid.decayRatio).toBe(0.5);
            expect(defaults.capacity.cores).toBe(os.cpus().length);
            expect(defaults.statistics.latencyPercentile).toBe(90);
        });

        test('should return a reference to the same object (singleton behavior)', () => {
            expect(DefaultOptions.values).toBe(DefaultOptions.values);
        });
    });

    describe('getRequiredOptions', () => {
        test('should return default values when no options are provided', () => {
            const options = DefaultOptions.getRequiredOptions({});

            expect(options).toEqual(DefaultOptions.values);
            expect(options).toHaveProperty('threshold');
            expect(options).toHaveProperty('pid');
            expect(options).toHaveProperty('statistics');
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

        test('should override specific nested properties while keeping others intact', () => {
            const overrides = {
                pid: { KP: 0.99 },
                statistics: { latencyPercentile: 20 }
            };

            const result = DefaultOptions.getRequiredOptions(overrides);

            expect(result.pid.KP).toBe(0.99);
            expect(result.statistics.latencyPercentile).toBe(20);

            expect(result.pid.KI).toBe(0.5);
            expect(result.statistics.minRequestsForLatencyPercentile).toBe(250);
            expect(result.log.level).toBe('warn');
        });

        test('should handle undefined values in overrides by falling back to defaults', () => {
            const overrides = {
                threshold: { initial: undefined },
                log: undefined
            } as any;

            const result = DefaultOptions.getRequiredOptions(overrides);

            expect(result.threshold.initial).toBe(768);
            expect(result.log.level).toBe('warn');
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

        test('should not mutate the original default values object', () => {
            const originalKp = DefaultOptions.values.pid.KP;

            DefaultOptions.getRequiredOptions({ pid: { KP: 999 } });

            expect(DefaultOptions.values.pid.KP).toBe(originalKp);
        });

        test('when override with invalid value breaking interface should set default value', () => {
            const overrides = { threshold: 0 } as any;

            const result = DefaultOptions.getRequiredOptions(overrides);

            expect(result).toHaveProperty('threshold.initial');
            expect(result.threshold.initial).toBe(768);
        });

        test('should return base when base is an object but override is a primitive', () => {
            const base = { a: 1 };
            const override = 42;

            const result = deepMerge(base, override);

            expect(result).toBe(base);
            expect(result).toEqual({ a: 1 });
        });

        test('should skip properties from the prototype in override', () => {
            const prototype = { inherited: 'I should be ignored' };
            const override = Object.create(prototype);
            override.own = 'I should be merged';

            const base = { inherited: 'default', own: 'default' };

            const result = deepMerge(base, override);

            expect(result.own).toBe('I should be merged');
            expect(result.inherited).toBe('default');
        });

        test('should handle objects as base correctly', () => {
            const base = { prop: 'value' };
            const result = deepMerge(base, { prop: 'new' });

            expect(typeof result).toBe('object');
            expect(Array.isArray(result)).toBe(false);
            expect(result.prop).toBe('new');
        });

        test('should handle arrays as base correctly', () => {
            const base = [1, 2, 3];
            const override = [4];

            const result = deepMerge(base, override);

            expect(Array.isArray(result)).toBe(true);
            expect(result).toEqual([4, 2, 3]);
            expect(result).not.toBe(base);
        });
    });
});
