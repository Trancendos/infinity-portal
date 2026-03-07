/**
 * Style&Shoot Studios — REST API Server
 *
 * Ista: Madam Krystal (The UX UIista)
 * Pipeline Stage: 2 — Visual Logic
 *
 * Architecture: Trancendos Industry 6.0 / 2060 Standard
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { ComponentEngine } from '../visual/component-engine';
import { DesignSystem } from '../design/design-system';
import { SVGGenerator } from '../image/svg-generator';
import { logger } from '../utils/logger';

// ── IAM Middleware ───────────────────────────────────────────────────────────
import { createHash, createHmac } from 'crypto';
const IAM_JWT_SECRET = process.env.IAM_JWT_SECRET || process.env.JWT_SECRET || '';
const SERVICE_ID = 'style-and-shoot';
const MESH_ADDRESS = process.env.MESH_ADDRESS || 'style-and-shoot.agent.local';

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

// ── Engine Instances ────────────────────────────────────────────────────────
export const componentEngine = new ComponentEngine();
export const designSystem = new DesignSystem();
export const svgGenerator = new SVGGenerator();

// ── Express App ─────────────────────────────────────────────────────────────
export const app = express();
app.use(helmet()); app.use(cors()); app.use(morgan('short'));
app.use(express.json({ limit: '5mb' })); app.use(iamRequestMiddleware);

// ── Health ──────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'healthy', service: SERVICE_ID, ista: 'Madam Krystal — The UX UIista', mesh: MESH_ADDRESS, uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// ── Component Endpoints ─────────────────────────────────────────────────────
app.post('/components', (req, res) => {
  try { res.status(201).json(componentEngine.createComponent(req.body)); }
  catch (err: any) { res.status(400).json({ error: err.message }); }
});
app.get('/components/:id', (req, res) => {
  const c = componentEngine.getComponent(req.params.id);
  if (!c) return res.status(404).json({ error: 'Component not found' });
  res.json(c);
});
app.post('/components/:id/validate', (req, res) => {
  try { res.json(componentEngine.validateComponent(req.params.id)); }
  catch (err: any) { res.status(400).json({ error: err.message }); }
});
app.post('/components/:id/compile', (req, res) => {
  const output = componentEngine.compileComponent(req.params.id);
  if (!output) return res.status(400).json({ error: 'Cannot compile — component not validated. Madam Krystal disapproves.' });
  res.json({ componentId: req.params.id, output });
});
app.get('/components/:id/tree', (req, res) => {
  res.json(componentEngine.getComponentTree(req.params.id));
});
app.get('/components', (req, res) => {
  const type = req.query.type as string | undefined;
  if (type) return res.json(componentEngine.getComponentsByType(type as any));
  res.json(componentEngine.getStats());
});

// ── BER (Biometric Empathy Rendering) ───────────────────────────────────────
app.get('/ber', (_req, res) => { res.json(componentEngine.getBERState()); });
app.post('/ber', (req, res) => { res.json(componentEngine.updateBER(req.body)); });

// ── Design System Endpoints ─────────────────────────────────────────────────
app.get('/design/tokens', (_req, res) => { res.json(designSystem.getDesignTokens()); });
app.get('/design/colors', (_req, res) => { res.json(designSystem.getColors()); });
app.get('/design/typography', (_req, res) => { res.json(designSystem.getTypography()); });
app.get('/design/spacing', (_req, res) => { res.json(designSystem.getSpacing()); });
app.post('/design/colors', (req, res) => {
  try { res.status(201).json(designSystem.registerColor(req.body)); }
  catch (err: any) { res.status(400).json({ error: err.message }); }
});
app.post('/design/validate', (req, res) => { res.json(designSystem.validateDesign(req.body)); });
app.post('/design/contrast', (req, res) => {
  const { fg, bg } = req.body;
  if (!fg || !bg) return res.status(400).json({ error: 'fg and bg hex values required' });
  res.json(designSystem.validateColorPair(fg, bg));
});

// ── SVG Generator Endpoints ─────────────────────────────────────────────────
app.post('/svg/generate', (req, res) => {
  try { res.status(201).json(svgGenerator.generate(req.body)); }
  catch (err: any) { res.status(400).json({ error: err.message }); }
});
app.post('/svg/pattern', (req, res) => {
  try { res.status(201).json(svgGenerator.generatePattern(req.body)); }
  catch (err: any) { res.status(400).json({ error: err.message }); }
});
app.get('/svg/:id', (req, res) => {
  const asset = svgGenerator.getAsset(req.params.id);
  if (!asset) return res.status(404).json({ error: 'SVG asset not found' });
  res.json(asset);
});
app.get('/svg/:id/raw', (req, res) => {
  const asset = svgGenerator.getAsset(req.params.id);
  if (!asset) return res.status(404).json({ error: 'SVG asset not found' });
  res.type('image/svg+xml').send(asset.svgContent);
});
app.get('/svg/:id/compare', (req, res) => {
  const asset = svgGenerator.getAsset(req.params.id);
  if (!asset) return res.status(404).json({ error: 'SVG asset not found' });
  res.json(svgGenerator.estimateRasterSize(asset, (req.query.format as any) ?? 'png'));
});
app.get('/svg', (req, res) => {
  const type = req.query.type as string | undefined;
  if (type) return res.json(svgGenerator.getAssetsByType(type as any));
  res.json(svgGenerator.getAllAssets());
});

// ── Dashboard ───────────────────────────────────────────────────────────────
app.get('/dashboard', (_req, res) => {
  res.json({
    service: SERVICE_ID, ista: 'Madam Krystal — The UX UIista', role: 'Empathy-Driven UX/UI & Visual Engine',
    pipeline: 'Stage 2 — Visual Logic',
    components: componentEngine.getStats(), design: designSystem.getStats(), svg: svgGenerator.getStats(),
    ber: componentEngine.getBERState(), timestamp: new Date().toISOString(),
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

// ── Error Handler ───────────────────────────────────────────────────────────
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err: err.message }, 'Style&Shoot: Unhandled error — Madam Krystal is deeply unimpressed');
  res.status(500).json({ error: 'Internal server error', service: SERVICE_ID, ista_note: 'Madam Krystal has noted this failure with exquisite disapproval.' });
});