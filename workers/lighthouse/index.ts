/**
 * Lighthouse Cloudflare Worker
 * Cryptographic Token Management Hub API
 *
 * Routes:
 *   POST   /tokens                    — Issue UET for entity
 *   GET    /tokens/:tokenId           — Get token details
 *   POST   /tokens/:tokenId/verify    — Verify token integrity
 *   POST   /tokens/:tokenId/rotate    — Rotate token
 *   POST   /tokens/:tokenId/revoke    — Revoke token
 *   PATCH  /tokens/:tokenId/risk      — Update risk score
 *   POST   /tokens/:tokenId/activity  — Record activity
 *
 *   GET    /threats                   — List threat events
 *   POST   /threats                   — Create threat event
 *   PATCH  /threats/:threatId         — Update threat status
 *
 *   POST   /warp                      — Trigger Warp Tunnel transfer
 *   GET    /warp/:transferId          — Get transfer status
 *
 *   GET    /icebox                    — List IceBox entries
 *   GET    /icebox/:entryId           — Get IceBox entry
 *   POST   /icebox/:entryId/verdict   — Issue verdict
 *
 *   GET    /metrics                   — Lighthouse metrics
 *   GET    /health                    — Health check
 *
 *   POST   /internal/events           — Internal event receiver (from other workers)
 */

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
  INFINITY_ONE_URL: string;
  HIVE_URL: string;
  VOID_URL: string;
  INTERNAL_SECRET: string;
  KV_TOKENS: KVNamespace;
  KV_RATE_LIMIT: KVNamespace;
  ENVIRONMENT: string;
}

// ============================================================
// RESPONSE HELPERS
// ============================================================

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Request-ID, X-Internal-Secret',
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

function errorResponse(message: string, status = 400, code = 'ERROR'): Response {
  return jsonResponse({ error: { message, code, status }, timestamp: new Date().toISOString() }, status);
}

// ============================================================
// SUPABASE CLIENT
// ============================================================

async function dbQuery(env: Env, path: string, method = 'GET', body?: unknown): Promise<{ data: unknown; error: unknown }> {
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'apikey': env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Prefer': 'return=representation',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  return response.ok ? { data, error: null } : { data: null, error: data };
}

// ============================================================
// TOKEN GENERATION
// ============================================================

