/**
 * Generic Artifact Handler
 * 
 * Handles ALL non-protocol-specific artifacts:
 * templates, configs, schemas, YAMLs, designs, schematics,
 * pipelines, migrations, workflows, and any other file type.
 * 
 * This is the most flexible handler — makes the Artifactory truly multi-adaptive.
 * Metadata is fully extensible via Zod-validated key-value pairs.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { createModuleLogger } from '../../utils/logger.js';
import type { RegistryEngine } from '../engine.js';
import { RegistryNotFoundError } from '../engine.js';

const log = createModuleLogger('handler:generic');

const MIME_MAP: Record<string, string> = {
  '.yaml': 'application/x-yaml',
  '.yml': 'application/x-yaml',
  '.json': 'application/json',
  '.toml': 'application/toml',
  '.xml': 'application/xml',
  '.sql': 'application/sql',
  '.mjs': 'application/javascript',
  '.js': 'application/javascript',
  '.ts': 'application/typescript',
  '.md': 'text/markdown',
  '.txt': 'text/plain',
  '.html': 'text/html',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.tar': 'application/x-tar',
  '.gz': 'application/gzip',
  '.wasm': 'application/wasm',
  '.hcl': 'application/vnd.hashicorp.hcl',
  '.tf': 'application/vnd.hashicorp.terraform',
};

export class GenericHandler {
  private engine: RegistryEngine;

  constructor(engine: RegistryEngine) {
    this.engine = engine;
    log.info('Generic artifact handler initialised');
  }

  createRouter(): Router {
    const router = Router();

    // Upload artifact
    router.put('/api/v1/generic/:repo/:path(*)', this.uploadArtifact.bind(this));

    // Download artifact
    router.get('/api/v1/generic/:repo/:path(*)', this.downloadArtifact.bind(this));

    // List artifacts in repository
    router.get('/api/v1/generic/:repo', this.listArtifacts.bind(this));

    // Delete artifact
    router.delete('/api/v1/generic/:repo/:path(*)', this.deleteArtifact.bind(this));

    // Search
    router.post('/api/v1/generic/search', this.searchArtifacts.bind(this));

    // Batch upload
    router.post('/api/v1/generic/:repo/batch', this.batchUpload.bind(this));

    log.info('Generic routes registered');
    return router;
  }

  /**
   * PUT /api/v1/generic/:repo/:path — Upload a generic artifact.
   * 
   * Headers:
   *   X-Artifact-Version: 1.0.0 (required)
   *   X-Artifact-Tags: schema,zod,production (optional, comma-separated)
   *   X-Artifact-Category: schema|template|config|yaml|design|schematic|pipeline|migration|workflow
   *   Content-Type: auto-detected from extension or provided
   */
  private async uploadArtifact(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { repo, path } = req.params;
      const tenantId = (req as any).tenantId;
      const repositoryId = (req as any).repositoryId || 'generic-local';
      const publisher = (req as any).user;

      const version = req.get('X-Artifact-Version');
      if (!version) {
        res.status(400).json({ error: 'X-Artifact-Version header is required' });
        return;
      }

      const tags = (req.get('X-Artifact-Tags') || '').split(',').filter(Boolean).map(t => t.trim());
      const category = req.get('X-Artifact-Category') || 'generic';

      // Collect request body
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      const data = Buffer.concat(chunks);

      if (data.length === 0) {
        res.status(400).json({ error: 'Request body is empty' });
        return;
      }

      // Detect MIME type from path extension
      const ext = '.' + path.split('.').pop()?.toLowerCase();
      const mimeType = req.get('Content-Type') || MIME_MAP[ext] || 'application/octet-stream';

      const artifactName = `${repo}/${path}`;

      log.info({
        artifactName,
        version,
        category,
        size: data.length,
        mimeType,
      }, 'Uploading generic artifact');

      const record = await this.engine.publish({
        name: artifactName,
        version,
        type: 'generic',
        data,
        tenantId,
        repositoryId,
        repository: repo,
        metadata: {
          category,
          originalPath: path,
          repository: repo,
          extension: ext,
        },
        tags,
        mimeType,
        publisher: {
          userId: publisher?.userId || 'anonymous',
          username: publisher?.username || 'anonymous',
          method: publisher?.method || 'api',
          ip: req.ip,
          userAgent: req.get('user-agent'),
        },
      });

      res.status(201).json({
        id: record.id,
        name: record.name,
        version: record.version,
        contentHash: record.contentHash,
        size: record.size,
        mimeType: record.mimeType,
        tags: record.tags,
        createdAt: record.createdAt,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/generic/:repo/:path — Download a generic artifact.
   * 
   * Query params:
   *   version=1.0.0 (optional, defaults to latest)
   *   metadata=true (optional, returns metadata only without binary)
   */
  private async downloadArtifact(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { repo, path } = req.params;
      const tenantId = (req as any).tenantId;
      const repositoryId = (req as any).repositoryId || 'generic-local';
      const version = (req.query.version as string) || 'latest';
      const metadataOnly = req.query.metadata === 'true';

      const artifactName = `${repo}/${path}`;

      if (metadataOnly) {
        const result = await this.engine.search({
          query: artifactName,
          type: 'generic',
          tenantId,
          limit: 1,
        });

        if (result.artifacts.length === 0) {
          res.status(404).json({ error: 'Artifact not found' });
          return;
        }

        res.json({
          id: result.artifacts[0].id,
          name: result.artifacts[0].name,
          version: result.artifacts[0].version,
          contentHash: result.artifacts[0].contentHash,
          size: result.artifacts[0].size,
          mimeType: result.artifacts[0].mimeType,
          tags: result.artifacts[0].tags,
          metadata: result.artifacts[0].metadata,
          environment: result.artifacts[0].environment,
          scanned: result.artifacts[0].scanned,
          signed: result.artifacts[0].signed,
          createdAt: result.artifacts[0].createdAt,
        });
        return;
      }

      // Resolve "latest" version
      let resolvedVersion = version;
      if (version === 'latest') {
        const result = await this.engine.search({
          query: artifactName,
          type: 'generic',
          tenantId,
          limit: 1,
        });
        if (result.artifacts.length === 0) {
          res.status(404).json({ error: 'Artifact not found' });
          return;
        }
        resolvedVersion = result.artifacts[0].version;
      }

      const { record, data } = await this.engine.retrieve({
        tenantId,
        repositoryId,
        name: artifactName,
        version: resolvedVersion,
      });

      const filename = path.split('/').pop() || 'artifact';

      res.set({
        'Content-Type': record.mimeType,
        'Content-Length': String(data.length),
        'Content-Disposition': `attachment; filename="${filename}"`,
        'ETag': record.contentHash,
        'X-Artifact-Version': record.version,
        'X-Content-Hash': record.contentHash,
        'Cache-Control': 'public, max-age=31536000, immutable',
      });

      res.send(data);
    } catch (error) {
      if (error instanceof RegistryNotFoundError) {
        res.status(404).json({ error: 'Artifact not found' });
        return;
      }
      next(error);
    }
  }

  /**
   * GET /api/v1/generic/:repo — List artifacts in a repository.
   */
  private async listArtifacts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { repo } = req.params;
      const tenantId = (req as any).tenantId;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      const category = req.query.category as string;

      const result = await this.engine.search({
        query: repo,
        type: 'generic',
        tenantId,
        limit,
        offset,
      });

      let artifacts = result.artifacts;
      if (category) {
        artifacts = artifacts.filter(a => (a.metadata as any)?.category === category);
      }

      res.json({
        repository: repo,
        total: result.total,
        limit,
        offset,
        artifacts: artifacts.map(a => ({
          id: a.id,
          name: a.name,
          version: a.version,
          contentHash: a.contentHash,
          size: a.size,
          mimeType: a.mimeType,
          tags: a.tags,
          category: (a.metadata as any)?.category,
          environment: a.environment,
          createdAt: a.createdAt,
        })),
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/v1/generic/:repo/:path — Delete a generic artifact.
   */
  private async deleteArtifact(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { repo, path } = req.params;
      const tenantId = (req as any).tenantId;
      const user = (req as any).user;
      const version = req.query.version as string;

      const artifactName = `${repo}/${path}`;

      const result = await this.engine.search({
        query: artifactName,
        type: 'generic',
        tenantId,
        limit: 1,
      });

      if (result.artifacts.length === 0) {
        res.status(404).json({ error: 'Artifact not found' });
        return;
      }

      const target = version
        ? result.artifacts.find(a => a.version === version)
        : result.artifacts[0];

      if (!target) {
        res.status(404).json({ error: 'Artifact version not found' });
        return;
      }

      await this.engine.delete(target.id, user?.username || 'unknown', `Delete generic artifact: ${artifactName}@${target.version}`);

      res.json({ ok: true, deleted: { name: artifactName, version: target.version } });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/generic/search — Search generic artifacts with filters.
   */
  private async searchArtifacts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = (req as any).tenantId;
      const { query, category, tags, environment, limit, offset } = req.body;

      const result = await this.engine.search({
        query: query || '',
        type: 'generic',
        tenantId,
        environment,
        tags,
        limit: limit || 20,
        offset: offset || 0,
      });

      let artifacts = result.artifacts;
      if (category) {
        artifacts = artifacts.filter(a => (a.metadata as any)?.category === category);
      }

      res.json({
        total: result.total,
        artifacts: artifacts.map(a => ({
          id: a.id,
          name: a.name,
          version: a.version,
          contentHash: a.contentHash,
          size: a.size,
          mimeType: a.mimeType,
          tags: a.tags,
          category: (a.metadata as any)?.category,
          environment: a.environment,
          createdAt: a.createdAt,
        })),
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/generic/:repo/batch — Batch upload multiple artifacts.
   */
  private async batchUpload(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { repo } = req.params;
      const tenantId = (req as any).tenantId;

      // Batch upload expects JSON with base64-encoded artifacts
      const { artifacts } = req.body;
      if (!Array.isArray(artifacts) || artifacts.length === 0) {
        res.status(400).json({ error: 'artifacts array is required' });
        return;
      }

      if (artifacts.length > 50) {
        res.status(400).json({ error: 'Maximum 50 artifacts per batch' });
        return;
      }

      const results = [];
      const errors = [];

      for (const item of artifacts) {
        try {
          const data = Buffer.from(item.data, 'base64');
          const ext = '.' + (item.path || '').split('.').pop()?.toLowerCase();
          const mimeType = MIME_MAP[ext] || 'application/octet-stream';

          const record = await this.engine.publish({
            name: `${repo}/${item.path}`,
            version: item.version,
            type: 'generic',
            data,
            tenantId,
            repositoryId: 'generic-local',
            repository: repo,
            metadata: {
              category: item.category || 'generic',
              originalPath: item.path,
              repository: repo,
            },
            tags: item.tags || [],
            mimeType,
            publisher: {
              userId: (req as any).user?.userId || 'batch',
              username: (req as any).user?.username || 'batch',
              method: 'api',
            },
          });

          results.push({ path: item.path, version: item.version, id: record.id, status: 'ok' });
        } catch (err: any) {
          errors.push({ path: item.path, version: item.version, error: err.message });
        }
      }

      res.status(errors.length > 0 ? 207 : 201).json({
        total: artifacts.length,
        succeeded: results.length,
        failed: errors.length,
        results,
        errors,
      });
    } catch (error) {
      next(error);
    }
  }
}