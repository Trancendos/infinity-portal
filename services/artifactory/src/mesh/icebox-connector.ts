/**
 * THE ARTIFACTORY — Ice Box Connector
 * Integration with the-ice-box (Cold Storage & Archival).
 *
 * Manages artifact archival to cold storage tiers, retrieval
 * from archive, and retention policy enforcement.
 *
 * @module mesh/icebox-connector
 * @version 1.0.0
 */

import { BaseMeshConnector, createMeshServiceConfig, type MeshResponse } from './base-connector.js';

interface ArchiveRequest {
  artifactId: string;
  tenantId: string;
  repositoryId: string;
  artifactName: string;
  version: string;
  contentHash: string;
  sizeBytes: number;
  sourceStoragePath: string;
  retentionPolicy: {
    retainUntil: string;
    deleteAfter?: string;
    legalHold: boolean;
  };
  metadata: Record<string, unknown>;
}

interface ArchiveRecord {
  archiveId: string;
  artifactId: string;
  storagePath: string;
  archivedAt: string;
  sizeBytes: number;
  status: 'archived' | 'restoring' | 'restored' | 'expired' | 'deleted';
  restorationEta?: string;
}

interface RestoreRequest {
  archiveId: string;
  targetStoragePath: string;
  priority: 'standard' | 'expedited' | 'bulk';
  expiresAfterHours: number;
}

export class IceBoxConnector extends BaseMeshConnector {
  constructor(baseUrl: string) {
    super(createMeshServiceConfig('the-ice-box', baseUrl, 3019, {
      timeoutMs: 30_000, // Archival operations can be slow
      retryAttempts: 5,
    }));
  }

  /**
   * Archive an artifact to cold storage.
   */
  async archiveArtifact(request: ArchiveRequest): Promise<MeshResponse<ArchiveRecord>> {
    return this.request<ArchiveRecord>('POST', '/api/v1/archives', {
      body: request,
    });
  }

  /**
   * Request restoration of an archived artifact.
   */
  async restoreArtifact(request: RestoreRequest): Promise<MeshResponse<ArchiveRecord>> {
    return this.request<ArchiveRecord>(
      'POST',
      `/api/v1/archives/${request.archiveId}/restore`,
      { body: request }
    );
  }

  /**
   * Check the status of an archive or restoration.
   */
  async getArchiveStatus(archiveId: string): Promise<MeshResponse<ArchiveRecord>> {
    return this.request<ArchiveRecord>('GET', `/api/v1/archives/${archiveId}`);
  }

  /**
   * List all archives for a tenant.
   */
  async listArchives(
    tenantId: string,
    options: { limit?: number; offset?: number; status?: string } = {}
  ): Promise<MeshResponse<{ archives: ArchiveRecord[]; total: number }>> {
    const params = new URLSearchParams();
    if (options.limit) params.set('limit', String(options.limit));
    if (options.offset) params.set('offset', String(options.offset));
    if (options.status) params.set('status', options.status);
    const qs = params.toString();
    return this.request('GET', `/api/v1/tenants/${tenantId}/archives${qs ? `?${qs}` : ''}`);
  }

  /**
   * Delete an archive permanently (after retention expiry).
   */
  async deleteArchive(archiveId: string, reason: string): Promise<MeshResponse> {
    return this.request('DELETE', `/api/v1/archives/${archiveId}`, {
      body: { reason, source: 'the-artifactory' },
    });
  }

  /**
   * Apply retention policy to all archives for a tenant.
   */
  async enforceRetention(tenantId: string): Promise<MeshResponse<{
    evaluated: number;
    expired: number;
    deleted: number;
  }>> {
    return this.request('POST', `/api/v1/tenants/${tenantId}/retention/enforce`, {
      body: { source: 'the-artifactory' },
      timeout: 60_000,
    });
  }

  /**
   * Get storage statistics from the-ice-box.
   */
  async getStorageStats(tenantId: string): Promise<MeshResponse<{
    totalArchived: number;
    totalBytes: number;
    oldestArchive: string;
    newestArchive: string;
  }>> {
    return this.request('GET', `/api/v1/tenants/${tenantId}/archives/stats`);
  }
}