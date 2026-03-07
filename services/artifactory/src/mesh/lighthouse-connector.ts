/**
 * THE ARTIFACTORY — Lighthouse Connector
 * Integration with the-lighthouse (Service Discovery & Health).
 *
 * Registers the-artifactory for discovery, reports heartbeats,
 * and queries for other mesh service locations.
 *
 * @module mesh/lighthouse-connector
 * @version 1.0.0
 */

import { BaseMeshConnector, createMeshServiceConfig, type MeshResponse } from './base-connector.js';

interface ServiceInstance {
  serviceName: string;
  instanceId: string;
  host: string;
  port: number;
  version: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  metadata: Record<string, string>;
  registeredAt: string;
  lastHeartbeat: string;
}

interface DiscoveryQuery {
  serviceName: string;
  version?: string;
  status?: 'healthy' | 'degraded';
  tags?: Record<string, string>;
}

export class LighthouseConnector extends BaseMeshConnector {
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private instanceId: string;

  constructor(baseUrl: string) {
    super(createMeshServiceConfig('the-lighthouse', baseUrl, 3016, {
      retryAttempts: 5,
      circuitBreakerThreshold: 10,
    }));
    this.instanceId = crypto.randomUUID();
  }

  /**
   * Initialize and register with the-lighthouse.
   */
  async initialize(): Promise<void> {
    await super.initialize();

    // Register this instance
    await this.register();

    // Send heartbeats every 15 seconds
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat().catch(() => {});
    }, 15_000);
  }

  /**
   * Deregister and shut down.
   */
  async shutdown(): Promise<void> {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    await this.deregister();
    await super.shutdown();
  }

  /**
   * Register the-artifactory instance with the-lighthouse.
   */
  async register(): Promise<MeshResponse> {
    return this.request('POST', '/api/v1/services/register', {
      body: {
        serviceName: 'the-artifactory',
        instanceId: this.instanceId,
        host: process.env.HOSTNAME ?? 'localhost',
        port: 3020,
        version: '1.0.0',
        status: 'healthy',
        metadata: {
          type: 'artifact-registry',
          protocols: 'npm,docker,helm,terraform,pypi,generic',
          multiTenant: 'true',
        },
        capabilities: [
          'artifact-storage',
          'artifact-retrieval',
          'security-scanning',
          'dependency-resolution',
          'content-addressable-storage',
        ],
      },
    });
  }

  /**
   * Deregister this instance.
   */
  async deregister(): Promise<MeshResponse> {
    return this.request('DELETE', `/api/v1/services/the-artifactory/${this.instanceId}`);
  }

  /**
   * Send heartbeat to maintain registration.
   */
  async sendHeartbeat(): Promise<MeshResponse> {
    return this.request('PUT', `/api/v1/services/the-artifactory/${this.instanceId}/heartbeat`, {
      body: {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage().heapUsed,
      },
    });
  }

  /**
   * Discover instances of a mesh service.
   */
  async discover(query: DiscoveryQuery): Promise<MeshResponse<ServiceInstance[]>> {
    const params = new URLSearchParams();
    if (query.version) params.set('version', query.version);
    if (query.status) params.set('status', query.status);
    if (query.tags) {
      for (const [k, v] of Object.entries(query.tags)) {
        params.set(`tag.${k}`, v);
      }
    }
    const qs = params.toString();
    return this.request<ServiceInstance[]>(
      'GET',
      `/api/v1/services/${query.serviceName}/instances${qs ? `?${qs}` : ''}`
    );
  }

  /**
   * Get the best available instance of a service (load-balanced).
   */
  async resolve(serviceName: string): Promise<MeshResponse<ServiceInstance>> {
    return this.request<ServiceInstance>(
      'GET',
      `/api/v1/services/${serviceName}/resolve`
    );
  }

  /**
   * Get the instance ID for this registration.
   */
  getInstanceId(): string {
    return this.instanceId;
  }
}