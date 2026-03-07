/**
 * THE ARTIFACTORY — Predictive Cache Warming
 * Analyzes access patterns to pre-warm caches and optimize
 * storage tier placement for minimal latency.
 * Part of the Trancendos Ecosystem.
 *
 * @module intelligence/predictive-cache
 * @version 1.0.0
 */

import { createModuleLogger } from '../utils/logger.js';

const logger = createModuleLogger('predictive-cache');

// ─── Types ───────────────────────────────────────────────────────────

export interface AccessRecord {
  artifactId: string;
  artifactName: string;
  version: string;
  tenantId: string;
  timestamp: string;
  sourceIp?: string;
  userAgent?: string;
  responseTimeMs: number;
  cacheHit: boolean;
}

export interface AccessPattern {
  artifactId: string;
  artifactName: string;
  version: string;
  tenantId: string;
  totalAccesses: number;
  uniqueConsumers: number;
  accessesByHour: number[];       // 24 slots
  accessesByDayOfWeek: number[];  // 7 slots (0=Sun)
  avgResponseTimeMs: number;
  cacheHitRate: number;
  lastAccessed: string;
  firstAccessed: string;
  trend: 'rising' | 'stable' | 'declining' | 'spike' | 'dormant';
  predictedNextAccess: string | null;
}

export interface CacheDecision {
  artifactId: string;
  artifactName: string;
  version: string;
  currentTier: 'hot' | 'warm' | 'cold';
  recommendedTier: 'hot' | 'warm' | 'cold';
  confidence: number;
  reason: string;
  estimatedSavingsBytes?: number;
  estimatedLatencyImpactMs?: number;
}

export interface WarmingPlan {
  id: string;
  generatedAt: string;
  tenantId: string;
  artifacts: Array<{
    artifactId: string;
    artifactName: string;
    version: string;
    priority: number;
    reason: string;
  }>;
  estimatedBandwidthBytes: number;
  estimatedDurationMs: number;
}

// ─── Storage Interface ───────────────────────────────────────────────

export interface AccessStore {
  recordAccess(record: AccessRecord): Promise<void>;
  getAccessRecords(artifactId: string, since: string): Promise<AccessRecord[]>;
  getTopArtifacts(tenantId: string, limit: number, since: string): Promise<Array<{
    artifactId: string;
    artifactName: string;
    version: string;
    accessCount: number;
  }>>;
  getAccessCountByHour(artifactId: string, since: string): Promise<number[]>;
  getAccessCountByDay(artifactId: string, since: string): Promise<number[]>;
  getUniqueConsumers(artifactId: string, since: string): Promise<number>;
  getAvgResponseTime(artifactId: string, since: string): Promise<number>;
  getCacheHitRate(artifactId: string, since: string): Promise<number>;
}

// ─── Predictive Cache Engine ─────────────────────────────────────────

export class PredictiveCacheEngine {
  private readonly store: AccessStore;
  private readonly analysisWindowDays: number;

  constructor(store: AccessStore, analysisWindowDays = 30) {
    this.store = store;
    this.analysisWindowDays = analysisWindowDays;
  }

  /**
   * Record an artifact access event.
   */
  async recordAccess(record: AccessRecord): Promise<void> {
    await this.store.recordAccess(record);
  }

  /**
   * Analyze access patterns for an artifact.
   */
  async analyzePattern(artifactId: string, tenantId: string): Promise<AccessPattern> {
    const since = this.getWindowStart();
    const records = await this.store.getAccessRecords(artifactId, since);

    if (records.length === 0) {
      return this.createDormantPattern(artifactId, tenantId);
    }

    const accessesByHour = await this.store.getAccessCountByHour(artifactId, since);
    const accessesByDay = await this.store.getAccessCountByDay(artifactId, since);
    const uniqueConsumers = await this.store.getUniqueConsumers(artifactId, since);
    const avgResponseTime = await this.store.getAvgResponseTime(artifactId, since);
    const cacheHitRate = await this.store.getCacheHitRate(artifactId, since);

    const sorted = records.sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const trend = this.calculateTrend(sorted);
    const predictedNextAccess = this.predictNextAccess(accessesByHour, accessesByDay);

    return {
      artifactId,
      artifactName: records[0].artifactName,
      version: records[0].version,
      tenantId,
      totalAccesses: records.length,
      uniqueConsumers,
      accessesByHour,
      accessesByDayOfWeek: accessesByDay,
      avgResponseTimeMs: avgResponseTime,
      cacheHitRate,
      lastAccessed: sorted[sorted.length - 1].timestamp,
      firstAccessed: sorted[0].timestamp,
      trend,
      predictedNextAccess,
    };
  }

