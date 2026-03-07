/**
 * Infinity Portal — API Gateway Worker
 * ─────────────────────────────────────
 * Edge proxy running on Cloudflare Workers that provides:
 * • CORS handling with preflight caching
 * • Rate limiting via KV (sliding window)
 * • Response caching for GET requests
 * • Request/response header hardening
 * • Health check endpoint
 * • Error handling with structured JSON responses
 */

export interface Env {
  BACKEND_ORIGIN: string;
  ENVIRONMENT: string;
  RATE_LIMIT_RPM: string;
  CACHE_TTL: string;
  RATE_LIMIT: KVNamespace;
  CACHE: KVNamespace;
}

/* ── Constants ─────────────────────────────────────────── */
const ALLOWED_ORIGINS = [
  'https://infinity-portal.com',
  'https://www.infinity-portal.com',
  'https://infinity-portal.pages.dev',
  'http://localhost:5173',
  'http://localhost:3000',
];

const CORS_HEADERS = {
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Request-ID',
  'Access-Control-Max-Age': '86400',
  'Access-Control-Allow-Credentials': 'true',
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
};

/* ── Helpers ───────────────────────────────────────────── */
function getAllowedOrigin(request: Request): string | null {
  const origin = request.headers.get('Origin');
  if (!origin) return null;
  if (ALLOWED_ORIGINS.includes(origin)) return origin;
  // Allow any *.infinity-portal.pages.dev subdomain
  if (origin.endsWith('.infinity-portal.pages.dev')) return origin;
  return null;
}

function jsonResponse(data: object, status: number, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...SECURITY_HEADERS,
      ...extraHeaders,
    },
  });
}

/* ── Rate Limiting ─────────────────────────────────────── */
async function checkRateLimit(env: Env, clientIP: string): Promise<{ allowed: boolean; remaining: number }> {
  const rpm = parseInt(env.RATE_LIMIT_RPM || '120', 10);
  const key = `rl:${clientIP}`;
  const now = Math.floor(Date.now() / 60000); // Current minute
  const windowKey = `${key}:${now}`;

  try {
    const current = parseInt((await env.RATE_LIMIT.get(windowKey)) || '0', 10);

    if (current >= rpm) {
      return { allowed: false, remaining: 0 };
    }

    await env.RATE_LIMIT.put(windowKey, String(current + 1), { expirationTtl: 120 });
    return { allowed: true, remaining: rpm - current - 1 };
  } catch {
    // If KV fails, allow the request (fail open)
    return { allowed: true, remaining: rpm };
  }
}

/* ── Caching ───────────────────────────────────────────── */
async function getCachedResponse(env: Env, cacheKey: string): Promise<Response | null> {
  try {
    const cached = await env.CACHE.get(cacheKey, 'text');
    if (!cached) return null;

    const { body, status, headers } = JSON.parse(cached);
    return new Response(body, {
      status,
      headers: { ...headers, 'X-Cache': 'HIT' },
    });
  } catch {
    return null;
  }
}

async function setCachedResponse(env: Env, cacheKey: string, response: Response, ttl: number): Promise<void> {
  try {
    const body = await response.clone().text();
    const data = {
      body,
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
    };
    await env.CACHE.put(cacheKey, JSON.stringify(data), { expirationTtl: ttl });
  } catch {
    // Cache write failure is non-critical
  }
}

/* ── Main Handler ──────────────────────────────────────── */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = getAllowedOrigin(request);
    const corsHeaders: Record<string, string> = origin
      ? { ...CORS_HEADERS, 'Access-Control-Allow-Origin': origin }
      : {};

    // ── Health Check ────────────────────────────────────
    if (url.pathname === '/health' || url.pathname === '/api/health') {
      return jsonResponse(
        {
          status: 'healthy',
          service: 'api-gateway',
          environment: env.ENVIRONMENT,
          timestamp: new Date().toISOString(),
        },
        200,
        corsHeaders,
      );
    }

    // ── CORS Preflight ──────────────────────────────────
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: { ...corsHeaders, ...SECURITY_HEADERS },
      });
    }

    // ── Rate Limiting ───────────────────────────────────
    const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
    const { allowed, remaining } = await checkRateLimit(env, clientIP);

    if (!allowed) {
      return jsonResponse(
        { error: 'Too many requests', retryAfter: 60 },
        429,
        {
          ...corsHeaders,
          'Retry-After': '60',
          'X-RateLimit-Remaining': '0',
        },
      );
    }

    // ── Cache Check (GET only) ──────────────────────────
    const cacheable = request.method === 'GET' && !url.pathname.startsWith('/api/auth');
    const cacheKey = `cache:${url.pathname}${url.search}`;
    const cacheTTL = parseInt(env.CACHE_TTL || '60', 10);

    if (cacheable) {
      const cached = await getCachedResponse(env, cacheKey);
      if (cached) {
        // Add CORS and rate limit headers to cached response
        const headers = new Headers(cached.headers);
        Object.entries(corsHeaders).forEach(([k, v]) => headers.set(k, v));
        headers.set('X-RateLimit-Remaining', String(remaining));
        return new Response(cached.body, { status: cached.status, headers });
      }
    }

    // ── Proxy to Backend ────────────────────────────────
    const backendURL = new URL(url.pathname + url.search, env.BACKEND_ORIGIN);

    const proxyHeaders = new Headers(request.headers);
    proxyHeaders.set('X-Forwarded-For', clientIP);
    proxyHeaders.set('X-Forwarded-Proto', 'https');
    proxyHeaders.set('X-Request-ID', crypto.randomUUID());
    // Remove Cloudflare-specific headers from backend request
    proxyHeaders.delete('cf-connecting-ip');
    proxyHeaders.delete('cf-ray');
    proxyHeaders.delete('cf-visitor');

    try {
      const backendResponse = await fetch(backendURL.toString(), {
        method: request.method,
        headers: proxyHeaders,
        body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
      });

      // Build response with security + CORS headers
      const responseHeaders = new Headers(backendResponse.headers);
      Object.entries(SECURITY_HEADERS).forEach(([k, v]) => responseHeaders.set(k, v));
      Object.entries(corsHeaders).forEach(([k, v]) => responseHeaders.set(k, v));
      responseHeaders.set('X-RateLimit-Remaining', String(remaining));
      responseHeaders.set('X-Cache', 'MISS');

      const response = new Response(backendResponse.body, {
        status: backendResponse.status,
        headers: responseHeaders,
      });

      // Cache successful GET responses
      if (cacheable && backendResponse.status === 200) {
        setCachedResponse(env, cacheKey, response.clone(), cacheTTL);
      }

      return response;
    } catch (err) {
      return jsonResponse(
        {
          error: 'Backend unavailable',
          message: env.ENVIRONMENT === 'production' ? 'Service temporarily unavailable' : String(err),
        },
        502,
        corsHeaders,
      );
    }
  },
};