/**
 * Resilience Module
 * 
 * Provides production-grade resilience patterns for the Infinity Portal:
 * - Circuit Breaker: Prevents cascading failures
 * - Retry: Handles transient failures with exponential backoff
 * - Rate Limiter: Controls request throughput
 * - Bulkhead: Isolates failures by limiting concurrency
 * 
 * Usage:
 * ```typescript
 * import { 
 *   CircuitBreaker, 
 *   withRetry, 
 *   createRateLimiter, 
 *   Bulkhead 
 * } from '@kernel/resilience';
 * 
 * // Circuit Breaker
 * const breaker = new CircuitBreaker({
 *   name: 'ai-service',
 *   failureThreshold: 5,
 *   resetTimeout: 30000,
 *   successThreshold: 3,
 *   callTimeout: 10000,
 * });
 * const result = await breaker.execute(() => callAIService());
 * 
 * // Retry with exponential backoff
 * const data = await withRetry(() => fetchData(), {
 *   maxRetries: 3,
 *   baseDelay: 1000,
 *   retryCondition: RetryConditions.isTransientError,
 * });
 * 
 * // Rate Limiter
 * const limiter = createRateLimiter({
 *   name: 'api',
 *   maxRequests: 100,
 *   windowMs: 60000,
 *   strategy: 'sliding-window',
 * });
 * const info = limiter.consume(clientId);
 * 
 * // Bulkhead
 * const bulkhead = new Bulkhead({
 *   name: 'database',
 *   maxConcurrent: 10,
 *   maxQueue: 50,
 *   queueTimeout: 5000,
 * });
 * const result = await bulkhead.execute(() => queryDatabase());
 * ```
 */

export {
  CircuitBreaker,
  CircuitBreakerError,
  CircuitBreakerRegistry,
  CircuitState,
  type CircuitBreakerOptions,
  type CircuitBreakerMetric,
} from './circuit-breaker';

export {
  withRetry,
  Retryable,
  RetryConditions,
  RetryExhaustedError,
  type RetryOptions,
} from './retry';

export {
  TokenBucketLimiter,
  SlidingWindowLimiter,
  FixedWindowLimiter,
  createRateLimiter,
  rateLimitMiddleware,
  RateLimitExceededError,
  type RateLimiterOptions,
  type RateLimitInfo,
} from './rate-limiter';

export {
  Bulkhead,
  BulkheadFullError,
  BulkheadTimeoutError,
  type BulkheadOptions,
  type BulkheadInfo,
  type BulkheadMetric,
} from './bulkhead';