/**
 * Auto-Scaler Configuration
 * 
 * Provides auto-scaling policies and configuration for:
 * - Horizontal Pod Autoscaling (HPA)
 * - Vertical Pod Autoscaling (VPA)
 * - Custom metrics-based scaling
 * - Predictive scaling
 */

export interface ScalingPolicy {
  /** Name of the scaling policy */
  name: string;
  /** Service to scale */
  service: string;
  /** Minimum replicas */
  minReplicas: number;
  /** Maximum replicas */
  maxReplicas: number;
  /** Target CPU utilization percentage */
  targetCpuPercent: number;
  /** Target memory utilization percentage */
  targetMemoryPercent: number;
  /** Custom metrics for scaling */
  customMetrics?: CustomScalingMetric[];
  /** Scale-up cooldown in seconds */
  scaleUpCooldown: number;
  /** Scale-down cooldown in seconds */
  scaleDownCooldown: number;
  /** Scale-up step size */
  scaleUpStep: number;
  /** Scale-down step size */
  scaleDownStep: number;
}

export interface CustomScalingMetric {
  /** Metric name */
  name: string;
  /** Target value */
  targetValue: number;
  /** Metric type */
  type: 'average' | 'total' | 'percentile';
}

export interface ScalingDecision {
  service: string;
  currentReplicas: number;
  desiredReplicas: number;
  reason: string;
  metrics: Record<string, number>;
  timestamp: number;
}

/**
 * Auto-Scaler Engine
 */
export class AutoScaler {
  private policies: Map<string, ScalingPolicy> = new Map();
  private currentReplicas: Map<string, number> = new Map();
  private lastScaleUp: Map<string, number> = new Map();
  private lastScaleDown: Map<string, number> = new Map();
  private decisions: ScalingDecision[] = [];

  /**
   * Register a scaling policy
   */
  registerPolicy(policy: ScalingPolicy): void {
    this.policies.set(policy.service, policy);
    if (!this.currentReplicas.has(policy.service)) {
      this.currentReplicas.set(policy.service, policy.minReplicas);
    }
  }

  /**
   * Evaluate scaling decision based on current metrics
   */
  evaluate(service: string, metrics: Record<string, number>): ScalingDecision {
    const policy = this.policies.get(service);
    if (!policy) {
      throw new Error(`No scaling policy found for service: ${service}`);
    }

    const current = this.currentReplicas.get(service) || policy.minReplicas;
    let desired = current;
    let reason = 'No scaling needed';
    const now = Date.now();

    // Check CPU-based scaling
    if (metrics.cpuPercent !== undefined) {
      if (metrics.cpuPercent > policy.targetCpuPercent) {
        const scaleRatio = metrics.cpuPercent / policy.targetCpuPercent;
        desired = Math.ceil(current * scaleRatio);
        reason = `CPU usage ${metrics.cpuPercent}% exceeds target ${policy.targetCpuPercent}%`;
      } else if (metrics.cpuPercent < policy.targetCpuPercent * 0.5) {
        const scaleRatio = metrics.cpuPercent / policy.targetCpuPercent;
        desired = Math.max(policy.minReplicas, Math.ceil(current * scaleRatio));
        reason = `CPU usage ${metrics.cpuPercent}% well below target ${policy.targetCpuPercent}%`;
      }
    }

    // Check memory-based scaling
    if (metrics.memoryPercent !== undefined) {
      if (metrics.memoryPercent > policy.targetMemoryPercent) {
        const memDesired = Math.ceil(current * (metrics.memoryPercent / policy.targetMemoryPercent));
        if (memDesired > desired) {
          desired = memDesired;
          reason = `Memory usage ${metrics.memoryPercent}% exceeds target ${policy.targetMemoryPercent}%`;
        }
      }
    }

    // Check custom metrics
    if (policy.customMetrics) {
      for (const customMetric of policy.customMetrics) {
        const value = metrics[customMetric.name];
        if (value !== undefined && value > customMetric.targetValue) {
          const customDesired = Math.ceil(current * (value / customMetric.targetValue));
          if (customDesired > desired) {
            desired = customDesired;
            reason = `Custom metric '${customMetric.name}' value ${value} exceeds target ${customMetric.targetValue}`;
          }
        }
      }
    }

    // Apply step limits
    if (desired > current) {
      desired = Math.min(desired, current + policy.scaleUpStep);
    } else if (desired < current) {
      desired = Math.max(desired, current - policy.scaleDownStep);
    }

    // Apply min/max bounds
    desired = Math.max(policy.minReplicas, Math.min(policy.maxReplicas, desired));

    // Apply cooldown
    if (desired > current) {
      const lastUp = this.lastScaleUp.get(service) || 0;
      if (now - lastUp < policy.scaleUpCooldown * 1000) {
        desired = current;
        reason = `Scale-up cooldown active (${Math.ceil((policy.scaleUpCooldown * 1000 - (now - lastUp)) / 1000)}s remaining)`;
      }
    } else if (desired < current) {
      const lastDown = this.lastScaleDown.get(service) || 0;
      if (now - lastDown < policy.scaleDownCooldown * 1000) {
        desired = current;
        reason = `Scale-down cooldown active (${Math.ceil((policy.scaleDownCooldown * 1000 - (now - lastDown)) / 1000)}s remaining)`;
      }
    }

    const decision: ScalingDecision = {
      service,
      currentReplicas: current,
      desiredReplicas: desired,
      reason,
      metrics,
      timestamp: now,
    };

    // Record decision
    this.decisions.push(decision);
    if (this.decisions.length > 1000) {
      this.decisions = this.decisions.slice(-500);
    }

    // Update state if scaling
    if (desired !== current) {
      this.currentReplicas.set(service, desired);
      if (desired > current) {
        this.lastScaleUp.set(service, now);
      } else {
        this.lastScaleDown.set(service, now);
      }
    }

    return decision;
  }

