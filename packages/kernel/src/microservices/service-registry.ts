/**
 * Service Registry
 * 
 * Central registry for microservice discovery and management.
 * Supports service registration, discovery, health monitoring,
 * and load balancing across service instances.
 */

export interface ServiceInstance {
  /** Unique instance ID */
  id: string;
  /** Service name */
  name: string;
  /** Service version */
  version: string;
  /** Host address */
  host: string;
  /** Port number */
  port: number;
  /** Service protocol */
  protocol: 'http' | 'https' | 'grpc';
  /** Health status */
  status: 'healthy' | 'degraded' | 'unhealthy' | 'starting' | 'stopping';
  /** Service metadata */
  metadata: Record<string, string>;
  /** Service tags for filtering */
  tags: string[];
  /** Registration timestamp */
  registeredAt: number;
  /** Last heartbeat timestamp */
  lastHeartbeat: number;
  /** Service weight for load balancing */
  weight: number;
}

export interface ServiceRegistryOptions {
  /** Heartbeat interval in ms */
  heartbeatInterval: number;
  /** Time before marking instance as unhealthy */
  unhealthyTimeout: number;
  /** Time before deregistering instance */
  deregisterTimeout: number;
  /** Callback for service events */
  onEvent?: (event: ServiceEvent) => void;
}

export interface ServiceEvent {
  type: 'registered' | 'deregistered' | 'healthy' | 'unhealthy' | 'degraded';
  instance: ServiceInstance;
  timestamp: number;
}

export class ServiceRegistry {
  private instances: Map<string, ServiceInstance> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(private readonly options: ServiceRegistryOptions) {
    this.cleanupInterval = setInterval(
      () => this.cleanup(),
      options.heartbeatInterval
    );
  }

  /**
   * Register a service instance
   */
  register(instance: Omit<ServiceInstance, 'registeredAt' | 'lastHeartbeat'>): ServiceInstance {
    const now = Date.now();
    const fullInstance: ServiceInstance = {
      ...instance,
      registeredAt: now,
      lastHeartbeat: now,
    };

    this.instances.set(instance.id, fullInstance);
    this.emitEvent('registered', fullInstance);
    return fullInstance;
  }

  /**
   * Deregister a service instance
   */
  deregister(instanceId: string): boolean {
    const instance = this.instances.get(instanceId);
    if (!instance) return false;

    this.instances.delete(instanceId);
    this.emitEvent('deregistered', instance);
    return true;
  }

  /**
   * Send heartbeat for an instance
   */
  heartbeat(instanceId: string, status?: ServiceInstance['status']): boolean {
    const instance = this.instances.get(instanceId);
    if (!instance) return false;

    instance.lastHeartbeat = Date.now();
    if (status) {
      const oldStatus = instance.status;
      instance.status = status;
      if (oldStatus !== status) {
        this.emitEvent(status as any, instance);
      }
    }

    return true;
  }

  /**
   * Discover service instances by name
   */
  discover(serviceName: string, options?: { healthy?: boolean; tags?: string[] }): ServiceInstance[] {
    let instances = Array.from(this.instances.values())
      .filter(i => i.name === serviceName);

    if (options?.healthy !== false) {
      instances = instances.filter(i => i.status === 'healthy' || i.status === 'degraded');
    }

    if (options?.tags?.length) {
      instances = instances.filter(i =>
        options.tags!.every(tag => i.tags.includes(tag))
      );
    }

    return instances;
  }

  /**
   * Get a single instance using round-robin load balancing
   */
  private roundRobinCounters: Map<string, number> = new Map();

  resolve(serviceName: string): ServiceInstance | null {
    const instances = this.discover(serviceName);
    if (instances.length === 0) return null;

    // Weighted round-robin
    const counter = (this.roundRobinCounters.get(serviceName) || 0) + 1;
    this.roundRobinCounters.set(serviceName, counter);

    const totalWeight = instances.reduce((sum, i) => sum + i.weight, 0);
    let target = counter % totalWeight;

    for (const instance of instances) {
      target -= instance.weight;
      if (target <= 0) return instance;
    }

    return instances[0];
  }

  /**
   * Get service URL
   */
  getServiceUrl(serviceName: string): string | null {
    const instance = this.resolve(serviceName);
    if (!instance) return null;
    return `${instance.protocol}://${instance.host}:${instance.port}`;
  }

  /**
   * Get all registered services
   */
  getServices(): Map<string, ServiceInstance[]> {
    const services = new Map<string, ServiceInstance[]>();
    for (const instance of this.instances.values()) {
      const existing = services.get(instance.name) || [];
      existing.push(instance);
      services.set(instance.name, existing);
    }
    return services;
  }

  /**
   * Get all instances
   */
  getAllInstances(): ServiceInstance[] {
    return Array.from(this.instances.values());
  }

  /**
   * Get instance by ID
   */
  getInstance(instanceId: string): ServiceInstance | undefined {
    return this.instances.get(instanceId);
  }

  /**
   * Cleanup stale instances
   */
  private cleanup(): void {
    const now = Date.now();

    for (const [id, instance] of this.instances.entries()) {
      const timeSinceHeartbeat = now - instance.lastHeartbeat;

      if (timeSinceHeartbeat > this.options.deregisterTimeout) {
        this.instances.delete(id);
        this.emitEvent('deregistered', instance);
      } else if (timeSinceHeartbeat > this.options.unhealthyTimeout) {
        if (instance.status !== 'unhealthy') {
          instance.status = 'unhealthy';
          this.emitEvent('unhealthy', instance);
        }
      }
    }
  }

  /**
   * Emit service event
   */
  private emitEvent(type: ServiceEvent['type'], instance: ServiceInstance): void {
    this.options.onEvent?.({
      type,
      instance,
      timestamp: Date.now(),
    });
  }

  /**
   * Destroy the registry
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.instances.clear();
  }
}