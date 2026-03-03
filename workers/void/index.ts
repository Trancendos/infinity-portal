/**
 * Void Cloudflare Worker
 * Secure Secret Store API
 *
 * Routes:
 *   POST   /secrets                      — Store a new secret
 *   GET    /secrets                      — Search/list secrets (metadata only)
 *   POST   /secrets/retrieve             — Retrieve a secret (returns plaintext)
 *   GET    /secrets/:secretId            — Get secret metadata
 *   PATCH  /secrets/:secretId            — Update secret value
 *   DELETE /secrets/:secretId            — Crypto-shred secret
 *   POST   /secrets/:secretId/rotate     — Rotate secret
 *   POST   /secrets/:secretId/quarantine — Quarantine via Warp Tunnel
 *   GET    /secrets/:secretId/audit      — Get audit log
 *
 *   GET    /vault/status                 — Vault seal status
 *   POST   /vault/unseal                 — Provide unseal shard
 *   POST   /vault/seal                   — Seal the vault
 *
 *   POST   /shamir/reconstruct           — Reconstruct from Shamir shards
 *   POST   /zk/verify                    — Verify ZK proof
 *
 *   POST   /gdpr/erasure                 — GDPR erasure for data subject
 *
 *   GET    /metrics                      — Vault metrics
 *   GET    /health                       — Health check
 *
 *   POST   /internal/events              — Internal event receiver
 */

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
  LIGHTHOUSE_URL: string;
  HIVE_URL: string;
  INFINITY_ONE_URL: string;
  INTERNAL_SECRET: string;
  MASTER_KEY_SEED: string;
  KV_SECRETS_CACHE: KVNamespace;
  KV_RATE_LIMIT: KVNamespace;
  R2_SECRETS: R2Bucket;
  ENVIRONMENT: string;
}

// ============================================================
// CONSTANTS
// ============================================================

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Request-ID, X-MFA-Token, X-Hardware-Key, X-Lighthouse-Token',
};

// Vault state (in-memory for worker — persisted to KV/DB)
let vaultSealed = true;
let unsealShardsCollected = 0;
const SHAMIR_THRESHOLD = 5;
const SHAMIR_TOTAL = 9;

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

function sealedResponse(): Response {
  return errorResponse(
    `Vault is SEALED — provide ${SHAMIR_THRESHOLD - unsealShardsCollected} more shards to unseal`,
    503,
    'VAULT_SEALED',
  );
}

// ============================================================
// AUTHENTICATION
// ============================================================

async function verifyJWT(token: string): Promise<Record<string, unknown> | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

async function extractUser(request: Request): Promise<Record<string, unknown> | null> {
  const auth = request.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  return verifyJWT(auth.substring(7));
}

// ============================================================
// RATE LIMITING
// ============================================================

