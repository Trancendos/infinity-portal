/**
 * API Gateway — Express + Helmet + Morgan (Pattern B Ecosystem Standard)
 * 
 * Single entry point for all external interactions.
 * Port 3020 — following Trancendos mesh port convention.
 */

import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import cors from 'cors';
import { createModuleLogger } from '../utils/logger.js';
import { getConfig } from '../config/environment.js';
import {
  traceIdMiddleware,
  authMiddleware,
  rateLimitMiddleware,
  requireRole,
  errorHandler,
} from './middleware.js';
import type { RegistryEngine } from '../registry/engine.js';
import type { NpmHandler } from '../registry/handlers/npm-handler.js';
import type { DockerHandler } from '../registry/handlers/docker-handler.js';
import type { GenericHandler } from '../registry/handlers/generic-handler.js';
import type { HelmHandler } from '../registry/handlers/helm-handler.js';
import type { TerraformHandler } from '../registry/handlers/terraform-handler.js';
import type { PyPIHandler } from '../registry/handlers/pypi-handler.js';
import type { ScannerOrchestrator } from '../security/scanner.js';
import type { PolicyEngine } from '../security/policy-engine.js';
import type { TenantManager } from '../tenant/tenant-manager.js';

const log = createModuleLogger('api:server');

export interface ServerDependencies {
  engine: RegistryEngine;
  npmHandler: NpmHandler;
  dockerHandler: DockerHandler;
  genericHandler: GenericHandler;
  helmHandler: HelmHandler;
  terraformHandler: TerraformHandler;
  pypiHandler: PyPIHandler;
  scanner: ScannerOrchestrator;
  policyEngine: PolicyEngine;
  tenantManager: TenantManager;
}

