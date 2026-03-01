/**
 * Structured Logger Implementation
 * 
 * Provides structured JSON logging with:
 * - Log levels (debug, info, warn, error, fatal)
 * - Correlation IDs for request tracing
 * - Context enrichment
 * - OpenTelemetry integration
 * - Performance-optimized output
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  FATAL = 4,
}

export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  service: string;
  correlationId?: string;
  traceId?: string;
  spanId?: string;
  context?: Record<string, any>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  duration?: number;
  [key: string]: any;
}

export interface LoggerOptions {
  /** Service name */
  service: string;
  /** Minimum log level */
  level: LogLevel;
  /** Whether to pretty-print output */
  pretty: boolean;
  /** Default context to include in all logs */
  defaultContext?: Record<string, any>;
  /** Custom output function */
  output?: (entry: LogEntry) => void;
  /** Whether to include stack traces */
  includeStackTrace: boolean;
}

export class StructuredLogger {
  private context: Record<string, any> = {};

  constructor(private readonly options: LoggerOptions) {
    if (options.defaultContext) {
      this.context = { ...options.defaultContext };
    }
  }

  /**
   * Create a child logger with additional context
   */
  child(context: Record<string, any>): StructuredLogger {
    const child = new StructuredLogger({
      ...this.options,
      defaultContext: { ...this.context, ...context },
    });
    return child;
  }

  /**
   * Log at DEBUG level
   */
  debug(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  /**
   * Log at INFO level
   */
  info(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.INFO, message, context);
  }

  /**
   * Log at WARN level
   */
  warn(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.WARN, message, context);
  }

  /**
   * Log at ERROR level
   */
  error(message: string, error?: Error | Record<string, any>, context?: Record<string, any>): void {
    if (error instanceof Error) {
      this.log(LogLevel.ERROR, message, {
        ...context,
        error: {
          name: error.name,
          message: error.message,
          stack: this.options.includeStackTrace ? error.stack : undefined,
        },
      });
    } else {
      this.log(LogLevel.ERROR, message, { ...error, ...context });
    }
  }

  /**
   * Log at FATAL level
   */
  fatal(message: string, error?: Error | Record<string, any>, context?: Record<string, any>): void {
    if (error instanceof Error) {
      this.log(LogLevel.FATAL, message, {
        ...context,
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
      });
    } else {
      this.log(LogLevel.FATAL, message, { ...error, ...context });
    }
  }

  /**
   * Log with timing information
   */
  time(label: string): () => void {
    const start = performance.now();
    return () => {
      const duration = performance.now() - start;
      this.info(`${label} completed`, { duration: Math.round(duration * 100) / 100 });
    };
  }

  /**
   * Log a request
   */
  request(method: string, path: string, statusCode: number, duration: number, context?: Record<string, any>): void {
    const level = statusCode >= 500 ? LogLevel.ERROR
      : statusCode >= 400 ? LogLevel.WARN
      : LogLevel.INFO;

    this.log(level, `${method} ${path} ${statusCode}`, {
      ...context,
      http: { method, path, statusCode },
      duration,
    });
  }

  /**
   * Core log method
   */
  private log(level: LogLevel, message: string, context?: Record<string, any>): void {
    if (level < this.options.level) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: LogLevel[level],
      message,
      service: this.options.service,
      ...this.context,
      ...context,
    };

    if (this.options.output) {
      this.options.output(entry);
    } else if (this.options.pretty) {
      this.prettyPrint(entry, level);
    } else {
      this.jsonPrint(entry, level);
    }
  }

  /**
   * JSON output
   */
  private jsonPrint(entry: LogEntry, level: LogLevel): void {
    const output = JSON.stringify(entry);
    if (level >= LogLevel.ERROR) {
      process.stderr.write(output + '\n');
    } else {
      process.stdout.write(output + '\n');
    }
  }

  /**
   * Pretty-print output for development
   */
  private prettyPrint(entry: LogEntry, level: LogLevel): void {
    const colors: Record<number, string> = {
      [LogLevel.DEBUG]: '\x1b[36m',  // Cyan
      [LogLevel.INFO]: '\x1b[32m',   // Green
      [LogLevel.WARN]: '\x1b[33m',   // Yellow
      [LogLevel.ERROR]: '\x1b[31m',  // Red
      [LogLevel.FATAL]: '\x1b[35m',  // Magenta
    };
    const reset = '\x1b[0m';
    const color = colors[level] || '';

    const time = entry.timestamp.split('T')[1]?.replace('Z', '') || entry.timestamp;
    const ctx = entry.context ? ` ${JSON.stringify(entry.context)}` : '';
    const dur = entry.duration ? ` (${entry.duration}ms)` : '';

    const output = `${color}[${time}] ${entry.level.padEnd(5)} ${entry.service}: ${entry.message}${dur}${ctx}${reset}`;

    if (level >= LogLevel.ERROR) {
      console.error(output);
      if (entry.error?.stack) {
        console.error(`  ${entry.error.stack}`);
      }
    } else {
      console.log(output);
    }
  }
}

/**
 * Create a logger instance
 */
export function createLogger(options?: Partial<LoggerOptions>): StructuredLogger {
  const env = process.env.NODE_ENV || 'development';
  return new StructuredLogger({
    service: 'infinity-portal',
    level: env === 'production' ? LogLevel.INFO : LogLevel.DEBUG,
    pretty: env !== 'production',
    includeStackTrace: env !== 'production',
    ...options,
  });
}

/**
 * Request logging middleware
 */
export function requestLoggerMiddleware(logger: StructuredLogger) {
  return (req: any, res: any, next: any) => {
    const start = Date.now();
    const correlationId = req.headers['x-correlation-id'] || generateId();

    // Add correlation ID to request
    req.correlationId = correlationId;
    res.setHeader('X-Correlation-ID', correlationId);

    // Create request-scoped logger
    req.logger = logger.child({ correlationId });

    // Log on response finish
    res.on('finish', () => {
      const duration = Date.now() - start;
      logger.request(req.method, req.path, res.statusCode, duration, {
        correlationId,
        userAgent: req.headers['user-agent'],
        ip: req.ip,
        contentLength: res.getHeader('content-length'),
      });
    });

    next();
  };
}

/**
 * Generate a simple unique ID
 */
function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 10)}`;
}