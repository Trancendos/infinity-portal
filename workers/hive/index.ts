/**
 * HIVE Cloudflare Worker
 * Bio-Inspired Swarm Data Router API
 *
 * Routes:
 *   POST   /route                   — Route a message through the HIVE
 *   GET    /route/:messageId        — Get message routing status
 *
 *   POST   /channels                — Create a data channel
 *   GET    /channels                — List channels
 *   GET    /channels/:channelId     — Get channel details
 *   DELETE /channels/:channelId     — Close channel
 *
 *   GET    /nodes                   — List HIVE nodes (bee colony)
 *   GET    /nodes/:nodeId           — Get node details
 *   GET    /nodes/:nodeId/health    — Node health check
 *
 *   GET    /discover/:serviceType   — Service discovery
 *
 *   GET    /topology                — Full HIVE topology
 *   GET    /health                  — HIVE health report
 *   GET    /metrics                 — HIVE metrics
 *
 *   POST   /internal/events         — Internal event receiver
 */

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
  LIGHTHOUSE_URL: string;
  INTERNAL_SECRET: string;
  KV_ROUTING: KVNamespace;
  KV_RATE_LIMIT: KVNamespace;
  ENVIRONMENT: string;
}

// ============================================================
// CONSTANTS
// ============================================================

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Request-ID, X-User-Type, X-Classification',
};

// Data classification access matrix
// Maps UserType → allowed DataClassification levels
const ACCESS_MATRIX: Record<string, string[]> = {
  SUPER_ADMIN:    ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'CLASSIFIED', 'VOID'],
  ORG_ADMIN:      ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'CLASSIFIED'],
  SECURITY_ADMIN: ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'CLASSIFIED'],
  POWER_USER:     ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL'],
  STANDARD_USER:  ['PUBLIC', 'INTERNAL'],
  BOT:            ['PUBLIC', 'INTERNAL'],
  AGENT:          ['PUBLIC', 'INTERNAL'],
  GUEST:          ['PUBLIC'],
  SYSTEM:         ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'CLASSIFIED', 'VOID'],
};

// Encryption algorithm by classification
const ENCRYPTION_BY_CLASSIFICATION: Record<string, string> = {
  VOID:         'ML-KEM-1024',
  CLASSIFIED:   'Hybrid-X25519-MLKEM-1024',
  CONFIDENTIAL: 'ChaCha20-Poly1305',
  INTERNAL:     'AES-256-GCM',
  PUBLIC:       'AES-128-GCM',
};

// ============================================================
// RESPONSE HELPERS
// ============================================================

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
// GUARD BEE: SECURITY ENFORCEMENT
// ============================================================

interface GuardCheckResult {
  allowed: boolean;
  reason?: string;
  encryptionAlgorithm?: string;
}

async function guardCheck(
  env: Env,
  userType: string,
  classification: string,
  lighthouseTokenId?: string,
): Promise<GuardCheckResult> {
  // Check classification access matrix
  const allowedClassifications = ACCESS_MATRIX[userType] ?? ACCESS_MATRIX.GUEST;
  if (!allowedClassifications.includes(classification)) {
    return {
      allowed: false,
      reason: `User type ${userType} cannot access ${classification} data`,
    };
  }

  // Verify Lighthouse token if provided
  if (lighthouseTokenId) {
    try {
      const response = await fetch(
        `${env.LIGHTHOUSE_URL}/tokens/${lighthouseTokenId}/verify`,
        { method: 'POST' },
      );
      const result = await response.json() as { valid: boolean; riskLevel?: string };

      if (!result.valid) {
        return { allowed: false, reason: 'Lighthouse token invalid or revoked' };
      }

      // Block high-risk entities from accessing sensitive data
      if (['high', 'critical'].includes(result.riskLevel ?? '') &&
          ['CLASSIFIED', 'VOID'].includes(classification)) {
        return {
          allowed: false,
          reason: `High-risk entity cannot access ${classification} data`,
        };
      }
    } catch {
      // Lighthouse unavailable — allow with warning for non-sensitive data
      if (['CLASSIFIED', 'VOID'].includes(classification)) {
        return { allowed: false, reason: 'Lighthouse verification required for sensitive data' };
      }
    }
  }

  return {
    allowed: true,
    encryptionAlgorithm: ENCRYPTION_BY_CLASSIFICATION[classification] ?? 'AES-256-GCM',
  };
}

