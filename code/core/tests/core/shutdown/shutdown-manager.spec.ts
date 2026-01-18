import { Scheduler } from "../../../src/application/scheduler";
import { IntervalManager } from "../../../src/core/shutdown/interval-manager";
import { ShutdownManager } from "../../../src/core/shutdown/shutdown-manager";

describe('Shutdown Manager', () => {

    let scheduler: jest.Mocked<Scheduler>;
    let intervalManager: jest.Mocked<IntervalManager>;
    let shutdownManager: ShutdownManager;

    beforeEach(() => {
        scheduler = {
            terminate: jest.fn()
        } as unknown as jest.Mocked<Scheduler>;
        intervalManager = {
            clearAll: jest.fn()
        } as unknown as jest.Mocked<IntervalManager>;

        shutdownManager = new ShutdownManager(scheduler, intervalManager);
    });

    afterEach(() => {
        jest.restoreAllMocks();
        process.removeAllListeners('SIGINT');
        process.removeAllListeners('SIGTERM');
    });

    test('should call scheduler terminate and interval manager clearAll when shutdown is called', () => {
        const exit = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);

        shutdownManager.shutdown();

        expect(scheduler.terminate).toHaveBeenCalledTimes(1);
        expect(intervalManager.clearAll).toHaveBeenCalledTimes(1);
        expect(exit).toHaveBeenNthCalledWith(1, 0);
    });

    test('when SIGINT is called should shutdown program', () => {
        const exit = jest.spyOn(shutdownManager, 'shutdown').mockImplementation(() => undefined);

        process.emit('SIGINT');

        expect(exit).toHaveBeenCalledTimes(1);
    });

    test('when SIGTERM is called should shutdown program', () => {
        const exit = jest.spyOn(shutdownManager, 'shutdown').mockImplementation(() => undefined);

        process.emit('SIGTERM');

        expect(exit).toHaveBeenCalledTimes(1);
    });
});
