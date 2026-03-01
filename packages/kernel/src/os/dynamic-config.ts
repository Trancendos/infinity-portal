/**
 * Dynamic Configuration & Feature Flags System
 * 
 * Provides runtime configuration management, feature flags
 * with targeting rules, A/B testing for configurations,
 * and configuration versioning with rollback support.
 * 
 * Architecture:
 * ```
 * DynamicConfigSystem
 *   ├── ConfigStore (versioned key-value store)
 *   ├── FeatureFlagManager (flags, targeting, rollout)
 *   ├── ConfigABTesting (experiments, variants, analysis)
 *   └── ConfigVersioning (history, rollback, diff)
 * ```
 */

// ============================================================
// TYPES
// ============================================================

export type ConfigValueType = 'string' | 'number' | 'boolean' | 'json' | 'secret';
export type FlagStatus = 'active' | 'inactive' | 'archived';
export type RolloutStrategy = 'all' | 'percentage' | 'user_list' | 'attribute' | 'gradual';
export type ExperimentStatus = 'draft' | 'running' | 'paused' | 'completed' | 'cancelled';

export interface ConfigEntry {
  /** Configuration key */
  key: string;
  /** Current value */
  value: unknown;
  /** Value type */
  type: ConfigValueType;
  /** Description */
  description: string;
  /** Namespace/group */
  namespace: string;
  /** Current version */
  version: number;
  /** Whether this is sensitive */
  sensitive: boolean;
  /** Environment overrides */
  environmentOverrides: Record<string, unknown>;
  /** Tags */
  tags: string[];
  /** Last modified by */
  modifiedBy: string;
  /** Created timestamp */
  createdAt: number;
  /** Updated timestamp */
  updatedAt: number;
}

export interface ConfigVersion {
  version: number;
  key: string;
  value: unknown;
  previousValue: unknown;
  modifiedBy: string;
  reason: string;
  timestamp: number;
}

export interface FeatureFlag {
  /** Flag key */
  key: string;
  /** Flag name */
  name: string;
  /** Description */
  description: string;
  /** Flag status */
  status: FlagStatus;
  /** Default value when no rules match */
  defaultValue: boolean;
  /** Targeting rules */
  rules: TargetingRule[];
  /** Rollout configuration */
  rollout: RolloutConfig;
  /** Tags */
  tags: string[];
  /** Owner */
  owner: string;
  /** Created timestamp */
  createdAt: number;
  /** Updated timestamp */
  updatedAt: number;
  /** Evaluation statistics */
  stats: FlagStats;
}

export interface TargetingRule {
  /** Rule ID */
  id: string;
  /** Rule name */
  name: string;
  /** Priority (lower = higher priority) */
  priority: number;
  /** Conditions that must all be true */
  conditions: TargetingCondition[];
  /** Value to return when rule matches */
  value: boolean;
  /** Whether this rule is enabled */
  enabled: boolean;
}

export interface TargetingCondition {
  /** Attribute to evaluate */
  attribute: string;
  /** Operator */
  operator: 'eq' | 'neq' | 'in' | 'not_in' | 'contains' | 'starts_with' | 'ends_with' | 'gt' | 'lt' | 'gte' | 'lte' | 'regex';
  /** Value to compare against */
  value: unknown;
}

export interface RolloutConfig {
  /** Rollout strategy */
  strategy: RolloutStrategy;
  /** Percentage (0-100) for percentage-based rollout */
  percentage?: number;
  /** User IDs for user_list strategy */
  userIds?: string[];
  /** Attribute rules for attribute strategy */
  attributeRules?: TargetingCondition[];
  /** Gradual rollout schedule */
  gradualSchedule?: GradualRolloutStep[];
}

export interface GradualRolloutStep {
  percentage: number;
  startDate: number;
  endDate?: number;
}

export interface FlagStats {
  totalEvaluations: number;
  trueCount: number;
  falseCount: number;
  lastEvaluatedAt: number;
}

export interface EvaluationContext {
  /** User ID */
  userId?: string;
  /** User email */
  email?: string;
  /** User attributes */
  attributes: Record<string, unknown>;
  /** Environment */
  environment?: string;
  /** Request metadata */
  metadata?: Record<string, unknown>;
}

