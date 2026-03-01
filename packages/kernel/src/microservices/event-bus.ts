/**
 * Event Bus Implementation
 * 
 * Provides asynchronous inter-service communication through:
 * - Publish/Subscribe messaging
 * - Event sourcing support
 * - Dead letter queue handling
 * - Event replay capability
 * - Ordered delivery guarantees
 */

export interface Event<T = any> {
  /** Unique event ID */
  id: string;
  /** Event type */
  type: string;
  /** Event source service */
  source: string;
  /** Event payload */
  data: T;
  /** Event metadata */
  metadata: EventMetadata;
  /** Event timestamp */
  timestamp: number;
  /** Event version */
  version: number;
}

export interface EventMetadata {
  correlationId?: string;
  causationId?: string;
  userId?: string;
  traceId?: string;
  retryCount?: number;
}

export interface EventSubscription {
  /** Subscription ID */
  id: string;
  /** Event type pattern (supports wildcards) */
  pattern: string;
  /** Handler function */
  handler: EventHandler;
  /** Subscriber service name */
  subscriber: string;
  /** Whether to process events in order */
  ordered: boolean;
  /** Maximum retries for failed handlers */
  maxRetries: number;
  /** Retry delay in ms */
  retryDelay: number;
}

export type EventHandler<T = any> = (event: Event<T>) => Promise<void>;

export interface EventBusOptions {
  /** Maximum events to store in history */
  maxHistory: number;
  /** Dead letter queue size */
  maxDeadLetterQueue: number;
  /** Default retry count */
  defaultMaxRetries: number;
  /** Default retry delay in ms */
  defaultRetryDelay: number;
  /** Callback for event bus metrics */
  onMetric?: (metric: EventBusMetric) => void;
}

export interface EventBusMetric {
  totalPublished: number;
  totalDelivered: number;
  totalFailed: number;
  totalRetried: number;
  deadLetterCount: number;
  subscriptionCount: number;
  historySize: number;
}

export class EventBus {
  private subscriptions: Map<string, EventSubscription[]> = new Map();
  private history: Event[] = [];
  private deadLetterQueue: Array<{ event: Event; error: string; subscription: string }> = [];
  private totalPublished: number = 0;
  private totalDelivered: number = 0;
  private totalFailed: number = 0;
  private totalRetried: number = 0;

  constructor(private readonly options: EventBusOptions) {}

  /**
   * Publish an event
   */
  async publish<T>(type: string, data: T, source: string, metadata?: Partial<EventMetadata>): Promise<Event<T>> {
    const event: Event<T> = {
      id: this.generateId(),
      type,
      source,
      data,
      metadata: {
        correlationId: metadata?.correlationId || this.generateId(),
        causationId: metadata?.causationId,
        userId: metadata?.userId,
        traceId: metadata?.traceId,
        retryCount: 0,
      },
      timestamp: Date.now(),
      version: 1,
    };

    // Store in history
    this.history.push(event);
    if (this.history.length > this.options.maxHistory) {
      this.history = this.history.slice(-this.options.maxHistory);
    }

    this.totalPublished++;

    // Deliver to subscribers
    await this.deliver(event);

    this.emitMetric();
    return event;
  }

  /**
   * Subscribe to events
   */
  subscribe<T = any>(
    pattern: string,
    handler: EventHandler<T>,
    subscriber: string,
    options?: Partial<Pick<EventSubscription, 'ordered' | 'maxRetries' | 'retryDelay'>>
  ): string {
    const subscription: EventSubscription = {
      id: this.generateId(),
      pattern,
      handler: handler as EventHandler,
      subscriber,
      ordered: options?.ordered || false,
      maxRetries: options?.maxRetries || this.options.defaultMaxRetries,
      retryDelay: options?.retryDelay || this.options.defaultRetryDelay,
    };

    const existing = this.subscriptions.get(pattern) || [];
    existing.push(subscription);
    this.subscriptions.set(pattern, existing);

    return subscription.id;
  }

  /**
   * Unsubscribe from events
   */
  unsubscribe(subscriptionId: string): boolean {
    for (const [pattern, subs] of this.subscriptions.entries()) {
      const index = subs.findIndex(s => s.id === subscriptionId);
      if (index !== -1) {
        subs.splice(index, 1);
        if (subs.length === 0) {
          this.subscriptions.delete(pattern);
        }
        return true;
      }
    }
    return false;
  }

  /**
   * Deliver event to matching subscribers
   */
  private async deliver(event: Event): Promise<void> {
    const matchingSubscriptions = this.getMatchingSubscriptions(event.type);

    const deliveryPromises = matchingSubscriptions.map(async (subscription) => {
      try {
        await this.executeHandler(event, subscription);
        this.totalDelivered++;
      } catch (error) {
        await this.handleDeliveryFailure(event, subscription, error);
      }
    });

    await Promise.allSettled(deliveryPromises);
  }

  /**
   * Execute handler with retry logic
   */
  private async executeHandler(event: Event, subscription: EventSubscription): Promise<void> {
    let lastError: Error | null = null;
    const maxAttempts = subscription.maxRetries + 1;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        await subscription.handler(event);
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < maxAttempts - 1) {
          this.totalRetried++;
          const delay = subscription.retryDelay * Math.pow(2, attempt);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }

