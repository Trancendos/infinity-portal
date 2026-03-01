/**
 * Microservices Module
 * 
 * Provides the complete microservice infrastructure for Infinity Portal:
 * - Service Registry: Service discovery and load balancing
 * - API Gateway: Request routing, auth, rate limiting
 * - Event Bus: Async inter-service communication
 * 
 * Architecture:
 * ```
 * Client → API Gateway → Service Registry → Microservice
 *                              ↕
 *                          Event Bus
 *                              ↕
 *                     Other Microservices
 * ```
 */

export {
  ServiceRegistry,
  type ServiceInstance,
  type ServiceRegistryOptions,
  type ServiceEvent,
} from './service-registry';

export {
  defaultGatewayConfig,
  serviceManifests,
  type RouteConfig,
  type CorsConfig,
  type GatewayConfig,
  type ServiceManifest,
} from './api-gateway';

export {
  EventBus,
  EventTypes,
  type Event,
  type EventMetadata,
  type EventSubscription,
  type EventHandler,
  type EventBusOptions,
  type EventBusMetric,
} from './event-bus';