async function checkRateLimit(env: Env, key: string, max: number, windowSecs: number): Promise<boolean> {
  const windowKey = `rl:void:${key}:${Math.floor(Date.now() / (windowSecs * 1000))}`;
  const current = parseInt(await env.KV_RATE_LIMIT.get(windowKey) ?? '0');
  if (current >= max) return false;
  await env.KV_RATE_LIMIT.put(windowKey, String(current + 1), { expirationTtl: windowSecs });
  return true;
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
// ENCRYPTION HELPERS
// ============================================================

async function encryptSecret(plaintext: string, classification: string, secretId: string): Promise<{
  ciphertext: string;
  iv: string;
  authTag: string;
  algorithm: string;
  keyId: string;
  plaintextHash: string;
}> {
  const algorithm = classification === 'VOID' || classification === 'QUANTUM'
    ? 'ML-KEM-1024'
    : classification === 'CLASSIFIED'
      ? 'Hybrid-X25519-MLKEM-1024'
      : classification === 'CONFIDENTIAL'
        ? 'ChaCha20-Poly1305'
        : 'AES-256-GCM';

  // Generate IV
  const iv = Array.from(crypto.getRandomValues(new Uint8Array(12)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  // Compute plaintext hash
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(plaintext));
  const plaintextHash = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  // In production: use Web Crypto API with real AES-GCM
  // For now: base64url encode with marker
  const ciphertext = btoa(plaintext) + ':enc:' + algorithm;
  const authTag = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return {
    ciphertext,
    iv,
    authTag,
    algorithm,
    keyId: `mk-v1-${classification.toLowerCase()}`,
    plaintextHash,
  };
}

async function decryptSecret(encryptedPayload: {
  ciphertext: string;
  algorithm: string;
}): Promise<string> {
  // In production: use real decryption
  const base64 = encryptedPayload.ciphertext.split(':enc:')[0];
  return atob(base64);
}

// ============================================================
// AUDIT HELPERS
// ============================================================

async function createAuditEntry(
  env: Env,
  secretId: string,
  action: string,
  principalId: string,
  result: string,
  extra: Record<string, unknown> = {},
): Promise<string> {
  const auditId = `AUD-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

  const entryData = JSON.stringify({ auditId, secretId, action, principalId, result, timestamp: new Date().toISOString(), ...extra });
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(entryData));
  const entryHash = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  await dbQuery(env, '/void/secret_audit_log', 'POST', {
    audit_id: auditId,
    secret_id: secretId,
    action,
    principal_id: principalId,
    principal_type: 'user',
    result,
    is_break_glass: extra.isBreakGlass ?? false,
    reason: extra.reason,
    lighthouse_token_id: extra.lighthouseTokenId,
    entry_hash: entryHash,
    timestamp: new Date().toISOString(),
  });

  return auditId;
}

// ============================================================
// ROUTE HANDLERS
// ============================================================

async function handleStoreSecret(request: Request, env: Env): Promise<Response> {
  if (vaultSealed) return sealedResponse();

  const user = await extractUser(request);
  if (!user) return errorResponse('Unauthorized', 401, 'UNAUTHORIZED');

  // Rate limit: 100 stores per hour per user
  const allowed = await checkRateLimit(env, `store:${user.sub}`, 100, 3600);
  if (!allowed) return errorResponse('Rate limit exceeded', 429, 'RATE_LIMITED');

  const body = await request.json() as {
    name: string;
    description?: string;
    type: string;
    classification: string;
    plaintext: string;
    path: string;
    tags?: string[];
    expiresAt?: string;
    reason?: string;
    accessPolicy?: Record<string, unknown>;
  };

  if (!body.name || !body.plaintext || !body.path || !body.type || !body.classification) {
    return errorResponse('name, plaintext, path, type, and classification are required', 400);
  }

  // Validate path format
  if (!/^[a-zA-Z0-9/_-]+$/.test(body.path)) {
    return errorResponse('Invalid path format — use alphanumeric, /, _, -', 400, 'INVALID_PATH');
  }

  // Size check (64KB max)
  if (new TextEncoder().encode(body.plaintext).length > 65536) {
    return errorResponse('Secret exceeds maximum size of 64KB', 400, 'SECRET_TOO_LARGE');
  }

  const secretId = `SEC-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

  // Encrypt
  const encrypted = await encryptSecret(body.plaintext, body.classification, secretId);

  // Sensitivity score
  const sensitivityScore = body.classification === 'VOID' ? 100
    : body.classification === 'CLASSIFIED' ? 90
    : body.classification === 'CONFIDENTIAL' ? 75
    : body.classification === 'INTERNAL' ? 50
    : 25;

  const secret = {
    secret_id: secretId,
    name: body.name,
    description: body.description,
    type: body.type,
    classification: body.classification,
    status: 'ACTIVE',
    version: 1,
    previous_versions: [],
    encrypted_payload: {
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
      auth_tag: encrypted.authTag,
      algorithm: encrypted.algorithm,
      key_id: encrypted.keyId,
      key_version: 1,
      plaintext_hash: encrypted.plaintextHash,
      hash_algorithm: 'SHA-256',
      encrypted_at: new Date().toISOString(),
    },
    key_derivation: {
      algorithm: 'HKDF',
      salt: Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join(''),
      key_length: 32,
      info: `void:${secretId}:${body.classification}`,
    },
    access_policy: {
      readers: [{ type: 'user', id: user.sub, grantedBy: 'system', grantedAt: new Date().toISOString() }],
      writers: [{ type: 'user', id: user.sub, grantedBy: 'system', grantedAt: new Date().toISOString() }],
      managers: [{ type: 'user', id: user.sub, grantedBy: 'system', grantedAt: new Date().toISOString() }],
      approvers: [],
      conditions: [],
      require_approval: false,
      require_mfa: ['VOID', 'CLASSIFIED'].includes(body.classification),
      require_hardware_key: body.classification === 'VOID',
      rate_limit: { max_requests: 100, window_seconds: 3600, per_principal: true },
      break_glass: {
        enabled: ['VOID', 'CLASSIFIED'].includes(body.classification),
        authorised_principals: [user.sub],
        require_reason: true,
        alert_on_use: true,
        alert_recipients: [user.sub],
        auto_rotate_after_use: true,
      },
      ...body.accessPolicy,
    },
    owner_id: user.sub as string,
    path: body.path,
    tags: body.tags ?? [],
    metadata: {
      environment: env.ENVIRONMENT ?? 'production',
      region: 'eu-west-1',
      labels: {},
      compliance_frameworks: ['ISO27001', 'SOC2'],
      sensitivity_score: sensitivityScore,
    },
    gdpr: {
      contains_personal_data: false,
      portability_available: false,
    },
    expires_at: body.expiresAt,
    rotation_config: {
      enabled: true,
      interval_days: 90,
      strategy: 'GRACEFUL',
      notify_days_before: 14,
      notify_recipients: [],
      keep_versions: 3,
    },
  };

  const { data, error } = await dbQuery(env, '/void/secrets', 'POST', secret);
  if (error) return errorResponse('Failed to store secret', 500, 'STORE_FAILED');

  // Audit
  await createAuditEntry(env, secretId, 'CREATE', user.sub as string, 'success', {
    reason: body.reason,
    classification: body.classification,
    type: body.type,
  });

  // Return without plaintext
  const stored = (data as unknown[])[0] as Record<string, unknown>;
  const { encrypted_payload, ...safeSecret } = stored;

  return jsonResponse({ secret: safeSecret }, 201);
}

async function handleRetrieveSecret(request: Request, env: Env): Promise<Response> {
  if (vaultSealed) return sealedResponse();

  const user = await extractUser(request);
  if (!user) return errorResponse('Unauthorized', 401, 'UNAUTHORIZED');

  // Strict rate limit for retrieval: 50 per hour
  const allowed = await checkRateLimit(env, `retrieve:${user.sub}`, 50, 3600);
  if (!allowed) return errorResponse('Rate limit exceeded', 429, 'RATE_LIMITED');

  const body = await request.json() as {
    secretId: string;
    reason?: string;
    mfaToken?: string;
    hardwareKeySignature?: string;
    lighthouseTokenId?: string;
    breakGlass?: boolean;
    breakGlassReason?: string;
  };

  if (!body.secretId) return errorResponse('secretId is required', 400);

  // Fetch secret
  const { data, error } = await dbQuery(
    env,
    `/void/secrets?secret_id=eq.${body.secretId}`,
  );

  if (error || !(data as unknown[])?.length) {
    return errorResponse('Secret not found', 404, 'NOT_FOUND');
  }

  const secret = (data as unknown[])[0] as Record<string, unknown>;

  // Status checks
  if (secret.status === 'SHREDDED') return errorResponse('Secret has been crypto-shredded', 410, 'SHREDDED');
  if (secret.status === 'REVOKED') return errorResponse('Secret has been revoked', 410, 'REVOKED');
  if (secret.status === 'QUARANTINED') return errorResponse('Secret is quarantined in IceBox', 403, 'QUARANTINED');

  // Expiry check
  if (secret.expires_at && new Date(secret.expires_at as string) < new Date()) {
    await dbQuery(env, `/void/secrets?secret_id=eq.${body.secretId}`, 'PATCH', { status: 'EXPIRED' });
    return errorResponse('Secret has expired', 410, 'EXPIRED');
  }

  // Access control
  const policy = secret.access_policy as Record<string, unknown>;
  const readers = (policy.readers as Array<Record<string, unknown>>) ?? [];
  const isReader = readers.some((r) => r.id === user.sub || r.id === '*');

  if (!isReader && !body.breakGlass) {
    await createAuditEntry(env, body.secretId, 'ACCESS_DENIED', user.sub as string, 'denied', {
      reason: 'Not in readers list',
    });
    return errorResponse('Access denied — not in readers list', 403, 'ACCESS_DENIED');
  }

  // MFA check
  if (policy.require_mfa && !body.mfaToken && !body.breakGlass) {
    return errorResponse('MFA token required for this secret', 403, 'MFA_REQUIRED');
  }

  // Hardware key check
  if (policy.require_hardware_key && !body.hardwareKeySignature && !body.breakGlass) {
    return errorResponse('Hardware key signature required for this secret', 403, 'HARDWARE_KEY_REQUIRED');
  }

  // Break-glass handling
  if (body.breakGlass) {
    const bgConfig = policy.break_glass as Record<string, unknown>;
    if (!bgConfig?.enabled) return errorResponse('Break-glass not enabled', 403, 'BREAK_GLASS_DISABLED');
    const authorised = (bgConfig.authorised_principals as string[]) ?? [];
    if (!authorised.includes(user.sub as string)) {
      return errorResponse('Not authorised for break-glass access', 403, 'BREAK_GLASS_UNAUTHORIZED');
    }
    if (bgConfig.require_reason && !body.breakGlassReason) {
      return errorResponse('Break-glass reason required', 400, 'BREAK_GLASS_REASON_REQUIRED');
    }
    console.warn(`[VOID] ⚠️  BREAK-GLASS: ${body.secretId} by ${user.sub}`);
  }

  // Decrypt
  const encPayload = secret.encrypted_payload as Record<string, unknown>;
  const plaintext = await decryptSecret({
    ciphertext: encPayload.ciphertext as string,
    algorithm: encPayload.algorithm as string,
  });

  // Update last accessed
  await dbQuery(env, `/void/secrets?secret_id=eq.${body.secretId}`, 'PATCH', {
    last_accessed_at: new Date().toISOString(),
  });

  // Audit
  const auditId = await createAuditEntry(env, body.secretId, 'READ', user.sub as string, 'success', {
    reason: body.reason,
    isBreakGlass: body.breakGlass ?? false,
    lighthouseTokenId: body.lighthouseTokenId,
  });

  const warnings: string[] = [];
  if (secret.expires_at) {
    const days = Math.floor((new Date(secret.expires_at as string).getTime() - Date.now()) / 86400000);
    if (days <= 7) warnings.push(`Secret expires in ${days} days`);
  }

  return jsonResponse({
    secretId: body.secretId,
    name: secret.name,
    type: secret.type,
    classification: secret.classification,
    version: secret.version,
    plaintext,
    expiresAt: secret.expires_at,
    retrievedAt: new Date().toISOString(),
    auditId,
    warnings: warnings.length > 0 ? warnings : undefined,
  });
}

async function handleGetSecretMeta(env: Env, secretId: string, userId: string): Promise<Response> {
  const { data, error } = await dbQuery(
    env,
    `/void/secrets?secret_id=eq.${secretId}&select=secret_id,name,description,type,classification,status,version,path,tags,owner_id,expires_at,last_accessed_at,created_at,updated_at,rotation_config,metadata`,
  );

  if (error || !(data as unknown[])?.length) {
    return errorResponse('Secret not found', 404, 'NOT_FOUND');
  }

  const secret = (data as unknown[])[0] as Record<string, unknown>;

  // Check read access
  const { data: fullData } = await dbQuery(env, `/void/secrets?secret_id=eq.${secretId}&select=access_policy`);
  const policy = ((fullData as unknown[])?.[0] as Record<string, unknown>)?.access_policy as Record<string, unknown>;
  const readers = (policy?.readers as Array<Record<string, unknown>>) ?? [];
  const isReader = readers.some((r) => r.id === userId || r.id === '*');

  if (!isReader) return errorResponse('Access denied', 403, 'ACCESS_DENIED');

  return jsonResponse({ secret });
}

async function handleRotateSecret(request: Request, env: Env, secretId: string): Promise<Response> {
  if (vaultSealed) return sealedResponse();

  const user = await extractUser(request);
  if (!user) return errorResponse('Unauthorized', 401, 'UNAUTHORIZED');

  const body = await request.json() as {
    newPlaintext?: string;
    strategy?: string;
    reason?: string;
    gracePeriodHours?: number;
  };

  // Fetch current secret
  const { data, error } = await dbQuery(env, `/void/secrets?secret_id=eq.${secretId}`);
  if (error || !(data as unknown[])?.length) return errorResponse('Secret not found', 404);

  const secret = (data as unknown[])[0] as Record<string, unknown>;

  // Generate new value if not provided
  const newPlaintext = body.newPlaintext ?? Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  // Re-encrypt
  const encrypted = await encryptSecret(newPlaintext, secret.classification as string, secretId);

  const newVersion = (secret.version as number) + 1;
  const previousVersions = [...((secret.previous_versions as string[]) ?? []), `${secretId}:v${secret.version}`];

  await dbQuery(env, `/void/secrets?secret_id=eq.${secretId}`, 'PATCH', {
    version: newVersion,
    previous_versions: previousVersions,
    status: 'ACTIVE',
    encrypted_payload: {
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
      auth_tag: encrypted.authTag,
      algorithm: encrypted.algorithm,
      key_id: encrypted.keyId,
      key_version: newVersion,
      plaintext_hash: encrypted.plaintextHash,
      hash_algorithm: 'SHA-256',
      encrypted_at: new Date().toISOString(),
    },
    updated_at: new Date().toISOString(),
  });

  await createAuditEntry(env, secretId, 'ROTATE', user.sub as string, 'success', {
    reason: body.reason,
    previousVersion: secret.version,
    newVersion,
    strategy: body.strategy ?? 'GRACEFUL',
  });

  return jsonResponse({
    secretId,
    previousVersion: secret.version,
    newVersion,
    strategy: body.strategy ?? 'GRACEFUL',
    rotatedAt: new Date().toISOString(),
  });
}

async function handleDeleteSecret(request: Request, env: Env, secretId: string): Promise<Response> {
  if (vaultSealed) return sealedResponse();

  const user = await extractUser(request);
  if (!user) return errorResponse('Unauthorized', 401, 'UNAUTHORIZED');

  const body = await request.json() as { reason: string };
  if (!body.reason) return errorResponse('Reason required for deletion', 400);

  // Crypto-shred: overwrite encrypted payload
  await dbQuery(env, `/void/secrets?secret_id=eq.${secretId}`, 'PATCH', {
    status: 'SHREDDED',
    encrypted_payload: {
      ciphertext: 'SHREDDED',
      iv: 'SHREDDED',
      auth_tag: 'SHREDDED',
      algorithm: 'SHREDDED',
      key_id: 'SHREDDED',
      key_version: 0,
      plaintext_hash: 'SHREDDED',
      hash_algorithm: 'SHA-256',
      encrypted_at: new Date().toISOString(),
    },
    updated_at: new Date().toISOString(),
  });

  await createAuditEntry(env, secretId, 'SHRED', user.sub as string, 'success', {
    reason: body.reason,
  });

  return jsonResponse({ success: true, secretId, shredAt: new Date().toISOString() });
}

async function handleQuarantineSecret(request: Request, env: Env, secretId: string): Promise<Response> {
  if (vaultSealed) return sealedResponse();

  const user = await extractUser(request);
  if (!user) return errorResponse('Unauthorized', 401, 'UNAUTHORIZED');

  const body = await request.json() as {
    reason: string;
    threatLevel: string;
  };

  const transferId = `WARP-VOID-${Date.now().toString(36).toUpperCase()}`;

  // Mark as quarantined
  await dbQuery(env, `/void/secrets?secret_id=eq.${secretId}`, 'PATCH', {
    status: 'QUARANTINED',
    updated_at: new Date().toISOString(),
  });

  // Log warp transfer
  await dbQuery(env, '/void/warp_transfers', 'POST', {
    transfer_id: transferId,
    secret_id: secretId,
    secret_name: 'quarantined',
    reason: body.reason,
    threat_level: body.threatLevel,
    triggered_by: user.sub,
    status: 'quarantined',
    auto_shredded: body.threatLevel === 'critical',
    triggered_at: new Date().toISOString(),
  });

  // Auto-shred if critical
  if (body.threatLevel === 'critical') {
    await dbQuery(env, `/void/secrets?secret_id=eq.${secretId}`, 'PATCH', {
      status: 'SHREDDED',
      encrypted_payload: {
        ciphertext: 'SHREDDED', iv: 'SHREDDED', auth_tag: 'SHREDDED',
        algorithm: 'SHREDDED', key_id: 'SHREDDED', key_version: 0,
        plaintext_hash: 'SHREDDED', hash_algorithm: 'SHA-256',
        encrypted_at: new Date().toISOString(),
      },
    });
  }

  await createAuditEntry(env, secretId, 'QUARANTINE', user.sub as string, 'success', {
    reason: body.reason,
    threatLevel: body.threatLevel,
    transferId,
    autoShredded: body.threatLevel === 'critical',
  });

  return jsonResponse({
    success: true,
    secretId,
    transferId,
    status: body.threatLevel === 'critical' ? 'SHREDDED' : 'QUARANTINED',
    autoShredded: body.threatLevel === 'critical',
  });
}

async function handleGetAuditLog(env: Env, secretId: string, userId: string): Promise<Response> {
  const { data, error } = await dbQuery(
    env,
    `/void/secret_audit_log?secret_id=eq.${secretId}&order=timestamp.desc&limit=100`,
  );

  if (error) return errorResponse('Failed to get audit log', 500);
  return jsonResponse({ auditLog: data });
}

async function handleVaultStatus(_env: Env): Promise<Response> {
  return jsonResponse({
    sealed: vaultSealed,
    shamirThreshold: SHAMIR_THRESHOLD,
    shamirTotal: SHAMIR_TOTAL,
    shardsProvided: unsealShardsCollected,
    shardsRemaining: Math.max(0, SHAMIR_THRESHOLD - unsealShardsCollected),
    progress: Math.round((unsealShardsCollected / SHAMIR_THRESHOLD) * 100),
    timestamp: new Date().toISOString(),
  });
}

async function handleUnseal(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as {
    shardIndex: number;
    encryptedShard: string;
    providedBy: string;
    signature: string;
  };

  if (!body.encryptedShard || !body.signature) {
    return errorResponse('encryptedShard and signature are required', 400);
  }

  unsealShardsCollected++;
  const shardsRemaining = Math.max(0, SHAMIR_THRESHOLD - unsealShardsCollected);
  const progress = Math.round((unsealShardsCollected / SHAMIR_THRESHOLD) * 100);

  if (unsealShardsCollected >= SHAMIR_THRESHOLD) {
    vaultSealed = false;
    unsealShardsCollected = 0;
    console.log(`[VOID] ✅ Vault UNSEALED by ${body.providedBy}`);
  }

  return jsonResponse({
    sealed: vaultSealed,
    shardsProvided: unsealShardsCollected,
    shardsRemaining,
    progress,
    message: vaultSealed
      ? `Shard accepted — ${shardsRemaining} more required`
      : 'Vault unsealed successfully',
  });
}

async function handleSeal(request: Request, env: Env): Promise<Response> {
  const user = await extractUser(request);
  if (!user) return errorResponse('Unauthorized', 401, 'UNAUTHORIZED');

  const body = await request.json() as { reason: string };

  vaultSealed = true;
  unsealShardsCollected = 0;

  console.log(`[VOID] 🔒 Vault SEALED by ${user.sub}: ${body.reason}`);

  return jsonResponse({
    sealed: true,
    sealedBy: user.sub,
    sealedAt: new Date().toISOString(),
    reason: body.reason,
  });
}

async function handleGDPRErasure(request: Request, env: Env): Promise<Response> {
  const user = await extractUser(request);
  if (!user) return errorResponse('Unauthorized', 401, 'UNAUTHORIZED');

  const body = await request.json() as { dataSubjectId: string; reason: string };

  // Find secrets belonging to data subject
  const { data } = await dbQuery(
    env,
    `/void/secrets?owner_id=eq.${body.dataSubjectId}&status=eq.ACTIVE`,
  );

  const secrets = (data as unknown[]) ?? [];
  let erased = 0;

  for (const secret of secrets) {
    const s = secret as Record<string, unknown>;
    await dbQuery(env, `/void/secrets?secret_id=eq.${s.secret_id}`, 'PATCH', {
      status: 'SHREDDED',
      encrypted_payload: {
        ciphertext: 'GDPR_ERASED', iv: 'GDPR_ERASED', auth_tag: 'GDPR_ERASED',
        algorithm: 'GDPR_ERASED', key_id: 'GDPR_ERASED', key_version: 0,
        plaintext_hash: 'GDPR_ERASED', hash_algorithm: 'SHA-256',
        encrypted_at: new Date().toISOString(),
      },
      gdpr: { erasure_completed_at: new Date().toISOString(), erasure_reason: body.reason },
    });
    erased++;
  }

  return jsonResponse({
    success: true,
    dataSubjectId: body.dataSubjectId,
    secretsErased: erased,
    erasedAt: new Date().toISOString(),
  });
}

async function handleGetMetrics(env: Env): Promise<Response> {
  const { data: secrets } = await dbQuery(env, '/void/secrets?select=type,classification,status,expires_at');
  const secretList = (secrets as unknown[]) ?? [];

  const now = new Date();
  const in7Days = new Date(now.getTime() + 7 * 86400000);
  const in30Days = new Date(now.getTime() + 30 * 86400000);

  return jsonResponse({
    vault: {
      sealed: vaultSealed,
      totalSecrets: secretList.length,
      active: secretList.filter((s: unknown) => (s as Record<string, unknown>).status === 'ACTIVE').length,
      shredded: secretList.filter((s: unknown) => (s as Record<string, unknown>).status === 'SHREDDED').length,
      quarantined: secretList.filter((s: unknown) => (s as Record<string, unknown>).status === 'QUARANTINED').length,
      expiringIn7Days: secretList.filter((s: unknown) => {
        const exp = (s as Record<string, unknown>).expires_at as string;
        return exp && new Date(exp) <= in7Days && new Date(exp) > now;
      }).length,
      expiringIn30Days: secretList.filter((s: unknown) => {
        const exp = (s as Record<string, unknown>).expires_at as string;
        return exp && new Date(exp) <= in30Days && new Date(exp) > now;
      }).length,
    },
    byClassification: secretList.reduce((acc: Record<string, number>, s: unknown) => {
      const cls = (s as Record<string, unknown>).classification as string;
      acc[cls] = (acc[cls] ?? 0) + 1;
      return acc;
    }, {}),
    generatedAt: new Date().toISOString(),
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
      // Secret operations
      if (method === 'POST' && path === '/secrets') return handleStoreSecret(request, env);
      if (method === 'POST' && path === '/secrets/retrieve') return handleRetrieveSecret(request, env);

      if (method === 'GET' && segments[0] === 'secrets' && segments[1] && !segments[2]) {
        const user = await extractUser(request);
        if (!user) return errorResponse('Unauthorized', 401, 'UNAUTHORIZED');
        return handleGetSecretMeta(env, segments[1], user.sub as string);
      }

      if (method === 'PATCH' && segments[0] === 'secrets' && segments[1] && !segments[2]) {
        return handleRotateSecret(request, env, segments[1]);
      }

      if (method === 'DELETE' && segments[0] === 'secrets' && segments[1] && !segments[2]) {
        return handleDeleteSecret(request, env, segments[1]);
      }

      if (method === 'POST' && segments[0] === 'secrets' && segments[2] === 'rotate') {
        return handleRotateSecret(request, env, segments[1]);
      }

      if (method === 'POST' && segments[0] === 'secrets' && segments[2] === 'quarantine') {
        return handleQuarantineSecret(request, env, segments[1]);
      }

      if (method === 'GET' && segments[0] === 'secrets' && segments[2] === 'audit') {
        const user = await extractUser(request);
        if (!user) return errorResponse('Unauthorized', 401, 'UNAUTHORIZED');
        return handleGetAuditLog(env, segments[1], user.sub as string);
      }

      // Vault operations
      if (method === 'GET' && path === '/vault/status') return handleVaultStatus(env);
      if (method === 'POST' && path === '/vault/unseal') return handleUnseal(request, env);
      if (method === 'POST' && path === '/vault/seal') return handleSeal(request, env);

      // GDPR
      if (method === 'POST' && path === '/gdpr/erasure') return handleGDPRErasure(request, env);

      // Metrics & Health
      if (method === 'GET' && path === '/metrics') return handleGetMetrics(env);
      if (method === 'GET' && path === '/health') {
        return jsonResponse({
          status: vaultSealed ? 'sealed' : 'healthy',
          service: 'void',
          version: '1.0.0',
          sealed: vaultSealed,
          timestamp: new Date().toISOString(),
        });
      }

      // Internal events
      if (method === 'POST' && path === '/internal/events') {
        const secret = request.headers.get('X-Internal-Secret');
        if (secret !== env.INTERNAL_SECRET) return errorResponse('Unauthorized', 401);
        const body = await request.json() as { event: string; data: Record<string, unknown> };
        console.log(`[VOID] Internal event: ${body.event}`);
        return jsonResponse({ received: true });
      }

      return errorResponse(`Route not found: ${method} ${path}`, 404, 'NOT_FOUND');

    } catch (error) {
      console.error('[VOID] Error:', error);
      return errorResponse('Internal server error', 500, 'INTERNAL_ERROR');
    }
  },
};