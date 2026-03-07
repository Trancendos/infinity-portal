/**
 * Infinity Portal — Monitoring Dashboard Worker
 *
 * Aggregates data from Prometheus-AI and Sentinel-AI into a unified
 * monitoring dashboard endpoint. Provides ecosystem-wide visibility
 * for the Trancendos mesh.
 *
 * Port: 3098 (internal worker)
 * Architecture: Trancendos Industry 6.0 / 2060 Standard
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';

// ── Configuration ────────────────────────────────────────────────────────────

const PORT = Number(process.env.MONITORING_PORT ?? 3098);
const HOST = process.env.HOST ?? '0.0.0.0';
const PROMETHEUS_URL = process.env.PROMETHEUS_URL || 'http://prometheus-ai:3019';
const SENTINEL_URL = process.env.SENTINEL_URL || 'http://sentinel-ai:3021';
const CACHE_TTL_MS = Number(process.env.DASHBOARD_CACHE_TTL_MS ?? 10_000);

// ── Types ────────────────────────────────────────────────────────────────────

interface CachedData {
  data: unknown;
  fetchedAt: number;
}

// ── Cache ────────────────────────────────────────────────────────────────────

const cache = new Map<string, CachedData>();

async function fetchWithCache(url: string, key: string): Promise<unknown> {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'X-Trace-Id': `dashboard-${Date.now()}`,
        'X-Service-Id': 'monitoring-dashboard',
      },
    });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const json = await response.json() as any;
    const data = json.data || json;
    cache.set(key, { data, fetchedAt: Date.now() });
    return data;
  } catch (err: any) {
    // Return cached data if available, even if stale
    if (cached) return cached.data;
    return { error: err.message, unavailable: true };
  }
}

// ── App ──────────────────────────────────────────────────────────────────────

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());

function ok(res: Response, data: unknown): void {
  res.json({ success: true, data, timestamp: new Date().toISOString() });
}

// ── Health ───────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  ok(res, {
    status: 'healthy',
    service: 'monitoring-dashboard',
    role: 'aggregator',
    uptime: process.uptime(),
    sources: {
      prometheus: PROMETHEUS_URL,
      sentinel: SENTINEL_URL,
    },
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// UNIFIED DASHBOARD — Single endpoint for full ecosystem visibility
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/dashboard', async (_req, res) => {
  const [
    prometheusHealth,
    sentinelDashboard,
    ecosystemHealth,
    slaReport,
  ] = await Promise.all([
    fetchWithCache(`${PROMETHEUS_URL}/ecosystem/dashboard`, 'prom-dashboard'),
    fetchWithCache(`${SENTINEL_URL}/dashboard`, 'sentinel-dashboard'),
    fetchWithCache(`${PROMETHEUS_URL}/ecosystem/health`, 'ecosystem-health'),
    fetchWithCache(`${SENTINEL_URL}/sla`, 'sla-report'),
  ]);

  ok(res, {
    ecosystem: ecosystemHealth,
    prometheus: prometheusHealth,
    sentinel: sentinelDashboard,
    sla: slaReport,
    sources: {
      prometheus: { url: PROMETHEUS_URL, status: (prometheusHealth as any)?.unavailable ? 'offline' : 'online' },
      sentinel: { url: SENTINEL_URL, status: (sentinelDashboard as any)?.unavailable ? 'offline' : 'online' },
    },
  });
});

// ── Proxy Endpoints ──────────────────────────────────────────────────────────

// Ecosystem health (from Prometheus-AI)
app.get('/dashboard/ecosystem', async (_req, res) => {
  const data = await fetchWithCache(`${PROMETHEUS_URL}/ecosystem/health`, 'ecosystem-health');
  ok(res, data);
});

// Service registry (from Prometheus-AI)
app.get('/dashboard/registry', async (_req, res) => {
  const data = await fetchWithCache(`${PROMETHEUS_URL}/ecosystem/registry`, 'registry');
  ok(res, data);
});

// Watchdog services (from Sentinel-AI)
app.get('/dashboard/services', async (_req, res) => {
  const data = await fetchWithCache(`${SENTINEL_URL}/services`, 'services');
  ok(res, data);
});

// SLA report (from Sentinel-AI)
app.get('/dashboard/sla', async (_req, res) => {
  const data = await fetchWithCache(`${SENTINEL_URL}/sla`, 'sla-report');
  ok(res, data);
});

// Alerts (from both sources)
app.get('/dashboard/alerts', async (_req, res) => {
  const [promAlerts, sentinelAlerts] = await Promise.all([
    fetchWithCache(`${PROMETHEUS_URL}/alerts`, 'prom-alerts'),
    fetchWithCache(`${SENTINEL_URL}/alerts`, 'sentinel-alerts'),
  ]);
  ok(res, {
    prometheus: promAlerts,
    sentinel: sentinelAlerts,
  });
});

// Incidents (from Sentinel-AI)
app.get('/dashboard/incidents', async (_req, res) => {
  const data = await fetchWithCache(`${SENTINEL_URL}/incidents`, 'incidents');
  ok(res, data);
});

// Threat level (from Prometheus-AI)
app.get('/dashboard/threat-level', async (_req, res) => {
  const data = await fetchWithCache(`${PROMETHEUS_URL}/threat-level`, 'threat-level');
  ok(res, data);
});

// Lockdown status (from Prometheus-AI)
app.get('/dashboard/lockdown', async (_req, res) => {
  const data = await fetchWithCache(`${PROMETHEUS_URL}/lockdown`, 'lockdown');
  ok(res, data);
});

// Prometheus text metrics (passthrough)
app.get('/dashboard/metrics/prometheus', async (_req, res) => {
  try {
    const response = await fetch(`${PROMETHEUS_URL}/metrics/prometheus`);
    const text = await response.text();
    res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.send(text);
  } catch {
    res.status(503).send('# Prometheus metrics unavailable\n');
  }
});

// ── Error Handler ────────────────────────────────────────────────────────────

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, error: err.message });
});

// ── Start ────────────────────────────────────────────────────────────────────

const server = app.listen(PORT, HOST, () => {
  console.log(`📊 Monitoring Dashboard online at http://${HOST}:${PORT}`);
  console.log(`   Prometheus: ${PROMETHEUS_URL}`);
  console.log(`   Sentinel:   ${SENTINEL_URL}`);
});

// Graceful shutdown
const shutdown = (signal: string) => {
  console.log(`${signal} received — shutting down`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000);
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));