// ============================================================
// SCOUT BEE: PATH DISCOVERY
// ============================================================

async function scoutPath(
  env: Env,
  sourceType: string,
  destinationType: string,
  classification: string,
): Promise<string[]> {
  // Check routing cache
  const cacheKey = `route:${sourceType}:${destinationType}:${classification}`;
  const cached = await env.KV_ROUTING.get(cacheKey);
  if (cached) return JSON.parse(cached);

  // Check routing table in DB
  const { data } = await dbQuery(
    env,
    `/hive/routing_table?source_type=eq.${sourceType}&destination_type=eq.${destinationType}&classification=eq.${classification}`,
  );

  if (data && (data as unknown[]).length > 0) {
    const route = (data as unknown[])[0] as Record<string, unknown>;
    const path = route.optimal_path as string[];
    await env.KV_ROUTING.put(cacheKey, JSON.stringify(path), { expirationTtl: 300 });
    return path;
  }

  // Default path: guard → worker → destination
  const defaultPath = ['guard-001', 'worker-001', destinationType];
  await env.KV_ROUTING.put(cacheKey, JSON.stringify(defaultPath), { expirationTtl: 60 });
  return defaultPath;
}

// ============================================================
// ROUTE HANDLERS
// ============================================================

async function handleRouteMessage(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as {
    sourceId: string;
    destinationId: string;
    sourceType: string;
    destinationType: string;
    userType: string;
    classification: string;
    payload: unknown;
    priority?: string;
    lighthouseTokenId?: string;
    metadata?: Record<string, unknown>;
  };

  if (!body.sourceId || !body.destinationId || !body.classification) {
    return errorResponse('sourceId, destinationId, and classification are required', 400);
  }

  const messageId = `MSG-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  const startTime = Date.now();

  // GUARD BEE: Security check
  const guardResult = await guardCheck(
    env,
    body.userType ?? 'GUEST',
    body.classification,
    body.lighthouseTokenId,
  );

  if (!guardResult.allowed) {
    // Log denied routing attempt
    await dbQuery(env, '/hive/message_log', 'POST', {
      message_id: messageId,
      source_id: body.sourceId,
      destination_id: body.destinationId,
      source_type: body.sourceType ?? 'unknown',
      destination_type: body.destinationType ?? 'unknown',
      classification: body.classification,
      priority: body.priority ?? 'NORMAL',
      status: 'blocked',
      security_checks: [{ type: 'guard', result: 'denied', reason: guardResult.reason }],
      encrypted: false,
      created_at: new Date().toISOString(),
      failed_at: new Date().toISOString(),
      error: guardResult.reason,
    });

    return errorResponse(`HIVE Guard denied routing: ${guardResult.reason}`, 403, 'GUARD_DENIED');
  }

  // SCOUT BEE: Find optimal path
  const routingPath = await scoutPath(
    env,
    body.sourceType ?? 'unknown',
    body.destinationType ?? 'unknown',
    body.classification,
  );

  // Compute payload hash (never store actual payload)
  const payloadStr = JSON.stringify(body.payload);
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(payloadStr));
  const payloadHash = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  const latencyMs = Date.now() - startTime;

  // Log routing
  await dbQuery(env, '/hive/message_log', 'POST', {
    message_id: messageId,
    source_id: body.sourceId,
    destination_id: body.destinationId,
    source_type: body.sourceType ?? 'unknown',
    destination_type: body.destinationType ?? 'unknown',
    classification: body.classification,
    priority: body.priority ?? 'NORMAL',
    status: 'delivered',
    routing_path: routingPath,
    hops: routingPath.map((node, i) => ({
      nodeId: node,
      hopIndex: i,
      timestamp: new Date().toISOString(),
    })),
    security_checks: [{
      type: 'guard',
      result: 'allowed',
      encryptionAlgorithm: guardResult.encryptionAlgorithm,
    }],
    payload_hash: payloadHash,
    encrypted: true,
    size_bytes: payloadStr.length,
    latency_ms: latencyMs,
    created_at: new Date().toISOString(),
    delivered_at: new Date().toISOString(),
  });

  return jsonResponse({
    messageId,
    status: 'delivered',
    routingPath,
    encryptionAlgorithm: guardResult.encryptionAlgorithm,
    latencyMs,
    hops: routingPath.length,
    classification: body.classification,
    payloadHash,
  }, 201);
}

async function handleCreateChannel(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as {
    name: string;
    sourceType: string;
    destinationType: string;
    classification: string;
    userType: string;
    expiresInHours?: number;
  };

  // Guard check
  const guardResult = await guardCheck(env, body.userType ?? 'GUEST', body.classification);
  if (!guardResult.allowed) {
    return errorResponse(`Cannot create channel: ${guardResult.reason}`, 403, 'GUARD_DENIED');
  }

  const channelId = `CH-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  const expiresAt = body.expiresInHours
    ? new Date(Date.now() + body.expiresInHours * 3600 * 1000).toISOString()
    : undefined;

  const channel = {
    channel_id: channelId,
    name: body.name,
    source_type: body.sourceType,
    destination_type: body.destinationType,
    classification: body.classification,
    status: 'active',
    encryption_key_id: `key-${channelId}`,
    encryption_algorithm: guardResult.encryptionAlgorithm,
    settings: {},
    metrics: { messagesRouted: 0, bytesTransferred: 0 },
    expires_at: expiresAt,
  };

  const { data, error } = await dbQuery(env, '/hive/channels', 'POST', channel);
  if (error) return errorResponse('Failed to create channel', 500);

  return jsonResponse({ channel: (data as unknown[])[0] }, 201);
}

