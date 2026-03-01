/**
 * Webhook & Event Streaming System
 * 
 * Provides reliable webhook delivery and event streaming
 * with backpressure, retry logic, audit logging, and
 * dead letter queue support.
 * 
 * Architecture:
 * ```
 * WebhookSystem
 *   ├── WebhookManager (CRUD, validation)
 *   ├── EventStream (pub/sub with backpressure)
 *   ├── DeliveryEngine (retry, DLQ, circuit breaker)
 *   └── AuditLog (delivery tracking, replay)
 * ```
 */

// ============================================================
// TYPES
// ============================================================

export type WebhookStatus = 'active' | 'paused' | 'disabled' | 'error';
export type DeliveryStatus = 'pending' | 'delivering' | 'delivered' | 'failed' | 'dead_letter';
export type StreamStatus = 'active' | 'paused' | 'backpressure' | 'closed';

export interface WebhookRegistration {
  /** Unique webhook ID */
  id: string;
  /** Webhook name */
  name: string;
  /** Target URL */
  url: string;
  /** HTTP method */
  method: 'POST' | 'PUT' | 'PATCH';
  /** Event types to subscribe to */
  eventTypes: string[];
  /** Event filter expression */
  filter?: EventFilter;
  /** Webhook status */
  status: WebhookStatus;
  /** Secret for HMAC signature */
  secret: string;
  /** Custom headers */
  headers: Record<string, string>;
  /** Retry configuration */
  retry: RetryConfig;
  /** Rate limit */
  rateLimit: { maxPerMinute: number; maxPerHour: number };
  /** Owner ID */
  ownerId: string;
  /** Created timestamp */
  createdAt: number;
  /** Updated timestamp */
  updatedAt: number;
  /** Delivery statistics */
  stats: WebhookStats;
}

export interface EventFilter {
  /** Include events matching these conditions */
  include?: FilterCondition[];
  /** Exclude events matching these conditions */
  exclude?: FilterCondition[];
}

export interface FilterCondition {
  field: string;
  operator: 'eq' | 'neq' | 'contains' | 'startsWith' | 'endsWith' | 'gt' | 'lt' | 'in';
  value: unknown;
}

export interface RetryConfig {
  /** Maximum retry attempts */
  maxAttempts: number;
  /** Initial delay in ms */
  initialDelayMs: number;
  /** Maximum delay in ms */
  maxDelayMs: number;
  /** Backoff multiplier */
  backoffMultiplier: number;
  /** Add jitter to delays */
  jitter: boolean;
}

export interface WebhookStats {
  totalDeliveries: number;
  successfulDeliveries: number;
  failedDeliveries: number;
  averageLatencyMs: number;
  lastDeliveryAt: number;
  lastSuccessAt: number;
  lastFailureAt: number;
  consecutiveFailures: number;
}

export interface StreamEvent {
  /** Event ID */
  id: string;
  /** Event type */
  type: string;
  /** Event source */
  source: string;
  /** Event payload */
  data: Record<string, unknown>;
  /** Event metadata */
  metadata: EventStreamMetadata;
  /** Timestamp */
  timestamp: number;
}

export interface EventStreamMetadata {
  /** Correlation ID for tracing */
  correlationId: string;
  /** Causation ID (event that caused this) */
  causationId?: string;
  /** Sequence number */
  sequenceNumber: number;
  /** Partition key */
  partitionKey?: string;
  /** Schema version */
  schemaVersion: string;
  /** Content type */
  contentType: string;
}

export interface DeliveryAttempt {
  /** Attempt ID */
  id: string;
  /** Webhook ID */
  webhookId: string;
  /** Event ID */
  eventId: string;
  /** Delivery status */
  status: DeliveryStatus;
  /** HTTP status code */
  httpStatus?: number;
  /** Response body (truncated) */
  responseBody?: string;
  /** Attempt number */
  attemptNumber: number;
  /** Delivery latency (ms) */
  latencyMs: number;
  /** Error message */
  error?: string;
  /** Timestamp */
  timestamp: number;
  /** Next retry timestamp */
  nextRetryAt?: number;
}

