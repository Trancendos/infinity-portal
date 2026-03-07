/**
 * THE ARTIFACTORY — Mesh Base Connector
 * Abstract base for all Trancendos ecosystem mesh connectors.
 * Part of the Trancendos Ecosystem.
 *
 * Provides standardized HTTP client, circuit breaker, retry logic,
 * health checking, and event propagation for mesh service integration.
 *
 * @module mesh/base-connector
 * @version 1.0.0
 */

import { createModuleLogger } from '../utils/logger.js';

const logger = createModuleLogger('mesh-connector');

// ─── Types ───────────────────────────────────────────────────────────

export interface MeshServiceConfig {
  name: string;
  baseUrl: string;
  port: number;
  timeoutMs: number;
  retryAttempts: number;
  retryDelayMs: number;
  circuitBreakerThreshold: number;
  circuitBreakerResetMs: number;
  healthEndpoint: string;
  apiKey?: string;
}

export interface MeshResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  statusCode: number;
  latencyMs: number;
  service: string;
}

type CircuitState = 'closed' | 'open' | 'half-open';

interface CircuitBreaker {
  state: CircuitState;
  failures: number;
  lastFailure: number;
  lastSuccess: number;
  totalRequests: number;
  totalFailures: number;
}

// ─── Base Connector ──────────────────────────────────────────────────

