import pino, { Logger } from 'pino';
import { LogLevel } from '../../domain/types/log-level';

let logger: Logger;

export function initLogger(level: LogLevel | undefined): void {
    if (!logger) {
        logger = pino({ level });
    }
}

export function getLogger(): Logger {
    if (!logger) throw new Error('Logger no inicializado');
    return logger;
}
