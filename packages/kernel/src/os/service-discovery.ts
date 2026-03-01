/**
 * Enhanced Service Discovery
 * 
 * Advanced service discovery system with auto-registration,
 * TTL-based health management, dependency graph tracking,
 * weighted routing, and version-aware discovery.
 * 
 * Architecture:
 * ```
 * ServiceDiscovery
 *   ├── AutoRegistration (TTL, heartbeat, deregistration)
 *   ├── DependencyGraph (service relationships, topological sort)
 *   ├── WeightedRouter (load-based, latency-based, round-robin)
 *   └── VersionedDiscovery (version negotiation, compatibility)
 * ```
 */

// ============================================================
// TYPES
// ============================================================

export type ServiceStatus = 'registering' | 'healthy' | 'degraded' | 'unhealthy' | 'draining' | 'deregistered';
export type RoutingStrategy = 'round-robin' | 'weighted' | 'least-connections' | 'latency-based' | 'random';
export type HealthCheckProtocol = 'http' | 'tcp' | 'grpc' | 'script';

export interface DiscoverableService {
  /** Unique service instance ID */
  instanceId: string;
  /** Service name/type */
  serviceName: string;
  /** Service version */
  version: string;
  /** Host address */
  host: string;
  /** Port number */
  port: number;
  /** Protocol */
  protocol: 'http' | 'https' | 'grpc' | 'ws' | 'wss';
  /** Service status */
  status: ServiceStatus;
  /** Service metadata */
  metadata: ServiceMetadata;
  /** Health check configuration */
  healthCheck: DiscoveryHealthCheck;
  /** Registration timestamp */
  registeredAt: number;
  /** Last heartbeat timestamp */
  lastHeartbeat: number;
  /** TTL in milliseconds */
  ttlMs: number;
  /** Service weight for load balancing (0-100) */
  weight: number;
  /** Current load (0-100) */
  load: number;
  /** Average response latency (ms) */
  latency: number;
  /** Active connections count */
  activeConnections: number;
  /** Tags for filtering */
  tags: string[];
  /** Service dependencies */
  dependencies: string[];
  /** Capabilities exposed */
  capabilities: string[];
}

export interface ServiceMetadata {
  /** Environment (production, staging, development) */
  environment: string;
  /** Region/zone */
  region?: string;
  /** Zone */
  zone?: string;
  /** Deployment ID */
  deploymentId?: string;
  /** Container/pod ID */
  containerId?: string;
  /** Custom metadata */
  custom: Record<string, string>;
}

export interface DiscoveryHealthCheck {
  /** Health check protocol */
  protocol: HealthCheckProtocol;
  /** Health check path (for HTTP) */
  path?: string;
  /** Check interval in ms */
  intervalMs: number;
  /** Timeout in ms */
  timeoutMs: number;
  /** Failures before unhealthy */
  unhealthyThreshold: number;
  /** Successes before healthy */
  healthyThreshold: number;
  /** Consecutive failures */
  consecutiveFailures: number;
  /** Consecutive successes */
  consecutiveSuccesses: number;
  /** Last check timestamp */
  lastCheckAt: number;
  /** Last check result */
  lastCheckResult: 'pass' | 'fail' | 'unknown';
}

export interface DiscoveryEvent {
  type: 'service:registered' | 'service:deregistered' | 'service:healthy' |
    'service:unhealthy' | 'service:degraded' | 'service:heartbeat' |
    'service:expired' | 'service:draining' | 'discovery:topology-changed';
  instanceId: string;
  serviceName: string;
  payload: Record<string, unknown>;
  timestamp: number;
}

export interface DiscoveryQuery {
  /** Service name to discover */
  serviceName: string;
  /** Required version range */
  versionRange?: string;
  /** Required tags */
  tags?: string[];
  /** Required capabilities */
  capabilities?: string[];
  /** Environment filter */
  environment?: string;
  /** Region filter */
  region?: string;
  /** Only healthy instances */
  healthyOnly?: boolean;
  /** Routing strategy */
  routingStrategy?: RoutingStrategy;
  /** Maximum results */
  limit?: number;
}