export abstract class BaseMeshConnector {
  protected readonly config: MeshServiceConfig;
  protected readonly serviceLogger;
  private circuit: CircuitBreaker;
  private healthy = false;
  private healthCheckInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: MeshServiceConfig) {
    this.config = config;
    this.serviceLogger = createModuleLogger(`mesh:${config.name}`);
    this.circuit = {
      state: 'closed',
      failures: 0,
      lastFailure: 0,
      lastSuccess: 0,
      totalRequests: 0,
      totalFailures: 0,
    };
  }

  /**
   * Initialize the connector — start health checks.
   */
  async initialize(): Promise<void> {
    this.serviceLogger.info(
      { service: this.config.name, baseUrl: this.config.baseUrl },
      'Initializing mesh connector'
    );

    // Initial health check
    await this.performHealthCheck();

    // Periodic health checks every 30 seconds
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck().catch((err) => {
        this.serviceLogger.debug({ err }, 'Health check failed');
      });
    }, 30_000);
  }

  /**
   * Shut down the connector.
   */
  async shutdown(): Promise<void> {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    this.serviceLogger.info({ service: this.config.name }, 'Mesh connector shut down');
  }

  /**
   * Check if the connected service is healthy.
   */
  isHealthy(): boolean {
    return this.healthy && this.circuit.state !== 'open';
  }

  /**
   * Get circuit breaker status.
   */
  getCircuitStatus(): CircuitBreaker & { healthy: boolean } {
    return { ...this.circuit, healthy: this.healthy };
  }

  /**
   * Make an HTTP request to the mesh service with retry and circuit breaker.
   */
  protected async request<T = unknown>(
    method: string,
    path: string,
    options: {
      body?: unknown;
      headers?: Record<string, string>;
      timeout?: number;
      skipCircuitBreaker?: boolean;
    } = {}
  ): Promise<MeshResponse<T>> {
    const startTime = Date.now();
    const url = `${this.config.baseUrl}${path}`;

    // Circuit breaker check
    if (!options.skipCircuitBreaker && !this.checkCircuit()) {
      return {
        success: false,
        error: `Circuit breaker OPEN for ${this.config.name} — service unavailable`,
        statusCode: 503,
        latencyMs: Date.now() - startTime,
        service: this.config.name,
      };
    }

    this.circuit.totalRequests++;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.retryAttempts; attempt++) {
      if (attempt > 0) {
        const delay = this.config.retryDelayMs * Math.pow(2, attempt - 1);
        this.serviceLogger.debug(
          { attempt, delay, service: this.config.name },
          'Retrying mesh request'
        );
        await this.sleep(delay);
      }

      try {
        const controller = new AbortController();
        const timeout = setTimeout(
          () => controller.abort(),
          options.timeout ?? this.config.timeoutMs
        );

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'X-Source-Service': 'the-artifactory',
          'X-Mesh-Protocol': 'trancendos-v1',
          ...options.headers,
        };

        if (this.config.apiKey) {
          headers['Authorization'] = `Bearer ${this.config.apiKey}`;
        }

        const fetchOptions: RequestInit = {
          method,
          headers,
          signal: controller.signal,
        };

        if (options.body && method !== 'GET' && method !== 'HEAD') {
          fetchOptions.body = JSON.stringify(options.body);
        }

        const response = await fetch(url, fetchOptions);
        clearTimeout(timeout);

        const latencyMs = Date.now() - startTime;

        if (response.ok) {
          this.recordSuccess();
          let data: T | undefined;
          const contentType = response.headers.get('content-type');
          if (contentType?.includes('application/json')) {
            data = await response.json() as T;
          }
          return {
            success: true,
            data,
            statusCode: response.status,
            latencyMs,
            service: this.config.name,
          };
        }

        // Non-retryable status codes
        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          let errorBody = '';
          try {
            errorBody = await response.text();
          } catch { /* ignore */ }

          this.recordSuccess(); // 4xx is not a service failure
          return {
            success: false,
            error: errorBody || `HTTP ${response.status}`,
            statusCode: response.status,
            latencyMs,
            service: this.config.name,
          };
        }

        // Retryable: 5xx, 429
        lastError = new Error(`HTTP ${response.status}`);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        this.serviceLogger.debug(
          { err: lastError.message, attempt, service: this.config.name },
          'Mesh request failed'
        );
      }
    }

    // All retries exhausted
    this.recordFailure();
    const latencyMs = Date.now() - startTime;

    this.serviceLogger.warn(
      {
        service: this.config.name,
        url,
        method,
        latencyMs,
        error: lastError?.message,
        circuitState: this.circuit.state,
      },
      'Mesh request failed after all retries'
    );

    return {
      success: false,
      error: lastError?.message ?? 'Unknown error',
      statusCode: 503,
      latencyMs,
      service: this.config.name,
    };
  }

  /**
   * Send an event to the mesh service (fire-and-forget with logging).
   */
  protected async emitEvent(
    eventType: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    const event = {
      id: crypto.randomUUID(),
      type: eventType,
      source: 'the-artifactory',
      timestamp: new Date().toISOString(),
      payload,
    };

    const result = await this.request('POST', '/events', { body: event });

    if (!result.success) {
      this.serviceLogger.warn(
        { eventType, service: this.config.name, error: result.error },
        'Failed to emit mesh event — non-blocking'
      );
    }
  }

  // ─── Circuit Breaker ─────────────────────────────────────────────

  private checkCircuit(): boolean {
    if (this.circuit.state === 'closed') return true;

    if (this.circuit.state === 'open') {
      const elapsed = Date.now() - this.circuit.lastFailure;
      if (elapsed >= this.config.circuitBreakerResetMs) {
        this.circuit.state = 'half-open';
        this.serviceLogger.info(
          { service: this.config.name },
          'Circuit breaker transitioning to half-open'
        );
        return true;
      }
      return false;
    }

    // half-open: allow one request through
    return true;
  }

  private recordSuccess(): void {
    this.circuit.lastSuccess = Date.now();
    if (this.circuit.state === 'half-open') {
      this.circuit.state = 'closed';
      this.circuit.failures = 0;
      this.serviceLogger.info(
        { service: this.config.name },
        'Circuit breaker closed — service recovered'
      );
    }
  }

  private recordFailure(): void {
    this.circuit.failures++;
    this.circuit.totalFailures++;
    this.circuit.lastFailure = Date.now();

    if (this.circuit.failures >= this.config.circuitBreakerThreshold) {
      this.circuit.state = 'open';
      this.serviceLogger.warn(
        {
          service: this.config.name,
          failures: this.circuit.failures,
          threshold: this.config.circuitBreakerThreshold,
        },
        'Circuit breaker OPENED — service marked unavailable'
      );
    }
  }

  // ─── Health Check ────────────────────────────────────────────────

  private async performHealthCheck(): Promise<void> {
    const result = await this.request<{ status: string }>(
      'GET',
      this.config.healthEndpoint,
      { skipCircuitBreaker: true, timeout: 5_000 }
    );

    const wasHealthy = this.healthy;
    this.healthy = result.success;

    if (this.healthy && !wasHealthy) {
      this.serviceLogger.info(
        { service: this.config.name },
        'Mesh service became healthy'
      );
    } else if (!this.healthy && wasHealthy) {
      this.serviceLogger.warn(
        { service: this.config.name, error: result.error },
        'Mesh service became unhealthy'
      );
    }
  }

  // ─── Utilities ───────────────────────────────────────────────────

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ─── Default Config Factory ──────────────────────────────────────────

export function createMeshServiceConfig(
  name: string,
  baseUrl: string,
  port: number,
  overrides: Partial<MeshServiceConfig> = {}
): MeshServiceConfig {
  return {
    name,
    baseUrl,
    port,
    timeoutMs: 10_000,
    retryAttempts: 3,
    retryDelayMs: 500,
    circuitBreakerThreshold: 5,
    circuitBreakerResetMs: 30_000,
    healthEndpoint: '/health',
    ...overrides,
  };
}