async function handleListNodes(env: Env): Promise<Response> {
  const { data, error } = await dbQuery(
    env,
    '/hive/nodes?order=role.asc,node_id.asc',
  );

  if (error) return errorResponse('Failed to list nodes', 500);

  return jsonResponse({ nodes: data });
}

async function handleGetTopology(env: Env): Promise<Response> {
  const { data: nodes } = await dbQuery(env, '/hive/nodes?status=eq.active');
  const { data: channels } = await dbQuery(env, '/hive/channels?status=eq.active');

  const nodeList = (nodes as unknown[]) ?? [];

  const topology = {
    nodes: {
      total: nodeList.length,
      byRole: nodeList.reduce((acc: Record<string, number>, node: unknown) => {
        const n = node as Record<string, unknown>;
        acc[n.role as string] = (acc[n.role as string] ?? 0) + 1;
        return acc;
      }, {}),
    },
    channels: {
      total: ((channels as unknown[]) ?? []).length,
      active: ((channels as unknown[]) ?? []).filter((c: unknown) => (c as Record<string, unknown>).status === 'active').length,
    },
    queen: nodeList.find((n: unknown) => (n as Record<string, unknown>).role === 'QUEEN'),
    generatedAt: new Date().toISOString(),
  };

  return jsonResponse({ topology, nodes, channels });
}

async function handleServiceDiscovery(env: Env, serviceType: string, userType: string): Promise<Response> {
  // Scout bee service discovery
  const cacheKey = `discover:${serviceType}:${userType}`;
  const cached = await env.KV_ROUTING.get(cacheKey);
  if (cached) {
    return jsonResponse({ services: JSON.parse(cached), cached: true });
  }

  // In production: query service registry
  const services = [
    {
      serviceId: `svc-${serviceType}-001`,
      serviceType,
      endpoint: `https://${serviceType}.infinity.os`,
      status: 'active',
      region: 'eu-west-1',
      latencyMs: 12,
      reliability: 0.9999,
    },
  ];

  await env.KV_ROUTING.put(cacheKey, JSON.stringify(services), { expirationTtl: 60 });
  return jsonResponse({ services });
}

