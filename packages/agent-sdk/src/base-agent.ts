// src/base-agent.ts - Abstract base class for all Trancendos agents

import { v4 as uuidv4 } from "uuid";
import {
  AgentConfig,
  AgentState,
  AgentEvent,
  EventResult,
  EventHandler,
  HealthStatus,
  MetricPoint,
  EventBus,
  AgentLogger,
} from "./types";
import { InMemoryEventBus, createEvent } from "./event-bus";
import { DefaultLogger } from "./logger";

/**
 * BaseAgent - Abstract foundation for all 27+ Trancendos AI agents.
 *
 * Provides:
 * - Lifecycle management (init → ready → processing → shutdown)
 * - Event publishing and subscription
 * - Health checks with pluggable indicators
 * - Structured logging with correlation IDs
 * - Metrics collection for Prometheus/Grafana
 * - Concurrency control
 * - Graceful shutdown
 *
 * Usage:
 * ```typescript
 * class NormanAI extends BaseAgent {
 *   async onInitialize(): Promise<void> { ... }
 *   async onEvent(event: AgentEvent): Promise<EventResult> { ... }
 *   async onShutdown(): Promise<void> { ... }
 * }
 * ```
 */
export abstract class BaseAgent {
  public readonly config: AgentConfig;
  protected readonly logger: AgentLogger;
  protected readonly eventBus: EventBus;

  private _state: AgentState = AgentState.UNINITIALIZED;
  private _startTime: number = 0;
  private _lastActivity: string | null = null;
  private _activeProcessing = 0;
  private _healthCheckTimer: ReturnType<typeof setInterval> | null = null;
  private _metrics: MetricPoint[] = [];
  private _eventHandlers: Map<string, EventHandler> = new Map();

  constructor(
    config: AgentConfig,
    options?: {
      logger?: AgentLogger;
      eventBus?: EventBus;
    }
  ) {
    this.config = {
      healthCheckIntervalMs: 30000,
      maxConcurrency: 10,
      ...config,
    };
    this.logger = options?.logger ?? new DefaultLogger(config.id);
    this.eventBus = options?.eventBus ?? new InMemoryEventBus();
  }

  // ── Lifecycle ──────────────────────────────────────────────────

  /**
   * Initialize the agent. Calls onInitialize() for subclass setup,
   * connects to the event bus, and starts health check timer.
   */
  async initialize(): Promise<void> {
    if (this._state !== AgentState.UNINITIALIZED) {
      throw new Error(`Cannot initialize agent in state: ${this._state}`);
    }

    this._state = AgentState.INITIALIZING;
    this._startTime = Date.now();
    this.logger.info("Agent initializing", { agent: this.config.id, version: this.config.version });

    try {
      // Connect event bus
      await this.eventBus.connect();

      // Register internal event handlers
      for (const [eventType, handler] of this._eventHandlers.entries()) {
        this.eventBus.subscribe(eventType, handler);
      }

      // Subclass initialization
      await this.onInitialize();

      // Start health check timer
      if (this.config.healthCheckIntervalMs && this.config.healthCheckIntervalMs > 0) {
        this._healthCheckTimer = setInterval(
          () => this._emitHealthCheck(),
          this.config.healthCheckIntervalMs
        );
      }

      this._state = AgentState.READY;
      this.logger.info("Agent ready", {
        agent: this.config.id,
        capabilities: this.config.capabilities,
        tier: this.config.tier,
      });

      // Announce presence
      await this.publish("agent.started", {
        agentId: this.config.id,
        capabilities: this.config.capabilities,
        version: this.config.version,
      });
    } catch (err) {
      this._state = AgentState.ERROR;
      this.logger.error("Agent initialization failed", {
        agent: this.config.id,
        error: String(err),
      });
      throw err;
    }
  }

