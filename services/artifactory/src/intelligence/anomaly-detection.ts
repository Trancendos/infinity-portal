/**
 * THE ARTIFACTORY — Anomaly Detection Engine
 * Detects unusual patterns in artifact operations, access,
 * and supply chain behavior for proactive security response.
 * Part of the Trancendos Ecosystem.
 *
 * @module intelligence/anomaly-detection
 * @version 1.0.0
 */

import { createModuleLogger } from '../utils/logger.js';

const logger = createModuleLogger('anomaly-detection');

// ─── Types ───────────────────────────────────────────────────────────

export type AnomalyType =
  | 'download-spike'
  | 'publish-burst'
  | 'dependency-confusion'
  | 'version-regression'
  | 'supply-chain-risk'
  | 'unusual-publisher'
  | 'size-anomaly'
  | 'access-pattern-shift'
  | 'mass-deletion'
  | 'privilege-escalation';

export type AnomalySeverity = 'low' | 'medium' | 'high' | 'critical';

export interface Anomaly {
  id: string;
  type: AnomalyType;
  severity: AnomalySeverity;
  tenantId: string;
  artifactId?: string;
  artifactName?: string;
  detectedAt: string;
  description: string;
  evidence: Record<string, unknown>;
  recommendedAction: string;
  autoMitigated: boolean;
  mitigationAction?: string;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
}

export interface AnomalyRule {
  id: string;
  name: string;
  type: AnomalyType;
  enabled: boolean;
  threshold: number;
  windowMinutes: number;
  severity: AnomalySeverity;
  autoMitigate: boolean;
  mitigationAction?: 'quarantine' | 'rate-limit' | 'alert-only' | 'block-publisher';
}

export interface OperationEvent {
  type: 'publish' | 'download' | 'delete' | 'promote' | 'quarantine' | 'login';
  tenantId: string;
  artifactId?: string;
  artifactName?: string;
  version?: string;
  actor: string;
  sourceIp?: string;
  timestamp: string;
  metadata: Record<string, unknown>;
}

// ─── Storage Interface ───────────────────────────────────────────────

export interface AnomalyStore {
  saveAnomaly(anomaly: Anomaly): Promise<void>;
  getAnomalies(tenantId: string, options: {
    since?: string;
    type?: AnomalyType;
    severity?: AnomalySeverity;
    acknowledged?: boolean;
    limit: number;
    offset: number;
  }): Promise<{ anomalies: Anomaly[]; total: number }>;
  acknowledgeAnomaly(id: string, actor: string): Promise<void>;
  getEventCount(tenantId: string, eventType: string, since: string): Promise<number>;
  getEventCountByActor(tenantId: string, actor: string, eventType: string, since: string): Promise<number>;
  getRecentEvents(tenantId: string, eventType: string, since: string, limit: number): Promise<OperationEvent[]>;
  saveEvent(event: OperationEvent): Promise<void>;
}

// ─── Anomaly Detection Engine ────────────────────────────────────────

export class AnomalyDetectionEngine {
  private readonly store: AnomalyStore;
  private readonly rules: Map<string, AnomalyRule> = new Map();
  private readonly mitigationCallbacks: Map<string, (anomaly: Anomaly) => Promise<void>> = new Map();

  constructor(store: AnomalyStore) {
    this.store = store;
    this.loadDefaultRules();
  }

  /**
   * Process an operation event and check for anomalies.
   */
  async processEvent(event: OperationEvent): Promise<Anomaly[]> {
    await this.store.saveEvent(event);

    const detected: Anomaly[] = [];

    for (const rule of this.rules.values()) {
      if (!rule.enabled) continue;

      const anomaly = await this.evaluateRule(rule, event);
      if (anomaly) {
        await this.store.saveAnomaly(anomaly);
        detected.push(anomaly);

        logger.warn(
          {
            anomalyId: anomaly.id,
            type: anomaly.type,
            severity: anomaly.severity,
            tenantId: anomaly.tenantId,
            artifactName: anomaly.artifactName,
          },
          `Anomaly detected: ${anomaly.description}`
        );

        // Auto-mitigate if configured
        if (rule.autoMitigate && rule.mitigationAction) {
          await this.autoMitigate(anomaly, rule.mitigationAction);
        }
      }
    }

    return detected;
  }

