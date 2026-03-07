import pino from 'pino';
export const logger = pino({
  name: 'tateking', level: process.env.LOG_LEVEL ?? 'info',
  formatters: { level: (label: string) => ({ level: label }) },
  timestamp: pino.stdTimeFunctions.isoTime,
});
