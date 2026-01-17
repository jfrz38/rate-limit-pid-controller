import { getLogger, initLogger } from "../../../src/core/logging/logger";
import { LogLevel } from "../../../src/domain/types/log-level";

describe('Logger', () => {
    let logger: any;

    beforeEach(() => {
        jest.resetModules();

        jest.mock('pino', () => jest.fn(() => ({
            info: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            debug: jest.fn(),
        })));

        logger = require('../../../src/core/logging/logger');
    });

    describe('initLogger', () => {
        test('should initialize logger only once', () => {
            const mockPino = require('pino');

            logger.initLogger('info');
            logger.initLogger('debug');

            expect(mockPino).toHaveBeenCalledTimes(1);
        });
    });

    describe('getLogger', () => {
        test('when is not initialized should throw expected error', () => {
            expect(() => logger.getLogger()).toThrow('Logger not initialized');
        });

        test('when is initialized should return the expected logger', () => {
            const logLevel: LogLevel = 'debug';

            initLogger(logLevel);

            const result = getLogger();

            expect(result.level).toBe(logLevel);
        });
    });
});