  /**
   * Generate cache tier recommendations for a tenant.
   */
  async generateRecommendations(tenantId: string): Promise<CacheDecision[]> {
    const since = this.getWindowStart();
    const topArtifacts = await this.store.getTopArtifacts(tenantId, 200, since);
    const decisions: CacheDecision[] = [];

    for (const artifact of topArtifacts) {
      const pattern = await this.analyzePattern(artifact.artifactId, tenantId);
      const decision = this.decideTier(pattern);
      decisions.push(decision);
    }

    // Sort by confidence descending
    decisions.sort((a, b) => b.confidence - a.confidence);

    logger.info(
      {
        tenantId,
        totalRecommendations: decisions.length,
        promotions: decisions.filter(d => this.tierRank(d.recommendedTier) < this.tierRank(d.currentTier)).length,
        demotions: decisions.filter(d => this.tierRank(d.recommendedTier) > this.tierRank(d.currentTier)).length,
      },
      'Cache recommendations generated'
    );

    return decisions;
  }

  /**
   * Generate a cache warming plan for predicted high-demand periods.
   */
  async generateWarmingPlan(tenantId: string): Promise<WarmingPlan> {
    const since = this.getWindowStart();
    const topArtifacts = await this.store.getTopArtifacts(tenantId, 50, since);
    const currentHour = new Date().getUTCHours();
    const nextHour = (currentHour + 1) % 24;

    const warmingCandidates: WarmingPlan['artifacts'] = [];

    for (const artifact of topArtifacts) {
      const hourlyAccess = await this.store.getAccessCountByHour(artifact.artifactId, since);

      // If next hour typically has high access, pre-warm
      const avgHourlyAccess = hourlyAccess.reduce((a, b) => a + b, 0) / 24;
      const nextHourAccess = hourlyAccess[nextHour] ?? 0;

      if (nextHourAccess > avgHourlyAccess * 1.5) {
        warmingCandidates.push({
          artifactId: artifact.artifactId,
          artifactName: artifact.artifactName,
          version: artifact.version,
          priority: nextHourAccess / avgHourlyAccess,
          reason: `Predicted ${nextHourAccess} accesses in next hour (avg: ${Math.round(avgHourlyAccess)})`,
        });
      }
    }

    // Sort by priority descending
    warmingCandidates.sort((a, b) => b.priority - a.priority);

    const plan: WarmingPlan = {
      id: crypto.randomUUID(),
      generatedAt: new Date().toISOString(),
      tenantId,
      artifacts: warmingCandidates.slice(0, 20), // Top 20
      estimatedBandwidthBytes: 0, // Would be calculated from actual artifact sizes
      estimatedDurationMs: warmingCandidates.length * 500, // Rough estimate
    };

    logger.info(
      { tenantId, candidateCount: warmingCandidates.length, planSize: plan.artifacts.length },
      'Cache warming plan generated'
    );

    return plan;
  }

  // ─── Private Methods ─────────────────────────────────────────────

