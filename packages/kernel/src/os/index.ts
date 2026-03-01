/**
 * Infinity OS Enhancement Module
 * 
 * Advanced operating system capabilities for the Infinity Portal,
 * providing service discovery, event streaming, self-healing,
 * and dynamic configuration management.
 * 
 * Architecture:
 * ```
 * Infinity OS
 *   ├── ServiceDiscovery (registration, routing, dependency graph)
 *   ├── WebhookSystem (webhooks, event streaming, delivery)
 *   ├── SelfHealingSystem (scaling, anomaly detection, failover)
 *   └── DynamicConfigSystem (config store, feature flags, A/B testing)
 * ```
 */

// Service Discovery
export {
  ServiceDiscovery,
  type DiscoverableService,
  type ServiceStatus,
  type RoutingStrategy,
  type HealthCheckProtocol,
  type ServiceMetadata,
  type DiscoveryHealthCheck,
  type DiscoveryEvent,
  type DiscoveryQuery,
  type DependencyNode,
} from './service-discovery';

// Webhook & Event Streaming
export {
  EventStream,
  WebhookManager,
  type WebhookRegistration,
  type WebhookStatus,
  type DeliveryStatus,
  type StreamStatus,
  type StreamEvent,
  type EventStreamMetadata,
  type EventFilter,
  type FilterCondition,
  type RetryConfig,
  type WebhookStats,
  type DeliveryAttempt,
  type WebhookEvent,
} from './webhook-system';

// Self-Healing & Predictive Scaling
export {
  SelfHealingSystem,
  PredictiveScaler,
  AnomalyDetector,
  FailoverManager,
  type ScalingAction,
  type RecoveryAction,
  type AnomalyType,
  type FailoverMode,
  type HealthTrend,
  type MetricDataPoint,
  type ScalingDecision,
  type ScalingPolicy,
  type SchedulePattern,
  type RecoveryPlan,
  type RecoveryStep,
  type RecoveryCondition,
  type EscalationPolicy,
  type EscalationLevel,
  type Anomaly,
  type FailoverConfig,
  type FailoverState,
  type SelfHealingEvent,
} from './self-healing';

// Dynamic Configuration & Feature Flags
export {
  DynamicConfigSystem,
  ConfigStore,
  FeatureFlagManager,
  type ConfigEntry,
  type ConfigVersion,
  type ConfigValueType,
  type FeatureFlag,
  type FlagStatus,
  type TargetingRule,
  type TargetingCondition,
  type RolloutConfig,
  type RolloutStrategy,
  type GradualRolloutStep,
  type FlagStats,
  type EvaluationContext,
  type Experiment,
  type ExperimentVariant,
  type ExperimentResults,
  type ExperimentStatus,
  type ConfigEvent,
} from './dynamic-config';