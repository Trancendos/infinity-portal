/**
 * @trancendos/shared-core — Logger
 * Ecosystem-standard Pino logger configuration.
 */

import pino from 'pino';

export type Logger = pino.Logger;

export interface LoggerOptions {
  service: string;
  level?: string;
  pretty?: boolean;
}

export function createLogger(options: LoggerOptions): Logger {
  return pino({
    name: options.service,
    level: options.level ?? process.env.LOG_LEVEL ?? 'info',
    transport: options.pretty || process.env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } }
      : undefined,
    redact: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.secret', '*.token'],
    formatters: {
      level: (label: string) => ({ level: label }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}

export function createModuleLogger(parentLogger: Logger, module: string): Logger {
  return parentLogger.child({ module });
}

export function createRequestLogger(parentLogger: Logger, requestId: string, tenantId?: string): Logger {
  return parentLogger.child({ requestId, tenantId });
}