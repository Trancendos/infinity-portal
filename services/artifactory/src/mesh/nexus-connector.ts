/**
 * THE ARTIFACTORY — Nexus Connector
 * Integration with the-nexus (API Gateway & Service Mesh Router).
 * Port: 3014
 *
 * Registers artifactory routes, reports health, and receives
 * mesh-wide configuration broadcasts from the-nexus.
 *
 * @module mesh/nexus-connector
 * @version 1.0.0
 */

import { BaseMeshConnector, createMeshServiceConfig, type MeshResponse } from './base-connector.js';

interface ServiceRegistration {
  serviceName: string;
  version: string;
  endpoints: Array<{
    method: string;
    path: string;
    description: string;
    auth: boolean;
    rateLimit?: number;
  }>;
  healthEndpoint: string;
  port: number;
}

interface RouteConfig {
  routes: Array<{
    path: string;
    target: string;
    methods: string[];
    middleware: string[];
  }>;
}

export class NexusConnector extends BaseMeshConnector {
  constructor(baseUrl: string) {
    super(createMeshServiceConfig('the-nexus', baseUrl, 3014));
  }

  /**
   * Register the-artifactory with the-nexus service mesh.
   */
  async registerService(registration: ServiceRegistration): Promise<MeshResponse> {
    return this.request('POST', '/api/v1/services/register', {
      body: registration,
    });
  }

  /**
   * Deregister from the mesh (graceful shutdown).
   */
  async deregisterService(serviceName: string): Promise<MeshResponse> {
    return this.request('DELETE', `/api/v1/services/${serviceName}`);
  }

  /**
   * Report health status to the-nexus.
   */
  async reportHealth(status: {
    healthy: boolean;
    uptime: number;
    version: string;
    checks: Record<string, boolean>;
  }): Promise<MeshResponse> {
    return this.request('PUT', '/api/v1/services/the-artifactory/health', {
      body: status,
    });
  }

  /**
   * Fetch current route configuration from the-nexus.
   */
  async getRouteConfig(): Promise<MeshResponse<RouteConfig>> {
    return this.request<RouteConfig>('GET', '/api/v1/routes/the-artifactory');
  }

  /**
   * Notify the-nexus of a new artifact type endpoint.
   */
  async registerEndpoint(endpoint: {
    method: string;
    path: string;
    description: string;
    auth: boolean;
  }): Promise<MeshResponse> {
    return this.request('POST', '/api/v1/services/the-artifactory/endpoints', {
      body: endpoint,
    });
  }
}