  /**
   * Register a mitigation callback for a specific action type.
   */
  registerMitigation(
    action: string,
    callback: (anomaly: Anomaly) => Promise<void>
  ): void {
    this.mitigationCallbacks.set(action, callback);
  }

  /**
   * Add or update an anomaly detection rule.
   */
  setRule(rule: AnomalyRule): void {
    this.rules.set(rule.id, rule);
    logger.info({ ruleId: rule.id, type: rule.type }, 'Anomaly rule configured');
  }

  /**
   * Remove an anomaly detection rule.
   */
  removeRule(ruleId: string): void {
    this.rules.delete(ruleId);
  }

  /**
   * Get all configured rules.
   */
  getRules(): AnomalyRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * Get anomalies for a tenant.
   */
  async getAnomalies(tenantId: string, options: {
    since?: string;
    type?: AnomalyType;
    severity?: AnomalySeverity;
    acknowledged?: boolean;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ anomalies: Anomaly[]; total: number }> {
    return this.store.getAnomalies(tenantId, {
      ...options,
      limit: options.limit ?? 50,
      offset: options.offset ?? 0,
    });
  }

  /**
   * Acknowledge an anomaly.
   */
  async acknowledgeAnomaly(anomalyId: string, actor: string): Promise<void> {
    await this.store.acknowledgeAnomaly(anomalyId, actor);
    logger.info({ anomalyId, actor }, 'Anomaly acknowledged');
  }

  // ─── Rule Evaluation ─────────────────────────────────────────────

  private async evaluateRule(
    rule: AnomalyRule,
    event: OperationEvent
  ): Promise<Anomaly | null> {
    const since = new Date(Date.now() - rule.windowMinutes * 60_000).toISOString();

    switch (rule.type) {
      case 'download-spike':
        return this.checkDownloadSpike(rule, event, since);
      case 'publish-burst':
        return this.checkPublishBurst(rule, event, since);
      case 'dependency-confusion':
        return this.checkDependencyConfusion(rule, event);
      case 'size-anomaly':
        return this.checkSizeAnomaly(rule, event);
      case 'unusual-publisher':
        return this.checkUnusualPublisher(rule, event, since);
      case 'mass-deletion':
        return this.checkMassDeletion(rule, event, since);
      case 'version-regression':
        return this.checkVersionRegression(rule, event);
      default:
        return null;
    }
  }

  private async checkDownloadSpike(
    rule: AnomalyRule,
    event: OperationEvent,
    since: string
  ): Promise<Anomaly | null> {
    if (event.type !== 'download') return null;

    const count = await this.store.getEventCount(event.tenantId, 'download', since);
    if (count < rule.threshold) return null;

    return this.createAnomaly(rule, event, {
      description: `Download spike detected: ${count} downloads in ${rule.windowMinutes} minutes (threshold: ${rule.threshold})`,
      evidence: { downloadCount: count, windowMinutes: rule.windowMinutes, threshold: rule.threshold },
      recommendedAction: 'Investigate source IPs and user agents for potential scraping or abuse',
    });
  }

  private async checkPublishBurst(
    rule: AnomalyRule,
    event: OperationEvent,
    since: string
  ): Promise<Anomaly | null> {
    if (event.type !== 'publish') return null;

    const count = await this.store.getEventCountByActor(
      event.tenantId, event.actor, 'publish', since
    );
    if (count < rule.threshold) return null;

    return this.createAnomaly(rule, event, {
      description: `Publish burst by ${event.actor}: ${count} publishes in ${rule.windowMinutes} minutes`,
      evidence: { publishCount: count, actor: event.actor, windowMinutes: rule.windowMinutes },
      recommendedAction: 'Verify publisher identity and review published artifacts for malicious content',
    });
  }

  private async checkDependencyConfusion(
    rule: AnomalyRule,
    event: OperationEvent
  ): Promise<Anomaly | null> {
    if (event.type !== 'publish') return null;

    const name = event.artifactName ?? '';
    // Flag if someone publishes a package with @trancendos scope from external source
    if (name.startsWith('@trancendos/') && event.metadata?.source === 'external') {
      return this.createAnomaly(rule, event, {
        description: `Potential dependency confusion attack: external publish of @trancendos scoped package "${name}"`,
        evidence: { artifactName: name, source: event.metadata.source, actor: event.actor },
        recommendedAction: 'IMMEDIATELY quarantine artifact and investigate publisher credentials',
      });
    }

    return null;
  }

  private async checkSizeAnomaly(
    rule: AnomalyRule,
    event: OperationEvent
  ): Promise<Anomaly | null> {
    if (event.type !== 'publish') return null;

    const sizeBytes = event.metadata?.sizeBytes as number;
    if (!sizeBytes || sizeBytes < rule.threshold) return null;

    return this.createAnomaly(rule, event, {
      description: `Unusually large artifact published: ${(sizeBytes / 1024 / 1024).toFixed(2)} MB (threshold: ${(rule.threshold / 1024 / 1024).toFixed(2)} MB)`,
      evidence: { sizeBytes, thresholdBytes: rule.threshold, artifactName: event.artifactName },
      recommendedAction: 'Review artifact contents for embedded binaries, data exfiltration, or bloat',
    });
  }

  private async checkUnusualPublisher(
    rule: AnomalyRule,
    event: OperationEvent,
    since: string
  ): Promise<Anomaly | null> {
    if (event.type !== 'publish') return null;

    // Check if this actor has published before
    const previousPublishes = await this.store.getEventCountByActor(
      event.tenantId, event.actor, 'publish', since
    );

    // First-time publisher for this tenant
    if (previousPublishes <= 1) {
      return this.createAnomaly(rule, event, {
        description: `First-time publisher detected: ${event.actor} published "${event.artifactName}"`,
        evidence: { actor: event.actor, artifactName: event.artifactName, previousPublishes },
        recommendedAction: 'Verify publisher authorization and review artifact contents',
      });
    }

    return null;
  }

  private async checkMassDeletion(
    rule: AnomalyRule,
    event: OperationEvent,
    since: string
  ): Promise<Anomaly | null> {
    if (event.type !== 'delete') return null;

    const count = await this.store.getEventCountByActor(
      event.tenantId, event.actor, 'delete', since
    );
    if (count < rule.threshold) return null;

    return this.createAnomaly(rule, event, {
      description: `Mass deletion detected: ${event.actor} deleted ${count} artifacts in ${rule.windowMinutes} minutes`,
      evidence: { deleteCount: count, actor: event.actor, windowMinutes: rule.windowMinutes },
      recommendedAction: 'IMMEDIATELY suspend actor permissions and investigate for compromised credentials',
    });
  }

  private async checkVersionRegression(
    rule: AnomalyRule,
    event: OperationEvent
  ): Promise<Anomaly | null> {
    if (event.type !== 'publish') return null;

    const isRegression = event.metadata?.isVersionRegression as boolean;
    if (!isRegression) return null;

    return this.createAnomaly(rule, event, {
      description: `Version regression detected: "${event.artifactName}" published version ${event.version} which is older than existing latest`,
      evidence: {
        artifactName: event.artifactName,
        publishedVersion: event.version,
        existingLatest: event.metadata?.existingLatest,
      },
      recommendedAction: 'Verify this is intentional (hotfix backport) or block as potential supply chain attack',
    });
  }

  // ─── Helpers ─────────────────────────────────────────────────────

  private createAnomaly(
    rule: AnomalyRule,
    event: OperationEvent,
    details: { description: string; evidence: Record<string, unknown>; recommendedAction: string }
  ): Anomaly {
    return {
      id: crypto.randomUUID(),
      type: rule.type,
      severity: rule.severity,
      tenantId: event.tenantId,
      artifactId: event.artifactId,
      artifactName: event.artifactName,
      detectedAt: new Date().toISOString(),
      description: details.description,
      evidence: details.evidence,
      recommendedAction: details.recommendedAction,
      autoMitigated: false,
      acknowledged: false,
    };
  }

  private async autoMitigate(
    anomaly: Anomaly,
    action: string
  ): Promise<void> {
    const callback = this.mitigationCallbacks.get(action);
    if (!callback) {
      logger.warn(
        { anomalyId: anomaly.id, action },
        'No mitigation callback registered for action'
      );
      return;
    }

    try {
      await callback(anomaly);
      anomaly.autoMitigated = true;
      anomaly.mitigationAction = action;
      await this.store.saveAnomaly(anomaly);

      logger.info(
        { anomalyId: anomaly.id, action, type: anomaly.type },
        'Anomaly auto-mitigated'
      );
    } catch (err) {
      logger.error(
        { err, anomalyId: anomaly.id, action },
        'Auto-mitigation failed'
      );
    }
  }

  // ─── Default Rules ───────────────────────────────────────────────

  private loadDefaultRules(): void {
    const defaults: AnomalyRule[] = [
      {
        id: 'download-spike-default',
        name: 'Download Spike Detection',
        type: 'download-spike',
        enabled: true,
        threshold: 1000,
        windowMinutes: 5,
        severity: 'medium',
        autoMitigate: false,
        mitigationAction: 'rate-limit',
      },
      {
        id: 'publish-burst-default',
        name: 'Publish Burst Detection',
        type: 'publish-burst',
        enabled: true,
        threshold: 20,
        windowMinutes: 10,
        severity: 'high',
        autoMitigate: false,
        mitigationAction: 'alert-only',
      },
      {
        id: 'dependency-confusion-default',
        name: 'Dependency Confusion Protection',
        type: 'dependency-confusion',
        enabled: true,
        threshold: 1,
        windowMinutes: 1,
        severity: 'critical',
        autoMitigate: true,
        mitigationAction: 'quarantine',
      },
      {
        id: 'size-anomaly-default',
        name: 'Artifact Size Anomaly',
        type: 'size-anomaly',
        enabled: true,
        threshold: 100 * 1024 * 1024, // 100 MB
        windowMinutes: 1,
        severity: 'medium',
        autoMitigate: false,
        mitigationAction: 'alert-only',
      },
      {
        id: 'unusual-publisher-default',
        name: 'Unusual Publisher Detection',
        type: 'unusual-publisher',
        enabled: true,
        threshold: 1,
        windowMinutes: 60 * 24 * 30, // 30 days
        severity: 'low',
        autoMitigate: false,
        mitigationAction: 'alert-only',
      },
      {
        id: 'mass-deletion-default',
        name: 'Mass Deletion Detection',
        type: 'mass-deletion',
        enabled: true,
        threshold: 10,
        windowMinutes: 5,
        severity: 'critical',
        autoMitigate: true,
        mitigationAction: 'block-publisher',
      },
      {
        id: 'version-regression-default',
        name: 'Version Regression Detection',
        type: 'version-regression',
        enabled: true,
        threshold: 1,
        windowMinutes: 1,
        severity: 'high',
        autoMitigate: false,
        mitigationAction: 'alert-only',
      },
    ];

    for (const rule of defaults) {
      this.rules.set(rule.id, rule);
    }

    logger.info({ ruleCount: defaults.length }, 'Default anomaly detection rules loaded');
  }
}