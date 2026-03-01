/**
 * Bulkhead Pattern Implementation
 * 
 * Isolates failures by limiting concurrent executions.
 * Prevents one failing service from consuming all resources.
 */

export interface BulkheadOptions {
  /** Name of the bulkhead */
  name: string;
  /** Maximum concurrent executions */
  maxConcurrent: number;
  /** Maximum queue size for waiting requests */
  maxQueue: number;
  /** Timeout for queued requests in ms */
  queueTimeout: number;
  /** Callback when bulkhead is full */
  onReject?: (info: BulkheadInfo) => void;
  /** Callback for metrics */
  onMetric?: (metric: BulkheadMetric) => void;
}

export interface BulkheadInfo {
  name: string;
  activeCount: number;
  queueSize: number;
  maxConcurrent: number;
  maxQueue: number;
}

export interface BulkheadMetric {
  name: string;
  activeCount: number;
  queueSize: number;
  totalExecutions: number;
  totalRejections: number;
  totalTimeouts: number;
  avgExecutionTime: number;
}

interface QueuedItem<T> {
  fn: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
  enqueuedAt: number;
}

export class Bulkhead {
  private activeCount: number = 0;
  private queue: QueuedItem<any>[] = [];
  private totalExecutions: number = 0;
  private totalRejections: number = 0;
  private totalTimeouts: number = 0;
  private totalExecutionTime: number = 0;

  constructor(private readonly options: BulkheadOptions) {}

  /**
   * Execute a function within the bulkhead
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // If we have capacity, execute immediately
    if (this.activeCount < this.options.maxConcurrent) {
      return this.run(fn);
    }

    // If queue is full, reject
    if (this.queue.length >= this.options.maxQueue) {
      this.totalRejections++;
      this.options.onReject?.({
        name: this.options.name,
        activeCount: this.activeCount,
        queueSize: this.queue.length,
        maxConcurrent: this.options.maxConcurrent,
        maxQueue: this.options.maxQueue,
      });
      this.emitMetric();
      throw new BulkheadFullError(
        `Bulkhead '${this.options.name}' is full. Active: ${this.activeCount}/${this.options.maxConcurrent}, Queue: ${this.queue.length}/${this.options.maxQueue}`,
        this.getInfo()
      );
    }

    // Queue the request
    return this.enqueue(fn);
  }

  /**
   * Run a function immediately
   */
  private async run<T>(fn: () => Promise<T>): Promise<T> {
    this.activeCount++;
    this.totalExecutions++;
    const startTime = Date.now();

    try {
      const result = await fn();
      return result;
    } finally {
      this.totalExecutionTime += Date.now() - startTime;
      this.activeCount--;
      this.emitMetric();
      this.dequeue();
    }
  }

  /**
   * Enqueue a function for later execution
   */
  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        // Remove from queue on timeout
        const index = this.queue.findIndex(item => item.timer === timer);
        if (index !== -1) {
          this.queue.splice(index, 1);
          this.totalTimeouts++;
          this.emitMetric();
          reject(new BulkheadTimeoutError(
            `Bulkhead '${this.options.name}' queue timeout after ${this.options.queueTimeout}ms`,
            this.getInfo()
          ));
        }
      }, this.options.queueTimeout);

      this.queue.push({
        fn,
        resolve,
        reject,
        timer,
        enqueuedAt: Date.now(),
      });
    });
  }

  /**
   * Dequeue and execute the next item
   */
  private dequeue(): void {
    if (this.queue.length === 0 || this.activeCount >= this.options.maxConcurrent) {
      return;
    }

    const item = this.queue.shift()!;
    clearTimeout(item.timer);

    this.run(item.fn)
      .then(item.resolve)
      .catch(item.reject);
  }

  /**
   * Get current bulkhead info
   */
  getInfo(): BulkheadInfo {
    return {
      name: this.options.name,
      activeCount: this.activeCount,
      queueSize: this.queue.length,
      maxConcurrent: this.options.maxConcurrent,
      maxQueue: this.options.maxQueue,
    };
  }

  /**
   * Get metrics
   */
  getMetrics(): BulkheadMetric {
    return {
      name: this.options.name,
      activeCount: this.activeCount,
      queueSize: this.queue.length,
      totalExecutions: this.totalExecutions,
      totalRejections: this.totalRejections,
      totalTimeouts: this.totalTimeouts,
      avgExecutionTime: this.totalExecutions > 0
        ? this.totalExecutionTime / this.totalExecutions
        : 0,
    };
  }

  /**
   * Emit metrics
   */
  private emitMetric(): void {
    this.options.onMetric?.(this.getMetrics());
  }

  /**
   * Reset the bulkhead
   */
  reset(): void {
    this.queue.forEach(item => {
      clearTimeout(item.timer);
      item.reject(new Error('Bulkhead reset'));
    });
    this.queue = [];
    this.activeCount = 0;
    this.totalExecutions = 0;
    this.totalRejections = 0;
    this.totalTimeouts = 0;
    this.totalExecutionTime = 0;
  }
}

/**
 * Bulkhead Full Error
 */
export class BulkheadFullError extends Error {
  constructor(
    message: string,
    public readonly info: BulkheadInfo
  ) {
    super(message);
    this.name = 'BulkheadFullError';
  }
}

/**
 * Bulkhead Timeout Error
 */
export class BulkheadTimeoutError extends Error {
  constructor(
    message: string,
    public readonly info: BulkheadInfo
  ) {
    super(message);
    this.name = 'BulkheadTimeoutError';
  }
}