/**
 * Circuit Breaker Pattern Implementation
 * 
 * Prevents cascading failures by wrapping calls to external services
 * with a circuit breaker that trips when failures exceed a threshold.
 * 
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Circuit tripped, requests fail immediately
 * - HALF_OPEN: Testing if service has recovered
 */

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerOptions {
  /** Name of the circuit breaker for logging */
  name: string;
  /** Number of failures before opening the circuit */
  failureThreshold: number;
  /** Time in ms before attempting to close the circuit */
  resetTimeout: number;
  /** Number of successful calls in HALF_OPEN to close the circuit */
  successThreshold: number;
  /** Timeout for individual calls in ms */
  callTimeout: number;
  /** Optional callback when state changes */
  onStateChange?: (from: CircuitState, to: CircuitState) => void;
  /** Optional callback for metrics */
  onMetric?: (metric: CircuitBreakerMetric) => void;
}

export interface CircuitBreakerMetric {
  name: string;
  state: CircuitState;
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  rejectedCalls: number;
  lastFailureTime: number | null;
  lastSuccessTime: number | null;
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private lastFailureTime: number | null = null;
  private lastSuccessTime: number | null = null;
  private totalCalls: number = 0;
  private successfulCalls: number = 0;
  private failedCalls: number = 0;
  private rejectedCalls: number = 0;
  private nextAttempt: number = 0;

  constructor(private readonly options: CircuitBreakerOptions) {}

  /**
   * Execute a function through the circuit breaker
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.totalCalls++;

    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttempt) {
        this.rejectedCalls++;
        this.emitMetric();
        throw new CircuitBreakerError(
          `Circuit breaker '${this.options.name}' is OPEN. Request rejected.`,
          this.state
        );
      }
      this.transitionTo(CircuitState.HALF_OPEN);
    }

    try {
      const result = await this.executeWithTimeout(fn);
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Execute function with timeout
   */
  private async executeWithTimeout<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new CircuitBreakerError(
          `Circuit breaker '${this.options.name}' call timed out after ${this.options.callTimeout}ms`,
          this.state
        ));
      }, this.options.callTimeout);

      fn()
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * Handle successful call
   */
  private onSuccess(): void {
    this.successfulCalls++;
    this.lastSuccessTime = Date.now();
    this.failureCount = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.options.successThreshold) {
        this.transitionTo(CircuitState.CLOSED);
        this.successCount = 0;
      }
    }

    this.emitMetric();
  }

  /**
   * Handle failed call
   */
  private onFailure(): void {
    this.failedCalls++;
    this.lastFailureTime = Date.now();
    this.failureCount++;

    if (this.state === CircuitState.HALF_OPEN) {
      this.transitionTo(CircuitState.OPEN);
      this.successCount = 0;
    } else if (this.failureCount >= this.options.failureThreshold) {
      this.transitionTo(CircuitState.OPEN);
    }

    this.emitMetric();
  }

  /**
   * Transition to a new state
   */
  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;

    if (newState === CircuitState.OPEN) {
      this.nextAttempt = Date.now() + this.options.resetTimeout;
    }

    this.options.onStateChange?.(oldState, newState);
  }

  /**
   * Emit metrics
   */
  private emitMetric(): void {
    this.options.onMetric?.({
      name: this.options.name,
      state: this.state,
      totalCalls: this.totalCalls,
      successfulCalls: this.successfulCalls,
      failedCalls: this.failedCalls,
      rejectedCalls: this.rejectedCalls,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
    });
  }

  /**
   * Get current state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get metrics
   */
  getMetrics(): CircuitBreakerMetric {
    return {
      name: this.options.name,
      state: this.state,
      totalCalls: this.totalCalls,
      successfulCalls: this.successfulCalls,
      failedCalls: this.failedCalls,
      rejectedCalls: this.rejectedCalls,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
    };
  }

  /**
   * Reset the circuit breaker
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.totalCalls = 0;
    this.successfulCalls = 0;
    this.failedCalls = 0;
    this.rejectedCalls = 0;
    this.lastFailureTime = null;
    this.lastSuccessTime = null;
    this.nextAttempt = 0;
  }
}

/**
 * Circuit Breaker Error
 */
export class CircuitBreakerError extends Error {
  constructor(
    message: string,
    public readonly circuitState: CircuitState
  ) {
    super(message);
    this.name = 'CircuitBreakerError';
  }
}

/**
 * Circuit Breaker Registry - manages multiple circuit breakers
 */
export class CircuitBreakerRegistry {
  private breakers: Map<string, CircuitBreaker> = new Map();

  /**
   * Get or create a circuit breaker
   */
  getOrCreate(options: CircuitBreakerOptions): CircuitBreaker {
    let breaker = this.breakers.get(options.name);
    if (!breaker) {
      breaker = new CircuitBreaker(options);
      this.breakers.set(options.name, breaker);
    }
    return breaker;
  }

  /**
   * Get a circuit breaker by name
   */
  get(name: string): CircuitBreaker | undefined {
    return this.breakers.get(name);
  }

  /**
   * Get all circuit breaker metrics
   */
  getAllMetrics(): CircuitBreakerMetric[] {
    return Array.from(this.breakers.values()).map(b => b.getMetrics());
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    this.breakers.forEach(b => b.reset());
  }
}