/**
 * TateKing Studios — REST API Server
 * Ista: Benji & Sam (The Movistas)
 * Pipeline Stage: 3 — Spatial Logic
 */
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { TimelineEngine } from '../timeline/timeline-engine';
import { LightingEngine } from '../lighting/lighting-engine';
import { SwarmOrchestrator } from '../swarm/swarm-orchestrator';
import { logger } from '../utils/logger';

import { createHash, createHmac } from 'crypto';
const IAM_JWT_SECRET = process.env.IAM_JWT_SECRET || process.env.JWT_SECRET || '';
const SERVICE_ID = 'tateking';
const MESH_ADDRESS = process.env.MESH_ADDRESS || 'tateking.agent.local';
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

export const timelineEngine = new TimelineEngine();
export const lightingEngine = new LightingEngine();
export const swarmOrchestrator = new SwarmOrchestrator();
export const app = express();
app.use(helmet()); app.use(cors()); app.use(morgan('short'));
app.use(express.json({ limit: '5mb' })); app.use(iamRequestMiddleware);

app.get('/health', (_req, res) => {
  res.json({ status: 'healthy', service: SERVICE_ID, ista: 'Benji & Sam — The Movistas', mesh: MESH_ADDRESS, uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// Timeline
app.post('/timeline/tracks', (req, res) => { res.status(201).json(timelineEngine.createTrack(req.body)); });
app.get('/timeline/tracks/:id', (req, res) => { const t = timelineEngine.getTrack(req.params.id); if (!t) return res.status(404).json({ error: 'Not found' }); res.json(t); });
app.post('/timeline/tracks/:id/keyframes', (req, res) => { const t = timelineEngine.addKeyframe(req.params.id, req.body); if (!t) return res.status(400).json({ error: 'Failed' }); res.json(t); });
app.post('/timeline/scenes', (req, res) => { res.status(201).json(timelineEngine.createScene(req.body)); });
app.get('/timeline/scenes/:id', (req, res) => { const s = timelineEngine.getScene(req.params.id); if (!s) return res.status(404).json({ error: 'Not found' }); res.json(s); });
app.post('/timeline/productions', (req, res) => { res.status(201).json(timelineEngine.createProduction(req.body)); });
app.get('/timeline/productions', (_req, res) => { res.json(timelineEngine.getAllProductions()); });
app.get('/timeline/productions/:id', (req, res) => { const p = timelineEngine.getProduction(req.params.id); if (!p) return res.status(404).json({ error: 'Not found' }); res.json(p); });

// Lighting
app.post('/lighting/lights', (req, res) => { res.status(201).json(lightingEngine.createLight(req.body)); });
app.get('/lighting/lights', (_req, res) => { res.json(lightingEngine.getAllLights()); });
app.post('/lighting/presets', (req, res) => { res.status(201).json(lightingEngine.createPreset(req.body)); });
app.get('/lighting/presets', (_req, res) => { res.json(lightingEngine.getAllPresets()); });

// Swarm
app.post('/swarm', (req, res) => { res.status(201).json(swarmOrchestrator.createSwarm(req.body)); });
app.get('/swarm', (_req, res) => { res.json(swarmOrchestrator.getAllSwarms()); });
app.get('/swarm/:id', (req, res) => { const s = swarmOrchestrator.getSwarm(req.params.id); if (!s) return res.status(404).json({ error: 'Not found' }); res.json({ ...s, boidCount: s.boids.length, boids: undefined }); });
app.post('/swarm/:id/step', (req, res) => { const r = swarmOrchestrator.stepSwarm(req.params.id); if (!r) return res.status(404).json({ error: 'Not found' }); res.json(r); });

app.get('/dashboard', (_req, res) => {
  res.json({
    service: SERVICE_ID, ista: 'Benji & Sam — The Movistas', role: 'Serverless Cinematic Rendering Engine',
    pipeline: 'Stage 3 — Spatial Logic',
    timeline: timelineEngine.getStats(), lighting: lightingEngine.getStats(), swarm: swarmOrchestrator.getStats(),
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
  logger.error({ err: err.message }, 'TateKing: Error — Benji & Sam call for a retake');
  res.status(500).json({ error: 'Internal server error', service: SERVICE_ID });
});
