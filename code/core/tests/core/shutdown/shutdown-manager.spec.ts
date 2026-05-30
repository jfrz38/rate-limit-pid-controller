import { vi, describe, expect, beforeEach, Mock, Mocked } from 'vitest';

import { Scheduler } from "../../../src/application/scheduler";
import { IntervalManager } from "../../../src/core/shutdown/interval-manager";
import { ShutdownManager } from "../../../src/core/shutdown/shutdown-manager";

describe('Shutdown Manager', () => {

    let scheduler: Mocked<Scheduler>;
    let intervalManager: Mocked<IntervalManager>;
    let shutdownManager: ShutdownManager;

    beforeEach(() => {
        scheduler = {
            terminate: vi.fn()
        } as unknown as Mocked<Scheduler>;
        intervalManager = {
            clearAll: vi.fn()
        } as unknown as Mocked<IntervalManager>;

        shutdownManager = new ShutdownManager(scheduler, intervalManager);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        process.removeAllListeners('SIGINT');
        process.removeAllListeners('SIGTERM');
    });

    test('should call scheduler terminate and interval manager clearAll when shutdown is called', () => {
        shutdownManager.shutdown();

        expect(scheduler.terminate).toHaveBeenCalledTimes(1);
        expect(intervalManager.clearAll).toHaveBeenCalledTimes(1);
    });

    test('shutdown should be idempotent', () => {
        shutdownManager.shutdown();
        shutdownManager.shutdown();

        expect(scheduler.terminate).toHaveBeenCalledTimes(1);
        expect(intervalManager.clearAll).toHaveBeenCalledTimes(1);
    });

    test('shutdown should remove registered process signal handlers', () => {
        const sigintBefore = process.listenerCount('SIGINT');
        const sigtermBefore = process.listenerCount('SIGTERM');

        shutdownManager.shutdown();

        expect(process.listenerCount('SIGINT')).toBe(sigintBefore - 1);
        expect(process.listenerCount('SIGTERM')).toBe(sigtermBefore - 1);
    });

    test('when SIGINT is called should shutdown program', () => {
        const exit = vi.spyOn(shutdownManager, 'shutdown').mockImplementation(() => undefined);

        process.emit('SIGINT');

        expect(exit).toHaveBeenCalledTimes(1);
    });

    test('when SIGTERM is called should shutdown program', () => {
        const exit = vi.spyOn(shutdownManager, 'shutdown').mockImplementation(() => undefined);

        process.emit('SIGTERM');

        expect(exit).toHaveBeenCalledTimes(1);
    });
});
