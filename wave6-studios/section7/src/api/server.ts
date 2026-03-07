/**
 * Section7 — REST API Server
 *
 * Ista: Bert-Joen Kater (The Storyista)
 * 
 * Intelligence, Narrative & Research Layer for the Trancendos Studio ecosystem.
 * Exposes sentiment analysis, lore generation, market intelligence, and
 * engagement prediction endpoints.
 *
 * Architecture: Trancendos Industry 6.0 / 2060 Standard
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { SentimentEngine } from '../intelligence/sentiment-engine';
import { LoreEngine } from '../narrative/lore-engine';
import { MarketScanner } from '../research/market-scanner';
import { logger } from '../utils/logger';

// ============================================================================
// IAM MIDDLEWARE — Trancendos 2060 Standard (TRN-PROD-001)
// ============================================================================
import { createHash, createHmac } from 'crypto';

const IAM_JWT_SECRET = process.env.IAM_JWT_SECRET || process.env.JWT_SECRET || '';
const IAM_ALGORITHM = process.env.JWT_ALGORITHM || 'HS512';
const SERVICE_ID = 'section7';
const MESH_ADDRESS = process.env.MESH_ADDRESS || 'section7.agent.local';

function sha512Audit(data: string): string {
  return createHash('sha512').update(data).digest('hex');
}

function b64urlDecode(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(b64 + '='.repeat((4 - b64.length % 4) % 4), 'base64').toString('utf8');
}

interface JWTClaims {
  sub: string; email?: string; role?: string;
  active_role_level?: number; permissions?: string[];
  exp?: number; jti?: string;
}

function verifyIAMToken(token: string): JWTClaims | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [h, p, sig] = parts;
    const header = JSON.parse(b64urlDecode(h));
    const alg = header.alg === 'HS512' ? 'sha512' : 'sha256';
    const expected = createHmac(alg, IAM_JWT_SECRET)
      .update(`${h}.${p}`).digest('base64url');
    if (sig !== expected) return null;
    const claims: JWTClaims = JSON.parse(b64urlDecode(p));
    if (claims.exp && claims.exp * 1000 < Date.now()) return null;
    return claims;
  } catch { return null; }
}

function iamRequestMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const traceId = (req.headers['x-trace-id'] as string) || `trc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const authHeader = req.headers.authorization;
  (req as any).traceId = traceId;
  (req as any).serviceId = SERVICE_ID;
  if (authHeader?.startsWith('Bearer ')) {
    const claims = verifyIAMToken(authHeader.slice(7));
    if (claims) {
      (req as any).user = claims;
      (req as any).auditHash = sha512Audit(JSON.stringify({ sub: claims.sub, path: req.path, ts: Date.now() }));
    }
  }
  next();
}

// ============================================================================
// ENGINE INSTANCES
// ============================================================================

export const sentimentEngine = new SentimentEngine();
export const loreEngine = new LoreEngine();
export const marketScanner = new MarketScanner();

// ============================================================================
// EXPRESS APP
// ============================================================================

export const app = express();

app.use(helmet());
app.use(cors());
app.use(morgan('short'));
app.use(express.json({ limit: '5mb' }));
app.use(iamRequestMiddleware);

// ── Health ──────────────────────────────────────────────────────────────────

app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    service: SERVICE_ID,
    ista: 'Bert-Joen Kater — The Storyista',
    mesh: MESH_ADDRESS,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// ── Sentiment Endpoints ─────────────────────────────────────────────────────

app.post('/intelligence/ingest', (req: Request, res: Response) => {
  try {
    const { source, sourceType, content, topics } = req.body;
    if (!source || !content) {
      return res.status(400).json({ error: 'source and content required' });
    }
    const dp = sentimentEngine.ingestDataPoint({ source, sourceType: sourceType ?? 'internal', content, topics });
    res.status(201).json(dp);
  } catch (err) {
    logger.error({ err }, 'Ingest failed');
    res.status(500).json({ error: 'Ingest failed' });
  }
});

app.post('/intelligence/batch-ingest', (req: Request, res: Response) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'items array required' });
    }
    const results = sentimentEngine.batchIngest(items);
    res.status(201).json({ ingested: results.length, results });
  } catch (err) {
    logger.error({ err }, 'Batch ingest failed');
    res.status(500).json({ error: 'Batch ingest failed' });
  }
});

app.get('/intelligence/trends', (_req: Request, res: Response) => {
  const limit = Number(_req.query.limit ?? 10);
  res.json(sentimentEngine.getTopTrends(limit));
});

app.get('/intelligence/trends/:topic', (req: Request, res: Response) => {
  const trend = sentimentEngine.getTrend(req.params.topic);
  if (!trend) return res.status(404).json({ error: 'Topic not tracked' });
  res.json(trend);
});

app.get('/intelligence/data-points', (req: Request, res: Response) => {
  const limit = Number(req.query.limit ?? 50);
  res.json(sentimentEngine.getRecentDataPoints(limit));
});

app.post('/intelligence/predict-engagement', (req: Request, res: Response) => {
  try {
    const { contentType, content } = req.body;
    if (!content) return res.status(400).json({ error: 'content required' });
    const prediction = sentimentEngine.predictEngagement(contentType ?? 'general', content);
    res.json(prediction);
  } catch (err) {
    logger.error({ err }, 'Prediction failed');
    res.status(500).json({ error: 'Prediction failed' });
  }
});

app.post('/intelligence/generate-report', (req: Request, res: Response) => {
  try {
    const { type, context } = req.body;
    const report = sentimentEngine.generateIntelligence(type ?? 'trend', context ?? 'general');
    res.status(201).json(report);
  } catch (err) {
    logger.error({ err }, 'Report generation failed');
    res.status(500).json({ error: 'Report generation failed' });
  }
});

// ── Lore / Narrative Endpoints ──────────────────────────────────────────────

app.post('/lore/nodes', (req: Request, res: Response) => {
  try {
    const node = loreEngine.createNode(req.body);
    res.status(201).json(node);
  } catch (err) {
    logger.error({ err }, 'Node creation failed');
    res.status(500).json({ error: 'Node creation failed' });
  }
});

app.get('/lore/nodes/:id', (req: Request, res: Response) => {
  const node = loreEngine.getNode(req.params.id);
  if (!node) return res.status(404).json({ error: 'Node not found' });
  res.json(node);
});

app.get('/lore/published', (req: Request, res: Response) => {
  const limit = Number(req.query.limit ?? 20);
  res.json(loreEngine.getPublishedNodes(limit));
});

app.post('/lore/branches', (req: Request, res: Response) => {
  try {
    const { name, description, rootContent } = req.body;
    if (!name || !rootContent) return res.status(400).json({ error: 'name and rootContent required' });
    const branch = loreEngine.createBranch(name, description ?? '', rootContent);
    res.status(201).json(branch);
  } catch (err) {
    logger.error({ err }, 'Branch creation failed');
    res.status(500).json({ error: 'Branch creation failed' });
  }
});

app.post('/lore/branches/:id/advance', (req: Request, res: Response) => {
  try {
    const node = loreEngine.advanceBranch(req.params.id, req.body);
    if (!node) return res.status(404).json({ error: 'Branch not found or inactive' });
    res.status(201).json(node);
  } catch (err) {
    logger.error({ err }, 'Branch advance failed');
    res.status(500).json({ error: 'Branch advance failed' });
  }
});

app.get('/lore/branches', (_req: Request, res: Response) => {
  res.json(loreEngine.getActiveBranches());
});

app.get('/lore/branches/:name/tree', (req: Request, res: Response) => {
  res.json(loreEngine.getBranchTree(req.params.name));
});

app.post('/lore/blueprints', (req: Request, res: Response) => {
  try {
    const blueprint = loreEngine.generateBlueprint(req.body);
    res.status(201).json(blueprint);
  } catch (err) {
    logger.error({ err }, 'Blueprint generation failed');
    res.status(500).json({ error: 'Blueprint generation failed' });
  }
});

app.post('/lore/empathy-check', (req: Request, res: Response) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'text required' });
    const result = loreEngine.filterForEmpathy(text);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Empathy check failed' });
  }
});

// ── Market Intelligence Endpoints ───────────────────────────────────────────

app.post('/market/competitors', (req: Request, res: Response) => {
  try {
    const profile = marketScanner.registerCompetitor(req.body);
    res.status(201).json(profile);
  } catch (err) {
    logger.error({ err }, 'Competitor registration failed');
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.get('/market/competitors', (_req: Request, res: Response) => {
  res.json(marketScanner.getAllCompetitors());
});

app.get('/market/competitors/:id', (req: Request, res: Response) => {
  const profile = marketScanner.getCompetitor(req.params.id);
  if (!profile) return res.status(404).json({ error: 'Competitor not found' });
  res.json(profile);
});

app.post('/market/competitors/:id/analyze', (req: Request, res: Response) => {
  try {
    const swot = marketScanner.analyzeSWOT(req.params.id, req.body.context);
    if (!swot) return res.status(404).json({ error: 'Competitor not found' });
    res.status(201).json(swot);
  } catch (err) {
    logger.error({ err }, 'SWOT analysis failed');
    res.status(500).json({ error: 'Analysis failed' });
  }
});

app.get('/market/intelligence', (req: Request, res: Response) => {
  const limit = Number(req.query.limit ?? 10);
  res.json(sentimentEngine.getRecentIntelligence(limit));
});

app.get('/market/drops', (req: Request, res: Response) => {
  const target = req.query.target as string | undefined;
  res.json(marketScanner.getPendingDrops(target));
});

app.post('/market/drops/:id/consume', (req: Request, res: Response) => {
  const drop = marketScanner.consumeDrop(req.params.id);
  if (!drop) return res.status(404).json({ error: 'Drop not found or already consumed' });
  res.json(drop);
});

// ── Dashboard ───────────────────────────────────────────────────────────────

app.get('/dashboard', (_req: Request, res: Response) => {
  res.json({
    service: SERVICE_ID,
    ista: 'Bert-Joen Kater — The Storyista',
    role: 'Intelligence, Narrative & Research Layer',
    pipeline: 'Stage 1 — Intelligence',
    intelligence: sentimentEngine.getStats(),
    lore: loreEngine.getStats(),
    market: marketScanner.getStats(),
    topTrends: sentimentEngine.getTopTrends(5),
    pendingDrops: marketScanner.getPendingDrops().length,
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

// ── Error Handler ───────────────────────────────────────────────────────────

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err: err.message, stack: err.stack }, 'Section7: Unhandled error — The Storyista is not amused');
  res.status(500).json({
    error: 'Internal server error',
    service: SERVICE_ID,
    ista_note: 'Bert-Joen has logged this incident with appropriate disdain.',
  });
});