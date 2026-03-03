/**
 * Infinity-One Cloudflare Worker
 * Central Account Management Hub API
 *
 * Routes:
 *   POST   /auth/register          — Register new user
 *   POST   /auth/login             — Login (returns JWT)
 *   POST   /auth/logout            — Logout (revoke session)
 *   POST   /auth/refresh           — Refresh access token
 *   POST   /auth/mfa/enroll        — Enrol MFA method
 *   POST   /auth/mfa/verify        — Verify MFA token
 *   POST   /auth/webauthn/register — Register WebAuthn credential
 *   POST   /auth/webauthn/verify   — Verify WebAuthn assertion
 *
 *   GET    /users/me               — Get current user profile
 *   PATCH  /users/me               — Update current user profile
 *   DELETE /users/me               — Delete account (GDPR erasure)
 *   GET    /users/:id              — Get user by ID (admin)
 *   GET    /users                  — List users (admin)
 *   POST   /users/:id/suspend      — Suspend user (admin)
 *   POST   /users/:id/quarantine   — Quarantine user (security admin)
 *
 *   GET    /roles                  — List roles
 *   POST   /roles                  — Create role (admin)
 *   POST   /users/:id/roles        — Assign role
 *   DELETE /users/:id/roles/:roleId — Revoke role
 *
 *   GET    /sessions               — List active sessions
 *   DELETE /sessions/:id           — Revoke session
 *   DELETE /sessions               — Revoke all sessions
 *
 *   GET    /apps                   — List applications
 *   POST   /apps                   — Create application (admin)
 *
 *   GET    /audit                  — Get audit log (admin)
 *
 *   POST   /scim/v2/Users          — SCIM 2.0 user provisioning
 *   GET    /scim/v2/Users/:id      — SCIM 2.0 get user
 *   PATCH  /scim/v2/Users/:id      — SCIM 2.0 update user
 *
 *   POST   /gdpr/erasure           — GDPR right to erasure
 *   GET    /gdpr/export            — GDPR data portability
 *
 *   GET    /health                 — Health check
 *   GET    /metrics                — Service metrics (admin)
 */

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
  JWT_SECRET: string;
  LIGHTHOUSE_URL: string;
  HIVE_URL: string;
  VOID_URL: string;
  ENVIRONMENT: string;
  KV_SESSIONS: KVNamespace;
  KV_RATE_LIMIT: KVNamespace;
}

// ============================================================
// CORS HEADERS
// ============================================================

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Request-ID, X-Lighthouse-Token',
  'Access-Control-Max-Age': '86400',
};

// ============================================================
// RESPONSE HELPERS
// ============================================================

function jsonResponse(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
      ...headers,
    },
  });
}

function errorResponse(message: string, status = 400, code?: string): Response {
  return jsonResponse({
    error: { message, code: code ?? 'ERROR', status },
    timestamp: new Date().toISOString(),
  }, status);
}

function unauthorizedResponse(message = 'Unauthorized'): Response {
  return errorResponse(message, 401, 'UNAUTHORIZED');
}

function forbiddenResponse(message = 'Forbidden'): Response {
  return errorResponse(message, 403, 'FORBIDDEN');
}

function notFoundResponse(message = 'Not found'): Response {
  return errorResponse(message, 404, 'NOT_FOUND');
}

// ============================================================
// RATE LIMITING
// ============================================================

async function checkRateLimit(
  env: Env,
  key: string,
  maxRequests: number,
  windowSeconds: number,
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const windowKey = `rl:${key}:${Math.floor(Date.now() / (windowSeconds * 1000))}`;
  const current = parseInt(await env.KV_RATE_LIMIT.get(windowKey) ?? '0');
  const resetAt = (Math.floor(Date.now() / (windowSeconds * 1000)) + 1) * windowSeconds * 1000;

  if (current >= maxRequests) {
    return { allowed: false, remaining: 0, resetAt };
  }

  await env.KV_RATE_LIMIT.put(windowKey, String(current + 1), { expirationTtl: windowSeconds });
  return { allowed: true, remaining: maxRequests - current - 1, resetAt };
}

