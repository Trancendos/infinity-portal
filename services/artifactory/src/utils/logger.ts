/**
 * Pino Structured Logger — Trancendos Ecosystem Standard
 * 
 * All Trancendos services use Pino for structured JSON logging.
 * Logs are correlated by traceId for distributed tracing across the mesh.
 */

import pino from 'pino';
import { randomUUID } from 'crypto';

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const SERVICE_NAME = 'the-artifactory';
const SERVICE_PORT = 3020;

export const logger = pino({
  name: SERVICE_NAME,
  level: LOG_LEVEL,
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level(label) {
      return { level: label };
    },
    bindings(bindings) {
      return {
        service: SERVICE_NAME,
        port: SERVICE_PORT,
        pid: bindings.pid,
        hostname: bindings.hostname,
      };
    },
  },
  serializers: {
    err: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
  },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      'secret',
      'token',
      'apiKey',
      'accessToken',
      'refreshToken',
    ],
    censor: '[REDACTED]',
  },
});

/**
 * Create a child logger with a trace ID for request correlation.
 * Every request gets a unique traceId that propagates across mesh calls.
 */
export function createRequestLogger(traceId?: string) {
  return logger.child({
    traceId: traceId || randomUUID(),
    timestamp: new Date().toISOString(),
  });
}

/**
 * Create a child logger for a specific module/component.
 */
export function createModuleLogger(module: string) {
  return logger.child({ module });
}

export type Logger = pino.Logger;