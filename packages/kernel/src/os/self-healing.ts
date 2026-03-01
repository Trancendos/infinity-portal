/**
 * Predictive Scaling & Self-Healing System
 * 
 * Provides intelligent auto-scaling based on pattern recognition,
 * automatic service recovery, anomaly detection, and failover
 * management for the Infinity OS platform.
 * 
 * Architecture:
 * ```
 * SelfHealingSystem
 *   ├── PredictiveScaler (pattern analysis, forecasting)
 *   ├── ServiceRecovery (restart, rollback, failover)
 *   ├── AnomalyDetector (statistical analysis, alerting)
 *   └── FailoverManager (primary/secondary, health-based switching)
 * ```
 */

// ============================================================
// TYPES
// ============================================================

export type ScalingAction = 'scale_up' | 'scale_down' | 'no_change';
export type RecoveryAction = 'restart' | 'rollback' | 'failover' | 'isolate' | 'notify';
export type AnomalyType = 'spike' | 'drop' | 'trend' | 'pattern_break' | 'threshold_breach';
export type FailoverMode = 'active-passive' | 'active-active' | 'hot-standby';
export type HealthTrend = 'improving' | 'stable' | 'degrading' | 'critical';

export interface MetricDataPoint {
  timestamp: number;
  value: number;
  label?: string;
}

export interface ScalingDecision {
  action: ScalingAction;
  serviceName: string;
  currentInstances: number;
  targetInstances: number;
  reason: string;
  confidence: number;
  predictedLoad: number;
  timestamp: number;
}

export interface ScalingPolicy {
  serviceName: string;
  minInstances: number;
  maxInstances: number;
  targetCpuUtilization: number;
  targetMemoryUtilization: number;
  targetResponseTime: number;
  scaleUpCooldownMs: number;
  scaleDownCooldownMs: number;
  scaleUpThreshold: number;
  scaleDownThreshold: number;
  predictiveEnabled: boolean;
  schedulePatterns: SchedulePattern[];
}

export interface SchedulePattern {
  name: string;
  dayOfWeek: number[];
  hourStart: number;
  hourEnd: number;
  targetInstances: number;
}

export interface RecoveryPlan {
  serviceName: string;
  actions: RecoveryStep[];
  maxAttempts: number;
  escalationPolicy: EscalationPolicy;
}

export interface RecoveryStep {
  order: number;
  action: RecoveryAction;
  description: string;
  timeoutMs: number;
  retryCount: number;
  conditions: RecoveryCondition[];
}

export interface RecoveryCondition {
  metric: string;
  operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
  value: number;
}

export interface EscalationPolicy {
  levels: EscalationLevel[];
}

export interface EscalationLevel {
  level: number;
  afterMinutes: number;
  actions: RecoveryAction[];
  notifyChannels: string[];
}

export interface Anomaly {
  id: string;
  type: AnomalyType;
  serviceName: string;
  metric: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  currentValue: number;
  expectedValue: number;
  deviation: number;
  detectedAt: number;
  resolvedAt?: number;
  acknowledged: boolean;
  description: string;
}

export interface FailoverConfig {
  serviceName: string;
  mode: FailoverMode;
  primaryInstance: string;
  secondaryInstances: string[];
  healthCheckIntervalMs: number;
  failoverThreshold: number;
  failbackEnabled: boolean;
  failbackDelayMs: number;
}

export interface FailoverState {
  serviceName: string;
  activeInstance: string;
  failoverCount: number;
  lastFailoverAt: number;
  lastFailbackAt: number;
  status: 'normal' | 'failover' | 'failback' | 'degraded';
}

export interface SelfHealingEvent {
  type: 'scaling:decision' | 'scaling:executed' | 'recovery:started' |
    'recovery:completed' | 'recovery:failed' | 'anomaly:detected' |
    'anomaly:resolved' | 'failover:triggered' | 'failover:completed' |
    'failback:triggered' | 'failback:completed' | 'health:trend_change';
  serviceName: string;
  payload: Record<string, unknown>;
  timestamp: number;
}

// ============================================================
// PREDICTIVE SCALER
// ============================================================

export class PredictiveScaler {
  private metrics: Map<string, MetricDataPoint[]> = new Map();
  private policies: Map<string, ScalingPolicy> = new Map();
  private decisions: ScalingDecision[] = [];
  private lastScaleAction: Map<string, { action: ScalingAction; timestamp: number }> = new Map();
  private currentInstances: Map<string, number> = new Map();