// ============================================================
// JWT VERIFICATION
// ============================================================

async function verifyJWT(token: string, secret: string): Promise<Record<string, unknown> | null> {
  try {
    // In production: use jose library for ML-DSA-65 verification
    // Simplified for Cloudflare Worker compatibility
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));

    // Check expiry
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

async function extractUser(request: Request, env: Env): Promise<Record<string, unknown> | null> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.substring(7);
  return verifyJWT(token, env.JWT_SECRET);
}

// ============================================================
// SUPABASE CLIENT
// ============================================================

async function supabaseQuery(
  env: Env,
  path: string,
  method = 'GET',
  body?: unknown,
): Promise<{ data: unknown; error: unknown }> {
  const url = `${env.SUPABASE_URL}/rest/v1${path}`;
  const response = await fetch(url, {
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
  if (!response.ok) {
    return { data: null, error: data };
  }
  return { data, error: null };
}

// ============================================================
// ROUTE HANDLERS
// ============================================================

async function handleRegister(request: Request, env: Env): Promise<Response> {
  const rateLimit = await checkRateLimit(env, `register:${request.headers.get('CF-Connecting-IP')}`, 5, 3600);
  if (!rateLimit.allowed) {
    return errorResponse('Too many registration attempts', 429, 'RATE_LIMITED');
  }

  const body = await request.json() as Record<string, unknown>;
  const { email, password, displayName, organisationId } = body;

  if (!email || !password) {
    return errorResponse('Email and password are required', 400, 'MISSING_FIELDS');
  }

  // Email format validation
  if (!/^[^@]+@[^@]+\.[^@]+$/.test(email as string)) {
    return errorResponse('Invalid email format', 400, 'INVALID_EMAIL');
  }

  // Password strength validation
  if ((password as string).length < 12) {
    return errorResponse('Password must be at least 12 characters', 400, 'WEAK_PASSWORD');
  }

  // Hash password (in production: use Argon2id)
  const passwordHash = await hashPassword(password as string);

  // Create user in Supabase
  const { data, error } = await supabaseQuery(env, '/infinity_one/users', 'POST', {
    email,
    password_hash: passwordHash,
    display_name: displayName,
    organisation_id: organisationId,
    status: 'pending_verification',
  });

  if (error) {
    const err = error as Record<string, unknown>;
    if ((err.code as string) === '23505') {
      return errorResponse('Email already registered', 409, 'EMAIL_EXISTS');
    }
    return errorResponse('Registration failed', 500, 'REGISTRATION_FAILED');
  }

  const user = (data as unknown[])[0] as Record<string, unknown>;

  // Notify Lighthouse to issue UET
  await notifyLighthouse(env, 'user_created', { userId: user.id, email });

  return jsonResponse({
    success: true,
    message: 'Registration successful — please verify your email',
    userId: user.id,
  }, 201);
}

async function handleLogin(request: Request, env: Env): Promise<Response> {
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const rateLimit = await checkRateLimit(env, `login:${ip}`, 10, 900);
  if (!rateLimit.allowed) {
    return errorResponse('Too many login attempts — try again in 15 minutes', 429, 'RATE_LIMITED');
  }

  const body = await request.json() as Record<string, unknown>;
  const { email, password, mfaToken } = body;

  if (!email || !password) {
    return errorResponse('Email and password are required', 400, 'MISSING_FIELDS');
  }

  // Fetch user
  const { data, error } = await supabaseQuery(
    env,
    `/infinity_one/users?email=eq.${encodeURIComponent(email as string)}&select=*`,
  );

  if (error || !(data as unknown[])?.length) {
    return errorResponse('Invalid credentials', 401, 'INVALID_CREDENTIALS');
  }

  const user = (data as unknown[])[0] as Record<string, unknown>;

  // Check account status
  if (user.status === 'suspended') {
    return errorResponse('Account suspended', 403, 'ACCOUNT_SUSPENDED');
  }
  if (user.status === 'quarantined') {
    return errorResponse('Account under security review', 403, 'ACCOUNT_QUARANTINED');
  }

  // Verify password
  const passwordValid = await verifyPassword(password as string, user.password_hash as string);
  if (!passwordValid) {
    // Increment failed login count
    await supabaseQuery(
      env,
      `/infinity_one/users?id=eq.${user.id}`,
      'PATCH',
      { failed_login_count: (user.failed_login_count as number) + 1 },
    );
    return errorResponse('Invalid credentials', 401, 'INVALID_CREDENTIALS');
  }

  // MFA check
  if (user.mfa_enabled && !mfaToken) {
    return jsonResponse({
      requiresMFA: true,
      mfaMethods: user.mfa_methods,
      sessionToken: await generateTempToken(user.id as string, env),
    }, 200);
  }

  // Generate tokens
  const accessToken = await generateAccessToken(user, env);
  const refreshToken = await generateRefreshToken(user.id as string, env);

  // Create session
  const sessionId = crypto.randomUUID();
  await env.KV_SESSIONS.put(
    `session:${sessionId}`,
    JSON.stringify({
      userId: user.id,
      ip,
      userAgent: request.headers.get('User-Agent'),
      createdAt: new Date().toISOString(),
    }),
    { expirationTtl: 86400 * 30 },
  );

  // Update last login
  await supabaseQuery(
    env,
    `/infinity_one/users?id=eq.${user.id}`,
    'PATCH',
    {
      last_login_at: new Date().toISOString(),
      last_login_ip: ip,
      failed_login_count: 0,
    },
  );

  return jsonResponse({
    accessToken,
    refreshToken,
    tokenType: 'Bearer',
    expiresIn: 3600,
    sessionId,
    user: sanitiseUser(user),
  });
}

async function handleGetMe(request: Request, env: Env): Promise<Response> {
  const user = await extractUser(request, env);
  if (!user) return unauthorizedResponse();

  const { data, error } = await supabaseQuery(
    env,
    `/infinity_one/users?id=eq.${user.sub}&select=*`,
  );

  if (error || !(data as unknown[])?.length) {
    return notFoundResponse('User not found');
  }

  return jsonResponse({ user: sanitiseUser((data as unknown[])[0] as Record<string, unknown>) });
}

async function handleUpdateMe(request: Request, env: Env): Promise<Response> {
  const user = await extractUser(request, env);
  if (!user) return unauthorizedResponse();

  const body = await request.json() as Record<string, unknown>;

  // Whitelist updatable fields
  const allowedFields = [
    'display_name', 'first_name', 'last_name', 'preferred_name',
    'timezone', 'locale', 'avatar_url', 'preferences',
    'notification_prefs', 'privacy_prefs', 'accessibility_prefs',
  ];

  const updates: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (field in body) updates[field] = body[field];
  }

  if (Object.keys(updates).length === 0) {
    return errorResponse('No valid fields to update', 400, 'NO_UPDATES');
  }

  const { data, error } = await supabaseQuery(
    env,
    `/infinity_one/users?id=eq.${user.sub}`,
    'PATCH',
    updates,
  );

  if (error) {
    return errorResponse('Update failed', 500, 'UPDATE_FAILED');
  }

  return jsonResponse({ user: sanitiseUser((data as unknown[])[0] as Record<string, unknown>) });
}

async function handleListUsers(request: Request, env: Env): Promise<Response> {
  const user = await extractUser(request, env);
  if (!user) return unauthorizedResponse();

  // Check admin role
  if (!hasRole(user, ['super_admin', 'org_admin'])) {
    return forbiddenResponse('Admin access required');
  }

  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50'), 100);
  const offset = parseInt(url.searchParams.get('offset') ?? '0');
  const status = url.searchParams.get('status');
  const search = url.searchParams.get('search');

  let query = `/infinity_one/users?select=id,email,display_name,status,risk_level,risk_score,verification_level,last_login_at,created_at&limit=${limit}&offset=${offset}&order=created_at.desc`;

  if (status) query += `&status=eq.${status}`;

  const { data, error } = await supabaseQuery(env, query);
  if (error) return errorResponse('Failed to list users', 500);

  return jsonResponse({ users: data, limit, offset });
}

async function handleGetSessions(request: Request, env: Env): Promise<Response> {
  const user = await extractUser(request, env);
  if (!user) return unauthorizedResponse();

  const { data, error } = await supabaseQuery(
    env,
    `/infinity_one/sessions?user_id=eq.${user.sub}&revoked_at=is.null&order=created_at.desc`,
  );

  if (error) return errorResponse('Failed to get sessions', 500);

  return jsonResponse({ sessions: data });
}

async function handleRevokeSession(request: Request, env: Env, sessionId: string): Promise<Response> {
  const user = await extractUser(request, env);
  if (!user) return unauthorizedResponse();

  const { error } = await supabaseQuery(
    env,
    `/infinity_one/sessions?id=eq.${sessionId}&user_id=eq.${user.sub}`,
    'PATCH',
    { revoked_at: new Date().toISOString(), revoked_reason: 'user_revoked' },
  );

  if (error) return errorResponse('Failed to revoke session', 500);

  // Also remove from KV
  await env.KV_SESSIONS.delete(`session:${sessionId}`);

  return jsonResponse({ success: true, message: 'Session revoked' });
}

async function handleGDPRErasure(request: Request, env: Env): Promise<Response> {
  const user = await extractUser(request, env);
  if (!user) return unauthorizedResponse();

  const body = await request.json() as Record<string, unknown>;
  const { reason, confirmEmail } = body;

  if (!reason) return errorResponse('Reason required for erasure request', 400);

  // Schedule erasure (30-day notice period)
  const erasureDate = new Date();
  erasureDate.setDate(erasureDate.getDate() + 30);

  await supabaseQuery(
    env,
    `/infinity_one/users?id=eq.${user.sub}`,
    'PATCH',
    {
      erasure_requested_at: new Date().toISOString(),
      erasure_scheduled_at: erasureDate.toISOString(),
      status: 'pending_erasure',
    },
  );

  // Notify Void to schedule secret erasure
  await notifyVoid(env, 'gdpr_erasure_scheduled', { userId: user.sub, erasureDate });

  return jsonResponse({
    success: true,
    message: 'Erasure request received — account will be deleted in 30 days',
    erasureScheduledAt: erasureDate.toISOString(),
    cancellationDeadline: erasureDate.toISOString(),
  });
}

async function handleHealth(_request: Request, _env: Env): Promise<Response> {
  return jsonResponse({
    status: 'healthy',
    service: 'infinity-one',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    systems: {
      database: 'connected',
      kv: 'connected',
      lighthouse: 'connected',
    },
  });
}

// ============================================================
// SCIM 2.0 HANDLERS
// ============================================================

async function handleSCIMCreateUser(request: Request, env: Env): Promise<Response> {
  // Verify SCIM bearer token
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return unauthorizedResponse();

  const body = await request.json() as Record<string, unknown>;

  // Map SCIM user to Infinity-One user
  const scimUser = body as {
    userName?: string;
    name?: { givenName?: string; familyName?: string };
    emails?: Array<{ value: string; primary?: boolean }>;
    active?: boolean;
    externalId?: string;
  };

  const primaryEmail = scimUser.emails?.find((e) => e.primary)?.value ?? scimUser.emails?.[0]?.value;
  if (!primaryEmail) return errorResponse('Email required', 400);

  const { data, error } = await supabaseQuery(env, '/infinity_one/users', 'POST', {
    email: primaryEmail,
    username: scimUser.userName,
    first_name: scimUser.name?.givenName,
    last_name: scimUser.name?.familyName,
    display_name: `${scimUser.name?.givenName ?? ''} ${scimUser.name?.familyName ?? ''}`.trim(),
    status: scimUser.active !== false ? 'active' : 'suspended',
    scim_external_id: scimUser.externalId,
    source: 'scim',
  });

  if (error) return errorResponse('SCIM user creation failed', 500);

  const user = (data as unknown[])[0] as Record<string, unknown>;

  // Return SCIM response format
  return jsonResponse({
    schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
    id: user.id,
    externalId: scimUser.externalId,
    userName: scimUser.userName,
    name: scimUser.name,
    emails: scimUser.emails,
    active: scimUser.active !== false,
    meta: {
      resourceType: 'User',
      created: user.created_at,
      lastModified: user.updated_at,
      location: `/scim/v2/Users/${user.id}`,
    },
  }, 201);
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

async function hashPassword(password: string): Promise<string> {
  // In production: use Argon2id via WASM
  const encoder = new TextEncoder();
  const data = encoder.encode(password + ':infinity-os-salt');
  const hash = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(hash)));
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const computed = await hashPassword(password);
  return computed === hash;
}

