import { vi, describe, expect, beforeEach } from 'vitest';

import { LogLevel } from "../../../src/domain/types/log-level";

describe('Logger', () => {
    let logger: typeof import("../../../src/core/logging/logger");

    beforeEach(async () => {
        vi.resetModules();
        vi.clearAllMocks();

        vi.doMock('pino', () => {
            const mock = vi.fn((options) => ({
                info: vi.fn(),
                error: vi.fn(),
                warn: vi.fn(),
                debug: vi.fn(),
                level: options.level
            }));
            return {
                default: mock,
                pino: mock
            };
        });

        logger = await import('../../../src/core/logging/logger');
    });

    describe('initLogger', () => {
        test('should initialize logger only once', async () => {
            const mockPino = (await import('pino')).default;

            logger.initLogger('info');
            logger.initLogger('debug');

            expect(mockPino).toHaveBeenCalledTimes(1);
        });
    });

    describe('getLogger', () => {
        test('when is not initialized should throw expected error', () => {
            expect(() => logger.getLogger()).toThrow('Logger not initialized');
        });

        test.each<LogLevel>([
            'trace',
            'debug',
            'info',
            'warn',
            'error',
            'fatal',
        ])('should return the expected logger for level: %s', (level) => {
            logger.initLogger(level);

            const result = logger.getLogger();

            expect(result.level).toBe(level);
        });
    });
});