  /**
   * Set scaling policy for a service
   */
  setPolicy(policy: ScalingPolicy): void {
    this.policies.set(policy.serviceName, policy);
    if (!this.currentInstances.has(policy.serviceName)) {
      this.currentInstances.set(policy.serviceName, policy.minInstances);
    }
    console.log(`[PredictiveScaler] Policy set for ${policy.serviceName}: ${policy.minInstances}-${policy.maxInstances} instances`);
  }

  /**
   * Record a metric data point
   */
  recordMetric(serviceName: string, metric: string, value: number): void {
    const key = `${serviceName}:${metric}`;
    if (!this.metrics.has(key)) {
      this.metrics.set(key, []);
    }

    const points = this.metrics.get(key)!;
    points.push({ timestamp: Date.now(), value });

    // Keep last 24 hours of data (at 1-minute intervals = 1440 points)
    if (points.length > 1440) {
      this.metrics.set(key, points.slice(-1440));
    }
  }

  /**
   * Evaluate scaling decision for a service
   */
  evaluate(serviceName: string): ScalingDecision {
    const policy = this.policies.get(serviceName);
    if (!policy) {
      return this.createDecision(serviceName, 'no_change', 0, 0, 'No scaling policy configured', 0, 0);
    }

    const currentCount = this.currentInstances.get(serviceName) || policy.minInstances;

    // Get current metrics
    const cpuMetrics = this.getRecentMetrics(serviceName, 'cpu', 5);
    const memoryMetrics = this.getRecentMetrics(serviceName, 'memory', 5);
    const responseTimeMetrics = this.getRecentMetrics(serviceName, 'response_time', 5);

    const avgCpu = this.average(cpuMetrics);
    const avgMemory = this.average(memoryMetrics);
    const avgResponseTime = this.average(responseTimeMetrics);

    // Check cooldown
    const lastAction = this.lastScaleAction.get(serviceName);
    if (lastAction) {
      const cooldown = lastAction.action === 'scale_up' ? policy.scaleUpCooldownMs : policy.scaleDownCooldownMs;
      if (Date.now() - lastAction.timestamp < cooldown) {
        return this.createDecision(serviceName, 'no_change', currentCount, currentCount, 'In cooldown period', 0.5, avgCpu);
      }
    }

    // Check schedule patterns
    const scheduledTarget = this.getScheduledTarget(policy);
    if (scheduledTarget !== null && scheduledTarget !== currentCount) {
      const action = scheduledTarget > currentCount ? 'scale_up' : 'scale_down';
      return this.createDecision(serviceName, action, currentCount, scheduledTarget, 'Schedule-based scaling', 0.9, avgCpu);
    }

    // Predictive scaling
    if (policy.predictiveEnabled) {
      const predictedLoad = this.predictLoad(serviceName);
      if (predictedLoad > policy.scaleUpThreshold && currentCount < policy.maxInstances) {
        const target = Math.min(currentCount + 1, policy.maxInstances);
        return this.createDecision(serviceName, 'scale_up', currentCount, target, `Predicted load: ${predictedLoad.toFixed(1)}%`, 0.7, predictedLoad);
      }
    }

    // Reactive scaling
    if (avgCpu > policy.scaleUpThreshold || avgMemory > policy.targetMemoryUtilization || avgResponseTime > policy.targetResponseTime) {
      if (currentCount < policy.maxInstances) {
        const target = Math.min(currentCount + 1, policy.maxInstances);
        const reason = avgCpu > policy.scaleUpThreshold ? `CPU: ${avgCpu.toFixed(1)}%` :
          avgMemory > policy.targetMemoryUtilization ? `Memory: ${avgMemory.toFixed(1)}%` :
            `Response time: ${avgResponseTime.toFixed(0)}ms`;
        return this.createDecision(serviceName, 'scale_up', currentCount, target, reason, 0.85, avgCpu);
      }
    }

    if (avgCpu < policy.scaleDownThreshold && avgMemory < policy.scaleDownThreshold && currentCount > policy.minInstances) {
      const target = Math.max(currentCount - 1, policy.minInstances);
      return this.createDecision(serviceName, 'scale_down', currentCount, target, `Low utilization: CPU ${avgCpu.toFixed(1)}%`, 0.8, avgCpu);
    }

    return this.createDecision(serviceName, 'no_change', currentCount, currentCount, 'Within target range', 0.9, avgCpu);
  }