export function createServer(deps: ServerDependencies): express.Application {
  const app = express();
  const config = getConfig();

  // ─── Global Middleware ───────────────────────────────────────────────────

  // Security headers (Helmet — ecosystem standard)
  app.use(helmet({
    contentSecurityPolicy: false, // Registry serves various content types
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }));

  // CORS
  app.use(cors({
    origin: config.NODE_ENV === 'production'
      ? ['https://trancendos.com', 'https://*.trancendos.com']
      : '*',
    credentials: true,
    exposedHeaders: [
      'Docker-Content-Digest',
      'Docker-Distribution-API-Version',
      'Docker-Upload-UUID',
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
      'X-Artifact-Version',
      'X-Content-Hash',
      'X-Trace-Id',
    ],
  }));

  // Request logging (Morgan — ecosystem standard)
  app.use(morgan('combined', {
    stream: {
      write: (message: string) => log.info({ httpLog: message.trim() }, 'HTTP request'),
    },
  }));

  // Trace ID for distributed tracing
  app.use(traceIdMiddleware);

  // Body parsing — large limit for artifact uploads
  app.use(express.json({ limit: '500mb' }));
  app.use(express.raw({ type: 'application/octet-stream', limit: '500mb' }));
  app.use(express.raw({ type: 'application/gzip', limit: '500mb' }));

  // Rate limiting
  app.use(rateLimitMiddleware({
    windowMs: config.RATE_LIMIT_WINDOW_MS,
    maxRequests: config.RATE_LIMIT_MAX_REQUESTS,
  }));

  // ─── Health & Status (No Auth Required) ─────────────────────────────────

  app.get('/health', (_req, res) => {
    res.json({
      status: 'healthy',
      service: 'the-artifactory',
      port: config.PORT,
      version: '1.0.0',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/readiness', async (_req, res) => {
    // In production: check DB, storage, search, cache, auth
    res.json({
      ready: true,
      components: {
        database: 'healthy',
        storage: 'healthy',
        search: 'healthy',
        cache: 'healthy',
        auth: 'healthy',
      },
    });
  });

  app.get('/liveness', (_req, res) => {
    res.json({ alive: true, pid: process.pid });
  });

  // ─── Docker/OCI Registry (Special Auth — Docker clients) ────────────────

  app.use(deps.dockerHandler.createRouter());

  // ─── Authenticated Routes ───────────────────────────────────────────────

  // npm registry (supports anonymous read for public packages)
  const npmRouter = deps.npmHandler.createRouter();
  app.use('/npm', authMiddleware({ optional: true }), npmRouter);

  // Generic artifacts
  app.use(authMiddleware(), deps.genericHandler.createRouter());

  // Helm charts
  app.use(authMiddleware(), deps.helmHandler.createRouter());

  // Terraform modules
  app.use(authMiddleware(), deps.terraformHandler.createRouter());

  // PyPI packages
  app.use(authMiddleware(), deps.pypiHandler.createRouter());

  // ─── Management API ─────────────────────────────────────────────────────

  const mgmtRouter = express.Router();

  // Artifact management
  mgmtRouter.get('/artifacts/:id', async (req, res, next) => {
    try {
      const record = await deps.engine.getMetadata(req.params.id);
      res.json(record);
    } catch (error) {
      next(error);
    }
  });

  mgmtRouter.post('/artifacts/:id/promote', requireRole('admin', 'developer', 'ci-cd'), async (req, res, next) => {
    try {
      const record = await deps.engine.promote({
        artifactId: req.params.id,
        targetEnvironment: req.body.targetEnvironment,
        promotedBy: req.user!.username,
        reason: req.body.reason || 'Manual promotion',
      });
      res.json(record);
    } catch (error) {
      next(error);
    }
  });

  mgmtRouter.post('/artifacts/:id/quarantine', requireRole('admin', 'security-officer'), async (req, res, next) => {
    try {
      await deps.engine.quarantine(req.params.id, req.body.reason, req.user!.username);
      res.json({ ok: true, quarantined: true });
    } catch (error) {
      next(error);
    }
  });

  mgmtRouter.post('/artifacts/:id/release', requireRole('admin', 'security-officer'), async (req, res, next) => {
    try {
      await deps.engine.releaseFromQuarantine(req.params.id, req.user!.username, req.body.reason);
      res.json({ ok: true, released: true });
    } catch (error) {
      next(error);
    }
  });

  mgmtRouter.post('/artifacts/:id/scan', requireRole('admin', 'security-officer', 'ci-cd'), async (req, res, next) => {
    try {
      const results = await deps.scanner.rescanArtifact(req.params.id);
      res.json({ ok: true, results });
    } catch (error) {
      next(error);
    }
  });

  mgmtRouter.delete('/artifacts/:id', requireRole('admin'), async (req, res, next) => {
    try {
      await deps.engine.delete(req.params.id, req.user!.username, req.body.reason || 'Admin deletion');
      res.json({ ok: true, deleted: true });
    } catch (error) {
      next(error);
    }
  });

  // Search
  mgmtRouter.get('/search', async (req, res, next) => {
    try {
      const result = await deps.engine.search({
        query: (req.query.q as string) || '',
        type: req.query.type as any,
        tenantId: req.tenantId,
        limit: parseInt(req.query.limit as string) || 20,
        offset: parseInt(req.query.offset as string) || 0,
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  // Policies
  mgmtRouter.get('/policies', requireRole('admin', 'auditor'), (_req, res) => {
    res.json(deps.policyEngine.listPolicies());
  });

  mgmtRouter.get('/policies/:id', requireRole('admin', 'auditor'), (req, res) => {
    const policy = deps.policyEngine.getPolicy(req.params.id);
    if (!policy) {
      res.status(404).json({ error: 'Policy not found' });
      return;
    }
    res.json(policy);
  });

  // Tenants
  mgmtRouter.get('/tenants', requireRole('admin'), async (req, res, next) => {
    try {
      const tenants = await deps.tenantManager.listTenants();
      res.json(tenants);
    } catch (error) {
      next(error);
    }
  });

  mgmtRouter.post('/tenants', requireRole('admin'), async (req, res, next) => {
    try {
      const tenant = await deps.tenantManager.createTenant(req.body);
      res.status(201).json(tenant);
    } catch (error) {
      next(error);
    }
  });

  // Scanner status
  mgmtRouter.get('/scanners', requireRole('admin', 'security-officer'), async (_req, res) => {
    const available = await deps.scanner.getAvailableScanners();
    const policy = deps.scanner.getPolicy();
    res.json({ scanners: available, policy });
  });

  app.use('/api/v1', authMiddleware(), mgmtRouter);

  // ─── Terraform Service Discovery ────────────────────────────────────────

  app.get('/.well-known/terraform.json', (_req, res) => {
    res.json({
      'modules.v1': '/api/v1/terraform/modules/',
    });
  });

  // ─── 404 Handler ────────────────────────────────────────────────────────

  app.use((_req, res) => {
    res.status(404).json({
      error: 'Not found',
      code: 'NOT_FOUND',
      service: 'the-artifactory',
    });
  });

  // ─── Error Handler ──────────────────────────────────────────────────────

  app.use(errorHandler);

  log.info({ port: config.PORT }, 'API server configured');
  return app;
}