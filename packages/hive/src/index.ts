/**
 * @trancendos/hive
 * The HIVE — Bio-Inspired Swarm Data Router
 * Bee Colony Architecture | Data Classification | Secure Routing | Service Discovery
 */

export { HiveService } from './HiveService';

export {
  // Enums
  BeeRole,
  DataClassification,
  UserType,
  ChannelStatus,
  RoutingStrategy,
  MessagePriority,
  MessageStatus,

  // Nodes & Topology
  HiveNode,
  NodeMetrics,
  HiveTopology,

  // Messaging
  HiveMessage,
  MessageHop,
  RoutingDecision,
  SecurityCheck,

  // Channels
  DataChannel,

  // Metrics & Health
  HiveMetrics,
  RouteMetric,
  NodeHealth,
  HiveHealthReport,

  // Service Discovery
  ServiceInfo,
  ServiceDiscoveryResult,

  // Cleanup
  CleanupResult,
} from './HiveService';