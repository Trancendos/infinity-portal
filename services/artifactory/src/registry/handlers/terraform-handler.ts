/**
 * Terraform Module Handler
 * 
 * Implements the Terraform Registry Protocol for IaC modules.
 * Compatible with `terraform init` module resolution.
 * Aligns with terraform-digitalocean-k8s fork in ecosystem.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { createModuleLogger } from '../../utils/logger.js';
import type { RegistryEngine } from '../engine.js';
import { RegistryNotFoundError } from '../engine.js';

const log = createModuleLogger('handler:terraform');

export class TerraformHandler {
  private engine: RegistryEngine;
  private baseUrl: string;

  constructor(engine: RegistryEngine, baseUrl: string) {
    this.engine = engine;
    this.baseUrl = baseUrl;
    log.info('Terraform module handler initialised');
  }

  createRouter(): Router {
    const router = Router();

    // Service discovery
    router.get('/.well-known/terraform.json', this.serviceDiscovery.bind(this));

    // Module registry protocol
    router.get('/api/v1/terraform/modules/:namespace/:name/:provider/versions', this.listVersions.bind(this));
    router.get('/api/v1/terraform/modules/:namespace/:name/:provider/:version/download', this.downloadModule.bind(this));
    router.get('/api/v1/terraform/modules/:namespace/:name/:provider', this.getLatest.bind(this));

    // Upload
    router.put('/api/v1/terraform/modules/:namespace/:name/:provider/:version', this.uploadModule.bind(this));

    // Search
    router.get('/api/v1/terraform/modules', this.searchModules.bind(this));

    // Delete
    router.delete('/api/v1/terraform/modules/:namespace/:name/:provider/:version', this.deleteModule.bind(this));

    log.info('Terraform routes registered');
    return router;
  }

  /**
   * GET /.well-known/terraform.json — Service discovery for Terraform CLI.
   */
  private async serviceDiscovery(_req: Request, res: Response): Promise<void> {
    res.json({
      'modules.v1': `${this.baseUrl}/api/v1/terraform/modules/`,
    });
  }

  /**
   * GET /modules/:namespace/:name/:provider/versions — List available versions.
   */
  private async listVersions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { namespace, name, provider } = req.params;
      const tenantId = (req as any).tenantId;
      const moduleName = `${namespace}/${name}/${provider}`;

      const result = await this.engine.search({
        query: moduleName,
        type: 'terraform',
        tenantId,
        limit: 100,
      });

      const versions = result.artifacts.map(a => ({ version: a.version }));

      res.json({
        modules: [{
          source: moduleName,
          versions,
        }],
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /modules/:namespace/:name/:provider/:version/download — Download module.
   * Returns X-Terraform-Get header with download URL.
   */
  private async downloadModule(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { namespace, name, provider, version } = req.params;
      const tenantId = (req as any).tenantId;
      const repositoryId = (req as any).repositoryId || 'terraform-local';
      const moduleName = `${namespace}/${name}/${provider}`;

      const { record, data } = await this.engine.retrieve({
        tenantId,
        repositoryId,
        name: moduleName,
        version,
      });

      res.set({
        'Content-Type': 'application/gzip',
        'Content-Length': String(data.length),
        'Content-Disposition': `attachment; filename="${name}-${version}.tar.gz"`,
        'X-Terraform-Get': `${this.baseUrl}/api/v1/terraform/modules/${moduleName}/${version}/archive`,
        'Cache-Control': 'public, max-age=31536000, immutable',
      });
      res.send(data);
    } catch (error) {
      if (error instanceof RegistryNotFoundError) {
        res.status(404).json({ error: 'Module not found' });
        return;
      }
      next(error);
    }
  }

  /**
   * GET /modules/:namespace/:name/:provider — Get latest version info.
   */
  private async getLatest(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { namespace, name, provider } = req.params;
      const tenantId = (req as any).tenantId;
      const moduleName = `${namespace}/${name}/${provider}`;

      const result = await this.engine.search({
        query: moduleName,
        type: 'terraform',
        tenantId,
        limit: 1,
      });

      if (result.artifacts.length === 0) {
        res.status(404).json({ error: 'Module not found' });
        return;
      }

      const latest = result.artifacts[0];
      res.json({
        id: `${moduleName}/${latest.version}`,
        namespace,
        name,
        provider,
        version: latest.version,
        description: (latest.metadata as any)?.description || '',
        source: (latest.metadata as any)?.source || '',
        published_at: latest.createdAt,
        downloads: latest.accessCount,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /modules/:namespace/:name/:provider/:version — Upload module.
   */
  private async uploadModule(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { namespace, name, provider, version } = req.params;
      const tenantId = (req as any).tenantId;
      const repositoryId = (req as any).repositoryId || 'terraform-local';
      const publisher = (req as any).user;
      const moduleName = `${namespace}/${name}/${provider}`;

      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      const moduleData = Buffer.concat(chunks);

      const record = await this.engine.publish({
        name: moduleName,
        version,
        type: 'terraform',
        data: moduleData,
        tenantId,
        repositoryId,
        repository: 'terraform-local',
        metadata: {
          namespace,
          moduleName: name,
          provider,
          description: req.get('X-Module-Description') || '',
          source: req.get('X-Module-Source') || '',
        },
        mimeType: 'application/gzip',
        publisher: {
          userId: publisher?.userId || 'terraform-client',
          username: publisher?.username || 'terraform-client',
          method: 'cli',
        },
      });

      log.info({ moduleName, version, size: moduleData.length }, 'Terraform module uploaded');
      res.status(201).json({ id: record.id, version });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /modules — Search modules.
   */
  private async searchModules(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = (req as any).tenantId;
      const q = (req.query.q as string) || '';
      const limit = parseInt(req.query.limit as string) || 20;
      const offset = parseInt(req.query.offset as string) || 0;

      const result = await this.engine.search({
        query: q,
        type: 'terraform',
        tenantId,
        limit,
        offset,
      });

      res.json({
        meta: { limit, offset, total: result.total },
        modules: result.artifacts.map(a => ({
          id: `${a.name}/${a.version}`,
          name: a.name,
          version: a.version,
          description: (a.metadata as any)?.description || '',
          published_at: a.createdAt,
          downloads: a.accessCount,
        })),
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /modules/:namespace/:name/:provider/:version — Delete module.
   */
  private async deleteModule(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { namespace, name, provider, version } = req.params;
      const tenantId = (req as any).tenantId;
      const user = (req as any).user;
      const moduleName = `${namespace}/${name}/${provider}`;

      const result = await this.engine.search({
        query: moduleName,
        type: 'terraform',
        tenantId,
        limit: 100,
      });

      const target = result.artifacts.find(a => a.version === version);
      if (!target) {
        res.status(404).json({ error: 'Module version not found' });
        return;
      }

      await this.engine.delete(target.id, user?.username || 'unknown', `Delete Terraform module: ${moduleName}@${version}`);
      res.json({ deleted: true });
    } catch (error) {
      next(error);
    }
  }
}