import { vi, describe, expect, beforeEach } from 'vitest';

import { intervalManager } from "../../../src/core/shutdown/interval-manager";

describe('Interval Manager', () => {

    beforeEach(() => {
        vi.useFakeTimers();
        vi.spyOn(global, 'clearInterval');
        (intervalManager as any).intervals = new Set<NodeJS.Timeout>();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
        vi.clearAllMocks();
    });

    describe('Add', () => {
        test('when add one interval should be stored in intervals', () => {
            const interval = setInterval(() => { }, 1000);

            intervalManager.add(interval);

            const intervals = (intervalManager as any).intervals;

            expect(intervals.size).toBe(1);
            expect(intervals.values().next().value).toBe(interval);
        });

        test('when add same interval should be stored only one', () => {
            const interval = setInterval(() => { }, 1000);

            intervalManager.add(interval);
            intervalManager.add(interval);

            const intervals = (intervalManager as any).intervals;

            expect(intervals.size).toBe(1);
            expect(intervals.values().next().value).toBe(interval);
        });

        test('when add multiple different interval should be stored expected intervals', () => {
            const firstInterval = setInterval(() => { }, 1000);
            const secondInterval = setInterval(() => { }, 1000);

            intervalManager.add(firstInterval);
            intervalManager.add(secondInterval);
            intervalManager.add(firstInterval);

            const intervals = (intervalManager as any).intervals;

            expect(intervals.size).toBe(2);
            expect(intervals.has(firstInterval)).toBe(true);
            expect(intervals.has(secondInterval)).toBe(true);
        });

    });

    describe('Add All', () => {
        test('when addAll only one interval should be stored', () => {
            const interval = setInterval(() => { }, 1000);

            intervalManager.addAll([interval]);

            const intervals = (intervalManager as any).intervals;

            expect(intervals.size).toBe(1);
            expect(intervals.values().next().value).toBe(interval);
        });

        test('when addAll repeated interval should be stored only one', () => {
            const interval = setInterval(() => { }, 1000);

            intervalManager.addAll([interval, interval, interval]);

            const intervals = (intervalManager as any).intervals;

            expect(intervals.size).toBe(1);
            expect(intervals.values().next().value).toBe(interval);
        });

        test('when addAll multiple intervals should be stored expected intervals', () => {
            const firstInterval = setInterval(() => { }, 1000);
            const secondInterval = setInterval(() => { }, 1000);

            intervalManager.addAll([firstInterval, secondInterval, firstInterval]);

            const intervals = (intervalManager as any).intervals;

            expect(intervals.size).toBe(2);
            expect(intervals.has(firstInterval)).toBe(true);
            expect(intervals.has(secondInterval)).toBe(true);
        });
    });

    describe('Clear All', () => {
        test('when are not intervals should keep empty', () => {
            intervalManager.clearAll();

            const intervals = (intervalManager as any).intervals;

            expect(intervals.size).toBe(0);
            expect(clearInterval).not.toHaveBeenCalled();
        });

        test('when exist one interval should clear intervals', () => {
            const interval = setInterval(() => { }, 1000);
            const intervals = (intervalManager as any).intervals;
            intervals.add(interval);

            intervalManager.clearAll();

            expect(intervals.size).toBe(0);
            expect(clearInterval).toHaveBeenNthCalledWith(1, interval);
        });

        test('when exists multiple intervals should clear all intervals', () => {
            const firstInterval = setInterval(() => { }, 1000);
            const secondInterval = setInterval(() => { }, 1000);
            const intervals = (intervalManager as any).intervals;
            intervals.add(firstInterval);
            intervals.add(secondInterval);

            intervalManager.clearAll();

            expect(intervals.size).toBe(0);
            expect(clearInterval).toHaveBeenCalledTimes(2);
            expect(clearInterval).toHaveBeenCalledWith(firstInterval);
            expect(clearInterval).toHaveBeenCalledWith(secondInterval);
        });
    });
});