  /**
   * Execute a scaling decision
   */
  execute(decision: ScalingDecision): void {
    if (decision.action === 'no_change') return;

    this.currentInstances.set(decision.serviceName, decision.targetInstances);
    this.lastScaleAction.set(decision.serviceName, { action: decision.action, timestamp: Date.now() });
    this.decisions.push(decision);

    console.log(`[PredictiveScaler] ${decision.action}: ${decision.serviceName} ${decision.currentInstances} → ${decision.targetInstances} (${decision.reason})`);
  }

  /**
   * Get scaling history
   */
  getHistory(serviceName?: string, limit: number = 50): ScalingDecision[] {
    let history = [...this.decisions];
    if (serviceName) {
      history = history.filter(d => d.serviceName === serviceName);
    }
    return history.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
  }

  /**
   * Get current instance count
   */
  getInstanceCount(serviceName: string): number {
    return this.currentInstances.get(serviceName) || 0;
  }

  // Private helpers

  private predictLoad(serviceName: string): number {
    const cpuMetrics = this.getRecentMetrics(serviceName, 'cpu', 30);
    if (cpuMetrics.length < 10) return this.average(cpuMetrics);

    // Simple linear regression for prediction
    const n = cpuMetrics.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += cpuMetrics[i];
      sumXY += i * cpuMetrics[i];
      sumX2 += i * i;
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Predict 5 minutes ahead
    const predicted = intercept + slope * (n + 5);
    return Math.max(0, Math.min(100, predicted));
  }

  private getScheduledTarget(policy: ScalingPolicy): number | null {
    if (policy.schedulePatterns.length === 0) return null;

    const now = new Date();
    const dayOfWeek = now.getDay();
    const hour = now.getHours();

    for (const pattern of policy.schedulePatterns) {
      if (pattern.dayOfWeek.includes(dayOfWeek) && hour >= pattern.hourStart && hour < pattern.hourEnd) {
        return pattern.targetInstances;
      }
    }

    return null;
  }

  private getRecentMetrics(serviceName: string, metric: string, minutes: number): number[] {
    const key = `${serviceName}:${metric}`;
    const points = this.metrics.get(key) || [];
    const cutoff = Date.now() - (minutes * 60 * 1000);
    return points.filter(p => p.timestamp >= cutoff).map(p => p.value);
  }

  private average(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }

  private createDecision(
    serviceName: string, action: ScalingAction, current: number,
    target: number, reason: string, confidence: number, predictedLoad: number
  ): ScalingDecision {
    return { action, serviceName, currentInstances: current, targetInstances: target, reason, confidence, predictedLoad, timestamp: Date.now() };
  }
}

// ============================================================
// ANOMALY DETECTOR
// ============================================================

export class AnomalyDetector {
  private anomalies: Map<string, Anomaly> = new Map();
  private metricHistory: Map<string, number[]> = new Map();
  private thresholds: Map<string, { warning: number; critical: number }> = new Map();

  /**
   * Set threshold for a metric
   */
  setThreshold(serviceName: string, metric: string, warning: number, critical: number): void {
    this.thresholds.set(`${serviceName}:${metric}`, { warning, critical });
  }

