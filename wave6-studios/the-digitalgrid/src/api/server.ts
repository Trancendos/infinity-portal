/**
 * The DigitalGrid — REST API Server
 * Ista: Tyler Towncroft (The DevOpsista)
 * Pipeline Stage: 4 — Deployment
 */
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { SpatialRouter } from '../routing/spatial-router';
import { QuarantineEngine } from '../quarantine/quarantine-engine';
import { WebhookMatrix } from '../webhooks/webhook-matrix';
import { logger } from '../utils/logger';

import { createHash, createHmac } from 'crypto';
const IAM_JWT_SECRET = process.env.IAM_JWT_SECRET || process.env.JWT_SECRET || '';
const SERVICE_ID = 'the-digitalgrid';
const MESH_ADDRESS = process.env.MESH_ADDRESS || 'the-digitalgrid.agent.local';
function sha512Audit(data: string): string { return createHash('sha512').update(data).digest('hex'); }
function b64urlDecode(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(b64 + '='.repeat((4 - b64.length % 4) % 4), 'base64').toString('utf8');
}
interface JWTClaims { sub: string; email?: string; role?: string; active_role_level?: number; permissions?: string[]; exp?: number; jti?: string; }
function verifyIAMToken(token: string): JWTClaims | null {
  try {
    const parts = token.split('.'); if (parts.length !== 3) return null;
    const [h, p, sig] = parts;
    const header = JSON.parse(b64urlDecode(h));
    const alg = header.alg === 'HS512' ? 'sha512' : 'sha256';
    const expected = createHmac(alg, IAM_JWT_SECRET).update(`${h}.${p}`).digest('base64url');
    if (sig !== expected) return null;
    const claims: JWTClaims = JSON.parse(b64urlDecode(p));
    if (claims.exp && claims.exp * 1000 < Date.now()) return null;
    return claims;
  } catch { return null; }
}
function iamRequestMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const traceId = (req.headers['x-trace-id'] as string) || `trc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  (req as any).traceId = traceId; (req as any).serviceId = SERVICE_ID;
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const claims = verifyIAMToken(authHeader.slice(7));
    if (claims) { (req as any).user = claims; (req as any).auditHash = sha512Audit(JSON.stringify({ sub: claims.sub, path: req.path, ts: Date.now() })); }
  }
  next();
}

export const spatialRouter = new SpatialRouter();
export const quarantineEngine = new QuarantineEngine();
export const webhookMatrix = new WebhookMatrix();
export const app = express();
app.use(helmet()); app.use(cors()); app.use(morgan('short'));
app.use(express.json({ limit: '5mb' })); app.use(iamRequestMiddleware);

app.get('/health', (_req, res) => {
  res.json({ status: 'healthy', service: SERVICE_ID, ista: 'Tyler Towncroft — The DevOpsista', mesh: MESH_ADDRESS, uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// Routing
app.post('/routing/nodes', (req, res) => { res.status(201).json(spatialRouter.registerNode(req.body)); });
app.get('/routing/nodes', (_req, res) => { res.json(spatialRouter.getAllNodes()); });
app.get('/routing/nodes/:id', (req, res) => { const n = spatialRouter.getNode(req.params.id); if (!n) return res.status(404).json({ error: 'Not found' }); res.json(n); });
app.post('/routing/nodes/:id/traffic', (req, res) => { const n = spatialRouter.updateTraffic(req.params.id, req.body.weight ?? 1); if (!n) return res.status(404).json({ error: 'Not found' }); res.json(n); });
app.post('/routing/connect', (req, res) => { const ok = spatialRouter.connectNodes(req.body.sourceId, req.body.targetId); res.json({ connected: ok }); });

// Pipelines
app.post('/pipelines', (req, res) => { res.status(201).json(spatialRouter.createPipeline(req.body)); });
app.get('/pipelines', (_req, res) => { res.json(spatialRouter.getAllPipelines()); });
app.get('/pipelines/:id', (req, res) => { const p = spatialRouter.getPipeline(req.params.id); if (!p) return res.status(404).json({ error: 'Not found' }); res.json(p); });
app.post('/pipelines/:id/advance', (req, res) => { const p = spatialRouter.advancePipeline(req.params.id); if (!p) return res.status(400).json({ error: 'Cannot advance' }); res.json(p); });

// Quarantine
app.post('/quarantine', (req, res) => { res.status(201).json(quarantineEngine.quarantine(req.body)); });
app.get('/quarantine', (_req, res) => { res.json(quarantineEngine.getAllZones()); });
app.get('/quarantine/active', (_req, res) => { res.json(quarantineEngine.getActiveZones()); });
app.post('/quarantine/:id/resolve', (req, res) => { const z = quarantineEngine.resolve(req.params.id); if (!z) return res.status(404).json({ error: 'Not found' }); res.json(z); });

// Webhooks
app.post('/webhooks', (req, res) => { res.status(201).json(webhookMatrix.registerEndpoint(req.body)); });
app.get('/webhooks', (_req, res) => { res.json(webhookMatrix.getAllEndpoints()); });
app.get('/webhooks/:id', (req, res) => { const e = webhookMatrix.getEndpoint(req.params.id); if (!e) return res.status(404).json({ error: 'Not found' }); res.json(e); });
app.post('/webhooks/:id/success', (req, res) => { const e = webhookMatrix.recordSuccess(req.params.id); if (!e) return res.status(404).json({ error: 'Not found' }); res.json(e); });
app.post('/webhooks/:id/failure', (req, res) => { const e = webhookMatrix.recordFailure(req.params.id); if (!e) return res.status(404).json({ error: 'Not found' }); res.json(e); });

app.get('/dashboard', (_req, res) => {
  res.json({
    service: SERVICE_ID, ista: 'Tyler Towncroft — The DevOpsista', role: 'Infrastructure & CI/CD Automation Matrix',
    pipeline: 'Stage 4 — Deployment',
    routing: spatialRouter.getStats(), quarantine: quarantineEngine.getStats(), webhooks: webhookMatrix.getStats(),
    timestamp: new Date().toISOString(),
  });
});


// ═══════════════════════════════════════════════════════════════════════════════
// 2060 SMART RESILIENCE LAYER — Auto-wired by Trancendos Compliance Engine
// ═══════════════════════════════════════════════════════════════════════════════
import {
  SmartTelemetry,
  SmartEventBus,
  SmartCircuitBreaker,
  telemetryMiddleware,
  adaptiveRateLimitMiddleware,
  createHealthEndpoint,
  setupGracefulShutdown,
} from '../middleware/resilience-layer';

// Initialize 2060 singletons
const telemetry2060 = SmartTelemetry.getInstance();
const eventBus2060 = SmartEventBus.getInstance();
const circuitBreaker2060 = new SmartCircuitBreaker(`${SERVICE_ID}-primary`, {
  failureThreshold: 5,
  resetTimeoutMs: 30000,
  halfOpenMaxAttempts: 3,
});

// Wire telemetry middleware (request tracking + trace propagation)
app.use(telemetryMiddleware);

// Wire adaptive rate limiting (IAM-level aware)
app.use(adaptiveRateLimitMiddleware);

// 2060 Enhanced health endpoint with resilience status
app.get('/health/2060', createHealthEndpoint({
  serviceName: SERVICE_ID,
  meshAddress: MESH_ADDRESS,
  getCustomHealth: () => ({
    circuitBreaker: circuitBreaker2060.getState(),
    eventBusListeners: eventBus2060.listenerCount(),
    telemetryMetrics: telemetry2060.getMetricNames().length,
  }),
}));

// Prometheus text format metrics export
app.get('/metrics/prometheus', (_req: any, res: any) => {
  res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  res.send(telemetry2060.exportPrometheus());
});

// Emit service lifecycle events
eventBus2060.emit('service.2060.wired', {
  serviceId: SERVICE_ID,
  meshAddress: MESH_ADDRESS,
  timestamp: new Date().toISOString(),
  features: ['telemetry', 'rate-limiting', 'circuit-breaker', 'event-bus', 'prometheus-export'],
});

// ═══════════════════════════════════════════════════════════════════════════════
// END 2060 SMART RESILIENCE LAYER
// ═══════════════════════════════════════════════════════════════════════════════

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err: err.message }, 'DigitalGrid: Error — Tyler is writing a post-mortem');
  res.status(500).json({ error: 'Internal server error', service: SERVICE_ID });
});