export interface DependencyNode {
  serviceName: string;
  dependencies: string[];
  dependents: string[];
  depth: number;
  critical: boolean;
}

// ============================================================
// SERVICE DISCOVERY
// ============================================================

export class ServiceDiscovery {
  private services: Map<string, DiscoverableService> = new Map();
  private servicesByName: Map<string, Set<string>> = new Map();
  private listeners: Map<string, Set<(event: DiscoveryEvent) => void>> = new Map();
  private healthCheckTimers: Map<string, ReturnType<typeof setInterval>> = new Map();
  private roundRobinCounters: Map<string, number> = new Map();
  private expirationTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private options: { expirationCheckIntervalMs?: number } = {}) {
    this.startExpirationChecker();
    console.log('[ServiceDiscovery] Initialized');
  }

  // ============================================================
  // REGISTRATION
  // ============================================================

  /**
   * Register a service instance
   */
  register(service: Omit<DiscoverableService, 'registeredAt' | 'lastHeartbeat' | 'status'>): DiscoverableService {
    const fullService: DiscoverableService = {
      ...service,
      status: 'registering',
      registeredAt: Date.now(),
      lastHeartbeat: Date.now(),
    };

    this.services.set(service.instanceId, fullService);

    // Index by service name
    if (!this.servicesByName.has(service.serviceName)) {
      this.servicesByName.set(service.serviceName, new Set());
    }
    this.servicesByName.get(service.serviceName)!.add(service.instanceId);

    // Mark as healthy after registration
    fullService.status = 'healthy';
    fullService.healthCheck.consecutiveSuccesses = fullService.healthCheck.healthyThreshold;
    fullService.healthCheck.lastCheckResult = 'pass';
    fullService.healthCheck.lastCheckAt = Date.now();

    this.emit({
      type: 'service:registered',
      instanceId: service.instanceId,
      serviceName: service.serviceName,
      payload: {
        version: service.version,
        host: service.host,
        port: service.port,
      },
      timestamp: Date.now(),
    });

    console.log(`[ServiceDiscovery] Registered: ${service.serviceName}@${service.version} (${service.instanceId})`);
    return fullService;
  }

  /**
   * Deregister a service instance
   */
  deregister(instanceId: string): boolean {
    const service = this.services.get(instanceId);
    if (!service) return false;

    service.status = 'deregistered';
    this.services.delete(instanceId);
    this.servicesByName.get(service.serviceName)?.delete(instanceId);

    // Clean up empty name sets
    if (this.servicesByName.get(service.serviceName)?.size === 0) {
      this.servicesByName.delete(service.serviceName);
    }

    // Stop health check timer
    const timer = this.healthCheckTimers.get(instanceId);
    if (timer) {
      clearInterval(timer);
      this.healthCheckTimers.delete(instanceId);
    }

    this.emit({
      type: 'service:deregistered',
      instanceId,
      serviceName: service.serviceName,
      payload: {},
      timestamp: Date.now(),
    });

    console.log(`[ServiceDiscovery] Deregistered: ${service.serviceName} (${instanceId})`);
    return true;
  }

  /**
   * Send a heartbeat for a service instance
   */
  heartbeat(instanceId: string, metrics?: { load?: number; latency?: number; activeConnections?: number }): boolean {
    const service = this.services.get(instanceId);
    if (!service) return false;

    service.lastHeartbeat = Date.now();

    if (metrics) {
      if (metrics.load !== undefined) service.load = metrics.load;
      if (metrics.latency !== undefined) service.latency = metrics.latency;
      if (metrics.activeConnections !== undefined) service.activeConnections = metrics.activeConnections;
    }

    // Auto-recover from unhealthy if heartbeat received
    if (service.status === 'unhealthy') {
      service.healthCheck.consecutiveFailures = 0;
      service.healthCheck.consecutiveSuccesses++;
      if (service.healthCheck.consecutiveSuccesses >= service.healthCheck.healthyThreshold) {
        service.status = 'healthy';
        this.emit({
          type: 'service:healthy',
          instanceId,
          serviceName: service.serviceName,
          payload: {},
          timestamp: Date.now(),
        });
      }
    }

    return true;
  }

  /**
   * Mark a service as draining (no new connections)
   */
  drain(instanceId: string): boolean {
    const service = this.services.get(instanceId);
    if (!service) return false;

    service.status = 'draining';
    this.emit({
      type: 'service:draining',
      instanceId,
      serviceName: service.serviceName,
      payload: {},
      timestamp: Date.now(),
    });

    return true;
  }

  // ============================================================
  // DISCOVERY
  // ============================================================

  /**
   * Discover service instances matching a query
   */
  discover(query: DiscoveryQuery): DiscoverableService[] {
    const instanceIds = this.servicesByName.get(query.serviceName);
    if (!instanceIds || instanceIds.size === 0) return [];

    let instances = Array.from(instanceIds)
      .map(id => this.services.get(id)!)
      .filter(Boolean);

    // Filter by health
    if (query.healthyOnly !== false) {
      instances = instances.filter(s => s.status === 'healthy');
    }

    // Filter by version
    if (query.versionRange) {
      const range = query.versionRange;
      instances = instances.filter(s => this.versionSatisfies(s.version, range));
    }

    // Filter by tags
    if (query.tags && query.tags.length > 0) {
      instances = instances.filter(s =>
        query.tags!.every(t => s.tags.includes(t))
      );
    }

    // Filter by capabilities
    if (query.capabilities && query.capabilities.length > 0) {
      instances = instances.filter(s =>
        query.capabilities!.every(c => s.capabilities.includes(c))
      );
    }

    // Filter by environment
    if (query.environment) {
      instances = instances.filter(s => s.metadata.environment === query.environment);
    }

    // Filter by region
    if (query.region) {
      instances = instances.filter(s => s.metadata.region === query.region);
    }

    // Apply routing strategy
    const strategy = query.routingStrategy || 'round-robin';
    instances = this.applyRoutingStrategy(instances, query.serviceName, strategy);

    // Apply limit
    if (query.limit) {
      instances = instances.slice(0, query.limit);
    }

    return instances;
  }

  /**
   * Discover a single best instance
   */
  discoverOne(query: DiscoveryQuery): DiscoverableService | null {
    const results = this.discover({ ...query, limit: 1 });
    return results[0] || null;
  }

  /**
   * Get the URL for a discovered service
   */
  getServiceUrl(query: DiscoveryQuery): string | null {
    const instance = this.discoverOne(query);
    if (!instance) return null;
    return `${instance.protocol}://${instance.host}:${instance.port}`;
  }

  // ============================================================
  // DEPENDENCY GRAPH
  // ============================================================

  /**
   * Build the service dependency graph
   */
  buildDependencyGraph(): Map<string, DependencyNode> {
    const graph = new Map<string, DependencyNode>();

    // Initialize nodes
    for (const serviceName of this.servicesByName.keys()) {
      graph.set(serviceName, {
        serviceName,
        dependencies: [],
        dependents: [],
        depth: 0,
        critical: false,
      });
    }

    // Build edges from service dependencies
    for (const service of this.services.values()) {
      const node = graph.get(service.serviceName);
      if (!node) continue;

      for (const dep of service.dependencies) {
        if (!node.dependencies.includes(dep)) {
          node.dependencies.push(dep);
        }

        // Add reverse edge
        const depNode = graph.get(dep);
        if (depNode && !depNode.dependents.includes(service.serviceName)) {
          depNode.dependents.push(service.serviceName);
        }
      }
    }

    // Calculate depths and critical status
    this.calculateDepths(graph);
    this.markCriticalServices(graph);

    return graph;
  }

  /**
   * Get topological sort order (startup order)
   */
  getStartupOrder(): string[] {
    const graph = this.buildDependencyGraph();
    const visited = new Set<string>();
    const order: string[] = [];

    const visit = (name: string) => {
      if (visited.has(name)) return;
      visited.add(name);

      const node = graph.get(name);
      if (node) {
        for (const dep of node.dependencies) {
          visit(dep);
        }
      }
      order.push(name);
    };

    for (const name of graph.keys()) {
      visit(name);
    }

    return order;
  }

  /**
   * Get shutdown order (reverse of startup)
   */
  getShutdownOrder(): string[] {
    return this.getStartupOrder().reverse();
  }

  /**
   * Check if removing a service would break dependencies
   */
  getImpactAnalysis(serviceName: string): {
    directDependents: string[];
    transitiveDependents: string[];
    canSafelyRemove: boolean;
  } {
    const graph = this.buildDependencyGraph();
    const node = graph.get(serviceName);

    if (!node) {
      return { directDependents: [], transitiveDependents: [], canSafelyRemove: true };
    }

    const transitive = new Set<string>();
    const queue = [...node.dependents];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (transitive.has(current)) continue;
      transitive.add(current);

      const currentNode = graph.get(current);
      if (currentNode) {
        queue.push(...currentNode.dependents);
      }
    }

    return {
      directDependents: node.dependents,
      transitiveDependents: Array.from(transitive),
      canSafelyRemove: node.dependents.length === 0,
    };
  }

  // ============================================================
  // QUERY METHODS
  // ============================================================

  /**
   * Get all registered services
   */
  getAllServices(): DiscoverableService[] {
    return Array.from(this.services.values());
  }

  /**
   * Get service by instance ID
   */
  getInstance(instanceId: string): DiscoverableService | undefined {
    return this.services.get(instanceId);
  }

  /**
   * Get all instances of a service
   */
  getInstances(serviceName: string): DiscoverableService[] {
    const ids = this.servicesByName.get(serviceName);
    if (!ids) return [];
    return Array.from(ids).map(id => this.services.get(id)!).filter(Boolean);
  }

  /**
   * Get all registered service names
   */
  getServiceNames(): string[] {
    return Array.from(this.servicesByName.keys());
  }

  /**
   * Get service count
   */
  getServiceCount(): { total: number; healthy: number; unhealthy: number; draining: number } {
    let healthy = 0, unhealthy = 0, draining = 0;
    for (const service of this.services.values()) {
      if (service.status === 'healthy') healthy++;
      else if (service.status === 'unhealthy') unhealthy++;
      else if (service.status === 'draining') draining++;
    }
    return { total: this.services.size, healthy, unhealthy, draining };
  }

  /**
   * Get discovery stats
   */
  getStats(): {
    totalInstances: number;
    totalServices: number;
    healthyInstances: number;
    averageLoad: number;
    averageLatency: number;
  } {
    const instances = Array.from(this.services.values());
    const healthy = instances.filter(s => s.status === 'healthy');

    return {
      totalInstances: instances.length,
      totalServices: this.servicesByName.size,
      healthyInstances: healthy.length,
      averageLoad: instances.length > 0
        ? instances.reduce((sum, s) => sum + s.load, 0) / instances.length
        : 0,
      averageLatency: instances.length > 0
        ? instances.reduce((sum, s) => sum + s.latency, 0) / instances.length
        : 0,
    };
  }

  // ============================================================
  // EVENT SYSTEM
  // ============================================================

  on(type: DiscoveryEvent['type'] | '*', handler: (event: DiscoveryEvent) => void): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(handler);
    return () => this.listeners.get(type)?.delete(handler);
  }

  private emit(event: DiscoveryEvent): void {
    this.listeners.get(event.type)?.forEach(h => h(event));
    this.listeners.get('*')?.forEach(h => h(event));
  }

  // ============================================================
  // CLEANUP
  // ============================================================

  /**
   * Stop the discovery system
   */
  destroy(): void {
    if (this.expirationTimer) {
      clearInterval(this.expirationTimer);
      this.expirationTimer = null;
    }
    for (const timer of this.healthCheckTimers.values()) {
      clearInterval(timer);
    }
    this.healthCheckTimers.clear();
    console.log('[ServiceDiscovery] Destroyed');
  }

  // ============================================================
  // PRIVATE METHODS
  // ============================================================

  private applyRoutingStrategy(
    instances: DiscoverableService[],
    serviceName: string,
    strategy: RoutingStrategy
  ): DiscoverableService[] {
    switch (strategy) {
      case 'round-robin': {
        const counter = (this.roundRobinCounters.get(serviceName) || 0) + 1;
        this.roundRobinCounters.set(serviceName, counter);
        const startIdx = counter % instances.length;
        return [...instances.slice(startIdx), ...instances.slice(0, startIdx)];
      }

      case 'weighted':
        return [...instances].sort((a, b) => b.weight - a.weight);

      case 'least-connections':
        return [...instances].sort((a, b) => a.activeConnections - b.activeConnections);

      case 'latency-based':
        return [...instances].sort((a, b) => a.latency - b.latency);

      case 'random':
        return [...instances].sort(() => Math.random() - 0.5);

      default:
        return instances;
    }
  }

  private startExpirationChecker(): void {
    const interval = this.options.expirationCheckIntervalMs || 10000;
    this.expirationTimer = setInterval(() => {
      this.checkExpirations();
    }, interval);

    // Prevent timer from keeping process alive in Node.js
    if (this.expirationTimer && typeof this.expirationTimer === 'object' && 'unref' in this.expirationTimer) {
      (this.expirationTimer as any).unref();
    }
  }

  private checkExpirations(): void {
    const now = Date.now();
    for (const [instanceId, service] of this.services) {
      if (service.status === 'deregistered') continue;

      const elapsed = now - service.lastHeartbeat;
      if (elapsed > service.ttlMs) {
        // TTL expired
        service.status = 'unhealthy';
        service.healthCheck.consecutiveFailures++;
        service.healthCheck.consecutiveSuccesses = 0;
        service.healthCheck.lastCheckResult = 'fail';
        service.healthCheck.lastCheckAt = now;

        this.emit({
          type: 'service:expired',
          instanceId,
          serviceName: service.serviceName,
          payload: { elapsed, ttl: service.ttlMs },
          timestamp: now,
        });

        // Auto-deregister after 3x TTL
        if (elapsed > service.ttlMs * 3) {
          this.deregister(instanceId);
        }
      }
    }
  }

  private versionSatisfies(version: string, range: string): boolean {
    if (range === '*') return true;
    if (range === version) return true;

    const vParts = version.split('.').map(Number);
    const rParts = range.replace(/^[\^~>=<]+/, '').split('.').map(Number);

    if (range.startsWith('^')) {
      return vParts[0] === rParts[0] && (vParts[1] > rParts[1] || (vParts[1] === rParts[1] && vParts[2] >= rParts[2]));
    }
    if (range.startsWith('~')) {
      return vParts[0] === rParts[0] && vParts[1] === rParts[1] && vParts[2] >= rParts[2];
    }
    if (range.startsWith('>=')) {
      return vParts[0] > rParts[0] || (vParts[0] === rParts[0] && (vParts[1] > rParts[1] || (vParts[1] === rParts[1] && vParts[2] >= rParts[2])));
    }

    return false;
  }

  private calculateDepths(graph: Map<string, DependencyNode>): void {
    const calculateDepth = (name: string, visited: Set<string>): number => {
      if (visited.has(name)) return 0;
      visited.add(name);

      const node = graph.get(name);
      if (!node || node.dependencies.length === 0) return 0;

      let maxDepth = 0;
      for (const dep of node.dependencies) {
        maxDepth = Math.max(maxDepth, 1 + calculateDepth(dep, visited));
      }

      node.depth = maxDepth;
      return maxDepth;
    };

    for (const name of graph.keys()) {
      calculateDepth(name, new Set());
    }
  }

  private markCriticalServices(graph: Map<string, DependencyNode>): void {
    for (const node of graph.values()) {
      // A service is critical if it has 2+ dependents or is a transitive dependency of many
      node.critical = node.dependents.length >= 2;
    }
  }
}