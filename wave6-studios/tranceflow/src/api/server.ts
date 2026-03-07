/**
 * TranceFlow Studio's — REST API Server
 * Ista: Junior Cesar (The Gamingista)
 * Pipeline Stage: 3 — Spatial Logic
 */
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { PhysicsEngine } from '../spatial/physics-engine';
import { AvatarEngine } from '../avatar/avatar-engine';
import { SelfHealingMesh } from '../geometry/self-healing-mesh';
import { logger } from '../utils/logger';

import { createHash, createHmac } from 'crypto';
const IAM_JWT_SECRET = process.env.IAM_JWT_SECRET || process.env.JWT_SECRET || '';
const SERVICE_ID = 'tranceflow';
const MESH_ADDRESS = process.env.MESH_ADDRESS || 'tranceflow.agent.local';
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

export const physicsEngine = new PhysicsEngine();
export const avatarEngine = new AvatarEngine();
export const meshEngine = new SelfHealingMesh();
export const app = express();
app.use(helmet()); app.use(cors()); app.use(morgan('short'));
app.use(express.json({ limit: '5mb' })); app.use(iamRequestMiddleware);

app.get('/health', (_req, res) => {
  res.json({ status: 'healthy', service: SERVICE_ID, ista: 'Junior Cesar — The Gamingista', mesh: MESH_ADDRESS, uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// Physics
app.post('/physics/worlds', (req, res) => { res.status(201).json(physicsEngine.createWorld(req.body)); });
app.get('/physics/worlds/:id', (req, res) => { const w = physicsEngine.getWorld(req.params.id); if (!w) return res.status(404).json({ error: 'Not found' }); res.json(w); });
app.post('/physics/worlds/:id/bodies', (req, res) => { const b = physicsEngine.addBody(req.params.id, req.body); if (!b) return res.status(400).json({ error: 'Failed' }); res.status(201).json(b); });
app.post('/physics/worlds/:id/step', (req, res) => { const r = physicsEngine.stepWorld(req.params.id); if (!r) return res.status(404).json({ error: 'Not found' }); res.json(r); });

// Avatars
app.post('/avatars', (req, res) => { res.status(201).json(avatarEngine.createAvatar(req.body)); });
app.get('/avatars', (_req, res) => { res.json(avatarEngine.getAllAvatars()); });
app.get('/avatars/:id', (req, res) => { const a = avatarEngine.getAvatar(req.params.id); if (!a) return res.status(404).json({ error: 'Not found' }); res.json(a); });
app.post('/avatars/:id/mocap', (req, res) => { const a = avatarEngine.enableMotionCapture(req.params.id); if (!a) return res.status(404).json({ error: 'Not found' }); res.json(a); });
app.post('/avatars/:id/animate', (req, res) => { const a = avatarEngine.setAnimationState(req.params.id, req.body.state ?? 'idle'); if (!a) return res.status(404).json({ error: 'Not found' }); res.json(a); });

// Meshes
app.post('/meshes', (req, res) => { res.status(201).json(meshEngine.registerMesh(req.body)); });
app.get('/meshes', (_req, res) => { res.json(meshEngine.getAllMeshes()); });
app.get('/meshes/:id', (req, res) => { const m = meshEngine.getMesh(req.params.id); if (!m) return res.status(404).json({ error: 'Not found' }); res.json(m); });
app.post('/meshes/:id/issue', (req, res) => { const m = meshEngine.reportIssue(req.params.id, req.body.issue ?? 'unknown'); if (!m) return res.status(404).json({ error: 'Not found' }); res.json(m); });
app.post('/meshes/:id/heal', (req, res) => { const m = meshEngine.healMesh(req.params.id); if (!m) return res.status(404).json({ error: 'Not found' }); res.json(m); });

app.get('/dashboard', (_req, res) => {
  res.json({
    service: SERVICE_ID, ista: 'Junior Cesar — The Gamingista', role: '3D Spatial & Avatar Engine',
    pipeline: 'Stage 3 — Spatial Logic',
    physics: physicsEngine.getStats(), avatars: avatarEngine.getStats(), meshes: meshEngine.getStats(),
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
  logger.error({ err: err.message }, 'TranceFlow: Error — Junior Cesar respawns');
  res.status(500).json({ error: 'Internal server error', service: SERVICE_ID });
});
