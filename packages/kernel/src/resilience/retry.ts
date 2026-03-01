/**
 * Retry Pattern Implementation
 * 
 * Provides configurable retry logic with exponential backoff,
 * jitter, and customizable retry conditions.
 */

export interface RetryOptions {
  /** Maximum number of retry attempts */
  maxRetries: number;
  /** Base delay in ms between retries */
  baseDelay: number;
  /** Maximum delay in ms between retries */
  maxDelay: number;
  /** Backoff multiplier (e.g., 2 for exponential) */
  backoffMultiplier: number;
  /** Whether to add jitter to delay */
  jitter: boolean;
  /** Function to determine if error is retryable */
  retryCondition?: (error: Error) => boolean;
  /** Callback on each retry attempt */
  onRetry?: (attempt: number, error: Error, delay: number) => void;
}

const DEFAULT_OPTIONS: RetryOptions = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  jitter: true,
};

/**
 * Execute a function with retry logic
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if we should retry
      if (attempt >= opts.maxRetries) {
        throw new RetryExhaustedError(
          `All ${opts.maxRetries} retry attempts exhausted`,
          lastError,
          attempt
        );
      }

      // Check retry condition
      if (opts.retryCondition && !opts.retryCondition(lastError)) {
        throw lastError;
      }

      // Calculate delay
      const delay = calculateDelay(attempt, opts);

      // Notify retry callback
      opts.onRetry?.(attempt + 1, lastError, delay);

      // Wait before retrying
      await sleep(delay);
    }
  }

  throw lastError!;
}

/**
 * Calculate delay with exponential backoff and optional jitter
 */
function calculateDelay(attempt: number, options: RetryOptions): number {
  let delay = options.baseDelay * Math.pow(options.backoffMultiplier, attempt);
  delay = Math.min(delay, options.maxDelay);

  if (options.jitter) {
    // Full jitter: random value between 0 and calculated delay
    delay = Math.random() * delay;
  }

  return Math.floor(delay);
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry Exhausted Error
 */
export class RetryExhaustedError extends Error {
  constructor(
    message: string,
    public readonly lastError: Error,
    public readonly attempts: number
  ) {
    super(message);
    this.name = 'RetryExhaustedError';
  }
}

/**
 * Decorator for retry logic on class methods
 */
export function Retryable(options: Partial<RetryOptions> = {}) {
  return function (
    _target: any,
    _propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      return withRetry(() => originalMethod.apply(this, args), options);
    };

    return descriptor;
  };
}

/**
 * Common retry conditions
 */
export const RetryConditions = {
  /** Retry on network errors */
  isNetworkError: (error: Error): boolean => {
    const networkErrors = ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN'];
    return networkErrors.some(code => error.message.includes(code));
  },

  /** Retry on HTTP 5xx errors */
  isServerError: (error: Error): boolean => {
    const match = error.message.match(/status[:\s]*(\d{3})/i);
    if (match) {
      const status = parseInt(match[1], 10);
      return status >= 500 && status < 600;
    }
    return false;
  },

  /** Retry on rate limit errors (429) */
  isRateLimitError: (error: Error): boolean => {
    return error.message.includes('429') || error.message.toLowerCase().includes('rate limit');
  },

  /** Retry on transient errors (network + server + rate limit) */
  isTransientError: (error: Error): boolean => {
    return (
      RetryConditions.isNetworkError(error) ||
      RetryConditions.isServerError(error) ||
      RetryConditions.isRateLimitError(error)
    );
  },
};