/**
 * npm Protocol Handler
 * 
 * Implements the npm registry protocol for @trancendos/* packages.
 * This is the highest-priority handler — it unblocks @trancendos/shared-core
 * for all 14+ Pattern A services.
 * 
 * Endpoints:
 *   GET  /@trancendos/:package          — Package metadata
 *   GET  /@trancendos/:package/-/:tar   — Download tarball
 *   PUT  /@trancendos/:package          — Publish new version
 *   GET  /-/v1/search                   — Search packages
 *   DELETE /@trancendos/:package/-rev/  — Unpublish (admin only)
 * 
 * Virtual repository behaviour:
 *   1. Check local repo first (@trancendos/* always local)
 *   2. If not found, check remote proxy cache
 *   3. If not cached, fetch from npmjs.org, scan, cache, serve
 *   4. Dependency confusion protection: @trancendos/* NEVER resolves from public npm
 */

import { Router, Request, Response, NextFunction } from 'express';
import { createModuleLogger } from '../../utils/logger.js';
import type { RegistryEngine, ArtifactRecord } from '../engine.js';
import { RegistryNotFoundError } from '../engine.js';

const log = createModuleLogger('handler:npm');

// ─── npm Package Metadata Format ─────────────────────────────────────────────

interface NpmPackageMetadata {
  name: string;
  description: string;
  'dist-tags': Record<string, string>;
  versions: Record<string, NpmVersionMetadata>;
  time: Record<string, string>;
  maintainers: Array<{ name: string; email?: string }>;
  license: string;
}