export interface Experiment {
  /** Experiment ID */
  id: string;
  /** Experiment name */
  name: string;
  /** Description */
  description: string;
  /** Configuration key being tested */
  configKey: string;
  /** Experiment status */
  status: ExperimentStatus;
  /** Variants */
  variants: ExperimentVariant[];
  /** Traffic allocation (0-100) */
  trafficAllocation: number;
  /** Start date */
  startDate: number;
  /** End date */
  endDate?: number;
  /** Success metric */
  successMetric: string;
  /** Results */
  results: ExperimentResults;
  /** Created timestamp */
  createdAt: number;
}

export interface ExperimentVariant {
  id: string;
  name: string;
  value: unknown;
  weight: number;
  impressions: number;
  conversions: number;
}

export interface ExperimentResults {
  winner?: string;
  confidence: number;
  sampleSize: number;
  variantResults: Record<string, { conversionRate: number; impressions: number; conversions: number }>;
}

export interface ConfigEvent {
  type: 'config:updated' | 'config:created' | 'config:deleted' | 'config:rolled_back' |
    'flag:toggled' | 'flag:created' | 'flag:updated' | 'flag:archived' |
    'experiment:started' | 'experiment:completed' | 'experiment:cancelled';
  payload: Record<string, unknown>;
  timestamp: number;
}

// ============================================================
// CONFIG STORE
// ============================================================

export class ConfigStore {
  private configs: Map<string, ConfigEntry> = new Map();
  private history: ConfigVersion[] = [];
  private listeners: Map<string, Set<(event: ConfigEvent) => void>> = new Map();

  /**
   * Set a configuration value
   */
  set(key: string, value: unknown, options: {
    type?: ConfigValueType;
    description?: string;
    namespace?: string;
    sensitive?: boolean;
    tags?: string[];
    modifiedBy?: string;
    reason?: string;
    environment?: string;
  } = {}): ConfigEntry {
    const existing = this.configs.get(key);

    if (existing && options.environment) {
      // Set environment override
      existing.environmentOverrides[options.environment] = value;
      existing.updatedAt = Date.now();
      existing.modifiedBy = options.modifiedBy || 'system';
      this.configs.set(key, existing);
      return existing;
    }

    const entry: ConfigEntry = {
      key,
      value,
      type: options.type || (existing?.type) || this.inferType(value),
      description: options.description || existing?.description || '',
      namespace: options.namespace || existing?.namespace || 'default',
      version: (existing?.version || 0) + 1,
      sensitive: options.sensitive ?? existing?.sensitive ?? false,
      environmentOverrides: existing?.environmentOverrides || {},
      tags: options.tags || existing?.tags || [],
      modifiedBy: options.modifiedBy || 'system',
      createdAt: existing?.createdAt || Date.now(),
      updatedAt: Date.now(),
    };

    // Record history
    this.history.push({
      version: entry.version,
      key,
      value,
      previousValue: existing?.value,
      modifiedBy: entry.modifiedBy,
      reason: options.reason || 'Configuration update',
      timestamp: Date.now(),
    });

    this.configs.set(key, entry);

    this.emit({
      type: existing ? 'config:updated' : 'config:created',
      payload: { key, version: entry.version, namespace: entry.namespace },
      timestamp: Date.now(),
    });

    return entry;
  }

  /**
   * Get a configuration value
   */
  get<T = unknown>(key: string, environment?: string): T | undefined {
    const entry = this.configs.get(key);
    if (!entry) return undefined;

    if (environment && entry.environmentOverrides[environment] !== undefined) {
      return entry.environmentOverrides[environment] as T;
    }

    return entry.value as T;
  }

  /**
   * Get a configuration entry with metadata
   */
  getEntry(key: string): ConfigEntry | undefined {
    return this.configs.get(key);
  }

  /**
   * Delete a configuration
   */
  delete(key: string): boolean {
    const existed = this.configs.delete(key);
    if (existed) {
      this.emit({
        type: 'config:deleted',
        payload: { key },
        timestamp: Date.now(),
      });
    }
    return existed;
  }

  /**
   * List all configurations
   */
  list(options?: { namespace?: string; tags?: string[]; prefix?: string }): ConfigEntry[] {
    let entries = Array.from(this.configs.values());

    if (options?.namespace) {
      entries = entries.filter(e => e.namespace === options.namespace);
    }

    if (options?.tags && options.tags.length > 0) {
      entries = entries.filter(e => options.tags!.some(t => e.tags.includes(t)));
    }

    if (options?.prefix) {
      entries = entries.filter(e => e.key.startsWith(options.prefix!));
    }

    return entries;
  }