  /**
   * Analyze a metric value for anomalies
   */
  analyze(serviceName: string, metric: string, value: number): Anomaly | null {
    const key = `${serviceName}:${metric}`;

    // Record history
    if (!this.metricHistory.has(key)) {
      this.metricHistory.set(key, []);
    }
    const history = this.metricHistory.get(key)!;
    history.push(value);
    if (history.length > 100) {
      this.metricHistory.set(key, history.slice(-100));
    }

    // Need at least 10 data points for analysis
    if (history.length < 10) return null;

    // Calculate statistics
    const mean = history.reduce((s, v) => s + v, 0) / history.length;
    const variance = history.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / history.length;
    const stdDev = Math.sqrt(variance);
    const zScore = stdDev > 0 ? (value - mean) / stdDev : 0;

    // Check for anomalies
    let anomaly: Anomaly | null = null;

    // Z-score based detection (> 3 standard deviations)
    if (Math.abs(zScore) > 3) {
      anomaly = this.createAnomaly(
        zScore > 0 ? 'spike' : 'drop',
        serviceName, metric,
        Math.abs(zScore) > 4 ? 'critical' : 'high',
        value, mean, Math.abs(zScore),
        `${metric} is ${zScore > 0 ? 'above' : 'below'} normal: ${value.toFixed(2)} (expected ~${mean.toFixed(2)}, ${Math.abs(zScore).toFixed(1)}σ)`
      );
    }

    // Threshold-based detection
    const threshold = this.thresholds.get(key);
    if (threshold) {
      if (value >= threshold.critical && !anomaly) {
        anomaly = this.createAnomaly(
          'threshold_breach', serviceName, metric, 'critical',
          value, threshold.critical, value / threshold.critical,
          `${metric} breached critical threshold: ${value.toFixed(2)} >= ${threshold.critical}`
        );
      } else if (value >= threshold.warning && !anomaly) {
        anomaly = this.createAnomaly(
          'threshold_breach', serviceName, metric, 'medium',
          value, threshold.warning, value / threshold.warning,
          `${metric} breached warning threshold: ${value.toFixed(2)} >= ${threshold.warning}`
        );
      }
    }

    // Trend detection (last 10 values consistently increasing/decreasing)
    if (!anomaly && history.length >= 10) {
      const recent = history.slice(-10);
      const increasing = recent.every((v, i) => i === 0 || v >= recent[i - 1]);
      const decreasing = recent.every((v, i) => i === 0 || v <= recent[i - 1]);

      if (increasing && value > mean * 1.5) {
        anomaly = this.createAnomaly(
          'trend', serviceName, metric, 'medium',
          value, mean, (value - mean) / mean,
          `${metric} showing sustained upward trend: ${value.toFixed(2)} (mean: ${mean.toFixed(2)})`
        );
      } else if (decreasing && value < mean * 0.5) {
        anomaly = this.createAnomaly(
          'trend', serviceName, metric, 'medium',
          value, mean, (mean - value) / mean,
          `${metric} showing sustained downward trend: ${value.toFixed(2)} (mean: ${mean.toFixed(2)})`
        );
      }
    }

    if (anomaly) {
      this.anomalies.set(anomaly.id, anomaly);
    }

    return anomaly;
  }

  /**
   * Get active anomalies
   */
  getActiveAnomalies(serviceName?: string): Anomaly[] {
    let anomalies = Array.from(this.anomalies.values()).filter(a => !a.resolvedAt);
    if (serviceName) {
      anomalies = anomalies.filter(a => a.serviceName === serviceName);
    }
    return anomalies.sort((a, b) => b.detectedAt - a.detectedAt);
  }

  /**
   * Acknowledge an anomaly
   */
  acknowledge(anomalyId: string): boolean {
    const anomaly = this.anomalies.get(anomalyId);
    if (!anomaly) return false;
    anomaly.acknowledged = true;
    return true;
  }

  /**
   * Resolve an anomaly
   */
  resolve(anomalyId: string): boolean {
    const anomaly = this.anomalies.get(anomalyId);
    if (!anomaly) return false;
    anomaly.resolvedAt = Date.now();
    return true;
  }

  /**
   * Get health trend for a service
   */
  getHealthTrend(serviceName: string): HealthTrend {
    const active = this.getActiveAnomalies(serviceName);
    const critical = active.filter(a => a.severity === 'critical');
    const high = active.filter(a => a.severity === 'high');

    if (critical.length > 0) return 'critical';
    if (high.length > 0) return 'degrading';
    if (active.length > 0) return 'degrading';
    return 'stable';
  }

