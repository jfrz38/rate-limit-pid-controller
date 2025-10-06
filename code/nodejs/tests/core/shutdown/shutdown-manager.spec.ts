import { Scheduler } from "../../../src/application/scheduler";
import { IntervalManager } from "../../../src/core/shutdown/interval-manager";
import { ShutdownManager } from "../../../src/core/shutdown/shutdown-manager";

describe('Shutdown Manager', () => {

    let scheduler: jest.Mocked<Scheduler>;
    let intervalManager: jest.Mocked<IntervalManager>
    let shutdownManager: ShutdownManager;

    beforeEach(() => {
        scheduler = {
            terminate: jest.fn()
        } as unknown as jest.Mocked<Scheduler>
        intervalManager = {
            clearAll: jest.fn()
        } as unknown as jest.Mocked<IntervalManager>

        shutdownManager = new ShutdownManager(scheduler, intervalManager);

        jest.spyOn(process, 'exit').mockImplementation(() => { return undefined as never });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('should call scheduler terminate and interval manager clearAll when shutdown is called', () => {
        shutdownManager.shutdown();
        expect(scheduler.terminate).toHaveBeenCalledTimes(1);
        expect(intervalManager.clearAll).toHaveBeenCalledTimes(1);
    });
});