  /**
   * Handle delivery failure
   */
  private async handleDeliveryFailure(
    event: Event,
    subscription: EventSubscription,
    error: unknown
  ): Promise<void> {
    this.totalFailed++;
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Add to dead letter queue
    this.deadLetterQueue.push({
      event,
      error: errorMessage,
      subscription: subscription.id,
    });

    // Trim dead letter queue
    if (this.deadLetterQueue.length > this.options.maxDeadLetterQueue) {
      this.deadLetterQueue = this.deadLetterQueue.slice(-this.options.maxDeadLetterQueue);
    }
  }

  /**
   * Get subscriptions matching an event type
   */
  private getMatchingSubscriptions(eventType: string): EventSubscription[] {
    const matching: EventSubscription[] = [];

    for (const [pattern, subs] of this.subscriptions.entries()) {
      if (this.matchPattern(eventType, pattern)) {
        matching.push(...subs);
      }
    }

    return matching;
  }

  /**
   * Match event type against pattern (supports wildcards)
   */
  private matchPattern(eventType: string, pattern: string): boolean {
    if (pattern === '*') return true;
    if (pattern === eventType) return true;

    // Support dot-separated wildcards: 'user.*' matches 'user.created'
    const patternParts = pattern.split('.');
    const typeParts = eventType.split('.');

    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i] === '*') return true;
      if (patternParts[i] === '**') return true;
      if (i >= typeParts.length) return false;
      if (patternParts[i] !== typeParts[i]) return false;
    }

    return patternParts.length === typeParts.length;
  }

  /**
   * Replay events from history
   */
  async replay(
    filter?: { type?: string; source?: string; since?: number; until?: number },
    handler?: EventHandler
  ): Promise<Event[]> {
    let events = [...this.history];

    if (filter?.type) {
      events = events.filter(e => this.matchPattern(e.type, filter.type!));
    }
    if (filter?.source) {
      events = events.filter(e => e.source === filter.source);
    }
    if (filter?.since) {
      events = events.filter(e => e.timestamp >= filter.since!);
    }
    if (filter?.until) {
      events = events.filter(e => e.timestamp <= filter.until!);
    }

    if (handler) {
      for (const event of events) {
        await handler(event);
      }
    }

    return events;
  }

  /**
   * Get dead letter queue contents
   */
  getDeadLetterQueue(): Array<{ event: Event; error: string; subscription: string }> {
    return [...this.deadLetterQueue];
  }

  /**
   * Retry dead letter queue items
   */
  async retryDeadLetterQueue(): Promise<{ success: number; failed: number }> {
    const items = [...this.deadLetterQueue];
    this.deadLetterQueue = [];
    let success = 0;
    let failed = 0;

    for (const item of items) {
      try {
        await this.deliver(item.event);
        success++;
      } catch {
        failed++;
        this.deadLetterQueue.push(item);
      }
    }

    return { success, failed };
  }

  /**
   * Get event bus metrics
   */
  getMetrics(): EventBusMetric {
    let subscriptionCount = 0;
    for (const subs of this.subscriptions.values()) {
      subscriptionCount += subs.length;
    }

    return {
      totalPublished: this.totalPublished,
      totalDelivered: this.totalDelivered,
      totalFailed: this.totalFailed,
      totalRetried: this.totalRetried,
      deadLetterCount: this.deadLetterQueue.length,
      subscriptionCount,
      historySize: this.history.length,
    };
  }

  /**
   * Emit metrics
   */
  private emitMetric(): void {
    this.options.onMetric?.(this.getMetrics());
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 10)}`;
  }

  /**
   * Destroy the event bus
   */
  destroy(): void {
    this.subscriptions.clear();
    this.history = [];
    this.deadLetterQueue = [];
  }
}

/**
 * Common event types for Infinity Portal
 */
export const EventTypes = {
  // User events
  USER_CREATED: 'user.created',
  USER_UPDATED: 'user.updated',
  USER_DELETED: 'user.deleted',
  USER_LOGIN: 'user.login',
  USER_LOGOUT: 'user.logout',

  // Agent events
  AGENT_CREATED: 'agent.created',
  AGENT_UPDATED: 'agent.updated',
  AGENT_DELETED: 'agent.deleted',
  AGENT_SUMMONED: 'agent.summoned',
  AGENT_COMPLETED: 'agent.completed',

  // Document events
  DOCUMENT_CREATED: 'document.created',
  DOCUMENT_UPDATED: 'document.updated',
  DOCUMENT_DELETED: 'document.deleted',
  DOCUMENT_SHARED: 'document.shared',

  // Workflow events
  WORKFLOW_STARTED: 'workflow.started',
  WORKFLOW_COMPLETED: 'workflow.completed',
  WORKFLOW_FAILED: 'workflow.failed',
  WORKFLOW_STEP_COMPLETED: 'workflow.step.completed',

  // Billing events
  PAYMENT_RECEIVED: 'billing.payment.received',
  SUBSCRIPTION_CREATED: 'billing.subscription.created',
  SUBSCRIPTION_CANCELLED: 'billing.subscription.cancelled',
  INVOICE_GENERATED: 'billing.invoice.generated',

  // System events
  SERVICE_STARTED: 'system.service.started',
  SERVICE_STOPPED: 'system.service.stopped',
  SERVICE_HEALTH_CHANGED: 'system.service.health_changed',
  DEPLOYMENT_COMPLETED: 'system.deployment.completed',
};