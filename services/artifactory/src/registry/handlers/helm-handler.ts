/**
 * Helm Chart Handler
 * 
 * Implements the Helm Chart Museum API for Kubernetes deployment charts.
 * Compatible with `helm push` and `helm pull` commands.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { createModuleLogger } from '../../utils/logger.js';
import type { RegistryEngine } from '../engine.js';
import { RegistryNotFoundError } from '../engine.js';

const log = createModuleLogger('handler:helm');

export class HelmHandler {
  private engine: RegistryEngine;

  constructor(engine: RegistryEngine) {
    this.engine = engine;
    log.info('Helm chart handler initialised');
  }

  createRouter(): Router {
    const router = Router();

    // Chart Museum API
    router.get('/api/v1/helm/charts', this.listCharts.bind(this));
    router.get('/api/v1/helm/charts/:name', this.getChartVersions.bind(this));
    router.get('/api/v1/helm/charts/:name/:version', this.getChartVersion.bind(this));
    router.post('/api/v1/helm/charts', this.uploadChart.bind(this));
    router.delete('/api/v1/helm/charts/:name/:version', this.deleteChart.bind(this));

    // Helm index.yaml
    router.get('/api/v1/helm/index.yaml', this.getIndex.bind(this));

    // Download chart tarball
    router.get('/api/v1/helm/charts/:name/-/:filename', this.downloadChart.bind(this));

    log.info('Helm routes registered');
    return router;
  }

  private async listCharts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = (req as any).tenantId;
      const result = await this.engine.search({ query: '', type: 'helm', tenantId, limit: 100 });

      const charts: Record<string, any[]> = {};
      for (const artifact of result.artifacts) {
        const name = artifact.name;
        if (!charts[name]) charts[name] = [];
        charts[name].push({
          name: artifact.name,
          version: artifact.version,
          description: (artifact.metadata as any)?.description || '',
          created: artifact.createdAt,
          digest: artifact.contentHash,
          urls: [`charts/${artifact.name}-${artifact.version}.tgz`],
        });
      }

      res.json(charts);
    } catch (error) {
      next(error);
    }
  }

  private async getChartVersions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { name } = req.params;
      const tenantId = (req as any).tenantId;
      const result = await this.engine.search({ query: name, type: 'helm', tenantId, limit: 100 });

      const versions = result.artifacts.map(a => ({
        name: a.name,
        version: a.version,
        description: (a.metadata as any)?.description || '',
        created: a.createdAt,
        digest: a.contentHash,
      }));

      res.json(versions);
    } catch (error) {
      next(error);
    }
  }

  private async getChartVersion(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { name, version } = req.params;
      const tenantId = (req as any).tenantId;
      const repositoryId = (req as any).repositoryId || 'helm-local';

      const { record } = await this.engine.retrieve({ tenantId, repositoryId, name, version });

      res.json({
        name: record.name,
        version: record.version,
        description: (record.metadata as any)?.description || '',
        created: record.createdAt,
        digest: record.contentHash,
        size: record.size,
      });
    } catch (error) {
      if (error instanceof RegistryNotFoundError) {
        res.status(404).json({ error: 'Chart not found' });
        return;
      }
      next(error);
    }
  }

  private async uploadChart(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = (req as any).tenantId;
      const repositoryId = (req as any).repositoryId || 'helm-local';
      const publisher = (req as any).user;

      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      const chartData = Buffer.concat(chunks);

      // Extract chart name and version from Chart.yaml inside the tarball
      // For now, use headers — full tar extraction in production
      const chartName = req.get('X-Chart-Name') || 'unknown-chart';
      const chartVersion = req.get('X-Chart-Version') || '0.0.0';

      const record = await this.engine.publish({
        name: chartName,
        version: chartVersion,
        type: 'helm',
        data: chartData,
        tenantId,
        repositoryId,
        repository: 'helm-local',
        metadata: {
          description: req.get('X-Chart-Description') || '',
          appVersion: req.get('X-Chart-App-Version') || '',
        },
        mimeType: 'application/gzip',
        publisher: {
          userId: publisher?.userId || 'helm-client',
          username: publisher?.username || 'helm-client',
          method: 'cli',
        },
      });

      log.info({ chartName, chartVersion, size: chartData.length }, 'Helm chart uploaded');
      res.status(201).json({ saved: true, id: record.id });
    } catch (error) {
      next(error);
    }
  }

  private async deleteChart(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { name, version } = req.params;
      const tenantId = (req as any).tenantId;
      const user = (req as any).user;

      const result = await this.engine.search({ query: name, type: 'helm', tenantId, limit: 1 });
      const target = result.artifacts.find(a => a.version === version);

      if (!target) {
        res.status(404).json({ error: 'Chart not found' });
        return;
      }

      await this.engine.delete(target.id, user?.username || 'unknown', `Delete Helm chart: ${name}@${version}`);
      res.json({ deleted: true });
    } catch (error) {
      next(error);
    }
  }

  private async downloadChart(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { name, filename } = req.params;
      const tenantId = (req as any).tenantId;
      const repositoryId = (req as any).repositoryId || 'helm-local';

      const version = filename.replace(`${name}-`, '').replace('.tgz', '');

      const { record, data } = await this.engine.retrieve({ tenantId, repositoryId, name, version });

      res.set({
        'Content-Type': 'application/gzip',
        'Content-Length': String(data.length),
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'public, max-age=31536000, immutable',
      });
      res.send(data);
    } catch (error) {
      if (error instanceof RegistryNotFoundError) {
        res.status(404).json({ error: 'Chart not found' });
        return;
      }
      next(error);
    }
  }

  private async getIndex(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = (req as any).tenantId;
      const result = await this.engine.search({ query: '', type: 'helm', tenantId, limit: 1000 });

      const entries: Record<string, any[]> = {};
      for (const artifact of result.artifacts) {
        if (!entries[artifact.name]) entries[artifact.name] = [];
        entries[artifact.name].push({
          name: artifact.name,
          version: artifact.version,
          description: (artifact.metadata as any)?.description || '',
          created: artifact.createdAt,
          digest: artifact.contentHash,
          urls: [`charts/${artifact.name}-${artifact.version}.tgz`],
          appVersion: (artifact.metadata as any)?.appVersion || '',
        });
      }

      const indexYaml = {
        apiVersion: 'v1',
        entries,
        generated: new Date().toISOString(),
      };

      res.set('Content-Type', 'application/x-yaml');
      res.json(indexYaml);
    } catch (error) {
      next(error);
    }
  }
}