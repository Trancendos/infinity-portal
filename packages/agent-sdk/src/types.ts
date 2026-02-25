// src/types.ts - Core type definitions for the Trancendos Agent ecosystem

/**
 * Agent lifecycle states
 */
export enum AgentState {
  UNINITIALIZED = "UNINITIALIZED",
  INITIALIZING = "INITIALIZING",
  READY = "READY",
  PROCESSING = "PROCESSING",
  DEGRADED = "DEGRADED",
  SHUTTING_DOWN = "SHUTTING_DOWN",
  STOPPED = "STOPPED",
  ERROR = "ERROR",
}

/**
 * Agent priority tiers (from the ecosystem report)
 */
export enum AgentTier {
  T1_CRITICAL = "T1_CRITICAL",
  T2_IMPORTANT = "T2_IMPORTANT",
  T3_NICE_TO_HAVE = "T3_NICE_TO_HAVE",
}

/**
 * Agent deployment targets
 */
export enum DeploymentTarget {
  CLOUDFLARE_WORKER = "cloudflare-worker",
  K3S_POD = "k3s-pod",
  BROWSER_MODULE = "browser-module",
  DOCKER_CONTAINER = "docker-container",
  STANDALONE = "standalone",
}

/**
 * Log severity levels
 */
export enum LogLevel {
  DEBUG = "DEBUG",
  INFO = "INFO",
  WARN = "WARN",
  ERROR = "ERROR",
  FATAL = "FATAL",
}

/**
 * Agent configuration
 */
export interface AgentConfig {
  /** Unique agent identifier (e.g., "norman-ai", "guardian-ai") */
  id: string;
  /** Human-readable name */
  name: string;
  /** Agent version (semver) */
  version: string;
  /** Brief description of agent purpose */
  description: string;
  /** Priority tier */
  tier: AgentTier;
  /** Deployment target */
  deploymentTarget: DeploymentTarget;
  /** Agent capabilities (used for service discovery) */
  capabilities: string[];
  /** Dependencies on other agents */
  dependencies: string[];
  /** Custom configuration key-value pairs */
  settings: Record<string, unknown>;
  /** Health check interval in milliseconds (default: 30000) */
  healthCheckIntervalMs?: number;
  /** Maximum concurrent event processing (default: 10) */
  maxConcurrency?: number;
}

/**
 * Event flowing through the Trancendos event bus
 */
export interface AgentEvent<T = unknown> {
  /** Unique event ID */
  id: string;
  /** Event type (e.g., "security.threat_detected", "agent.health_check") */
  type: string;
  /** Source agent ID */
  source: string;
  /** Target agent ID (null = broadcast) */
  target: string | null;
  /** Event payload */
  data: T;
  /** ISO 8601 timestamp */
  timestamp: string;
  /** W3C Trace Context correlation ID */
  correlationId: string;
  /** Event schema version */
  schemaVersion: string;
  /** Metadata */
  metadata: Record<string, string>;
}

/**
 * Result of processing an event
 */
export interface EventResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  /** Duration in milliseconds */
  durationMs: number;
}

/**
 * Health check response
 */
export interface HealthStatus {
  agentId: string;
  state: AgentState;
  uptime: number;
  version: string;
  /** Timestamp of last successful event processing */
  lastActivity: string | null;
  /** Current event queue depth */
  queueDepth: number;
  /** Custom health indicators */
  checks: Record<string, { status: "pass" | "warn" | "fail"; message?: string }>;
  timestamp: string;
}

/**
 * Agent metric point for observability
 */
export interface MetricPoint {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: string;
}

/**
 * Event handler function signature
 */
export type EventHandler<T = unknown> = (event: AgentEvent<T>) => Promise<EventResult>;

/**
 * Logger interface (pluggable)
 */
export interface AgentLogger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

/**
 * Event bus interface (pluggable - NATS, Kafka, in-memory, Cloudflare Queues)
 */
export interface EventBus {
  publish(event: AgentEvent): Promise<void>;
  subscribe(eventType: string, handler: EventHandler): void;
  unsubscribe(eventType: string): void;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
}