export interface WebhookEvent {
  type: 'webhook:created' | 'webhook:updated' | 'webhook:deleted' |
    'webhook:delivery.success' | 'webhook:delivery.failed' |
    'webhook:delivery.dead_letter' | 'webhook:circuit.open' |
    'webhook:circuit.closed' | 'stream:event.published' |
    'stream:backpressure.on' | 'stream:backpressure.off';
  payload: Record<string, unknown>;
  timestamp: number;
}

// ============================================================
// EVENT STREAM
// ============================================================

export class EventStream {
  private subscribers: Map<string, Set<(event: StreamEvent) => void | Promise<void>>> = new Map();
  private buffer: StreamEvent[] = [];
  private sequenceCounter = 0;
  private status: StreamStatus = 'active';
  private maxBufferSize: number;
  private backpressureThreshold: number;
  private listeners: Map<string, Set<(event: WebhookEvent) => void>> = new Map();

  constructor(options: { maxBufferSize?: number; backpressureThreshold?: number } = {}) {
    this.maxBufferSize = options.maxBufferSize || 10000;
    this.backpressureThreshold = options.backpressureThreshold || 8000;
  }

  /**
   * Publish an event to the stream
   */
  async publish(type: string, source: string, data: Record<string, unknown>, metadata?: Partial<EventStreamMetadata>): Promise<StreamEvent> {
    if (this.status === 'closed') {
      throw new Error('Event stream is closed');
    }

    const event: StreamEvent = {
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type,
      source,
      data,
      metadata: {
        correlationId: metadata?.correlationId || `cor_${Date.now()}`,
        causationId: metadata?.causationId,
        sequenceNumber: ++this.sequenceCounter,
        partitionKey: metadata?.partitionKey,
        schemaVersion: metadata?.schemaVersion || '1.0',
        contentType: metadata?.contentType || 'application/json',
      },
      timestamp: Date.now(),
    };

    // Add to buffer
    this.buffer.push(event);
    if (this.buffer.length > this.maxBufferSize) {
      this.buffer.shift(); // Remove oldest
    }

    // Check backpressure
    if (this.buffer.length >= this.backpressureThreshold && this.status !== 'backpressure') {
      this.status = 'backpressure';
      this.emitInternal({
        type: 'stream:backpressure.on',
        payload: { bufferSize: this.buffer.length },
        timestamp: Date.now(),
      });
    }

    // Notify subscribers
    const typeSubscribers = this.subscribers.get(type) || new Set();
    const wildcardSubscribers = this.subscribers.get('*') || new Set();
    const allSubscribers = new Set([...typeSubscribers, ...wildcardSubscribers]);

    const deliveryPromises: Promise<void>[] = [];
    for (const handler of allSubscribers) {
      deliveryPromises.push(
        Promise.resolve(handler(event)).catch(err => {
          console.error(`[EventStream] Subscriber error for ${type}:`, err);
        })
      );
    }

    await Promise.allSettled(deliveryPromises);

    this.emitInternal({
      type: 'stream:event.published',
      payload: { eventId: event.id, type, subscriberCount: allSubscribers.size },
      timestamp: Date.now(),
    });

    return event;
  }

  /**
   * Subscribe to events
   */
  subscribe(eventType: string | '*', handler: (event: StreamEvent) => void | Promise<void>): () => void {
    if (!this.subscribers.has(eventType)) {
      this.subscribers.set(eventType, new Set());
    }
    this.subscribers.get(eventType)!.add(handler);

    return () => {
      this.subscribers.get(eventType)?.delete(handler);
    };
  }

  /**
   * Replay events from the buffer
   */
  replay(options: {
    fromSequence?: number;
    fromTimestamp?: number;
    eventType?: string;
    limit?: number;
  } = {}): StreamEvent[] {
    let events = [...this.buffer];

    if (options.fromSequence) {
      events = events.filter(e => e.metadata.sequenceNumber >= options.fromSequence!);
    }

    if (options.fromTimestamp) {
      events = events.filter(e => e.timestamp >= options.fromTimestamp!);
    }

    if (options.eventType) {
      events = events.filter(e => e.type === options.eventType);
    }

    if (options.limit) {
      events = events.slice(0, options.limit);
    }

    return events;
  }