  /**
   * Get scaling history
   */
  getHistory(service?: string, limit: number = 50): ScalingDecision[] {
    let history = this.decisions;
    if (service) {
      history = history.filter(d => d.service === service);
    }
    return history.slice(-limit);
  }

  /**
   * Get current replica count
   */
  getReplicas(service: string): number {
    return this.currentReplicas.get(service) || 0;
  }

  /**
   * Get all policies
   */
  getPolicies(): ScalingPolicy[] {
    return Array.from(this.policies.values());
  }
}

/**
 * Default scaling policies for Infinity Portal services
 */
export const DefaultScalingPolicies: ScalingPolicy[] = [
  {
    name: 'api-gateway-scaling',
    service: 'api-gateway',
    minReplicas: 2,
    maxReplicas: 10,
    targetCpuPercent: 70,
    targetMemoryPercent: 80,
    scaleUpCooldown: 60,
    scaleDownCooldown: 300,
    scaleUpStep: 2,
    scaleDownStep: 1,
    customMetrics: [
      { name: 'requestsPerSecond', targetValue: 1000, type: 'average' },
    ],
  },
  {
    name: 'ai-service-scaling',
    service: 'ai-service',
    minReplicas: 1,
    maxReplicas: 8,
    targetCpuPercent: 60,
    targetMemoryPercent: 75,
    scaleUpCooldown: 120,
    scaleDownCooldown: 600,
    scaleUpStep: 1,
    scaleDownStep: 1,
    customMetrics: [
      { name: 'inferenceQueueLength', targetValue: 10, type: 'average' },
      { name: 'avgLatencyMs', targetValue: 5000, type: 'average' },
    ],
  },
  {
    name: 'worker-scaling',
    service: 'infinity-worker',
    minReplicas: 1,
    maxReplicas: 6,
    targetCpuPercent: 75,
    targetMemoryPercent: 80,
    scaleUpCooldown: 90,
    scaleDownCooldown: 300,
    scaleUpStep: 2,
    scaleDownStep: 1,
    customMetrics: [
      { name: 'jobQueueLength', targetValue: 50, type: 'total' },
    ],
  },
  {
    name: 'web-frontend-scaling',
    service: 'web-frontend',
    minReplicas: 2,
    maxReplicas: 8,
    targetCpuPercent: 70,
    targetMemoryPercent: 80,
    scaleUpCooldown: 60,
    scaleDownCooldown: 300,
    scaleUpStep: 2,
    scaleDownStep: 1,
  },
];