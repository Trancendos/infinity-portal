/**
 * AI Performance Optimization Platform
 * 
 * Monitors, analyzes, and optimizes AI model performance:
 * - Model inference tracking
 * - A/B testing framework
 * - Cost optimization
 * - Quality scoring
 * - Prompt optimization
 */

export interface InferenceRecord {
  id: string;
  model: string;
  agentId: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
  cost: number;
  quality?: number;
  timestamp: number;
  metadata: Record<string, any>;
}

export interface ModelMetrics {
  model: string;
  totalInferences: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  avgTokensPerRequest: number;
  totalTokensUsed: number;
  totalCost: number;
  avgQuality: number;
  errorRate: number;
  throughput: number;
}

export interface ABTest {
  id: string;
  name: string;
  description: string;
  status: 'draft' | 'running' | 'completed' | 'cancelled';
  variants: ABTestVariant[];
  trafficSplit: number[];
  startedAt?: number;
  completedAt?: number;
  winnerVariant?: string;
  sampleSize: number;
  confidenceLevel: number;
}

export interface ABTestVariant {
  id: string;
  name: string;
  model: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  metrics: {
    totalRequests: number;
    avgLatency: number;
    avgQuality: number;
    avgCost: number;
    errorRate: number;
  };
}

export interface CostOptimization {
  currentMonthlyCost: number;
  projectedMonthlyCost: number;
  savings: number;
  recommendations: CostRecommendation[];
}

export interface CostRecommendation {
  type: 'model-switch' | 'prompt-optimization' | 'caching' | 'batching' | 'rate-reduction';
  description: string;
  estimatedSavings: number;
  impact: 'low' | 'medium' | 'high';
  effort: 'low' | 'medium' | 'high';
}

// Model pricing per 1K tokens (approximate)
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4': { input: 0.03, output: 0.06 },
  'gpt-4-turbo': { input: 0.01, output: 0.03 },
  'gpt-4o': { input: 0.005, output: 0.015 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
  'claude-3-opus': { input: 0.015, output: 0.075 },
  'claude-3-sonnet': { input: 0.003, output: 0.015 },
  'claude-3-haiku': { input: 0.00025, output: 0.00125 },
};

export class AIPerformanceTracker {
  private records: InferenceRecord[] = [];
  private abTests: Map<string, ABTest> = new Map();
  private maxRecords: number;

  constructor(maxRecords: number = 100000) {
    this.maxRecords = maxRecords;
  }

  /**
   * Record an inference
   */
  record(record: Omit<InferenceRecord, 'id' | 'cost' | 'timestamp'>): InferenceRecord {
    const pricing = MODEL_PRICING[record.model] || { input: 0.01, output: 0.03 };
    const cost = (record.promptTokens / 1000 * pricing.input) +
                 (record.completionTokens / 1000 * pricing.output);

    const fullRecord: InferenceRecord = {
      ...record,
      id: this.generateId(),
      cost,
      timestamp: Date.now(),
    };

    this.records.push(fullRecord);
    if (this.records.length > this.maxRecords) {
      this.records = this.records.slice(-this.maxRecords);
    }

    return fullRecord;
  }

  /**
   * Get model metrics
   */
  getModelMetrics(model?: string, timeRange?: { from: number; to: number }): ModelMetrics[] {
    let filtered = this.records;

    if (model) {
      filtered = filtered.filter(r => r.model === model);
    }
    if (timeRange) {
      filtered = filtered.filter(r => r.timestamp >= timeRange.from && r.timestamp <= timeRange.to);
    }

    // Group by model
    const groups = new Map<string, InferenceRecord[]>();
    for (const record of filtered) {
      const existing = groups.get(record.model) || [];
      existing.push(record);
      groups.set(record.model, existing);
    }

    return Array.from(groups.entries()).map(([modelName, records]) => {
      const latencies = records.map(r => r.latencyMs).sort((a, b) => a - b);
      const qualities = records.filter(r => r.quality !== undefined).map(r => r.quality!);
      const errors = records.filter(r => r.metadata?.error).length;
      const timeSpan = records.length > 1
        ? (records[records.length - 1].timestamp - records[0].timestamp) / 1000
        : 1;

      return {
        model: modelName,
        totalInferences: records.length,
        avgLatencyMs: latencies.reduce((a, b) => a + b, 0) / latencies.length,
        p95LatencyMs: latencies[Math.floor(latencies.length * 0.95)] || 0,
        p99LatencyMs: latencies[Math.floor(latencies.length * 0.99)] || 0,
        avgTokensPerRequest: records.reduce((a, r) => a + r.totalTokens, 0) / records.length,
        totalTokensUsed: records.reduce((a, r) => a + r.totalTokens, 0),
        totalCost: records.reduce((a, r) => a + r.cost, 0),
        avgQuality: qualities.length > 0 ? qualities.reduce((a, b) => a + b, 0) / qualities.length : 0,
        errorRate: errors / records.length,
        throughput: records.length / timeSpan,
      };
    });
  }