  /**
   * Get configuration history
   */
  getHistory(key: string, limit: number = 20): ConfigVersion[] {
    return this.history
      .filter(h => h.key === key)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  /**
   * Rollback to a specific version
   */
  rollback(key: string, targetVersion: number): ConfigEntry | null {
    const versionEntry = this.history.find(h => h.key === key && h.version === targetVersion);
    if (!versionEntry) return null;

    const entry = this.set(key, versionEntry.value, {
      modifiedBy: 'system',
      reason: `Rollback to version ${targetVersion}`,
    });

    this.emit({
      type: 'config:rolled_back',
      payload: { key, fromVersion: entry.version - 1, toVersion: targetVersion },
      timestamp: Date.now(),
    });

    return entry;
  }

  /**
   * Get diff between two versions
   */
  diff(key: string, versionA: number, versionB: number): { versionA: unknown; versionB: unknown } | null {
    const a = this.history.find(h => h.key === key && h.version === versionA);
    const b = this.history.find(h => h.key === key && h.version === versionB);
    if (!a || !b) return null;
    return { versionA: a.value, versionB: b.value };
  }

  /**
   * Export all configurations
   */
  export(namespace?: string): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const entry of this.list({ namespace })) {
      result[entry.key] = entry.sensitive ? '***REDACTED***' : entry.value;
    }
    return result;
  }

  /**
   * Import configurations
   */
  import(configs: Record<string, unknown>, namespace: string = 'default', modifiedBy: string = 'import'): number {
    let count = 0;
    for (const [key, value] of Object.entries(configs)) {
      this.set(key, value, { namespace, modifiedBy, reason: 'Bulk import' });
      count++;
    }
    return count;
  }

  private inferType(value: unknown): ConfigValueType {
    if (typeof value === 'string') return 'string';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    return 'json';
  }

  on(type: string, handler: (event: ConfigEvent) => void): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(handler);
    return () => this.listeners.get(type)?.delete(handler);
  }

  private emit(event: ConfigEvent): void {
    this.listeners.get(event.type)?.forEach(h => h(event));
    this.listeners.get('*')?.forEach(h => h(event));
  }
}

// ============================================================
// FEATURE FLAG MANAGER
// ============================================================

export class FeatureFlagManager {
  private flags: Map<string, FeatureFlag> = new Map();
  private listeners: Map<string, Set<(event: ConfigEvent) => void>> = new Map();

  /**
   * Create a feature flag
   */
  create(config: Omit<FeatureFlag, 'createdAt' | 'updatedAt' | 'stats'>): FeatureFlag {
    const flag: FeatureFlag = {
      ...config,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      stats: {
        totalEvaluations: 0,
        trueCount: 0,
        falseCount: 0,
        lastEvaluatedAt: 0,
      },
    };

    this.flags.set(flag.key, flag);

    this.emit({
      type: 'flag:created',
      payload: { key: flag.key, name: flag.name, defaultValue: flag.defaultValue },
      timestamp: Date.now(),
    });

    return flag;
  }

  /**
   * Evaluate a feature flag for a given context
   */
  evaluate(flagKey: string, context: EvaluationContext = { attributes: {} }): boolean {
    const flag = this.flags.get(flagKey);
    if (!flag || flag.status !== 'active') {
      return false;
    }

    let result = flag.defaultValue;

    // Check rollout strategy first
    if (!this.isInRollout(flag.rollout, context)) {
      result = false;
    } else {
      // Evaluate targeting rules (sorted by priority)
      const sortedRules = [...flag.rules]
        .filter(r => r.enabled)
        .sort((a, b) => a.priority - b.priority);

      for (const rule of sortedRules) {
        if (this.evaluateRule(rule, context)) {
          result = rule.value;
          break;
        }
      }
    }

    // Update stats
    flag.stats.totalEvaluations++;
    if (result) flag.stats.trueCount++;
    else flag.stats.falseCount++;
    flag.stats.lastEvaluatedAt = Date.now();

    return result;
  }

  /**
   * Toggle a flag on/off
   */
  toggle(flagKey: string): boolean {
    const flag = this.flags.get(flagKey);
    if (!flag) return false;

    flag.defaultValue = !flag.defaultValue;
    flag.updatedAt = Date.now();

    this.emit({
      type: 'flag:toggled',
      payload: { key: flagKey, newValue: flag.defaultValue },
      timestamp: Date.now(),
    });

    return true;
  }

  /**
   * Update a flag
   */
  update(flagKey: string, updates: Partial<Pick<FeatureFlag, 'name' | 'description' | 'rules' | 'rollout' | 'tags' | 'defaultValue'>>): FeatureFlag | null {
    const flag = this.flags.get(flagKey);
    if (!flag) return null;

    Object.assign(flag, updates, { updatedAt: Date.now() });

    this.emit({
      type: 'flag:updated',
      payload: { key: flagKey, updates: Object.keys(updates) },
      timestamp: Date.now(),
    });

    return flag;
  }

