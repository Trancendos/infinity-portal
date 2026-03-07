/**
 * Docker/OCI Protocol Handler
 * 
 * Implements the OCI Distribution Specification v2.
 * Supports Docker images, OCI artifacts, and multi-architecture manifests.
 * Layer deduplication via content-addressable storage.
 * 
 * Endpoints:
 *   GET    /v2/                              — API version check
 *   HEAD   /v2/:name/blobs/:digest           — Check blob existence
 *   GET    /v2/:name/blobs/:digest           — Download blob
 *   POST   /v2/:name/blobs/uploads/          — Initiate blob upload
 *   PATCH  /v2/:name/blobs/uploads/:uuid     — Upload blob chunk
 *   PUT    /v2/:name/blobs/uploads/:uuid     — Complete blob upload
 *   PUT    /v2/:name/manifests/:reference     — Push manifest
 *   GET    /v2/:name/manifests/:reference     — Pull manifest
 *   GET    /v2/_catalog                       — List repositories
 *   GET    /v2/:name/tags/list                — List tags
 */

import { Router, Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { createModuleLogger } from '../../utils/logger.js';
import type { RegistryEngine } from '../engine.js';
import { RegistryNotFoundError } from '../engine.js';

const log = createModuleLogger('handler:docker');

// In-memory upload sessions (production: Redis-backed)
const uploadSessions = new Map<string, {
  repositoryName: string;
  tenantId: string;
  chunks: Buffer[];
  startedAt: Date;
}>();

export class DockerHandler {
  private engine: RegistryEngine;
  private baseUrl: string;

  constructor(engine: RegistryEngine, baseUrl: string) {
    this.engine = engine;
    this.baseUrl = baseUrl;
    log.info({ baseUrl }, 'Docker/OCI handler initialised');
  }

  createRouter(): Router {
    const router = Router();

    // API version check
    router.get('/v2/', this.versionCheck.bind(this));

    // Blob operations
    router.head('/v2/:name(*)/blobs/:digest', this.headBlob.bind(this));
    router.get('/v2/:name(*)/blobs/:digest', this.getBlob.bind(this));
    router.post('/v2/:name(*)/blobs/uploads/', this.initiateUpload.bind(this));
    router.patch('/v2/:name(*)/blobs/uploads/:uuid', this.uploadChunk.bind(this));
    router.put('/v2/:name(*)/blobs/uploads/:uuid', this.completeUpload.bind(this));

    // Manifest operations
    router.put('/v2/:name(*)/manifests/:reference', this.pushManifest.bind(this));
    router.get('/v2/:name(*)/manifests/:reference', this.pullManifest.bind(this));
    router.head('/v2/:name(*)/manifests/:reference', this.headManifest.bind(this));
    router.delete('/v2/:name(*)/manifests/:reference', this.deleteManifest.bind(this));

    // Catalog
    router.get('/v2/_catalog', this.listRepositories.bind(this));
    router.get('/v2/:name(*)/tags/list', this.listTags.bind(this));

    log.info('Docker/OCI routes registered');
    return router;
  }

  /**
   * GET /v2/ — OCI version check. Must return 200 for Docker clients.
   */
  private async versionCheck(_req: Request, res: Response): Promise<void> {
    res.set('Docker-Distribution-API-Version', 'registry/2.0');
    res.json({});
  }

  /**
   * HEAD /v2/:name/blobs/:digest — Check if blob exists.
   */
  private async headBlob(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { name, digest } = req.params;
      const tenantId = (req as any).tenantId;

      const record = await this.findBlobByDigest(tenantId, name, digest);
      if (!record) {
        res.status(404).json({ errors: [{ code: 'BLOB_UNKNOWN', message: 'Blob not found' }] });
        return;
      }

      res.set({
        'Content-Length': String(record.size),
        'Docker-Content-Digest': digest,
        'Content-Type': 'application/octet-stream',
      });
      res.status(200).end();
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /v2/:name/blobs/:digest — Download blob.
   */
  private async getBlob(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { name, digest } = req.params;
      const tenantId = (req as any).tenantId;
      const repositoryId = (req as any).repositoryId || 'docker-local';

      // Find the artifact by digest
      const result = await this.engine.search({
        query: digest,
        type: 'docker',
        tenantId,
        limit: 1,
      });

      if (result.artifacts.length === 0) {
        res.status(404).json({ errors: [{ code: 'BLOB_UNKNOWN', message: 'Blob not found' }] });
        return;
      }

      const { data } = await this.engine.retrieve({
        tenantId,
        repositoryId,
        name: result.artifacts[0].name,
        version: result.artifacts[0].version,
      });

      res.set({
        'Content-Length': String(data.length),
        'Docker-Content-Digest': digest,
        'Content-Type': 'application/octet-stream',
        'Cache-Control': 'public, max-age=31536000, immutable',
      });
      res.send(data);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /v2/:name/blobs/uploads/ — Initiate a blob upload.
   */
  private async initiateUpload(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const name = req.params.name;
      const tenantId = (req as any).tenantId;
      const uploadId = randomUUID();

      uploadSessions.set(uploadId, {
        repositoryName: name,
        tenantId,
        chunks: [],
        startedAt: new Date(),
      });

      log.debug({ uploadId, name }, 'Blob upload initiated');

      res.set({
        'Location': `${this.baseUrl}/v2/${name}/blobs/uploads/${uploadId}`,
        'Docker-Upload-UUID': uploadId,
        'Range': '0-0',
      });
      res.status(202).end();
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /v2/:name/blobs/uploads/:uuid — Upload a blob chunk.
   */
  private async uploadChunk(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { name, uuid } = req.params;
      const session = uploadSessions.get(uuid);

      if (!session) {
        res.status(404).json({ errors: [{ code: 'BLOB_UPLOAD_UNKNOWN', message: 'Upload not found' }] });
        return;
      }

      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      const data = Buffer.concat(chunks);
      session.chunks.push(data);

      const totalSize = session.chunks.reduce((sum, c) => sum + c.length, 0);

      res.set({
        'Location': `${this.baseUrl}/v2/${name}/blobs/uploads/${uuid}`,
        'Docker-Upload-UUID': uuid,
        'Range': `0-${totalSize - 1}`,
      });
      res.status(202).end();
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /v2/:name/blobs/uploads/:uuid — Complete blob upload.
   */
  private async completeUpload(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { name, uuid } = req.params;
      const digest = req.query.digest as string;
      const session = uploadSessions.get(uuid);

      if (!session) {
        res.status(404).json({ errors: [{ code: 'BLOB_UPLOAD_UNKNOWN', message: 'Upload not found' }] });
        return;
      }

      // Collect any remaining data from the request body
      const finalChunks: Buffer[] = [];
      for await (const chunk of req) {
        finalChunks.push(chunk);
      }
      if (finalChunks.length > 0) {
        session.chunks.push(Buffer.concat(finalChunks));
      }

      const blobData = Buffer.concat(session.chunks);
      const repositoryId = (req as any).repositoryId || 'docker-local';
      const publisher = (req as any).user;

      // Store the blob as an artifact
      const record = await this.engine.publish({
        name: `${name}/blob/${digest}`,
        version: digest,
        type: 'docker',
        data: blobData,
        tenantId: session.tenantId,
        repositoryId,
        repository: 'docker-local',
        metadata: { digest, repositoryName: name, layerType: 'blob' },
        mimeType: 'application/octet-stream',
        publisher: {
          userId: publisher?.userId || 'docker-client',
          username: publisher?.username || 'docker-client',
          method: 'cli',
        },
      });

      uploadSessions.delete(uuid);

      log.info({ name, digest, size: blobData.length }, 'Blob upload completed');

      res.set({
        'Location': `${this.baseUrl}/v2/${name}/blobs/${digest}`,
        'Docker-Content-Digest': digest,
        'Content-Length': '0',
      });
      res.status(201).end();
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /v2/:name/manifests/:reference — Push manifest.
   */
  private async pushManifest(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { name, reference } = req.params;
      const tenantId = (req as any).tenantId;
      const repositoryId = (req as any).repositoryId || 'docker-local';
      const publisher = (req as any).user;
      const contentType = req.get('Content-Type') || 'application/vnd.docker.distribution.manifest.v2+json';

      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      const manifestData = Buffer.concat(chunks);

      const record = await this.engine.publish({
        name: `${name}/manifest`,
        version: reference,
        type: 'docker',
        data: manifestData,
        tenantId,
        repositoryId,
        repository: 'docker-local',
        metadata: {
          reference,
          repositoryName: name,
          mediaType: contentType,
          layerType: 'manifest',
        },
        mimeType: contentType,
        publisher: {
          userId: publisher?.userId || 'docker-client',
          username: publisher?.username || 'docker-client',
          method: 'cli',
        },
      });

      log.info({ name, reference, size: manifestData.length }, 'Manifest pushed');

      res.set({
        'Location': `${this.baseUrl}/v2/${name}/manifests/${reference}`,
        'Docker-Content-Digest': record.contentHash.replace('sha256:', 'sha256:'),
      });
      res.status(201).end();
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /v2/:name/manifests/:reference — Pull manifest.
   */
  private async pullManifest(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { name, reference } = req.params;
      const tenantId = (req as any).tenantId;
      const repositoryId = (req as any).repositoryId || 'docker-local';

      const { record, data } = await this.engine.retrieve({
        tenantId,
        repositoryId,
        name: `${name}/manifest`,
        version: reference,
      });

      const mediaType = (record.metadata as any)?.mediaType || 'application/vnd.docker.distribution.manifest.v2+json';

      res.set({
        'Content-Type': mediaType,
        'Content-Length': String(data.length),
        'Docker-Content-Digest': record.contentHash,
        'Cache-Control': 'public, max-age=31536000, immutable',
      });
      res.send(data);
    } catch (error) {
      if (error instanceof RegistryNotFoundError) {
        res.status(404).json({ errors: [{ code: 'MANIFEST_UNKNOWN', message: 'Manifest not found' }] });
        return;
      }
      next(error);
    }
  }

  /**
   * HEAD /v2/:name/manifests/:reference — Check manifest existence.
   */
  private async headManifest(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { name, reference } = req.params;
      const tenantId = (req as any).tenantId;
      const repositoryId = (req as any).repositoryId || 'docker-local';

      const result = await this.engine.search({
        query: `${name}/manifest`,
        type: 'docker',
        tenantId,
        limit: 1,
      });

      if (result.artifacts.length === 0) {
        res.status(404).json({ errors: [{ code: 'MANIFEST_UNKNOWN', message: 'Manifest not found' }] });
        return;
      }

      const artifact = result.artifacts[0];
      const mediaType = (artifact.metadata as any)?.mediaType || 'application/vnd.docker.distribution.manifest.v2+json';

      res.set({
        'Content-Type': mediaType,
        'Content-Length': String(artifact.size),
        'Docker-Content-Digest': artifact.contentHash,
      });
      res.status(200).end();
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /v2/:name/manifests/:reference — Delete manifest.
   */
  private async deleteManifest(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { name, reference } = req.params;
      const tenantId = (req as any).tenantId;
      const user = (req as any).user;

      const result = await this.engine.search({
        query: `${name}/manifest`,
        type: 'docker',
        tenantId,
        limit: 1,
      });

      if (result.artifacts.length === 0) {
        res.status(404).json({ errors: [{ code: 'MANIFEST_UNKNOWN', message: 'Manifest not found' }] });
        return;
      }

      await this.engine.delete(result.artifacts[0].id, user?.username || 'unknown', `Delete manifest: ${name}:${reference}`);
      res.status(202).end();
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /v2/_catalog — List all repositories.
   */
  private async listRepositories(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = (req as any).tenantId;
      const n = parseInt(req.query.n as string) || 100;

      const result = await this.engine.search({
        query: '',
        type: 'docker',
        tenantId,
        limit: n,
      });

      const repositories = [...new Set(
        result.artifacts
          .map(a => (a.metadata as any)?.repositoryName)
          .filter(Boolean)
      )];

      res.json({ repositories });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /v2/:name/tags/list — List tags for a repository.
   */
  private async listTags(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const name = req.params.name;
      const tenantId = (req as any).tenantId;

      const result = await this.engine.search({
        query: `${name}/manifest`,
        type: 'docker',
        tenantId,
        limit: 100,
      });

      const tags = result.artifacts.map(a => a.version);

      res.json({ name, tags });
    } catch (error) {
      next(error);
    }
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────

  private async findBlobByDigest(tenantId: string, name: string, digest: string): Promise<{ size: number } | null> {
    const result = await this.engine.search({
      query: digest,
      type: 'docker',
      tenantId,
      limit: 1,
    });

    if (result.artifacts.length === 0) return null;
    return { size: result.artifacts[0].size };
  }
}