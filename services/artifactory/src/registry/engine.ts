/**
 * Registry Engine — Content-Addressable Artifact Storage Core
 * 
 * The heart of the Artifactory. Protocol-agnostic — it doesn't know
 * about npm, Docker, or Helm. Protocol handlers translate between
 * wire protocols and this engine's generic interface.
 * 
 * Every mutation emits an event for mesh integration and auditability.
 */

import { randomUUID } from 'crypto';
import { createHash } from 'crypto';
import { createModuleLogger } from '../utils/logger.js';
import type { StorageBackend } from '../storage/backend.js';
import type { Artifact, ArtifactType, LifecycleEnvironment, StorageTier } from './schemas.js';

const log = createModuleLogger('registry:engine');

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PublishRequest {
  name: string;
  version: string;
  type: ArtifactType;
  data: Buffer;
  tenantId: string;
  repositoryId: string;
  repository: string;
  metadata?: Record<string, unknown>;
  tags?: string[];
  mimeType?: string;
  publisher: {
    userId: string;
    username: string;
    method: 'cli' | 'ci-cd' | 'api' | 'mesh';
    ip?: string;
    userAgent?: string;
  };
}

export interface RetrieveRequest {
  tenantId: string;
  repositoryId: string;
  name: string;
  version: string;
}

export interface SearchRequest {
  query: string;
  type?: ArtifactType;
  tenantId?: string;
  repositoryId?: string;
  environment?: LifecycleEnvironment;
  tags?: string[];
  limit?: number;
  offset?: number;
}

export interface PromoteRequest {
  artifactId: string;
  targetEnvironment: LifecycleEnvironment;
  promotedBy: string;
  reason: string;
}

export interface RegistryEvent {
  id: string;
  type: string;
  artifactId?: string;
  tenantId?: string;
  timestamp: string;
  details: Record<string, unknown>;
}

export interface ArtifactRecord {
  id: string;
  contentHash: string;
  blake3Hash?: string;
  type: ArtifactType;
  name: string;
  version: string;
  tenantId: string;
  repositoryId: string;
  storageKey: string;
  size: number;
  mimeType: string;
  tags: string[];
  metadata: Record<string, unknown>;
  scanned: boolean;
  scanStatus: string;
  signed: boolean;
  quarantined: boolean;
  environment: LifecycleEnvironment;
  storageTier: StorageTier;
  accessCount: number;
  lastAccessedAt: string | null;
  publisherUserId: string;
  publisherUsername: string;
  publisherMethod: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Event Emitter Interface ─────────────────────────────────────────────────

export interface EventEmitter {
  emit(event: RegistryEvent): Promise<void>;
}

// ─── Database Interface ──────────────────────────────────────────────────────

export interface RegistryDatabase {
  insertArtifact(record: ArtifactRecord): Promise<void>;
  getArtifact(id: string): Promise<ArtifactRecord | null>;
  getArtifactByNameVersion(tenantId: string, repositoryId: string, name: string, version: string): Promise<ArtifactRecord | null>;
  updateArtifact(id: string, updates: Partial<ArtifactRecord>): Promise<void>;
  deleteArtifact(id: string): Promise<void>;
  listArtifacts(tenantId: string, repositoryId: string, limit: number, offset: number): Promise<ArtifactRecord[]>;
  searchArtifacts(query: SearchRequest): Promise<{ artifacts: ArtifactRecord[]; total: number }>;
  incrementAccessCount(id: string): Promise<void>;
  insertAuditLog(entry: {
    tenantId: string | null;
    artifactId: string | null;
    action: string;
    actor: string;
    details: Record<string, unknown>;
    traceId?: string;
  }): Promise<void>;
}

// ─── Registry Engine ─────────────────────────────────────────────────────────

export class RegistryEngine {
  private storage: StorageBackend;
  private db: RegistryDatabase;
  private events: EventEmitter;

  constructor(storage: StorageBackend, db: RegistryDatabase, events: EventEmitter) {
    this.storage = storage;
    this.db = db;
    this.events = events;
    log.info('Registry engine initialised');
  }

