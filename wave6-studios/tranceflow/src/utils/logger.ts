import pino from 'pino';
export const logger = pino({
  name: 'tranceflow', level: process.env.LOG_LEVEL ?? 'info',
  formatters: { level: (label: string) => ({ level: label }) },
  timestamp: pino.stdTimeFunctions.isoTime,
});
