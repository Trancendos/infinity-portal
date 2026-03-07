/**
 * THE ARTIFACTORY — Treasury Connector
 * Integration with the-treasury (Billing & Cost Management).
 *
 * Reports storage consumption, bandwidth usage, and artifact
 * operations for billing calculation and cost attribution.
 *
 * @module mesh/treasury-connector
 * @version 1.0.0
 */

import { BaseMeshConnector, createMeshServiceConfig, type MeshResponse } from './base-connector.js';

interface UsageRecord {
  tenantId: string;
  resourceType: 'storage' | 'bandwidth' | 'compute' | 'operations';
  quantity: number;
  unit: 'bytes' | 'requests' | 'seconds' | 'scans';
  operation: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

interface CostReport {
  tenantId: string;
  period: string;
  breakdown: Array<{
    category: string;
    quantity: number;
    unit: string;
    unitCost: number;
    totalCost: number;
  }>;
  totalCost: number;
  currency: string;
}

interface BillingAlert {
  tenantId: string;
  alertType: 'quota-warning' | 'quota-exceeded' | 'cost-spike' | 'usage-anomaly';
  threshold: number;
  currentValue: number;
  message: string;
}

export class TreasuryConnector extends BaseMeshConnector {
  private usageBuffer: UsageRecord[] = [];
  private flushInterval: ReturnType<typeof setInterval> | null = null;

  constructor(baseUrl: string) {
    super(createMeshServiceConfig('the-treasury', baseUrl, 3018));
  }

  /**
   * Initialize with periodic usage flushing.
   */
  async initialize(): Promise<void> {
    await super.initialize();
    this.flushInterval = setInterval(() => {
      this.flushUsage().catch(() => {});
    }, 30_000);
  }

  /**
   * Shut down and flush remaining usage records.
   */
  async shutdown(): Promise<void> {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    await this.flushUsage();
    await super.shutdown();
  }

  /**
   * Record a usage event (buffered for batch submission).
   */
  recordUsage(record: Omit<UsageRecord, 'timestamp'>): void {
    this.usageBuffer.push({
      ...record,
      timestamp: new Date().toISOString(),
    });

    if (this.usageBuffer.length >= 50) {
      this.flushUsage().catch(() => {});
    }
  }

  /**
   * Record a storage operation for billing.
   */
  recordStorageUsage(tenantId: string, bytes: number, operation: string): void {
    this.recordUsage({
      tenantId,
      resourceType: 'storage',
      quantity: bytes,
      unit: 'bytes',
      operation,
    });
  }

  /**
   * Record a bandwidth operation for billing.
   */
  recordBandwidthUsage(tenantId: string, bytes: number, operation: string): void {
    this.recordUsage({
      tenantId,
      resourceType: 'bandwidth',
      quantity: bytes,
      unit: 'bytes',
      operation,
    });
  }

  /**
   * Record a scan operation for billing.
   */
  recordScanUsage(tenantId: string, operation: string): void {
    this.recordUsage({
      tenantId,
      resourceType: 'compute',
      quantity: 1,
      unit: 'scans',
      operation,
    });
  }

  /**
   * Get cost report for a tenant.
   */
  async getCostReport(tenantId: string, period: string): Promise<MeshResponse<CostReport>> {
    return this.request<CostReport>(
      'GET',
      `/api/v1/tenants/${tenantId}/costs?period=${encodeURIComponent(period)}`
    );
  }

  /**
   * Send a billing alert to the-treasury.
   */
  async sendBillingAlert(alert: BillingAlert): Promise<MeshResponse> {
    return this.request('POST', '/api/v1/alerts/billing', {
      body: { ...alert, source: 'the-artifactory', timestamp: new Date().toISOString() },
    });
  }

  /**
   * Report current storage totals per tenant for reconciliation.
   */
  async reportStorageTotals(
    totals: Array<{ tenantId: string; totalBytes: number; artifactCount: number }>
  ): Promise<MeshResponse> {
    return this.request('POST', '/api/v1/reconciliation/storage', {
      body: { service: 'the-artifactory', totals, timestamp: new Date().toISOString() },
    });
  }

  // ─── Private ─────────────────────────────────────────────────────

  private async flushUsage(): Promise<void> {
    if (this.usageBuffer.length === 0) return;

    const batch = this.usageBuffer.splice(0, this.usageBuffer.length);
    const result = await this.request('POST', '/api/v1/usage/batch', {
      body: { service: 'the-artifactory', records: batch },
    });

    if (!result.success && this.usageBuffer.length < 500) {
      this.usageBuffer.unshift(...batch);
    }
  }
}