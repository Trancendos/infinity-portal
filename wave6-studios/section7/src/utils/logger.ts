/**
 * Section7 — Structured Logger
 * Ista: Bert-Joen Kater (The Storyista)
 * Pino-based structured logging with sarcastic incident observations
 */

import pino from 'pino';

export const logger = pino({
  name: 'section7',
  level: process.env.LOG_LEVEL ?? 'info',
  formatters: {
    level: (label: string) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});