import { Scheduler } from "../../../src/application/scheduler";
import { ShutdownManager } from "../../../src/core/shutdown/shutdown-manager";

describe('Shutdown Manager', () => {

    let scheduler: jest.Mocked<Scheduler>;
    let shutdownManager: ShutdownManager;

    beforeEach(() => {
        scheduler = {
            terminate: jest.fn()
        } as unknown as jest.Mocked<Scheduler>

        shutdownManager = new ShutdownManager(scheduler);

        jest.spyOn(process, 'exit').mockImplementation(() => { return undefined as never });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('should call scheduler terminate and process exit when shutdown is called', () => {
        shutdownManager.shutdown();
        expect(scheduler.terminate).toHaveBeenCalledTimes(1);
        expect(process.exit).toHaveBeenNthCalledWith(1, 0);
    });
});