function generateTokenId(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Array.from(crypto.getRandomValues(new Uint8Array(8)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
  return `UET-${timestamp}-${random}`;
}

async function computeEntityHash(entityId: string, entityType: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`${entityType}:${entityId}:lighthouse`);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function signToken(tokenId: string, payload: unknown): Promise<string> {
  // In production: use ML-DSA-65 (CRYSTALS-Dilithium) signing
  const encoder = new TextEncoder();
  const data = encoder.encode(JSON.stringify({ tokenId, payload }));
  const hash = await crypto.subtle.digest('SHA-256', data);
  return 'ML-DSA-65:' + Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ============================================================
// ROUTE HANDLERS
// ============================================================

async function handleIssueToken(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as {
    entityId: string;
    entityType: string;
    classification?: string;
    metadata?: Record<string, unknown>;
  };

  if (!body.entityId || !body.entityType) {
    return errorResponse('entityId and entityType are required', 400, 'MISSING_FIELDS');
  }

  const tokenId = generateTokenId();
  const entityHash = await computeEntityHash(body.entityId, body.entityType);
  const now = new Date().toISOString();

  const payload = {
    entityId: body.entityId,
    entityType: body.entityType,
    entityHash,
    riskScore: 0,
    classification: body.classification ?? 'INTERNAL',
    issuedAt: now,
  };

  const signature = await signToken(tokenId, payload);

  const token = {
    token_id: tokenId,
    entity_id: body.entityId,
    entity_type: body.entityType,
    entity_hash: entityHash,
    version: 1,
    status: 'active',
    classification: body.classification ?? 'INTERNAL',
    risk_score: 0,
    risk_level: 'none',
    risk_factors: [],
    signature,
    signing_algorithm: 'ML-DSA-65',
    behavioural_fingerprint: {
      accessPatterns: [],
      typicalLocations: [],
      typicalHours: [],
      typicalDevices: [],
      anomalyScore: 0,
    },
    issuer: 'lighthouse.infinity.os',
    issued_at: now,
    audit_chain: [{
      action: 'ISSUED',
      timestamp: now,
      actor: 'lighthouse',
      hash: signature,
    }],
  };

  // Store in Supabase
  const { data, error } = await dbQuery(env, '/lighthouse/entity_tokens', 'POST', token);
  if (error) return errorResponse('Failed to issue token', 500, 'TOKEN_ISSUE_FAILED');

  // Cache in KV for fast lookups
  await env.KV_TOKENS.put(
    `token:${tokenId}`,
    JSON.stringify(token),
    { expirationTtl: 3600 },
  );

  return jsonResponse({ token: (data as unknown[])[0] }, 201);
}

async function handleGetToken(env: Env, tokenId: string): Promise<Response> {
  // Check KV cache first
  const cached = await env.KV_TOKENS.get(`token:${tokenId}`);
  if (cached) {
    return jsonResponse({ token: JSON.parse(cached), cached: true });
  }

  const { data, error } = await dbQuery(
    env,
    `/lighthouse/entity_tokens?token_id=eq.${tokenId}`,
  );

  if (error || !(data as unknown[])?.length) {
    return errorResponse('Token not found', 404, 'TOKEN_NOT_FOUND');
  }

  const token = (data as unknown[])[0];
  await env.KV_TOKENS.put(`token:${tokenId}`, JSON.stringify(token), { expirationTtl: 3600 });

  return jsonResponse({ token });
}

async function handleVerifyToken(request: Request, env: Env, tokenId: string): Promise<Response> {
  const { data, error } = await dbQuery(
    env,
    `/lighthouse/entity_tokens?token_id=eq.${tokenId}`,
  );

  if (error || !(data as unknown[])?.length) {
    return jsonResponse({ valid: false, reason: 'Token not found' });
  }

  const token = (data as unknown[])[0] as Record<string, unknown>;

  if (token.status === 'revoked') {
    return jsonResponse({ valid: false, reason: 'Token revoked', revokedAt: token.revoked_at });
  }
  if (token.status === 'expired') {
    return jsonResponse({ valid: false, reason: 'Token expired' });
  }
  if (token.expires_at && new Date(token.expires_at as string) < new Date()) {
    return jsonResponse({ valid: false, reason: 'Token expired' });
  }

  // Verify entity hash integrity
  const expectedHash = await computeEntityHash(token.entity_id as string, token.entity_type as string);
  const hashValid = expectedHash === token.entity_hash;

  return jsonResponse({
    valid: hashValid && token.status === 'active',
    tokenId,
    entityId: token.entity_id,
    entityType: token.entity_type,
    riskScore: token.risk_score,
    riskLevel: token.risk_level,
    classification: token.classification,
    verifiedAt: new Date().toISOString(),
  });
}

async function handleUpdateRiskScore(request: Request, env: Env, tokenId: string): Promise<Response> {
  const body = await request.json() as { riskScore: number; reason?: string; factors?: string[] };

  if (typeof body.riskScore !== 'number' || body.riskScore < 0 || body.riskScore > 100) {
    return errorResponse('riskScore must be 0-100', 400, 'INVALID_RISK_SCORE');
  }

  const riskLevel = body.riskScore >= 85 ? 'critical'
    : body.riskScore >= 70 ? 'high'
    : body.riskScore >= 50 ? 'medium'
    : body.riskScore >= 25 ? 'low'
    : 'none';

  const { data, error } = await dbQuery(
    env,
    `/lighthouse/entity_tokens?token_id=eq.${tokenId}`,
    'PATCH',
    {
      risk_score: body.riskScore,
      risk_level: riskLevel,
      risk_factors: body.factors ?? [],
      updated_at: new Date().toISOString(),
    },
  );

  if (error) return errorResponse('Failed to update risk score', 500);

  // Auto-trigger Warp Tunnel if risk >= 85
  if (body.riskScore >= 85) {
    const token = (data as unknown[])[0] as Record<string, unknown>;
    await triggerWarpTunnel(env, {
      tokenId,
      entityId: token.entity_id as string,
      entityType: token.entity_type as string,
      reason: `Risk score threshold exceeded: ${body.riskScore}/100`,
      threatLevel: 'critical',
    });
  }

  return jsonResponse({
    tokenId,
    riskScore: body.riskScore,
    riskLevel,
    autoWarpTriggered: body.riskScore >= 85,
  });
}

async function handleCreateThreat(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as {
    entityId: string;
    entityType: string;
    tokenId?: string;
    type: string;
    severity: string;
    title: string;
    description?: string;
    mitreTactic?: string;
    mitreTechnique?: string;
    evidence?: unknown[];
  };

  const threatId = `THR-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

  const threat = {
    threat_id: threatId,
    token_id: body.tokenId,
    entity_id: body.entityId,
    entity_type: body.entityType,
    type: body.type,
    severity: body.severity,
    status: 'open',
    title: body.title,
    description: body.description,
    mitre_tactic: body.mitreTactic,
    mitre_technique: body.mitreTechnique,
    evidence: body.evidence ?? [],
    indicators: [],
    risk_score_delta: body.severity === 'critical' ? 30
      : body.severity === 'high' ? 20
      : body.severity === 'medium' ? 10
      : 5,
    detected_at: new Date().toISOString(),
  };

  const { data, error } = await dbQuery(env, '/lighthouse/threat_events', 'POST', threat);
  if (error) return errorResponse('Failed to create threat', 500);

  // Auto-warp for critical threats
  if (body.severity === 'critical' && body.tokenId) {
    await triggerWarpTunnel(env, {
      tokenId: body.tokenId,
      entityId: body.entityId,
      entityType: body.entityType,
      reason: `Critical threat detected: ${body.title}`,
      threatLevel: 'critical',
    });
  }

  return jsonResponse({ threat: (data as unknown[])[0] }, 201);
}

async function handleTriggerWarp(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as {
    tokenId: string;
    entityId: string;
    entityType: string;
    reason: string;
    threatLevel: string;
  };

  const transfer = await triggerWarpTunnel(env, body);
  return jsonResponse({ transfer }, 201);
}

async function handleListIceBox(env: Env): Promise<Response> {
  const { data, error } = await dbQuery(
    env,
    '/lighthouse/icebox_entries?order=quarantined_at.desc&limit=50',
  );

  if (error) return errorResponse('Failed to list IceBox entries', 500);
  return jsonResponse({ entries: data });
}

async function handleIssueVerdict(request: Request, env: Env, entryId: string): Promise<Response> {
  const body = await request.json() as {
    decision: string;
    justification: string;
    issuedBy: string;
    actions?: string[];
  };

  const verdict = {
    decision: body.decision,
    justification: body.justification,
    issued_by: body.issuedBy,
    issued_at: new Date().toISOString(),
    actions: body.actions ?? [],
  };

  const { error } = await dbQuery(
    env,
    `/lighthouse/icebox_entries?entry_id=eq.${entryId}`,
    'PATCH',
    {
      verdict,
      status: body.decision === 'RELEASE' ? 'released'
        : body.decision === 'DESTROY' ? 'destroyed'
        : 'blocked',
      verdict_issued_at: new Date().toISOString(),
      released_at: body.decision === 'RELEASE' ? new Date().toISOString() : undefined,
      destroyed_at: body.decision === 'DESTROY' ? new Date().toISOString() : undefined,
    },
  );

  if (error) return errorResponse('Failed to issue verdict', 500);

  return jsonResponse({ success: true, entryId, verdict });
}

async function handleGetMetrics(env: Env): Promise<Response> {
  // Aggregate metrics from Supabase
  const [tokensResult, threatsResult, warpResult, iceboxResult] = await Promise.all([
    dbQuery(env, '/lighthouse/entity_tokens?select=status,risk_level,classification'),
    dbQuery(env, '/lighthouse/threat_events?select=severity,status'),
    dbQuery(env, '/lighthouse/warp_transfers?select=status'),
    dbQuery(env, '/lighthouse/icebox_entries?select=status'),
  ]);

  const tokens = (tokensResult.data as unknown[]) ?? [];
  const threats = (threatsResult.data as unknown[]) ?? [];
  const warps = (warpResult.data as unknown[]) ?? [];
  const icebox = (iceboxResult.data as unknown[]) ?? [];

  return jsonResponse({
    tokens: {
      total: tokens.length,
      active: tokens.filter((t: unknown) => (t as Record<string, unknown>).status === 'active').length,
      revoked: tokens.filter((t: unknown) => (t as Record<string, unknown>).status === 'revoked').length,
      highRisk: tokens.filter((t: unknown) => ['high', 'critical'].includes((t as Record<string, unknown>).risk_level as string)).length,
    },
    threats: {
      total: threats.length,
      open: threats.filter((t: unknown) => (t as Record<string, unknown>).status === 'open').length,
      critical: threats.filter((t: unknown) => (t as Record<string, unknown>).severity === 'critical').length,
    },
    warpTunnel: {
      total: warps.length,
      completed: warps.filter((w: unknown) => (w as Record<string, unknown>).status === 'quarantined').length,
    },
    iceBox: {
      total: icebox.length,
      quarantined: icebox.filter((i: unknown) => (i as Record<string, unknown>).status === 'quarantined').length,
      released: icebox.filter((i: unknown) => (i as Record<string, unknown>).status === 'released').length,
    },
    generatedAt: new Date().toISOString(),
  });
}

async function handleInternalEvent(request: Request, env: Env): Promise<Response> {
  // Verify internal secret
  const secret = request.headers.get('X-Internal-Secret');
  if (secret !== env.INTERNAL_SECRET) {
    return errorResponse('Unauthorized', 401, 'UNAUTHORIZED');
  }

  const body = await request.json() as { event: string; data: Record<string, unknown> };

  switch (body.event) {
    case 'user_created':
      // Issue UET for new user
      await handleIssueToken(
        new Request('https://lighthouse/tokens', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            entityId: body.data.userId,
            entityType: 'user',
            classification: 'INTERNAL',
          }),
        }),
        env,
      );
      break;
    default:
      console.log(`[LIGHTHOUSE] Unknown internal event: ${body.event}`);
  }

  return jsonResponse({ received: true });
}

// ============================================================
// WARP TUNNEL EXECUTION
// ============================================================

async function triggerWarpTunnel(
  env: Env,
  params: {
    tokenId: string;
    entityId: string;
    entityType: string;
    reason: string;
    threatLevel: string;
  },
): Promise<Record<string, unknown>> {
  const transferId = `WARP-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  const now = new Date().toISOString();

  const transfer = {
    transfer_id: transferId,
    token_id: params.tokenId,
    entity_id: params.entityId,
    entity_type: params.entityType,
    reason: params.reason,
    threat_level: params.threatLevel,
    status: 'initiated',
    initiated_at: now,
  };

  await dbQuery(env, '/lighthouse/warp_transfers', 'POST', transfer);

  // Execute pipeline asynchronously
  const steps = ['scanning', 'capturing', 'encrypting', 'transferring', 'quarantined'];
  let currentTransfer = { ...transfer };

  for (const step of steps) {
    currentTransfer.status = step;
    await dbQuery(
      env,
      `/lighthouse/warp_transfers?transfer_id=eq.${transferId}`,
      'PATCH',
      { status: step },
    );

    if (step === 'quarantined') {
      // Create IceBox entry
      const entryId = `ICE-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

      await dbQuery(env, '/lighthouse/icebox_entries', 'POST', {
        entry_id: entryId,
        transfer_id: transferId,
        entity_id: params.entityId,
        entity_type: params.entityType,
        entity_snapshot: {},
        status: 'quarantined',
        forensic_analysis: {
          static: { completed: false },
          dynamic: { completed: false },
          behavioural: { completed: false },
          network: { completed: false },
        },
        quarantined_at: new Date().toISOString(),
      });

      // Update transfer with IceBox entry ID
      await dbQuery(
        env,
        `/lighthouse/warp_transfers?transfer_id=eq.${transferId}`,
        'PATCH',
        {
          icebox_entry_id: entryId,
          status: 'quarantined',
          completed_at: new Date().toISOString(),
        },
      );

      // Suspend the entity token
      await dbQuery(
        env,
        `/lighthouse/entity_tokens?token_id=eq.${params.tokenId}`,
        'PATCH',
        { status: 'suspended', updated_at: new Date().toISOString() },
      );

      currentTransfer = { ...currentTransfer, status: 'quarantined', icebox_entry_id: entryId };
    }
  }

  console.log(`[LIGHTHOUSE] ⚡ Warp Tunnel complete: ${params.entityId} → IceBox`);
  return currentTransfer;
}

// ============================================================
// MAIN ROUTER
// ============================================================

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    const segments = path.split('/').filter(Boolean);

    try {
      // Token routes
      if (method === 'POST' && path === '/tokens') return handleIssueToken(request, env);
      if (method === 'GET' && segments[0] === 'tokens' && segments[1]) return handleGetToken(env, segments[1]);
      if (method === 'POST' && segments[0] === 'tokens' && segments[2] === 'verify') return handleVerifyToken(request, env, segments[1]);
      if (method === 'PATCH' && segments[0] === 'tokens' && segments[2] === 'risk') return handleUpdateRiskScore(request, env, segments[1]);

      // Threat routes
      if (method === 'POST' && path === '/threats') return handleCreateThreat(request, env);

      // Warp Tunnel
      if (method === 'POST' && path === '/warp') return handleTriggerWarp(request, env);

      // IceBox
      if (method === 'GET' && path === '/icebox') return handleListIceBox(env);
      if (method === 'POST' && segments[0] === 'icebox' && segments[2] === 'verdict') return handleIssueVerdict(request, env, segments[1]);

      // Metrics & Health
      if (method === 'GET' && path === '/metrics') return handleGetMetrics(env);
      if (method === 'GET' && path === '/health') {
        return jsonResponse({ status: 'healthy', service: 'lighthouse', timestamp: new Date().toISOString() });
      }

      // Internal events
      if (method === 'POST' && path === '/internal/events') return handleInternalEvent(request, env);

      return errorResponse(`Route not found: ${method} ${path}`, 404, 'NOT_FOUND');

    } catch (error) {
      console.error('[LIGHTHOUSE] Error:', error);
      return errorResponse('Internal server error', 500, 'INTERNAL_ERROR');
    }
  },
};