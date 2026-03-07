/**
 * Storage Lifecycle Manager
 * 
 * Manages artifact lifecycle across storage tiers:
 *   Hot (R2 Standard) → Warm (R2 IA) → Cold (the-ice-box)
 * 
 * Runs as a background process evaluating artifacts against
 * retention policies and access patterns.
 */

import { createModuleLogger } from '../utils/logger.js';
import { getConfig } from '../config/environment.js';
import type { StorageBackend } from './backend.js';
import type { StorageTier } from '../registry/schemas.js';

const log = createModuleLogger('storage:lifecycle');

export interface LifecyclePolicy {
  name: string;
  hotRetentionDays: number;
  warmRetentionDays: number;
  coldArchiveAfterDays: number;
  minVersionsToKeep: number;
  deleteAfterDays: number | null;
}

export interface LifecycleAction {
  artifactId: string;
  currentTier: StorageTier;
  targetTier: StorageTier | 'delete';
  reason: string;
  scheduledAt: Date;
}

const DEFAULT_POLICY: LifecyclePolicy = {
  name: 'default',
  hotRetentionDays: 90,
  warmRetentionDays: 365,
  coldArchiveAfterDays: 730,
  minVersionsToKeep: 5,
  deleteAfterDays: null,
};

export class LifecycleManager {
  private storage: StorageBackend;
  private policies: Map<string, LifecyclePolicy> = new Map();
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(storage: StorageBackend) {
    this.storage = storage;
    this.policies.set('default', DEFAULT_POLICY);
    log.info('Lifecycle manager initialised');
  }

  /**
   * Register a lifecycle policy for a repository or tenant.
   */
  registerPolicy(key: string, policy: LifecyclePolicy): void {
    this.policies.set(key, policy);
    log.info({ key, policy: policy.name }, 'Lifecycle policy registered');
  }

  /**
   * Evaluate an artifact against its applicable policy.
   * Returns the recommended action, if any.
   */
  evaluateArtifact(artifact: {
    id: string;
    storageTier: StorageTier;
    lastAccessedAt: string | null;
    createdAt: string;
    repository: string;
    tenant: string;
    accessCount: number;
  }): LifecycleAction | null {
    const policyKey = `${artifact.tenant}:${artifact.repository}`;
    const policy = this.policies.get(policyKey) || this.policies.get(artifact.tenant) || DEFAULT_POLICY;

    const now = new Date();
    const lastAccessed = artifact.lastAccessedAt ? new Date(artifact.lastAccessedAt) : new Date(artifact.createdAt);
    const daysSinceAccess = Math.floor((now.getTime() - lastAccessed.getTime()) / (1000 * 60 * 60 * 24));
    const daysSinceCreation = Math.floor((now.getTime() - new Date(artifact.createdAt).getTime()) / (1000 * 60 * 60 * 24));

    // Delete check (if policy allows deletion)
    if (policy.deleteAfterDays !== null && daysSinceCreation > policy.deleteAfterDays) {
      return {
        artifactId: artifact.id,
        currentTier: artifact.storageTier,
        targetTier: 'delete',
        reason: `Exceeded max retention of ${policy.deleteAfterDays} days (created ${daysSinceCreation} days ago)`,
        scheduledAt: now,
      };
    }

    // Cold archive check
    if (artifact.storageTier !== 'cold' && daysSinceAccess > policy.coldArchiveAfterDays) {
      return {
        artifactId: artifact.id,
        currentTier: artifact.storageTier,
        targetTier: 'cold',
        reason: `Not accessed for ${daysSinceAccess} days (threshold: ${policy.coldArchiveAfterDays})`,
        scheduledAt: now,
      };
    }

    // Warm tier check
    if (artifact.storageTier === 'hot' && daysSinceAccess > policy.hotRetentionDays) {
      return {
        artifactId: artifact.id,
        currentTier: artifact.storageTier,
        targetTier: 'warm',
        reason: `Not accessed for ${daysSinceAccess} days (hot threshold: ${policy.hotRetentionDays})`,
        scheduledAt: now,
      };
    }

    // Promote back to hot if warm artifact is being accessed frequently
    if (artifact.storageTier === 'warm' && daysSinceAccess < 7 && artifact.accessCount > 10) {
      return {
        artifactId: artifact.id,
        currentTier: artifact.storageTier,
        targetTier: 'hot',
        reason: `Warm artifact accessed ${artifact.accessCount} times in last 7 days — promoting to hot`,
        scheduledAt: now,
      };
    }

    return null;
  }

  /**
   * Start the lifecycle evaluation loop.
   * Runs every hour by default.
   */
  start(intervalMs: number = 3600000): void {
    if (this.running) {
      log.warn('Lifecycle manager already running');
      return;
    }

    this.running = true;
    log.info({ intervalMs }, 'Lifecycle manager started');

    this.intervalHandle = setInterval(() => {
      this.runCycle().catch(err => {
        log.error({ error: err }, 'Lifecycle cycle failed');
      });
    }, intervalMs);
  }

  /**
   * Stop the lifecycle evaluation loop.
   */
  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    this.running = false;
    log.info('Lifecycle manager stopped');
  }

  /**
   * Run a single lifecycle evaluation cycle.
   * In production, this queries the database for all artifacts
   * and evaluates each against its policy.
   */
  async runCycle(): Promise<LifecycleAction[]> {
    const startTime = Date.now();
    log.info('Starting lifecycle evaluation cycle');

    // In production, this would query PostgreSQL for artifacts
    // and evaluate each one. For now, return empty — the evaluation
    // logic is in evaluateArtifact() and is fully testable.
    const actions: LifecycleAction[] = [];

    const duration = Date.now() - startTime;
    log.info({ duration, actionsGenerated: actions.length }, 'Lifecycle cycle complete');

    return actions;
  }

  /**
   * Get the applicable policy for a repository.
   */
  getPolicy(tenant: string, repository: string): LifecyclePolicy {
    return this.policies.get(`${tenant}:${repository}`)
      || this.policies.get(tenant)
      || DEFAULT_POLICY;
  }
}