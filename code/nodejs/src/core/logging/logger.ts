import pino, { Logger } from 'pino';

export type Log = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'

let logger: Logger;

export function initLogger(level: Log | undefined): void {
    if (!logger) {
        logger = pino({ level: level ?? 'warn' });
    }
}

export function getLogger(): Logger {
    if (!logger) throw new Error('Logger no inicializado');
    return logger;
}