  /**
   * Archive a flag
   */
  archive(flagKey: string): boolean {
    const flag = this.flags.get(flagKey);
    if (!flag) return false;

    flag.status = 'archived';
    flag.updatedAt = Date.now();

    this.emit({
      type: 'flag:archived',
      payload: { key: flagKey },
      timestamp: Date.now(),
    });

    return true;
  }

  /**
   * Get a flag
   */
  get(flagKey: string): FeatureFlag | undefined {
    return this.flags.get(flagKey);
  }

  /**
   * List all flags
   */
  list(options?: { status?: FlagStatus; tags?: string[]; owner?: string }): FeatureFlag[] {
    let flags = Array.from(this.flags.values());

    if (options?.status) {
      flags = flags.filter(f => f.status === options.status);
    }
    if (options?.tags && options.tags.length > 0) {
      flags = flags.filter(f => options.tags!.some(t => f.tags.includes(t)));
    }
    if (options?.owner) {
      flags = flags.filter(f => f.owner === options.owner);
    }

    return flags;
  }

  /**
   * Evaluate all flags for a context
   */
  evaluateAll(context: EvaluationContext): Record<string, boolean> {
    const results: Record<string, boolean> = {};
    for (const flag of this.flags.values()) {
      if (flag.status === 'active') {
        results[flag.key] = this.evaluate(flag.key, context);
      }
    }
    return results;
  }

  // Private helpers

  private isInRollout(rollout: RolloutConfig, context: EvaluationContext): boolean {
    switch (rollout.strategy) {
      case 'all':
        return true;

      case 'percentage': {
        if (!context.userId) return false;
        const hash = this.hashString(context.userId);
        return (hash % 100) < (rollout.percentage || 0);
      }

      case 'user_list':
        return context.userId ? (rollout.userIds || []).includes(context.userId) : false;

      case 'attribute':
        return (rollout.attributeRules || []).every(rule =>
          this.evaluateCondition(context.attributes[rule.attribute], rule)
        );

      case 'gradual': {
        if (!rollout.gradualSchedule || rollout.gradualSchedule.length === 0) return false;
        const now = Date.now();
        const activeStep = rollout.gradualSchedule
          .filter(s => s.startDate <= now)
          .sort((a, b) => b.startDate - a.startDate)[0];
        if (!activeStep) return false;
        if (!context.userId) return false;
        const hash = this.hashString(context.userId);
        return (hash % 100) < activeStep.percentage;
      }

      default:
        return true;
    }
  }

  private evaluateRule(rule: TargetingRule, context: EvaluationContext): boolean {
    return rule.conditions.every(condition => {
      const value = this.resolveAttribute(condition.attribute, context);
      return this.evaluateCondition(value, condition);
    });
  }

  private resolveAttribute(attribute: string, context: EvaluationContext): unknown {
    if (attribute === 'userId') return context.userId;
    if (attribute === 'email') return context.email;
    if (attribute === 'environment') return context.environment;
    return context.attributes[attribute];
  }

  private evaluateCondition(value: unknown, condition: TargetingCondition): boolean {
    switch (condition.operator) {
      case 'eq': return value === condition.value;
      case 'neq': return value !== condition.value;
      case 'in': return Array.isArray(condition.value) && condition.value.includes(value);
      case 'not_in': return Array.isArray(condition.value) && !condition.value.includes(value);
      case 'contains': return typeof value === 'string' && value.includes(String(condition.value));
      case 'starts_with': return typeof value === 'string' && value.startsWith(String(condition.value));
      case 'ends_with': return typeof value === 'string' && value.endsWith(String(condition.value));
      case 'gt': return typeof value === 'number' && value > (condition.value as number);
      case 'lt': return typeof value === 'number' && value < (condition.value as number);
      case 'gte': return typeof value === 'number' && value >= (condition.value as number);
      case 'lte': return typeof value === 'number' && value <= (condition.value as number);
      case 'regex': return typeof value === 'string' && new RegExp(String(condition.value)).test(value);
      default: return false;
    }
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  on(type: string, handler: (event: ConfigEvent) => void): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(handler);
    return () => this.listeners.get(type)?.delete(handler);
  }

  private emit(event: ConfigEvent): void {
    this.listeners.get(event.type)?.forEach(h => h(event));
    this.listeners.get('*')?.forEach(h => h(event));
  }
}

