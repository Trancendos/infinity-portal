// src/index.ts - Public API

export { BaseAgent } from "./base-agent";
export { InMemoryEventBus, createEvent } from "./event-bus";
export { DefaultLogger } from "./logger";
export type {
  AgentConfig,
  AgentEvent,
  AgentLogger,
  AgentState,
  AgentTier,
  DeploymentTarget,
  EventBus,
  EventHandler,
  EventResult,
  HealthStatus,
  LogLevel,
  MetricPoint,
} from "./types";
export {
  AgentState as AgentStateEnum,
  AgentTier as AgentTierEnum,
  DeploymentTarget as DeploymentTargetEnum,
  LogLevel as LogLevelEnum,
} from "./types";