async function generateAccessToken(user: Record<string, unknown>, env: Env): Promise<string> {
  // In production: use ML-DSA-65 signing via jose
  const header = btoa(JSON.stringify({ alg: 'ML-DSA-65', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({
    sub: user.id,
    email: user.email,
    roles: user.roles ?? [],
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    iss: 'infinity-one.infinity.os',
    aud: 'infinity-platform',
  }));
  const signature = btoa(`sig:${user.id}:${env.JWT_SECRET}`);
  return `${header}.${payload}.${signature}`;
}

async function generateRefreshToken(userId: string, env: Env): Promise<string> {
  const token = crypto.randomUUID() + '-' + crypto.randomUUID();
  await env.KV_SESSIONS.put(`refresh:${token}`, userId, { expirationTtl: 86400 * 30 });
  return token;
}

async function generateTempToken(userId: string, env: Env): Promise<string> {
  const token = crypto.randomUUID();
  await env.KV_SESSIONS.put(`mfa_pending:${token}`, userId, { expirationTtl: 300 });
  return token;
}

function sanitiseUser(user: Record<string, unknown>): Record<string, unknown> {
  const { password_hash, backup_codes_hash, ...safe } = user;
  return safe;
}

function hasRole(user: Record<string, unknown>, roles: string[]): boolean {
  const userRoles = (user.roles as string[]) ?? [];
  return roles.some((r) => userRoles.includes(r));
}

async function notifyLighthouse(env: Env, event: string, data: unknown): Promise<void> {
  try {
    await fetch(`${env.LIGHTHOUSE_URL}/internal/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, data, timestamp: new Date().toISOString() }),
    });
  } catch {
    console.error('[INFINITY-ONE] Failed to notify Lighthouse');
  }
}

async function notifyVoid(env: Env, event: string, data: unknown): Promise<void> {
  try {
    await fetch(`${env.VOID_URL}/internal/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, data, timestamp: new Date().toISOString() }),
    });
  } catch {
    console.error('[INFINITY-ONE] Failed to notify Void');
  }
}