  /**
   * Get stream status
   */
  getStatus(): { status: StreamStatus; bufferSize: number; subscriberCount: number; sequenceNumber: number } {
    let subscriberCount = 0;
    for (const subs of this.subscribers.values()) {
      subscriberCount += subs.size;
    }

    return {
      status: this.status,
      bufferSize: this.buffer.length,
      subscriberCount,
      sequenceNumber: this.sequenceCounter,
    };
  }

  /**
   * Pause the stream
   */
  pause(): void {
    this.status = 'paused';
  }

  /**
   * Resume the stream
   */
  resume(): void {
    this.status = 'active';
    if (this.buffer.length < this.backpressureThreshold) {
      this.emitInternal({
        type: 'stream:backpressure.off',
        payload: { bufferSize: this.buffer.length },
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Close the stream
   */
  close(): void {
    this.status = 'closed';
    this.subscribers.clear();
  }

  on(type: string, handler: (event: WebhookEvent) => void): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(handler);
    return () => this.listeners.get(type)?.delete(handler);
  }

  private emitInternal(event: WebhookEvent): void {
    this.listeners.get(event.type)?.forEach(h => h(event));
    this.listeners.get('*')?.forEach(h => h(event));
  }
}

// ============================================================
// WEBHOOK MANAGER
// ============================================================

export class WebhookManager {
  private webhooks: Map<string, WebhookRegistration> = new Map();
  private deliveryLog: DeliveryAttempt[] = [];
  private deadLetterQueue: DeliveryAttempt[] = [];
  private circuitState: Map<string, { open: boolean; openedAt: number; halfOpenAt: number }> = new Map();
  private eventStream: EventStream;
  private listeners: Map<string, Set<(event: WebhookEvent) => void>> = new Map();

  constructor(eventStream?: EventStream) {
    this.eventStream = eventStream || new EventStream();
    console.log('[WebhookManager] Initialized');
  }

  /**
   * Get the event stream
   */
  getEventStream(): EventStream {
    return this.eventStream;
  }

  // ============================================================
  // WEBHOOK CRUD
  // ============================================================

  /**
   * Register a new webhook
   */
  create(config: Omit<WebhookRegistration, 'id' | 'createdAt' | 'updatedAt' | 'stats' | 'status'>): WebhookRegistration {
    const webhook: WebhookRegistration = {
      ...config,
      id: `wh_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      stats: {
        totalDeliveries: 0,
        successfulDeliveries: 0,
        failedDeliveries: 0,
        averageLatencyMs: 0,
        lastDeliveryAt: 0,
        lastSuccessAt: 0,
        lastFailureAt: 0,
        consecutiveFailures: 0,
      },
    };

    this.webhooks.set(webhook.id, webhook);

    // Subscribe to event stream for matching event types
    for (const eventType of webhook.eventTypes) {
      this.eventStream.subscribe(eventType, async (event) => {
        if (webhook.status !== 'active') return;
        if (!this.matchesFilter(event, webhook.filter)) return;
        await this.deliver(webhook.id, event);
      });
    }

    this.emit({
      type: 'webhook:created',
      payload: { webhookId: webhook.id, name: webhook.name, url: webhook.url },
      timestamp: Date.now(),
    });

    console.log(`[WebhookManager] Created webhook: ${webhook.name} → ${webhook.url}`);
    return webhook;
  }

  /**
   * Update a webhook
   */
  update(webhookId: string, updates: Partial<Pick<WebhookRegistration, 'name' | 'url' | 'eventTypes' | 'filter' | 'headers' | 'retry' | 'rateLimit'>>): WebhookRegistration | null {
    const webhook = this.webhooks.get(webhookId);
    if (!webhook) return null;

    Object.assign(webhook, updates, { updatedAt: Date.now() });
    this.webhooks.set(webhookId, webhook);

    this.emit({
      type: 'webhook:updated',
      payload: { webhookId, updates: Object.keys(updates) },
      timestamp: Date.now(),
    });

    return webhook;
  }

  /**
   * Delete a webhook
   */
  delete(webhookId: string): boolean {
    const webhook = this.webhooks.get(webhookId);
    if (!webhook) return false;

    this.webhooks.delete(webhookId);
    this.circuitState.delete(webhookId);

    this.emit({
      type: 'webhook:deleted',
      payload: { webhookId, name: webhook.name },
      timestamp: Date.now(),
    });

    return true;
  }

  /**
   * Get a webhook by ID
   */
  get(webhookId: string): WebhookRegistration | undefined {
    return this.webhooks.get(webhookId);
  }

  /**
   * List all webhooks
   */
  list(ownerId?: string): WebhookRegistration[] {
    const all = Array.from(this.webhooks.values());
    if (ownerId) {
      return all.filter(w => w.ownerId === ownerId);
    }
    return all;
  }

  /**
   * Pause a webhook
   */
  pause(webhookId: string): boolean {
    const webhook = this.webhooks.get(webhookId);
    if (!webhook) return false;
    webhook.status = 'paused';
    webhook.updatedAt = Date.now();
    return true;
  }

  /**
   * Resume a webhook
   */
  resume(webhookId: string): boolean {
    const webhook = this.webhooks.get(webhookId);
    if (!webhook) return false;
    webhook.status = 'active';
    webhook.stats.consecutiveFailures = 0;
    webhook.updatedAt = Date.now();

    // Reset circuit breaker
    this.circuitState.delete(webhookId);

    return true;
  }

  // ============================================================
  // DELIVERY ENGINE
  // ============================================================

  /**
   * Deliver an event to a webhook
   */
  async deliver(webhookId: string, event: StreamEvent): Promise<DeliveryAttempt> {
    const webhook = this.webhooks.get(webhookId);
    if (!webhook) {
      throw new Error(`Webhook ${webhookId} not found`);
    }

    // Check circuit breaker
    const circuit = this.circuitState.get(webhookId);
    if (circuit?.open) {
      const now = Date.now();
      if (now < circuit.halfOpenAt) {
        // Circuit is open, skip delivery
        return this.createDeliveryAttempt(webhookId, event.id, 'failed', 0, 1, 'Circuit breaker open');
      }
      // Half-open: allow one attempt
    }

    return this.attemptDelivery(webhook, event, 1);
  }

  private async attemptDelivery(
    webhook: WebhookRegistration,
    event: StreamEvent,
    attemptNumber: number
  ): Promise<DeliveryAttempt> {
    const startTime = Date.now();

    try {
      // Simulate HTTP delivery (in production, use fetch/axios)
      const payload = {
        id: event.id,
        type: event.type,
        source: event.source,
        data: event.data,
        metadata: event.metadata,
        timestamp: event.timestamp,
      };

      // Generate HMAC signature
      const signature = this.generateSignature(JSON.stringify(payload), webhook.secret);

      // Simulated delivery - in production this would be an actual HTTP request
      const success = Math.random() > 0.1; // 90% success rate for simulation
      const latencyMs = Date.now() - startTime;

      if (success) {
        const attempt = this.createDeliveryAttempt(webhook.id, event.id, 'delivered', 200, attemptNumber);
        this.updateStats(webhook, true, latencyMs);
        this.resetCircuitBreaker(webhook.id);

        this.emit({
          type: 'webhook:delivery.success',
          payload: { webhookId: webhook.id, eventId: event.id, attemptNumber, latencyMs },
          timestamp: Date.now(),
        });

        return attempt;
      } else {
        throw new Error('Simulated delivery failure');
      }
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      this.updateStats(webhook, false, latencyMs);

      // Check if we should retry
      if (attemptNumber < webhook.retry.maxAttempts) {
        const delay = this.calculateRetryDelay(webhook.retry, attemptNumber);
        const attempt = this.createDeliveryAttempt(
          webhook.id, event.id, 'failed', 0, attemptNumber,
          String(error), Date.now() + delay
        );

        // Schedule retry (in production, use a job queue)
        setTimeout(() => {
          this.attemptDelivery(webhook, event, attemptNumber + 1);
        }, delay);

        return attempt;
      }

      // Max retries exceeded - send to dead letter queue
      const attempt = this.createDeliveryAttempt(
        webhook.id, event.id, 'dead_letter', 0, attemptNumber, String(error)
      );
      this.deadLetterQueue.push(attempt);
      this.checkCircuitBreaker(webhook);

      this.emit({
        type: 'webhook:delivery.dead_letter',
        payload: { webhookId: webhook.id, eventId: event.id, error: String(error) },
        timestamp: Date.now(),
      });

      return attempt;
    }
  }

  // ============================================================
  // AUDIT & REPLAY
  // ============================================================

  /**
   * Get delivery log for a webhook
   */
  getDeliveryLog(webhookId: string, limit: number = 50): DeliveryAttempt[] {
    return this.deliveryLog
      .filter(d => d.webhookId === webhookId)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  /**
   * Get dead letter queue entries
   */
  getDeadLetterQueue(webhookId?: string): DeliveryAttempt[] {
    if (webhookId) {
      return this.deadLetterQueue.filter(d => d.webhookId === webhookId);
    }
    return [...this.deadLetterQueue];
  }

  /**
   * Retry a dead letter queue entry
   */
  async retryDeadLetter(attemptId: string): Promise<boolean> {
    const idx = this.deadLetterQueue.findIndex(d => d.id === attemptId);
    if (idx === -1) return false;

    const attempt = this.deadLetterQueue[idx];
    const webhook = this.webhooks.get(attempt.webhookId);
    if (!webhook) return false;

    // Find the original event in the stream buffer
    const events = this.eventStream.replay({ limit: 1000 });
    const event = events.find(e => e.id === attempt.eventId);
    if (!event) return false;

    // Remove from DLQ
    this.deadLetterQueue.splice(idx, 1);

    // Retry delivery
    await this.deliver(webhook.id, event);
    return true;
  }

  /**
   * Purge dead letter queue
   */
  purgeDeadLetterQueue(webhookId?: string): number {
    if (webhookId) {
      const before = this.deadLetterQueue.length;
      this.deadLetterQueue = this.deadLetterQueue.filter(d => d.webhookId !== webhookId);
      return before - this.deadLetterQueue.length;
    }
    const count = this.deadLetterQueue.length;
    this.deadLetterQueue = [];
    return count;
  }

  /**
   * Get webhook system stats
   */
  getSystemStats(): {
    totalWebhooks: number;
    activeWebhooks: number;
    totalDeliveries: number;
    deadLetterCount: number;
    openCircuits: number;
  } {
    const webhooks = Array.from(this.webhooks.values());
    return {
      totalWebhooks: webhooks.length,
      activeWebhooks: webhooks.filter(w => w.status === 'active').length,
      totalDeliveries: this.deliveryLog.length,
      deadLetterCount: this.deadLetterQueue.length,
      openCircuits: Array.from(this.circuitState.values()).filter(c => c.open).length,
    };
  }

  // ============================================================
  // PRIVATE HELPERS
  // ============================================================

  private createDeliveryAttempt(
    webhookId: string,
    eventId: string,
    status: DeliveryStatus,
    httpStatus: number,
    attemptNumber: number,
    error?: string,
    nextRetryAt?: number
  ): DeliveryAttempt {
    const attempt: DeliveryAttempt = {
      id: `del_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      webhookId,
      eventId,
      status,
      httpStatus: httpStatus || undefined,
      attemptNumber,
      latencyMs: 0,
      error,
      timestamp: Date.now(),
      nextRetryAt,
    };

    this.deliveryLog.push(attempt);

    // Keep log bounded
    if (this.deliveryLog.length > 10000) {
      this.deliveryLog = this.deliveryLog.slice(-5000);
    }

    return attempt;
  }

  private updateStats(webhook: WebhookRegistration, success: boolean, latencyMs: number): void {
    webhook.stats.totalDeliveries++;
    webhook.stats.lastDeliveryAt = Date.now();

    if (success) {
      webhook.stats.successfulDeliveries++;
      webhook.stats.lastSuccessAt = Date.now();
      webhook.stats.consecutiveFailures = 0;
      // Running average latency
      webhook.stats.averageLatencyMs = (webhook.stats.averageLatencyMs * (webhook.stats.successfulDeliveries - 1) + latencyMs) / webhook.stats.successfulDeliveries;
    } else {
      webhook.stats.failedDeliveries++;
      webhook.stats.lastFailureAt = Date.now();
      webhook.stats.consecutiveFailures++;
    }
  }

  private calculateRetryDelay(config: RetryConfig, attemptNumber: number): number {
    let delay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attemptNumber - 1);
    delay = Math.min(delay, config.maxDelayMs);

    if (config.jitter) {
      delay = delay * (0.5 + Math.random() * 0.5);
    }

    return Math.round(delay);
  }

  private checkCircuitBreaker(webhook: WebhookRegistration): void {
    if (webhook.stats.consecutiveFailures >= 5) {
      this.circuitState.set(webhook.id, {
        open: true,
        openedAt: Date.now(),
        halfOpenAt: Date.now() + 60000, // 1 minute before half-open
      });
      webhook.status = 'error';

      this.emit({
        type: 'webhook:circuit.open',
        payload: { webhookId: webhook.id, consecutiveFailures: webhook.stats.consecutiveFailures },
        timestamp: Date.now(),
      });
    }
  }

  private resetCircuitBreaker(webhookId: string): void {
    const circuit = this.circuitState.get(webhookId);
    if (circuit?.open) {
      this.circuitState.delete(webhookId);
      const webhook = this.webhooks.get(webhookId);
      if (webhook) {
        webhook.status = 'active';
      }

      this.emit({
        type: 'webhook:circuit.closed',
        payload: { webhookId },
        timestamp: Date.now(),
      });
    }
  }

  private matchesFilter(event: StreamEvent, filter?: EventFilter): boolean {
    if (!filter) return true;

    if (filter.include && filter.include.length > 0) {
      const matches = filter.include.some(condition => this.evaluateCondition(event, condition));
      if (!matches) return false;
    }

    if (filter.exclude && filter.exclude.length > 0) {
      const excluded = filter.exclude.some(condition => this.evaluateCondition(event, condition));
      if (excluded) return false;
    }

    return true;
  }

  private evaluateCondition(event: StreamEvent, condition: FilterCondition): boolean {
    const value = this.getNestedValue(event, condition.field);

    switch (condition.operator) {
      case 'eq': return value === condition.value;
      case 'neq': return value !== condition.value;
      case 'contains': return typeof value === 'string' && value.includes(String(condition.value));
      case 'startsWith': return typeof value === 'string' && value.startsWith(String(condition.value));
      case 'endsWith': return typeof value === 'string' && value.endsWith(String(condition.value));
      case 'gt': return typeof value === 'number' && value > (condition.value as number);
      case 'lt': return typeof value === 'number' && value < (condition.value as number);
      case 'in': return Array.isArray(condition.value) && condition.value.includes(value);
      default: return false;
    }
  }

  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    return path.split('.').reduce((current: any, key) => current?.[key], obj);
  }

  private generateSignature(payload: string, secret: string): string {
    // Simple hash for simulation - in production use crypto.createHmac('sha256', secret)
    let hash = 0;
    const combined = payload + secret;
    for (let i = 0; i < combined.length; i++) {
      const char = combined.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `sha256=${Math.abs(hash).toString(16)}`;
  }

  // Event system
  on(type: string, handler: (event: WebhookEvent) => void): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(handler);
    return () => this.listeners.get(type)?.delete(handler);
  }

  private emit(event: WebhookEvent): void {
    this.listeners.get(event.type)?.forEach(h => h(event));
    this.listeners.get('*')?.forEach(h => h(event));
  }
}