/**
 * PyPI Handler
 * 
 * Implements the PyPI Simple Repository API for Python packages.
 * Compatible with `pip install` and `twine upload`.
 * Relevant because ci-python.yml workflow exists in infinity-portal.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { createModuleLogger } from '../../utils/logger.js';
import type { RegistryEngine } from '../engine.js';
import { RegistryNotFoundError } from '../engine.js';

const log = createModuleLogger('handler:pypi');

export class PyPIHandler {
  private engine: RegistryEngine;

  constructor(engine: RegistryEngine) {
    this.engine = engine;
    log.info('PyPI handler initialised');
  }

  createRouter(): Router {
    const router = Router();

    // Simple API (PEP 503)
    router.get('/api/v1/pypi/simple/', this.listPackages.bind(this));
    router.get('/api/v1/pypi/simple/:name/', this.getPackageLinks.bind(this));

    // Upload (twine compatible)
    router.post('/api/v1/pypi/upload', this.uploadPackage.bind(this));

    // Download
    router.get('/api/v1/pypi/packages/:name/:filename', this.downloadPackage.bind(this));

    // JSON API
    router.get('/api/v1/pypi/json/:name', this.getPackageJson.bind(this));
    router.get('/api/v1/pypi/json/:name/:version', this.getVersionJson.bind(this));

    // Delete
    router.delete('/api/v1/pypi/packages/:name/:version', this.deletePackage.bind(this));

    log.info('PyPI routes registered');
    return router;
  }

  /**
   * GET /simple/ — List all packages (PEP 503).
   */
  private async listPackages(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = (req as any).tenantId;
      const result = await this.engine.search({ query: '', type: 'pypi', tenantId, limit: 1000 });

      const packageNames = [...new Set(result.artifacts.map(a => a.name))];

      const links = packageNames.map(name =>
        `<a href="${name}/">${name}</a>`
      ).join('\n');

      res.set('Content-Type', 'text/html');
      res.send(`<!DOCTYPE html>\n<html><body>\n${links}\n</body></html>`);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /simple/:name/ — List package files (PEP 503).
   */
  private async getPackageLinks(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { name } = req.params;
      const tenantId = (req as any).tenantId;
      const normalised = this.normalisePackageName(name);

      const result = await this.engine.search({
        query: normalised,
        type: 'pypi',
        tenantId,
        limit: 100,
      });

      const links = result.artifacts.map(a => {
        const filename = `${a.name}-${a.version}.tar.gz`;
        const hash = a.contentHash.replace('sha256:', '');
        return `<a href="../packages/${a.name}/${filename}#sha256=${hash}">${filename}</a>`;
      }).join('\n');

      res.set('Content-Type', 'text/html');
      res.send(`<!DOCTYPE html>\n<html><body>\n<h1>Links for ${name}</h1>\n${links}\n</body></html>`);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /upload — Upload package (twine compatible).
   */
  private async uploadPackage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = (req as any).tenantId;
      const repositoryId = (req as any).repositoryId || 'pypi-local';
      const publisher = (req as any).user;

      // twine sends multipart form data
      const name = req.body?.name || req.get('X-Package-Name');
      const version = req.body?.version || req.get('X-Package-Version');

      if (!name || !version) {
        res.status(400).json({ error: 'name and version are required' });
        return;
      }

      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      const packageData = Buffer.concat(chunks);

      const normalised = this.normalisePackageName(name);

      const record = await this.engine.publish({
        name: normalised,
        version,
        type: 'pypi',
        data: packageData,
        tenantId,
        repositoryId,
        repository: 'pypi-local',
        metadata: {
          originalName: name,
          summary: req.body?.summary || '',
          author: req.body?.author || '',
          authorEmail: req.body?.author_email || '',
          license: req.body?.license || '',
          requiresPython: req.body?.requires_python || '',
          classifiers: req.body?.classifiers || [],
        },
        mimeType: 'application/gzip',
        publisher: {
          userId: publisher?.userId || 'twine-client',
          username: publisher?.username || 'twine-client',
          method: 'cli',
        },
      });

      log.info({ name: normalised, version, size: packageData.length }, 'PyPI package uploaded');
      res.status(201).json({ ok: true, id: record.id });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /packages/:name/:filename — Download package file.
   */
  private async downloadPackage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { name, filename } = req.params;
      const tenantId = (req as any).tenantId;
      const repositoryId = (req as any).repositoryId || 'pypi-local';

      // Extract version from filename
      const version = filename.replace(`${name}-`, '').replace('.tar.gz', '').replace('.whl', '');

      const { record, data } = await this.engine.retrieve({
        tenantId,
        repositoryId,
        name: this.normalisePackageName(name),
        version,
      });

      res.set({
        'Content-Type': 'application/gzip',
        'Content-Length': String(data.length),
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'public, max-age=31536000, immutable',
      });
      res.send(data);
    } catch (error) {
      if (error instanceof RegistryNotFoundError) {
        res.status(404).json({ error: 'Package not found' });
        return;
      }
      next(error);
    }
  }

  /**
   * GET /json/:name — Package JSON metadata.
   */
  private async getPackageJson(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { name } = req.params;
      const tenantId = (req as any).tenantId;
      const normalised = this.normalisePackageName(name);

      const result = await this.engine.search({
        query: normalised,
        type: 'pypi',
        tenantId,
        limit: 100,
      });

      if (result.artifacts.length === 0) {
        res.status(404).json({ error: 'Package not found' });
        return;
      }

      const latest = result.artifacts[0];
      const meta = latest.metadata as any;

      const releases: Record<string, any[]> = {};
      for (const a of result.artifacts) {
        releases[a.version] = [{
          filename: `${a.name}-${a.version}.tar.gz`,
          size: a.size,
          digests: { sha256: a.contentHash.replace('sha256:', '') },
          upload_time: a.createdAt,
        }];
      }

      res.json({
        info: {
          name: normalised,
          version: latest.version,
          summary: meta?.summary || '',
          author: meta?.author || '',
          author_email: meta?.authorEmail || '',
          license: meta?.license || '',
          requires_python: meta?.requiresPython || '',
        },
        releases,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /json/:name/:version — Version-specific JSON metadata.
   */
  private async getVersionJson(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { name, version } = req.params;
      const tenantId = (req as any).tenantId;
      const normalised = this.normalisePackageName(name);

      const result = await this.engine.search({
        query: normalised,
        type: 'pypi',
        tenantId,
        limit: 100,
      });

      const target = result.artifacts.find(a => a.version === version);
      if (!target) {
        res.status(404).json({ error: 'Version not found' });
        return;
      }

      const meta = target.metadata as any;
      res.json({
        info: {
          name: normalised,
          version: target.version,
          summary: meta?.summary || '',
          author: meta?.author || '',
          license: meta?.license || '',
        },
        urls: [{
          filename: `${normalised}-${version}.tar.gz`,
          size: target.size,
          digests: { sha256: target.contentHash.replace('sha256:', '') },
          upload_time: target.createdAt,
        }],
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /packages/:name/:version — Delete package version.
   */
  private async deletePackage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { name, version } = req.params;
      const tenantId = (req as any).tenantId;
      const user = (req as any).user;
      const normalised = this.normalisePackageName(name);

      const result = await this.engine.search({
        query: normalised,
        type: 'pypi',
        tenantId,
        limit: 100,
      });

      const target = result.artifacts.find(a => a.version === version);
      if (!target) {
        res.status(404).json({ error: 'Package version not found' });
        return;
      }

      await this.engine.delete(target.id, user?.username || 'unknown', `Delete PyPI package: ${normalised}@${version}`);
      res.json({ deleted: true });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Normalise package name per PEP 503.
   */
  private normalisePackageName(name: string): string {
    return name.toLowerCase().replace(/[-_.]+/g, '-');
  }
}