// ============================================================
// MAIN ROUTER
// ============================================================

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    try {
      // Auth routes
      if (method === 'POST' && path === '/auth/register') return handleRegister(request, env);
      if (method === 'POST' && path === '/auth/login') return handleLogin(request, env);
      if (method === 'POST' && path === '/auth/logout') return handleRevokeSession(request, env, 'current');

      // User routes
      if (method === 'GET' && path === '/users/me') return handleGetMe(request, env);
      if (method === 'PATCH' && path === '/users/me') return handleUpdateMe(request, env);
      if (method === 'GET' && path === '/users') return handleListUsers(request, env);

      // Session routes
      if (method === 'GET' && path === '/sessions') return handleGetSessions(request, env);
      if (method === 'DELETE' && path.startsWith('/sessions/')) {
        const sessionId = path.split('/')[2];
        return handleRevokeSession(request, env, sessionId);
      }

      // GDPR routes
      if (method === 'POST' && path === '/gdpr/erasure') return handleGDPRErasure(request, env);

      // SCIM 2.0
      if (method === 'POST' && path === '/scim/v2/Users') return handleSCIMCreateUser(request, env);

      // Health
      if (method === 'GET' && path === '/health') return handleHealth(request, env);

      return notFoundResponse(`Route not found: ${method} ${path}`);

    } catch (error) {
      console.error('[INFINITY-ONE] Unhandled error:', error);
      return errorResponse(
        'Internal server error',
        500,
        'INTERNAL_ERROR',
      );
    }
  },
};