// src/logger.ts - Structured JSON logger with correlation IDs

import { AgentLogger, LogLevel } from "./types";

/**
 * Default structured logger that outputs JSON to stdout/stderr.
 * Integrates with Loki, Grafana, and any JSON-based log aggregator.
 */
export class DefaultLogger implements AgentLogger {
  constructor(
    private readonly agentId: string,
    private readonly minLevel: LogLevel = LogLevel.INFO
  ) {}

  private readonly levelPriority: Record<LogLevel, number> = {
    [LogLevel.DEBUG]: 0,
    [LogLevel.INFO]: 1,
    [LogLevel.WARN]: 2,
    [LogLevel.ERROR]: 3,
    [LogLevel.FATAL]: 4,
  };

  private shouldLog(level: LogLevel): boolean {
    return this.levelPriority[level] >= this.levelPriority[this.minLevel];
  }

  private emit(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    if (!this.shouldLog(level)) return;

    const entry = {
      timestamp: new Date().toISOString(),
      level,
      agent: this.agentId,
      message,
      ...context,
    };

    const output = JSON.stringify(entry);

    if (level === LogLevel.ERROR || level === LogLevel.FATAL) {
      process.stderr.write(output + "\n");
    } else {
      process.stdout.write(output + "\n");
    }
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.emit(LogLevel.DEBUG, message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.emit(LogLevel.INFO, message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.emit(LogLevel.WARN, message, context);
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.emit(LogLevel.ERROR, message, context);
  }
}
