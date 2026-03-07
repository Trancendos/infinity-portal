/**
 * THE ARTIFACTORY — Observatory Connector
 * Integration with the-observatory (Monitoring & Observability).
 * Port: 3012
 *
 * Feeds metrics, traces, and structured logs to the central
 * observability platform for dashboards and alerting.
 *
 * @module mesh/observatory-connector
 * @version 1.0.0
 */

import { BaseMeshConnector, createMeshServiceConfig, type MeshResponse } from './base-connector.js';

interface MetricDataPoint {
  name: string;
  value: number;
  unit: string;
  tags: Record<string, string>;
  timestamp: string;
}

interface TraceSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  operationName: string;
  serviceName: string;
  startTime: string;
  endTime: string;
  durationMs: number;
  status: 'ok' | 'error';
  tags: Record<string, string>;
  logs?: Array<{ timestamp: string; message: string }>;
}

interface AlertDefinition {
  name: string;
  description: string;
  metric: string;
  condition: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
  threshold: number;
  windowSeconds: number;
  severity: 'info' | 'warning' | 'critical';
  channels: string[];
}

export class ObservatoryConnector extends BaseMeshConnector {
  private metricsBuffer: MetricDataPoint[] = [];
  private flushInterval: ReturnType<typeof setInterval> | null = null;

  constructor(baseUrl: string) {
    super(createMeshServiceConfig('the-observatory', baseUrl, 3012));
  }

  /**
   * Initialize with periodic metrics flushing.
   */
  async initialize(): Promise<void> {
    await super.initialize();

    // Flush buffered metrics every 10 seconds
    this.flushInterval = setInterval(() => {
      this.flushMetrics().catch(() => {});
    }, 10_000);
  }

  /**
   * Shut down and flush remaining metrics.
   */
  async shutdown(): Promise<void> {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    await this.flushMetrics();
    await super.shutdown();
  }

  /**
   * Record a metric data point (buffered).
   */
  recordMetric(
    name: string,
    value: number,
    unit: string,
    tags: Record<string, string> = {}
  ): void {
    this.metricsBuffer.push({
      name: `artifactory.${name}`,
      value,
      unit,
      tags: { ...tags, service: 'the-artifactory' },
      timestamp: new Date().toISOString(),
    });

    // Auto-flush if buffer is large
    if (this.metricsBuffer.length >= 100) {
      this.flushMetrics().catch(() => {});
    }
  }

  /**
   * Send a trace span to the observatory.
   */
  async sendTrace(span: TraceSpan): Promise<MeshResponse> {
    return this.request('POST', '/api/v1/traces', {
      body: { ...span, serviceName: 'the-artifactory' },
    });
  }

  /**
   * Register alert definitions for artifactory-specific conditions.
   */
  async registerAlerts(alerts: AlertDefinition[]): Promise<MeshResponse> {
    return this.request('POST', '/api/v1/alerts/register', {
      body: {
        service: 'the-artifactory',
        alerts,
      },
    });
  }

  /**
   * Send a structured event for dashboard rendering.
   */
  async sendDashboardEvent(event: {
    type: string;
    title: string;
    description: string;
    severity: 'info' | 'warning' | 'critical';
    metadata: Record<string, unknown>;
  }): Promise<MeshResponse> {
    return this.request('POST', '/api/v1/events', {
      body: { ...event, source: 'the-artifactory', timestamp: new Date().toISOString() },
    });
  }

  /**
   * Report artifact-specific metrics batch.
   */
  async reportArtifactMetrics(metrics: {
    totalArtifacts: number;
    totalStorageBytes: number;
    publishesLast24h: number;
    downloadsLast24h: number;
    quarantinedCount: number;
    scansPending: number;
    cacheHitRate: number;
    avgPublishLatencyMs: number;
    avgDownloadLatencyMs: number;
  }): Promise<MeshResponse> {
    return this.request('POST', '/api/v1/metrics/batch', {
      body: {
        service: 'the-artifactory',
        timestamp: new Date().toISOString(),
        metrics: Object.entries(metrics).map(([name, value]) => ({
          name: `artifactory.${name}`,
          value,
          unit: name.includes('Bytes') ? 'bytes' : name.includes('Ms') ? 'ms' : name.includes('Rate') ? 'percent' : 'count',
          tags: { service: 'the-artifactory' },
          timestamp: new Date().toISOString(),
        })),
      },
    });
  }

  // ─── Private ─────────────────────────────────────────────────────

  private async flushMetrics(): Promise<void> {
    if (this.metricsBuffer.length === 0) return;

    const batch = this.metricsBuffer.splice(0, this.metricsBuffer.length);
    const result = await this.request('POST', '/api/v1/metrics/batch', {
      body: { service: 'the-artifactory', metrics: batch },
    });

    if (!result.success) {
      // Re-add to buffer on failure (with cap to prevent memory leak)
      if (this.metricsBuffer.length < 1000) {
        this.metricsBuffer.unshift(...batch);
      }
    }
  }
}