// ============================================================
// DYNAMIC CONFIG SYSTEM (UNIFIED)
// ============================================================

export class DynamicConfigSystem {
  readonly config: ConfigStore;
  readonly flags: FeatureFlagManager;

  private experiments: Map<string, Experiment> = new Map();

  constructor() {
    this.config = new ConfigStore();
    this.flags = new FeatureFlagManager();
    console.log('[DynamicConfig] System initialized');
  }

  /**
   * Create an A/B test experiment
   */
  createExperiment(config: Omit<Experiment, 'id' | 'createdAt' | 'results' | 'status'>): Experiment {
    const experiment: Experiment = {
      ...config,
      id: `exp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      status: 'draft',
      results: { confidence: 0, sampleSize: 0, variantResults: {} },
      createdAt: Date.now(),
    };

    this.experiments.set(experiment.id, experiment);
    return experiment;
  }

  /**
   * Start an experiment
   */
  startExperiment(experimentId: string): boolean {
    const exp = this.experiments.get(experimentId);
    if (!exp || exp.status !== 'draft') return false;

    exp.status = 'running';
    exp.startDate = Date.now();
    return true;
  }

  /**
   * Record an impression for an experiment
   */
  recordImpression(experimentId: string, userId: string): ExperimentVariant | null {
    const exp = this.experiments.get(experimentId);
    if (!exp || exp.status !== 'running') return null;

    // Deterministic variant assignment based on user ID
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      hash = ((hash << 5) - hash) + userId.charCodeAt(i);
      hash = hash & hash;
    }

    const bucket = Math.abs(hash) % 100;
    if (bucket >= exp.trafficAllocation) return null;

    // Select variant based on weights
    let cumWeight = 0;
    const variantBucket = Math.abs(hash >> 8) % 100;
    for (const variant of exp.variants) {
      cumWeight += variant.weight;
      if (variantBucket < cumWeight) {
        variant.impressions++;
        exp.results.sampleSize++;
        return variant;
      }
    }

    return exp.variants[0] || null;
  }

  /**
   * Record a conversion for an experiment
   */
  recordConversion(experimentId: string, variantId: string): boolean {
    const exp = this.experiments.get(experimentId);
    if (!exp) return false;

    const variant = exp.variants.find(v => v.id === variantId);
    if (!variant) return false;

    variant.conversions++;
    this.updateExperimentResults(exp);
    return true;
  }

  /**
   * Complete an experiment
   */
  completeExperiment(experimentId: string): Experiment | null {
    const exp = this.experiments.get(experimentId);
    if (!exp) return null;

    exp.status = 'completed';
    exp.endDate = Date.now();
    this.updateExperimentResults(exp);

    // Apply winner if confidence is high enough
    if (exp.results.confidence >= 0.95 && exp.results.winner) {
      const winner = exp.variants.find(v => v.id === exp.results.winner);
      if (winner) {
        this.config.set(exp.configKey, winner.value, {
          reason: `Experiment ${exp.name} winner: ${winner.name}`,
          modifiedBy: 'experiment_system',
        });
      }
    }

    return exp;
  }

  /**
   * Get experiment
   */
  getExperiment(experimentId: string): Experiment | undefined {
    return this.experiments.get(experimentId);
  }

  /**
   * List experiments
   */
  listExperiments(status?: ExperimentStatus): Experiment[] {
    let exps = Array.from(this.experiments.values());
    if (status) {
      exps = exps.filter(e => e.status === status);
    }
    return exps;
  }

  private updateExperimentResults(exp: Experiment): void {
    const variantResults: Record<string, { conversionRate: number; impressions: number; conversions: number }> = {};
    let bestRate = 0;
    let bestVariant: string | undefined;

    for (const variant of exp.variants) {
      const rate = variant.impressions > 0 ? variant.conversions / variant.impressions : 0;
      variantResults[variant.id] = {
        conversionRate: rate,
        impressions: variant.impressions,
        conversions: variant.conversions,
      };

      if (rate > bestRate) {
        bestRate = rate;
        bestVariant = variant.id;
      }
    }

    // Simple confidence calculation based on sample size
    const totalSamples = exp.variants.reduce((sum, v) => sum + v.impressions, 0);
    const confidence = Math.min(0.99, totalSamples / 1000);

    exp.results = {
      winner: confidence >= 0.95 ? bestVariant : undefined,
      confidence,
      sampleSize: totalSamples,
      variantResults,
    };
  }
}