interface NpmVersionMetadata {
  name: string;
  version: string;
  description: string;
  main: string;
  types?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  dist: {
    tarball: string;
    shasum: string;
    integrity: string;
  };
  _id: string;
  _nodeVersion: string;
  _npmVersion: string;
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export class NpmHandler {
  private engine: RegistryEngine;
  private baseUrl: string;

  constructor(engine: RegistryEngine, baseUrl: string) {
    this.engine = engine;
    this.baseUrl = baseUrl;
    log.info({ baseUrl }, 'npm handler initialised');
  }

  /**
   * Create Express router with all npm protocol endpoints.
   */
  createRouter(): Router {
    const router = Router();

    // Package metadata
    router.get('/@:scope/:name', this.getPackageMetadata.bind(this));
    router.get('/:name', this.getPackageMetadata.bind(this));

    // Download tarball
    router.get('/@:scope/:name/-/:filename', this.downloadTarball.bind(this));
    router.get('/:name/-/:filename', this.downloadTarball.bind(this));

    // Publish
    router.put('/@:scope/:name', this.publishPackage.bind(this));
    router.put('/:name', this.publishPackage.bind(this));

    // Search
    router.get('/-/v1/search', this.searchPackages.bind(this));

    // Unpublish
    router.delete('/@:scope/:name/-rev/:rev', this.unpublishPackage.bind(this));

    // Audit
    router.post('/-/npm/v1/security/advisories/bulk', this.securityAudit.bind(this));

    log.info('npm routes registered');
    return router;
  }

  /**
   * GET /@scope/name — Return package metadata with all versions.
   */
  private async getPackageMetadata(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const packageName = this.extractPackageName(req);
      const tenantId = (req as any).tenantId;
      const repositoryId = (req as any).repositoryId || 'npm-local';

      log.debug({ packageName, tenantId }, 'Fetching package metadata');

      // Dependency confusion protection: @trancendos/* ALWAYS resolves locally
      if (packageName.startsWith('@trancendos/')) {
        const result = await this.engine.search({
          query: packageName,
          type: 'npm',
          tenantId,
          limit: 100,
        });

        if (result.artifacts.length === 0) {
          // Do NOT fall through to proxy for @trancendos/* packages
          res.status(404).json({ error: 'Package not found' });
          return;
        }

        const metadata = this.buildPackageMetadata(packageName, result.artifacts);
        res.json(metadata);
        return;
      }

      // For non-scoped packages, check local first, then proxy
      const result = await this.engine.search({
        query: packageName,
        type: 'npm',
        tenantId,
        limit: 100,
      });

      if (result.artifacts.length > 0) {
        const metadata = this.buildPackageMetadata(packageName, result.artifacts);
        res.json(metadata);
        return;
      }

      // TODO: Proxy to npmjs.org for public packages
      // For now, return 404 — proxy implementation in Phase 1
      res.status(404).json({ error: 'Package not found' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /@scope/name/-/filename — Download tarball.
   */
  private async downloadTarball(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const packageName = this.extractPackageName(req);
      const filename = req.params.filename;
      const tenantId = (req as any).tenantId;
      const repositoryId = (req as any).repositoryId || 'npm-local';

      // Extract version from filename (e.g., "shared-core-1.0.0.tgz")
      const version = this.extractVersionFromFilename(packageName, filename);

      log.debug({ packageName, version, filename }, 'Downloading tarball');

      const { record, data } = await this.engine.retrieve({
        tenantId,
        repositoryId,
        name: packageName,
        version,
      });

      res.set({
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(data.length),
        'Content-Disposition': `attachment; filename="${filename}"`,
        'ETag': record.contentHash,
        'Cache-Control': 'public, max-age=31536000, immutable',
      });

      res.send(data);
    } catch (error) {
      if (error instanceof RegistryNotFoundError) {
        res.status(404).json({ error: 'Tarball not found' });
        return;
      }
      next(error);
    }
  }

  /**
   * PUT /@scope/name — Publish a new package version.
   */
  private async publishPackage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const packageName = this.extractPackageName(req);
      const tenantId = (req as any).tenantId;
      const repositoryId = (req as any).repositoryId || 'npm-local';
      const publisher = (req as any).user;

      const body = req.body;
      if (!body || !body.versions) {
        res.status(400).json({ error: 'Invalid publish payload' });
        return;
      }

      // npm publish sends all versions but only one is new
      const versions = Object.keys(body.versions);
      const latestTag = body['dist-tags']?.latest;
      const newVersion = latestTag || versions[versions.length - 1];
      const versionData = body.versions[newVersion];

      if (!versionData) {
        res.status(400).json({ error: 'No version data found' });
        return;
      }

      // Extract the tarball attachment
      const attachmentKey = Object.keys(body._attachments || {})[0];
      if (!attachmentKey) {
        res.status(400).json({ error: 'No attachment found' });
        return;
      }

      const attachment = body._attachments[attachmentKey];
      const tarballData = Buffer.from(attachment.data, 'base64');

      log.info({
        packageName,
        version: newVersion,
        size: tarballData.length,
        publisher: publisher?.username,
      }, 'Publishing npm package');

      const record = await this.engine.publish({
        name: packageName,
        version: newVersion,
        type: 'npm',
        data: tarballData,
        tenantId,
        repositoryId,
        repository: 'npm-local',
        metadata: {
          description: versionData.description,
          main: versionData.main,
          types: versionData.types,
          dependencies: versionData.dependencies || {},
          devDependencies: versionData.devDependencies || {},
          keywords: versionData.keywords || [],
          distTags: body['dist-tags'] || {},
        },
        tags: versionData.keywords || [],
        mimeType: 'application/gzip',
        publisher: {
          userId: publisher?.userId || 'anonymous',
          username: publisher?.username || 'anonymous',
          method: publisher?.method || 'cli',
          ip: req.ip,
          userAgent: req.get('user-agent'),
        },
      });

      res.status(201).json({
        ok: true,
        id: packageName,
        rev: record.id,
        version: newVersion,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /-/v1/search — Search packages.
   */
  private async searchPackages(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const text = (req.query.text as string) || '';
      const size = parseInt(req.query.size as string) || 20;
      const from = parseInt(req.query.from as string) || 0;
      const tenantId = (req as any).tenantId;

      const result = await this.engine.search({
        query: text,
        type: 'npm',
        tenantId,
        limit: size,
        offset: from,
      });

      const objects = result.artifacts.map(artifact => ({
        package: {
          name: artifact.name,
          version: artifact.version,
          description: (artifact.metadata as any)?.description || '',
          keywords: artifact.tags,
          date: artifact.createdAt,
          links: {
            npm: `${this.baseUrl}/package/${artifact.name}`,
          },
          publisher: {
            username: artifact.publisherUsername,
          },
        },
        score: {
          final: 1.0,
          detail: { quality: 1.0, popularity: 0.5, maintenance: 1.0 },
        },
        searchScore: 1.0,
      }));

      res.json({
        objects,
        total: result.total,
        time: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /@scope/name/-rev/:rev — Unpublish (admin only).
   */
  private async unpublishPackage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const packageName = this.extractPackageName(req);
      const rev = req.params.rev;
      const user = (req as any).user;

      log.warn({ packageName, rev, user: user?.username }, 'Unpublish requested');

      await this.engine.delete(rev, user?.username || 'unknown', `Unpublish via npm CLI: ${packageName}`);

      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /-/npm/v1/security/advisories/bulk — Security audit.
   */
  private async securityAudit(req: Request, res: Response, _next: NextFunction): Promise<void> {
    // Return empty advisories for now — full implementation in Phase 2
    // when the security scanner is integrated
    res.json({
      actions: [],
      advisories: {},
      muted: [],
      metadata: {
        vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0 },
        dependencies: 0,
        devDependencies: 0,
        optionalDependencies: 0,
        totalDependencies: 0,
      },
    });
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────

  private extractPackageName(req: Request): string {
    const scope = req.params.scope;
    const name = req.params.name;
    return scope ? `@${scope}/${name}` : name;
  }

  private extractVersionFromFilename(packageName: string, filename: string): string {
    // Filename format: "package-name-1.0.0.tgz" or "name-1.0.0.tgz"
    const baseName = packageName.replace(/^@[^/]+\//, '');
    const match = filename.match(new RegExp(`^${baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(.*)\\.tgz$`));
    return match ? match[1] : filename.replace('.tgz', '');
  }

  private buildPackageMetadata(packageName: string, artifacts: ArtifactRecord[]): NpmPackageMetadata {
    const versions: Record<string, NpmVersionMetadata> = {};
    const time: Record<string, string> = { created: '', modified: '' };
    let latestVersion = '0.0.0';

    for (const artifact of artifacts) {
      const meta = artifact.metadata as any;
      const baseName = packageName.replace(/^@[^/]+\//, '');

      versions[artifact.version] = {
        name: packageName,
        version: artifact.version,
        description: meta?.description || '',
        main: meta?.main || 'dist/index.js',
        types: meta?.types,
        dependencies: meta?.dependencies || {},
        devDependencies: meta?.devDependencies || {},
        dist: {
          tarball: `${this.baseUrl}/${packageName}/-/${baseName}-${artifact.version}.tgz`,
          shasum: artifact.contentHash.replace('sha256:', ''),
          integrity: `sha256-${Buffer.from(artifact.contentHash.replace('sha256:', ''), 'hex').toString('base64')}`,
        },
        _id: `${packageName}@${artifact.version}`,
        _nodeVersion: '20.0.0',
        _npmVersion: '10.0.0',
      };

      time[artifact.version] = artifact.createdAt;

      // Track latest version (simple string comparison — semver in production)
      if (artifact.version > latestVersion) {
        latestVersion = artifact.version;
      }
    }

    if (artifacts.length > 0) {
      time.created = artifacts[artifacts.length - 1].createdAt;
      time.modified = artifacts[0].createdAt;
    }

    return {
      name: packageName,
      description: (artifacts[0]?.metadata as any)?.description || '',
      'dist-tags': { latest: latestVersion },
      versions,
      time,
      maintainers: [{ name: 'trancendos' }],
      license: 'MIT',
    };
  }
}