  /**
   * Publish an artifact to the registry.
   * 
   * 1. Compute content hash (SHA-256 + BLAKE3)
   * 2. Check for duplicates (content-addressable dedup)
   * 3. Store blob in R2
   * 4. Store metadata in PostgreSQL
   * 5. Emit publish event to mesh
   * 6. Return artifact record
   */
  async publish(request: PublishRequest): Promise<ArtifactRecord> {
    const startTime = Date.now();
    const artifactId = randomUUID();

    // 1. Compute content hashes
    const contentHash = `sha256:${createHash('sha256').update(request.data).digest('hex')}`;
    const blake3Hash = `blake3:${createHash('sha256').update(request.data).digest('hex')}`; // TODO: Replace with actual BLAKE3 when available

    log.info({
      artifactId,
      name: request.name,
      version: request.version,
      type: request.type,
      size: request.data.length,
      contentHash,
    }, 'Publishing artifact');

    // 2. Check for duplicate (same name + version in same repo)
    const existing = await this.db.getArtifactByNameVersion(
      request.tenantId,
      request.repositoryId,
      request.name,
      request.version,
    );

    if (existing) {
      // Content-addressable: if hash matches, it's the same artifact — idempotent
      if (existing.contentHash === contentHash) {
        log.info({ artifactId: existing.id, contentHash }, 'Duplicate publish detected — idempotent return');
        return existing;
      }
      throw new RegistryConflictError(
        `Artifact ${request.name}@${request.version} already exists in repository. ` +
        `Use a new version or enable overwrite policy.`
      );
    }

    // 3. Store blob in R2
    const storageKey = this.buildStorageKey(request.tenantId, request.type, request.repository, request.name, request.version, contentHash);

    await this.storage.put(storageKey, request.data, {
      contentType: request.mimeType || 'application/octet-stream',
      metadata: {
        'x-artifact-id': artifactId,
        'x-artifact-type': request.type,
        'x-artifact-name': request.name,
        'x-artifact-version': request.version,
        'x-content-hash': contentHash,
        'x-tenant-id': request.tenantId,
      },
    });

    // 4. Store metadata in PostgreSQL
    const now = new Date().toISOString();
    const record: ArtifactRecord = {
      id: artifactId,
      contentHash,
      blake3Hash,
      type: request.type,
      name: request.name,
      version: request.version,
      tenantId: request.tenantId,
      repositoryId: request.repositoryId,
      storageKey,
      size: request.data.length,
      mimeType: request.mimeType || 'application/octet-stream',
      tags: request.tags || [],
      metadata: request.metadata || {},
      scanned: false,
      scanStatus: 'pending',
      signed: false,
      quarantined: false,
      environment: 'dev',
      storageTier: 'hot',
      accessCount: 0,
      lastAccessedAt: null,
      publisherUserId: request.publisher.userId,
      publisherUsername: request.publisher.username,
      publisherMethod: request.publisher.method,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.insertArtifact(record);

    // 5. Audit log
    await this.db.insertAuditLog({
      tenantId: request.tenantId,
      artifactId,
      action: 'artifact.published',
      actor: request.publisher.username,
      details: {
        name: request.name,
        version: request.version,
        type: request.type,
        size: request.data.length,
        contentHash,
      },
    });

    // 6. Emit event to mesh
    await this.events.emit({
      id: randomUUID(),
      type: 'artifact.published',
      artifactId,
      tenantId: request.tenantId,
      timestamp: now,
      details: {
        name: request.name,
        version: request.version,
        type: request.type,
        size: request.data.length,
        contentHash,
        publisher: request.publisher.username,
      },
    });

    const duration = Date.now() - startTime;
    log.info({ artifactId, duration, contentHash }, 'Artifact published successfully');

    return record;
  }

  /**
   * Retrieve an artifact's binary data.
   * Updates access count and last accessed timestamp.
   */
  async retrieve(request: RetrieveRequest): Promise<{ record: ArtifactRecord; data: Buffer }> {
    const startTime = Date.now();

    const record = await this.db.getArtifactByNameVersion(
      request.tenantId,
      request.repositoryId,
      request.name,
      request.version,
    );

    if (!record) {
      throw new RegistryNotFoundError(
        `Artifact not found: ${request.name}@${request.version}`
      );
    }

    // Quarantine check — quarantined artifacts cannot be served
    if (record.quarantined) {
      throw new RegistryQuarantinedError(
        `Artifact ${request.name}@${request.version} is quarantined: ${record.quarantined}`
      );
    }

    // Retrieve blob from storage
    const result = await this.storage.get(record.storageKey);

    // Integrity verification — content hash must match
    const computedHash = `sha256:${createHash('sha256').update(result.data).digest('hex')}`;
    if (computedHash !== record.contentHash) {
      log.error({
        artifactId: record.id,
        expectedHash: record.contentHash,
        computedHash,
      }, 'INTEGRITY VIOLATION: Content hash mismatch');

      throw new RegistryIntegrityError(
        `Integrity violation for ${request.name}@${request.version}: ` +
        `expected ${record.contentHash}, got ${computedHash}`
      );
    }

    // Update access metrics
    await this.db.incrementAccessCount(record.id);

    const duration = Date.now() - startTime;
    log.debug({ artifactId: record.id, name: request.name, version: request.version, duration }, 'Artifact retrieved');

    return { record, data: result.data };
  }

  /**
   * Get artifact metadata without downloading the binary.
   */
  async getMetadata(artifactId: string): Promise<ArtifactRecord> {
    const record = await this.db.getArtifact(artifactId);
    if (!record) {
      throw new RegistryNotFoundError(`Artifact not found: ${artifactId}`);
    }
    return record;
  }

  /**
   * Search artifacts across the registry.
   */
  async search(request: SearchRequest): Promise<{ artifacts: ArtifactRecord[]; total: number }> {
    return this.db.searchArtifacts(request);
  }

  /**
   * List artifacts in a repository.
   */
  async list(tenantId: string, repositoryId: string, limit: number = 20, offset: number = 0): Promise<ArtifactRecord[]> {
    return this.db.listArtifacts(tenantId, repositoryId, limit, offset);
  }

  /**
   * Promote an artifact to a higher environment.
   * dev → staging → production
   */
  async promote(request: PromoteRequest): Promise<ArtifactRecord> {
    const record = await this.db.getArtifact(request.artifactId);
    if (!record) {
      throw new RegistryNotFoundError(`Artifact not found: ${request.artifactId}`);
    }

    // Validate promotion path
    const validPromotions: Record<string, string[]> = {
      dev: ['staging'],
      staging: ['production'],
      production: [],
      archived: [],
    };

    const allowed = validPromotions[record.environment] || [];
    if (!allowed.includes(request.targetEnvironment)) {
      throw new RegistryValidationError(
        `Cannot promote from ${record.environment} to ${request.targetEnvironment}. ` +
        `Valid targets: ${allowed.join(', ') || 'none'}`
      );
    }

    // Quarantined artifacts cannot be promoted
    if (record.quarantined) {
      throw new RegistryQuarantinedError(
        `Cannot promote quarantined artifact: ${record.name}@${record.version}`
      );
    }

    // Unscanned artifacts cannot be promoted to production
    if (request.targetEnvironment === 'production' && !record.scanned) {
      throw new RegistryValidationError(
        `Cannot promote unscanned artifact to production: ${record.name}@${record.version}`
      );
    }

    const now = new Date().toISOString();
    await this.db.updateArtifact(request.artifactId, {
      environment: request.targetEnvironment,
      promotedAt: now,
      updatedAt: now,
    });

    await this.db.insertAuditLog({
      tenantId: record.tenantId,
      artifactId: request.artifactId,
      action: 'artifact.promoted',
      actor: request.promotedBy,
      details: {
        from: record.environment,
        to: request.targetEnvironment,
        reason: request.reason,
      },
    });

    await this.events.emit({
      id: randomUUID(),
      type: 'artifact.promoted',
      artifactId: request.artifactId,
      tenantId: record.tenantId,
      timestamp: now,
      details: {
        name: record.name,
        version: record.version,
        from: record.environment,
        to: request.targetEnvironment,
        promotedBy: request.promotedBy,
        reason: request.reason,
      },
    });

    log.info({
      artifactId: request.artifactId,
      from: record.environment,
      to: request.targetEnvironment,
    }, 'Artifact promoted');

    return { ...record, environment: request.targetEnvironment, promotedAt: now, updatedAt: now };
  }

  /**
   * Quarantine an artifact — prevents it from being served.
   */
  async quarantine(artifactId: string, reason: string, quarantinedBy: string): Promise<void> {
    const record = await this.db.getArtifact(artifactId);
    if (!record) {
      throw new RegistryNotFoundError(`Artifact not found: ${artifactId}`);
    }

    const now = new Date().toISOString();
    await this.db.updateArtifact(artifactId, {
      quarantined: true,
      updatedAt: now,
    });

    await this.db.insertAuditLog({
      tenantId: record.tenantId,
      artifactId,
      action: 'artifact.quarantined',
      actor: quarantinedBy,
      details: { reason, name: record.name, version: record.version },
    });

    await this.events.emit({
      id: randomUUID(),
      type: 'artifact.quarantined',
      artifactId,
      tenantId: record.tenantId,
      timestamp: now,
      details: {
        name: record.name,
        version: record.version,
        reason,
        quarantinedBy,
      },
    });

    log.warn({ artifactId, reason, quarantinedBy }, 'Artifact quarantined');
  }

  /**
   * Release an artifact from quarantine.
   * Requires security-officer or admin role (enforced at API layer).
   */
  async releaseFromQuarantine(artifactId: string, releasedBy: string, reason: string): Promise<void> {
    const record = await this.db.getArtifact(artifactId);
    if (!record) {
      throw new RegistryNotFoundError(`Artifact not found: ${artifactId}`);
    }

    if (!record.quarantined) {
      throw new RegistryValidationError(`Artifact is not quarantined: ${artifactId}`);
    }

    const now = new Date().toISOString();
    await this.db.updateArtifact(artifactId, {
      quarantined: false,
      updatedAt: now,
    });

    await this.db.insertAuditLog({
      tenantId: record.tenantId,
      artifactId,
      action: 'artifact.released',
      actor: releasedBy,
      details: { reason, name: record.name, version: record.version },
    });

    await this.events.emit({
      id: randomUUID(),
      type: 'artifact.released',
      artifactId,
      tenantId: record.tenantId,
      timestamp: now,
      details: {
        name: record.name,
        version: record.version,
        reason,
        releasedBy,
      },
    });

    log.info({ artifactId, releasedBy, reason }, 'Artifact released from quarantine');
  }

  /**
   * Delete an artifact from the registry.
   * Removes both the blob and metadata.
   */
  async delete(artifactId: string, deletedBy: string, reason: string): Promise<void> {
    const record = await this.db.getArtifact(artifactId);
    if (!record) {
      throw new RegistryNotFoundError(`Artifact not found: ${artifactId}`);
    }

    // Delete blob from storage
    await this.storage.delete(record.storageKey);

    // Delete metadata from database
    await this.db.deleteArtifact(artifactId);

    await this.db.insertAuditLog({
      tenantId: record.tenantId,
      artifactId,
      action: 'artifact.deleted',
      actor: deletedBy,
      details: {
        reason,
        name: record.name,
        version: record.version,
        contentHash: record.contentHash,
      },
    });

    await this.events.emit({
      id: randomUUID(),
      type: 'artifact.deleted',
      artifactId,
      tenantId: record.tenantId,
      timestamp: new Date().toISOString(),
      details: {
        name: record.name,
        version: record.version,
        deletedBy,
        reason,
      },
    });

    log.info({ artifactId, deletedBy, reason }, 'Artifact deleted');
  }

  /**
   * Update scan results for an artifact.
   * Called by the security scanner after scanning completes.
   */
  async updateScanResults(artifactId: string, scanStatus: string, scanResults: unknown[]): Promise<void> {
    const now = new Date().toISOString();
    await this.db.updateArtifact(artifactId, {
      scanned: true,
      scanStatus,
      updatedAt: now,
    });

    await this.events.emit({
      id: randomUUID(),
      type: 'artifact.scanned',
      artifactId,
      timestamp: now,
      details: { scanStatus, resultCount: scanResults.length },
    });

    log.info({ artifactId, scanStatus }, 'Scan results updated');
  }

  /**
   * Mark an artifact as signed.
   */
  async markSigned(artifactId: string, signatureRef: string): Promise<void> {
    const now = new Date().toISOString();
    await this.db.updateArtifact(artifactId, {
      signed: true,
      updatedAt: now,
    });

    await this.events.emit({
      id: randomUUID(),
      type: 'artifact.signed',
      artifactId,
      timestamp: now,
      details: { signatureRef },
    });

    log.info({ artifactId, signatureRef }, 'Artifact signed');
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────

  /**
   * Build the storage key for an artifact.
   * Layout: tenants/{tenantId}/{type}/{repository}/{name}/{version}/{hash}
   */
  private buildStorageKey(
    tenantId: string,
    type: string,
    repository: string,
    name: string,
    version: string,
    contentHash: string,
  ): string {
    const hashSuffix = contentHash.replace('sha256:', '').substring(0, 16);
    return `tenants/${tenantId}/${type}/${repository}/${name}/${version}/${hashSuffix}`;
  }
}

// ─── Registry Errors ─────────────────────────────────────────────────────────

export class RegistryError extends Error {
  public readonly statusCode: number;

  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.name = 'RegistryError';
    this.statusCode = statusCode;
  }
}

export class RegistryNotFoundError extends RegistryError {
  constructor(message: string) {
    super(message, 404);
    this.name = 'RegistryNotFoundError';
  }
}

export class RegistryConflictError extends RegistryError {
  constructor(message: string) {
    super(message, 409);
    this.name = 'RegistryConflictError';
  }
}

export class RegistryQuarantinedError extends RegistryError {
  constructor(message: string) {
    super(message, 403);
    this.name = 'RegistryQuarantinedError';
  }
}

export class RegistryIntegrityError extends RegistryError {
  constructor(message: string) {
    super(message, 500);
    this.name = 'RegistryIntegrityError';
  }
}

export class RegistryValidationError extends RegistryError {
  constructor(message: string) {
    super(message, 400);
    this.name = 'RegistryValidationError';
  }
}