  /**
   * Get cost optimization recommendations
   */
  getCostOptimization(): CostOptimization {
    const metrics = this.getModelMetrics();
    const currentMonthlyCost = metrics.reduce((sum, m) => sum + m.totalCost, 0) * 30;
    const recommendations: CostRecommendation[] = [];

    for (const metric of metrics) {
      // Recommend cheaper models for low-complexity tasks
      if (metric.model === 'gpt-4' && metric.avgQuality > 0.8) {
        recommendations.push({
          type: 'model-switch',
          description: `Switch ${metric.model} to gpt-4o-mini for simple tasks (avg quality: ${metric.avgQuality.toFixed(2)})`,
          estimatedSavings: metric.totalCost * 0.9 * 30,
          impact: 'low',
          effort: 'low',
        });
      }

      // Recommend caching for repeated queries
      if (metric.totalInferences > 100) {
        recommendations.push({
          type: 'caching',
          description: `Enable response caching for ${metric.model} (${metric.totalInferences} inferences)`,
          estimatedSavings: metric.totalCost * 0.3 * 30,
          impact: 'low',
          effort: 'low',
        });
      }

      // Recommend prompt optimization for high token usage
      if (metric.avgTokensPerRequest > 2000) {
        recommendations.push({
          type: 'prompt-optimization',
          description: `Optimize prompts for ${metric.model} (avg ${Math.round(metric.avgTokensPerRequest)} tokens/request)`,
          estimatedSavings: metric.totalCost * 0.2 * 30,
          impact: 'medium',
          effort: 'medium',
        });
      }
    }

    const projectedSavings = recommendations.reduce((sum, r) => sum + r.estimatedSavings, 0);

    return {
      currentMonthlyCost,
      projectedMonthlyCost: currentMonthlyCost - projectedSavings,
      savings: projectedSavings,
      recommendations: recommendations.sort((a, b) => b.estimatedSavings - a.estimatedSavings),
    };
  }

  /**
   * Create an A/B test
   */
  createABTest(test: Omit<ABTest, 'id' | 'status'>): ABTest {
    const fullTest: ABTest = {
      ...test,
      id: this.generateId(),
      status: 'draft',
    };
    this.abTests.set(fullTest.id, fullTest);
    return fullTest;
  }

  /**
   * Start an A/B test
   */
  startABTest(testId: string): ABTest {
    const test = this.abTests.get(testId);
    if (!test) throw new Error(`A/B test ${testId} not found`);
    test.status = 'running';
    test.startedAt = Date.now();
    return test;
  }

  /**
   * Get A/B test results
   */
  getABTestResults(testId: string): ABTest | undefined {
    return this.abTests.get(testId);
  }

  /**
   * Get agent performance summary
   */
  getAgentPerformance(agentId: string): {
    totalInferences: number;
    totalCost: number;
    avgLatency: number;
    avgQuality: number;
    modelsUsed: string[];
  } {
    const agentRecords = this.records.filter(r => r.agentId === agentId);
    const qualities = agentRecords.filter(r => r.quality !== undefined).map(r => r.quality!);

    return {
      totalInferences: agentRecords.length,
      totalCost: agentRecords.reduce((sum, r) => sum + r.cost, 0),
      avgLatency: agentRecords.length > 0
        ? agentRecords.reduce((sum, r) => sum + r.latencyMs, 0) / agentRecords.length
        : 0,
      avgQuality: qualities.length > 0
        ? qualities.reduce((a, b) => a + b, 0) / qualities.length
        : 0,
      modelsUsed: [...new Set(agentRecords.map(r => r.model))],
    };
  }

  /**
   * Get overall dashboard metrics
   */
  getDashboard(): {
    totalInferences: number;
    totalCost: number;
    avgLatency: number;
    activeModels: number;
    activeAgents: number;
    errorRate: number;
    costTrend: 'up' | 'down' | 'stable';
  } {
    const now = Date.now();
    const dayAgo = now - 86400000;
    const twoDaysAgo = now - 172800000;

    const recent = this.records.filter(r => r.timestamp >= dayAgo);
    const previous = this.records.filter(r => r.timestamp >= twoDaysAgo && r.timestamp < dayAgo);

    const recentCost = recent.reduce((sum, r) => sum + r.cost, 0);
    const previousCost = previous.reduce((sum, r) => sum + r.cost, 0);

    let costTrend: 'up' | 'down' | 'stable' = 'stable';
    if (recentCost > previousCost * 1.1) costTrend = 'up';
    else if (recentCost < previousCost * 0.9) costTrend = 'down';

    const errors = this.records.filter(r => r.metadata?.error).length;

    return {
      totalInferences: this.records.length,
      totalCost: this.records.reduce((sum, r) => sum + r.cost, 0),
      avgLatency: this.records.length > 0
        ? this.records.reduce((sum, r) => sum + r.latencyMs, 0) / this.records.length
        : 0,
      activeModels: new Set(this.records.map(r => r.model)).size,
      activeAgents: new Set(this.records.map(r => r.agentId)).size,
      errorRate: this.records.length > 0 ? errors / this.records.length : 0,
      costTrend,
    };
  }

  private generateId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 10)}`;
  }
}