  private createAnomaly(
    type: AnomalyType, serviceName: string, metric: string,
    severity: Anomaly['severity'], currentValue: number,
    expectedValue: number, deviation: number, description: string
  ): Anomaly {
    return {
      id: `anomaly_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type, serviceName, metric, severity,
      currentValue, expectedValue, deviation,
      detectedAt: Date.now(),
      acknowledged: false,
      description,
    };
  }
}

// ============================================================
// FAILOVER MANAGER
// ============================================================

export class FailoverManager {
  private configs: Map<string, FailoverConfig> = new Map();
  private states: Map<string, FailoverState> = new Map();
  private healthScores: Map<string, number> = new Map();

  /**
   * Configure failover for a service
   */
  configure(config: FailoverConfig): void {
    this.configs.set(config.serviceName, config);
    this.states.set(config.serviceName, {
      serviceName: config.serviceName,
      activeInstance: config.primaryInstance,
      failoverCount: 0,
      lastFailoverAt: 0,
      lastFailbackAt: 0,
      status: 'normal',
    });
    console.log(`[FailoverManager] Configured ${config.mode} failover for ${config.serviceName}`);
  }

  /**
   * Update health score for an instance
   */
  updateHealth(instanceId: string, score: number): void {
    this.healthScores.set(instanceId, Math.max(0, Math.min(100, score)));
  }

  /**
   * Check and execute failover if needed
   */
  checkFailover(serviceName: string): FailoverState | null {
    const config = this.configs.get(serviceName);
    const state = this.states.get(serviceName);
    if (!config || !state) return null;

    const activeHealth = this.healthScores.get(state.activeInstance) ?? 100;

    // Check if failover is needed
    if (activeHealth < config.failoverThreshold && state.status === 'normal') {
      // Find best secondary
      let bestSecondary: string | null = null;
      let bestHealth = 0;

      for (const secondary of config.secondaryInstances) {
        const health = this.healthScores.get(secondary) ?? 0;
        if (health > bestHealth) {
          bestHealth = health;
          bestSecondary = secondary;
        }
      }

      if (bestSecondary && bestHealth > config.failoverThreshold) {
        state.activeInstance = bestSecondary;
        state.status = 'failover';
        state.failoverCount++;
        state.lastFailoverAt = Date.now();
        console.log(`[FailoverManager] Failover: ${serviceName} → ${bestSecondary} (health: ${activeHealth} → ${bestHealth})`);
      } else {
        state.status = 'degraded';
        console.warn(`[FailoverManager] No healthy secondary for ${serviceName}`);
      }
    }

    // Check if failback is possible
    if (config.failbackEnabled && state.status === 'failover') {
      const primaryHealth = this.healthScores.get(config.primaryInstance) ?? 0;
      const timeSinceFailover = Date.now() - state.lastFailoverAt;

      if (primaryHealth > config.failoverThreshold + 10 && timeSinceFailover > config.failbackDelayMs) {
        state.activeInstance = config.primaryInstance;
        state.status = 'normal';
        state.lastFailbackAt = Date.now();
        console.log(`[FailoverManager] Failback: ${serviceName} → ${config.primaryInstance}`);
      }
    }

    this.states.set(serviceName, state);
    return state;
  }

  /**
   * Get failover state
   */
  getState(serviceName: string): FailoverState | undefined {
    return this.states.get(serviceName);
  }

  /**
   * Get all failover states
   */
  getAllStates(): FailoverState[] {
    return Array.from(this.states.values());
  }

  /**
   * Force failover
   */
  forceFailover(serviceName: string, targetInstance: string): boolean {
    const config = this.configs.get(serviceName);
    const state = this.states.get(serviceName);
    if (!config || !state) return false;

    if (!config.secondaryInstances.includes(targetInstance) && targetInstance !== config.primaryInstance) {
      return false;
    }

    state.activeInstance = targetInstance;
    state.status = targetInstance === config.primaryInstance ? 'normal' : 'failover';
    state.failoverCount++;
    state.lastFailoverAt = Date.now();
    this.states.set(serviceName, state);
    return true;
  }
}

// ============================================================
// SELF-HEALING SYSTEM (UNIFIED)
// ============================================================

export class SelfHealingSystem {
  readonly scaler: PredictiveScaler;
  readonly anomalyDetector: AnomalyDetector;
  readonly failover: FailoverManager;

  private recoveryPlans: Map<string, RecoveryPlan> = new Map();
  private recoveryHistory: { serviceName: string; action: RecoveryAction; success: boolean; timestamp: number }[] = [];
  private listeners: Map<string, Set<(event: SelfHealingEvent) => void>> = new Map();

  constructor() {
    this.scaler = new PredictiveScaler();
    this.anomalyDetector = new AnomalyDetector();
    this.failover = new FailoverManager();
    console.log('[SelfHealing] System initialized');
  }

  /**
   * Set recovery plan for a service
   */
  setRecoveryPlan(plan: RecoveryPlan): void {
    this.recoveryPlans.set(plan.serviceName, plan);
  }

  /**
   * Process metrics and trigger healing actions
   */
  processMetrics(serviceName: string, metrics: Record<string, number>): {
    scalingDecision: ScalingDecision;
    anomalies: Anomaly[];
    failoverState: FailoverState | null;
    recoveryTriggered: boolean;
  } {
    // Record metrics
    for (const [metric, value] of Object.entries(metrics)) {
      this.scaler.recordMetric(serviceName, metric, value);
    }

    // Evaluate scaling
    const scalingDecision = this.scaler.evaluate(serviceName);
    if (scalingDecision.action !== 'no_change') {
      this.scaler.execute(scalingDecision);
      this.emit({
        type: 'scaling:executed',
        serviceName,
        payload: { action: scalingDecision.action, from: scalingDecision.currentInstances, to: scalingDecision.targetInstances },
        timestamp: Date.now(),
      });
    }

    // Detect anomalies
    const anomalies: Anomaly[] = [];
    for (const [metric, value] of Object.entries(metrics)) {
      const anomaly = this.anomalyDetector.analyze(serviceName, metric, value);
      if (anomaly) {
        anomalies.push(anomaly);
        this.emit({
          type: 'anomaly:detected',
          serviceName,
          payload: { anomalyId: anomaly.id, type: anomaly.type, severity: anomaly.severity, metric },
          timestamp: Date.now(),
        });
      }
    }

    // Check failover
    const failoverState = this.failover.checkFailover(serviceName);
    if (failoverState && (failoverState.status === 'failover' || failoverState.status === 'degraded')) {
      this.emit({
        type: 'failover:triggered',
        serviceName,
        payload: { activeInstance: failoverState.activeInstance, status: failoverState.status },
        timestamp: Date.now(),
      });
    }

    // Trigger recovery if critical anomalies detected
    let recoveryTriggered = false;
    const criticalAnomalies = anomalies.filter(a => a.severity === 'critical');
    if (criticalAnomalies.length > 0) {
      recoveryTriggered = this.triggerRecovery(serviceName, criticalAnomalies);
    }

    return { scalingDecision, anomalies, failoverState, recoveryTriggered };
  }

  /**
   * Trigger recovery for a service
   */
  private triggerRecovery(serviceName: string, anomalies: Anomaly[]): boolean {
    const plan = this.recoveryPlans.get(serviceName);
    if (!plan) return false;

    this.emit({
      type: 'recovery:started',
      serviceName,
      payload: { anomalyCount: anomalies.length, plan: plan.actions.map(a => a.action) },
      timestamp: Date.now(),
    });

    // Execute recovery steps in order
    for (const step of plan.actions.sort((a, b) => a.order - b.order)) {
      const conditionsMet = step.conditions.every(c => {
        const anomaly = anomalies.find(a => a.metric === c.metric);
        if (!anomaly) return false;
        switch (c.operator) {
          case 'gt': return anomaly.currentValue > c.value;
          case 'lt': return anomaly.currentValue < c.value;
          case 'gte': return anomaly.currentValue >= c.value;
          case 'lte': return anomaly.currentValue <= c.value;
          case 'eq': return anomaly.currentValue === c.value;
          default: return false;
        }
      });

      if (conditionsMet || step.conditions.length === 0) {
        console.log(`[SelfHealing] Executing recovery: ${step.action} for ${serviceName}`);
        this.recoveryHistory.push({
          serviceName,
          action: step.action,
          success: true,
          timestamp: Date.now(),
        });
      }
    }

    this.emit({
      type: 'recovery:completed',
      serviceName,
      payload: { stepsExecuted: plan.actions.length },
      timestamp: Date.now(),
    });

    return true;
  }

  /**
   * Get system health overview
   */
  getHealthOverview(): {
    services: { name: string; trend: HealthTrend; instances: number; anomalies: number }[];
    totalAnomalies: number;
    failoverCount: number;
    recoveryCount: number;
  } {
    const serviceNames = new Set<string>();
    for (const anomaly of this.anomalyDetector.getActiveAnomalies()) {
      serviceNames.add(anomaly.serviceName);
    }
    for (const state of this.failover.getAllStates()) {
      serviceNames.add(state.serviceName);
    }

    const services = Array.from(serviceNames).map(name => ({
      name,
      trend: this.anomalyDetector.getHealthTrend(name),
      instances: this.scaler.getInstanceCount(name),
      anomalies: this.anomalyDetector.getActiveAnomalies(name).length,
    }));

    return {
      services,
      totalAnomalies: this.anomalyDetector.getActiveAnomalies().length,
      failoverCount: this.failover.getAllStates().filter(s => s.status === 'failover').length,
      recoveryCount: this.recoveryHistory.length,
    };
  }

  /**
   * Get recovery history
   */
  getRecoveryHistory(serviceName?: string, limit: number = 50): typeof this.recoveryHistory {
    let history = [...this.recoveryHistory];
    if (serviceName) {
      history = history.filter(h => h.serviceName === serviceName);
    }
    return history.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
  }

  // Event system
  on(type: string, handler: (event: SelfHealingEvent) => void): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(handler);
    return () => this.listeners.get(type)?.delete(handler);
  }

  private emit(event: SelfHealingEvent): void {
    this.listeners.get(event.type)?.forEach(h => h(event));
    this.listeners.get('*')?.forEach(h => h(event));
  }
}