  private decideTier(pattern: AccessPattern): CacheDecision {
    const { artifactId, artifactName, version, trend, totalAccesses, cacheHitRate } = pattern;

    // Determine current tier based on cache hit rate
    let currentTier: 'hot' | 'warm' | 'cold';
    if (cacheHitRate > 0.8) currentTier = 'hot';
    else if (cacheHitRate > 0.3) currentTier = 'warm';
    else currentTier = 'cold';

    let recommendedTier: 'hot' | 'warm' | 'cold';
    let confidence: number;
    let reason: string;

    if (trend === 'dormant' || totalAccesses < 5) {
      recommendedTier = 'cold';
      confidence = 0.9;
      reason = 'Artifact is dormant with minimal access';
    } else if (trend === 'rising' || trend === 'spike') {
      recommendedTier = 'hot';
      confidence = trend === 'spike' ? 0.95 : 0.8;
      reason = `Access trend is ${trend} — promote to hot tier for optimal latency`;
    } else if (trend === 'declining' && totalAccesses < 20) {
      recommendedTier = 'warm';
      confidence = 0.7;
      reason = 'Declining access pattern — demote to warm tier';
    } else if (totalAccesses > 100) {
      recommendedTier = 'hot';
      confidence = 0.85;
      reason = `High access volume (${totalAccesses}) warrants hot tier placement`;
    } else {
      recommendedTier = 'warm';
      confidence = 0.6;
      reason = 'Moderate access pattern — warm tier is appropriate';
    }

    return {
      artifactId,
      artifactName,
      version,
      currentTier,
      recommendedTier,
      confidence,
      reason,
    };
  }

  private calculateTrend(
    records: AccessRecord[]
  ): 'rising' | 'stable' | 'declining' | 'spike' | 'dormant' {
    if (records.length < 3) return 'dormant';

    const now = Date.now();
    const dayMs = 86_400_000;

    // Split into recent (last 7 days) and older
    const recent = records.filter(r => now - new Date(r.timestamp).getTime() < 7 * dayMs);
    const older = records.filter(r => now - new Date(r.timestamp).getTime() >= 7 * dayMs);

    if (older.length === 0) {
      return recent.length > 20 ? 'spike' : 'rising';
    }

    const recentRate = recent.length / 7;
    const olderDays = Math.max(1, (this.analysisWindowDays - 7));
    const olderRate = older.length / olderDays;

    if (recentRate > olderRate * 3) return 'spike';
    if (recentRate > olderRate * 1.3) return 'rising';
    if (recentRate < olderRate * 0.5) return 'declining';
    return 'stable';
  }

  private predictNextAccess(
    hourlyAccess: number[],
    _dailyAccess: number[]
  ): string | null {
    if (hourlyAccess.every(h => h === 0)) return null;

    // Find the next peak hour
    const currentHour = new Date().getUTCHours();
    let maxAccess = 0;
    let peakHour = currentHour;

    for (let i = 1; i <= 24; i++) {
      const hour = (currentHour + i) % 24;
      if (hourlyAccess[hour] > maxAccess) {
        maxAccess = hourlyAccess[hour];
        peakHour = hour;
      }
    }

    const nextPeak = new Date();
    nextPeak.setUTCHours(peakHour, 0, 0, 0);
    if (nextPeak.getTime() <= Date.now()) {
      nextPeak.setDate(nextPeak.getDate() + 1);
    }

    return nextPeak.toISOString();
  }

  private createDormantPattern(artifactId: string, tenantId: string): AccessPattern {
    return {
      artifactId,
      artifactName: '',
      version: '',
      tenantId,
      totalAccesses: 0,
      uniqueConsumers: 0,
      accessesByHour: new Array(24).fill(0),
      accessesByDayOfWeek: new Array(7).fill(0),
      avgResponseTimeMs: 0,
      cacheHitRate: 0,
      lastAccessed: '',
      firstAccessed: '',
      trend: 'dormant',
      predictedNextAccess: null,
    };
  }

  private tierRank(tier: 'hot' | 'warm' | 'cold'): number {
    return { hot: 0, warm: 1, cold: 2 }[tier];
  }

  private getWindowStart(): string {
    const d = new Date();
    d.setDate(d.getDate() - this.analysisWindowDays);
    return d.toISOString();
  }
}