  /**
   * Graceful shutdown. Waits for active processing to complete,
   * then calls onShutdown() for subclass cleanup.
   */
  async shutdown(): Promise<void> {
    if (this._state === AgentState.STOPPED || this._state === AgentState.SHUTTING_DOWN) {
      return;
    }

    this._state = AgentState.SHUTTING_DOWN;
    this.logger.info("Agent shutting down", { agent: this.config.id });

    // Stop health checks
    if (this._healthCheckTimer) {
      clearInterval(this._healthCheckTimer);
      this._healthCheckTimer = null;
    }

    // Wait for active processing to finish (max 30s)
    const deadline = Date.now() + 30000;
    while (this._activeProcessing > 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    if (this._activeProcessing > 0) {
      this.logger.warn("Forcing shutdown with active processing", {
        active: this._activeProcessing,
      });
    }

    try {
      // Announce departure
      await this.publish("agent.stopped", { agentId: this.config.id });

      // Subclass cleanup
      await this.onShutdown();

      // Disconnect event bus
      await this.eventBus.disconnect();
    } catch (err) {
      this.logger.error("Error during shutdown", { error: String(err) });
    }

    this._state = AgentState.STOPPED;
    this.logger.info("Agent stopped", { agent: this.config.id });
  }

  // ── Event System ───────────────────────────────────────────────

  /**
   * Publish an event to the event bus
   */
  async publish<T = unknown>(
    eventType: string,
    data: T,
    options?: { target?: string; correlationId?: string; metadata?: Record<string, string> }
  ): Promise<void> {
    const event = createEvent(eventType, this.config.id, data, options);
    await this.eventBus.publish(event);
    this.recordMetric("events_published_total", 1, { type: eventType });
  }

  /**
   * Subscribe to events of a specific type
   */
  subscribe<T = unknown>(eventType: string, handler: EventHandler<T>): void {
    const wrappedHandler: EventHandler = async (event: AgentEvent) => {
      // Concurrency gate
      if (this._activeProcessing >= (this.config.maxConcurrency ?? 10)) {
        this.logger.warn("Concurrency limit reached, dropping event", {
          eventType: event.type,
          active: this._activeProcessing,
          max: this.config.maxConcurrency,
        });
        this.recordMetric("events_dropped_total", 1, { type: event.type });
        return { success: false, error: "Concurrency limit reached", durationMs: 0 };
      }

      this._activeProcessing++;
      this._state = AgentState.PROCESSING;
      const start = Date.now();

      try {
        const result = await handler(event as AgentEvent<T>);
        this._lastActivity = new Date().toISOString();
        this.recordMetric("events_processed_total", 1, {
          type: event.type,
          success: String(result.success),
        });
        this.recordMetric("event_processing_duration_ms", Date.now() - start, {
          type: event.type,
        });
        return result;
      } catch (err) {
        this.logger.error("Event handler error", {
          eventType: event.type,
          error: String(err),
          correlationId: event.correlationId,
        });
        this.recordMetric("events_failed_total", 1, { type: event.type });
        return { success: false, error: String(err), durationMs: Date.now() - start };
      } finally {
        this._activeProcessing--;
        if (this._activeProcessing === 0 && this._state === AgentState.PROCESSING) {
          this._state = AgentState.READY;
        }
      }
    };

    this._eventHandlers.set(eventType, wrappedHandler);

    // If already connected, subscribe immediately
    if (this._state !== AgentState.UNINITIALIZED) {
      this.eventBus.subscribe(eventType, wrappedHandler);
    }
  }

  // ── Health ─────────────────────────────────────────────────────

  /**
   * Get current health status. Override getCustomHealthChecks() to add
   * agent-specific health indicators.
   */
  getHealth(): HealthStatus {
    return {
      agentId: this.config.id,
      state: this._state,
      uptime: this._startTime > 0 ? Date.now() - this._startTime : 0,
      version: this.config.version,
      lastActivity: this._lastActivity,
      queueDepth: this._activeProcessing,
      checks: this.getCustomHealthChecks(),
      timestamp: new Date().toISOString(),
    };
  }

  private async _emitHealthCheck(): Promise<void> {
    try {
      await this.publish("agent.health_check", this.getHealth());
    } catch {
      // Health check failure should not crash the agent
    }
  }

  // ── Metrics ────────────────────────────────────────────────────

  /**
   * Record a metric point (for Prometheus/Grafana collection)
   */
  protected recordMetric(name: string, value: number, labels: Record<string, string> = {}): void {
    this._metrics.push({
      name: `trancendos_agent_${name}`,
      value,
      labels: { agent: this.config.id, ...labels },
      timestamp: new Date().toISOString(),
    });

    // Keep only last 1000 metrics in memory
    if (this._metrics.length > 1000) {
      this._metrics = this._metrics.slice(-500);
    }
  }

  /**
   * Flush and return collected metrics
   */
  getMetrics(): MetricPoint[] {
    const metrics = [...this._metrics];
    this._metrics = [];
    return metrics;
  }

  // ── State ──────────────────────────────────────────────────────

  get state(): AgentState {
    return this._state;
  }

  get uptime(): number {
    return this._startTime > 0 ? Date.now() - this._startTime : 0;
  }

  // ── Abstract Methods (implement in subclass) ───────────────────

  /**
   * Called during initialization. Set up resources, load models, etc.
   */
  protected abstract onInitialize(): Promise<void>;

  /**
   * Called during shutdown. Clean up resources, flush buffers, etc.
   */
  protected abstract onShutdown(): Promise<void>;

  /**
   * Return custom health check indicators specific to this agent.
   * Override to add checks like model readiness, external service status, etc.
   */
  protected getCustomHealthChecks(): Record<
    string,
    { status: "pass" | "warn" | "fail"; message?: string }
  > {
    return {};
  }
}