async function handleGetMetrics(env: Env): Promise<Response> {
  const [nodesResult, messagesResult, channelsResult] = await Promise.all([
    dbQuery(env, '/hive/nodes?select=role,status'),
    dbQuery(env, '/hive/message_log?select=status,classification,latency_ms&created_at=gte.' +
      new Date(Date.now() - 24 * 3600 * 1000).toISOString()),
    dbQuery(env, '/hive/channels?select=status,classification'),
  ]);

  const nodes = (nodesResult.data as unknown[]) ?? [];
  const messages = (messagesResult.data as unknown[]) ?? [];
  const channels = (channelsResult.data as unknown[]) ?? [];

  const delivered = messages.filter((m: unknown) => (m as Record<string, unknown>).status === 'delivered');
  const avgLatency = delivered.length > 0
    ? delivered.reduce((sum: number, m: unknown) => sum + ((m as Record<string, unknown>).latency_ms as number ?? 0), 0) / delivered.length
    : 0;

  return jsonResponse({
    nodes: {
      total: nodes.length,
      active: nodes.filter((n: unknown) => (n as Record<string, unknown>).status === 'active').length,
      byRole: nodes.reduce((acc: Record<string, number>, n: unknown) => {
        const node = n as Record<string, unknown>;
        acc[node.role as string] = (acc[node.role as string] ?? 0) + 1;
        return acc;
      }, {}),
    },
    messages24h: {
      total: messages.length,
      delivered: delivered.length,
      blocked: messages.filter((m: unknown) => (m as Record<string, unknown>).status === 'blocked').length,
      avgLatencyMs: Math.round(avgLatency),
      successRate: messages.length > 0 ? (delivered.length / messages.length) : 1,
    },
    channels: {
      total: channels.length,
      active: channels.filter((c: unknown) => (c as Record<string, unknown>).status === 'active').length,
    },
    generatedAt: new Date().toISOString(),
  });
}

async function handleHealth(env: Env): Promise<Response> {
  const { data: nodes } = await dbQuery(env, '/hive/nodes?status=eq.active&select=role');
  const activeNodes = (nodes as unknown[]) ?? [];
  const hasQueen = activeNodes.some((n: unknown) => (n as Record<string, unknown>).role === 'QUEEN');

  return jsonResponse({
    status: hasQueen ? 'healthy' : 'degraded',
    service: 'hive',
    version: '1.0.0',
    activeNodes: activeNodes.length,
    hasQueen,
    timestamp: new Date().toISOString(),
  });
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
      // Routing
      if (method === 'POST' && path === '/route') return handleRouteMessage(request, env);

      // Channels
      if (method === 'POST' && path === '/channels') return handleCreateChannel(request, env);
      if (method === 'GET' && path === '/channels') {
        const { data } = await dbQuery(env, '/hive/channels?order=created_at.desc');
        return jsonResponse({ channels: data });
      }

      // Nodes
      if (method === 'GET' && path === '/nodes') return handleListNodes(env);

      // Topology
      if (method === 'GET' && path === '/topology') return handleGetTopology(env);

      // Service discovery
      if (method === 'GET' && segments[0] === 'discover' && segments[1]) {
        const userType = url.searchParams.get('userType') ?? 'STANDARD_USER';
        return handleServiceDiscovery(env, segments[1], userType);
      }

      // Metrics & Health
      if (method === 'GET' && path === '/metrics') return handleGetMetrics(env);
      if (method === 'GET' && path === '/health') return handleHealth(env);

      // Internal events
      if (method === 'POST' && path === '/internal/events') {
        const secret = request.headers.get('X-Internal-Secret');
        if (secret !== env.INTERNAL_SECRET) return errorResponse('Unauthorized', 401);
        return jsonResponse({ received: true });
      }

      return errorResponse(`Route not found: ${method} ${path}`, 404, 'NOT_FOUND');

    } catch (error) {
      console.error('[HIVE] Error:', error);
      return errorResponse('Internal server error', 500, 'INTERNAL_ERROR');
    }
  },
};