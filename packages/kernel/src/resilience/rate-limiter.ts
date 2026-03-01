/**
 * Rate Limiter Implementation
 * 
 * Provides multiple rate limiting strategies:
 * - Token Bucket: Smooth rate limiting with burst capacity
 * - Sliding Window: Precise rate limiting over time windows
 * - Fixed Window: Simple counter-based rate limiting
 */

export interface RateLimiterOptions {
  /** Name of the rate limiter */
  name: string;
  /** Maximum requests per window */
  maxRequests: number;
  /** Window duration in ms */
  windowMs: number;
  /** Strategy to use */
  strategy: 'token-bucket' | 'sliding-window' | 'fixed-window';
  /** Optional key extractor for per-client limiting */
  keyExtractor?: (request: any) => string;
  /** Callback when rate limit is exceeded */
  onLimitExceeded?: (key: string, info: RateLimitInfo) => void;
}

export interface RateLimitInfo {
  /** Total allowed requests in window */
  limit: number;
  /** Remaining requests in current window */
  remaining: number;
  /** Time in ms until the window resets */
  resetMs: number;
  /** Whether the request is allowed */
  allowed: boolean;
}

/**
 * Token Bucket Rate Limiter
 * Allows burst traffic up to bucket capacity, then limits to steady rate
 */
export class TokenBucketLimiter {
  private buckets: Map<string, { tokens: number; lastRefill: number }> = new Map();

  constructor(private readonly options: RateLimiterOptions) {}

  /**
   * Check if a request is allowed
   */
  consume(key: string = 'default', tokens: number = 1): RateLimitInfo {
    const now = Date.now();
    let bucket = this.buckets.get(key);

    if (!bucket) {
      bucket = { tokens: this.options.maxRequests, lastRefill: now };
      this.buckets.set(key, bucket);
    }

    // Refill tokens based on elapsed time
    const elapsed = now - bucket.lastRefill;
    const refillRate = this.options.maxRequests / this.options.windowMs;
    const tokensToAdd = elapsed * refillRate;
    bucket.tokens = Math.min(this.options.maxRequests, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;

    const allowed = bucket.tokens >= tokens;

    if (allowed) {
      bucket.tokens -= tokens;
    } else {
      this.options.onLimitExceeded?.(key, {
        limit: this.options.maxRequests,
        remaining: Math.floor(bucket.tokens),
        resetMs: Math.ceil((tokens - bucket.tokens) / refillRate),
        allowed: false,
      });
    }

    return {
      limit: this.options.maxRequests,
      remaining: Math.floor(bucket.tokens),
      resetMs: allowed ? 0 : Math.ceil((tokens - bucket.tokens) / refillRate),
      allowed,
    };
  }

  /**
   * Reset a specific key
   */
  reset(key: string): void {
    this.buckets.delete(key);
  }

  /**
   * Reset all keys
   */
  resetAll(): void {
    this.buckets.clear();
  }
}

/**
 * Sliding Window Rate Limiter
 * Tracks individual request timestamps for precise limiting
 */
export class SlidingWindowLimiter {
  private windows: Map<string, number[]> = new Map();

  constructor(private readonly options: RateLimiterOptions) {}

  /**
   * Check if a request is allowed
   */
  consume(key: string = 'default'): RateLimitInfo {
    const now = Date.now();
    let timestamps = this.windows.get(key) || [];

    // Remove expired timestamps
    const windowStart = now - this.options.windowMs;
    timestamps = timestamps.filter(t => t > windowStart);

    const allowed = timestamps.length < this.options.maxRequests;

    if (allowed) {
      timestamps.push(now);
    } else {
      this.options.onLimitExceeded?.(key, {
        limit: this.options.maxRequests,
        remaining: 0,
        resetMs: timestamps[0] ? timestamps[0] + this.options.windowMs - now : this.options.windowMs,
        allowed: false,
      });
    }

    this.windows.set(key, timestamps);

    const remaining = Math.max(0, this.options.maxRequests - timestamps.length);
    const resetMs = timestamps.length > 0
      ? timestamps[0] + this.options.windowMs - now
      : this.options.windowMs;

    return {
      limit: this.options.maxRequests,
      remaining,
      resetMs: Math.max(0, resetMs),
      allowed,
    };
  }

  /**
   * Reset a specific key
   */
  reset(key: string): void {
    this.windows.delete(key);
  }

  /**
   * Reset all keys
   */
  resetAll(): void {
    this.windows.clear();
  }
}

/**
 * Fixed Window Rate Limiter
 * Simple counter-based limiting per fixed time window
 */
export class FixedWindowLimiter {
  private counters: Map<string, { count: number; windowStart: number }> = new Map();

  constructor(private readonly options: RateLimiterOptions) {}

  /**
   * Check if a request is allowed
   */
  consume(key: string = 'default'): RateLimitInfo {
    const now = Date.now();
    let counter = this.counters.get(key);

    // Reset counter if window has expired
    if (!counter || now - counter.windowStart >= this.options.windowMs) {
      counter = { count: 0, windowStart: now };
      this.counters.set(key, counter);
    }

    const allowed = counter.count < this.options.maxRequests;

    if (allowed) {
      counter.count++;
    } else {
      this.options.onLimitExceeded?.(key, {
        limit: this.options.maxRequests,
        remaining: 0,
        resetMs: counter.windowStart + this.options.windowMs - now,
        allowed: false,
      });
    }

    const remaining = Math.max(0, this.options.maxRequests - counter.count);
    const resetMs = counter.windowStart + this.options.windowMs - now;

    return {
      limit: this.options.maxRequests,
      remaining,
      resetMs: Math.max(0, resetMs),
      allowed,
    };
  }

  /**
   * Reset a specific key
   */
  reset(key: string): void {
    this.counters.delete(key);
  }

  /**
   * Reset all keys
   */
  resetAll(): void {
    this.counters.clear();
  }
}

/**
 * Rate Limiter Factory
 */
export function createRateLimiter(options: RateLimiterOptions) {
  switch (options.strategy) {
    case 'token-bucket':
      return new TokenBucketLimiter(options);
    case 'sliding-window':
      return new SlidingWindowLimiter(options);
    case 'fixed-window':
      return new FixedWindowLimiter(options);
    default:
      throw new Error(`Unknown rate limiter strategy: ${options.strategy}`);
  }
}

/**
 * Rate Limit Exceeded Error
 */
export class RateLimitExceededError extends Error {
  constructor(
    message: string,
    public readonly info: RateLimitInfo
  ) {
    super(message);
    this.name = 'RateLimitExceededError';
  }
}

/**
 * Express/Fastify middleware for rate limiting
 */
export function rateLimitMiddleware(options: RateLimiterOptions) {
  const limiter = createRateLimiter(options);

  return (req: any, res: any, next: any) => {
    const key = options.keyExtractor?.(req) || req.ip || 'default';
    const result = limiter.consume(key);

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', result.limit);
    res.setHeader('X-RateLimit-Remaining', result.remaining);
    res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetMs / 1000));

    if (!result.allowed) {
      res.status(429).json({
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Try again in ${Math.ceil(result.resetMs / 1000)} seconds.`,
        retryAfter: Math.ceil(result.resetMs / 1000),
      });
      return;
    }

    next();
  };
}