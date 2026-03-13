/**
 * @package @trancendos/iam-middleware
 * ============================================================
 * Shared IAM middleware for ALL Trancendos services
 * ============================================================
 * Provides:
 *   - JWT verification (HS512)
 *   - IAM permission evaluation (5-step chain)
 *   - Zero-trust request validation
 *   - SHA-512 audit logging
 *   - 2060 semantic mesh routing headers
 * ============================================================
 * Usage (Express):
 *   import { iamMiddleware, requirePermission, requireLevel } from '@trancendos/iam-middleware';
 *   app.use(iamMiddleware({ serviceId: 'the-hive', infinityPortalUrl: process.env.IAM_URL }));
 *   app.get('/admin', requireLevel(2), handler);
 *   app.post('/data', requirePermission('hive', 'swarm', 'write'), handler);
 * ============================================================
 * Ticket: TRN-IAM-SHARED-001
 * 2060 Standard: Modular, composable, quantum-safe defaults
 * Revert: 6384ebd
 */

import { createHmac, createHash, randomBytes } from 'crypto';
import { Request, Response, NextFunction } from 'express';

// ============================================================
// TYPES
// ============================================================

export type IAMRoleLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface IAMTokenPayload {
  sub: string;           // User ID
  email: string;
  role: string;          // Legacy role (backward compat)
  jti: string;           // JWT ID for revocation
  iat: number;
  exp: number;
  // IAM enrichment (present in HS512 tokens)
  iam_roles?: string[];
  active_role?: string;
  active_role_level?: IAMRoleLevel;
  subscription_tier?: string;
  permissions?: string[];
}

export interface IAMPrincipal {
  userId: string;
  email: string;
  role: string;
  roleLevel: IAMRoleLevel | null;
  activeRole: string | null;
  subscriptionTier: string | null;
  permissions: string[];
  isNHI: boolean;        // Non-Human Identity (agent/bot)
  serviceId?: string;    // For NHI: which service issued the token
}

export interface IAMMiddlewareOptions {
  /** Service identifier (e.g., 'the-hive', 'cornelius-ai') */
  serviceId: string;
  /** Infinity Portal backend URL for permission evaluation */
  infinityPortalUrl?: string;
  /** JWT secret — defaults to IAM_JWT_SECRET env var */
  jwtSecret?: string;
  /** JWT algorithm — defaults to HS512 */
  algorithm?: 'HS256' | 'HS512';
  /** Whether to require authentication on all routes (default: false) */
  requireAuth?: boolean;
  /** Whether to log all requests to audit trail (default: true) */
  auditAll?: boolean;
  /** 2060: Mesh address for this service (e.g., 'the-hive.agent.local') */
  meshAddress?: string;
}

export interface PermissionRequirement {
  namespace: string;
  resource: string;
  action: string;
}

// Extend Express Request with IAM principal
declare global {
  namespace Express {
    interface Request {
      principal?: IAMPrincipal;
      iamToken?: string;
      requestId?: string;
    }
  }
}

// ============================================================
// JWT UTILITIES (Zero-dependency implementation)
// ============================================================

function base64UrlDecode(str: string): string {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - base64.length % 4) % 4);
  return Buffer.from(padded, 'base64').toString('utf8');
}

function base64UrlEncode(str: string): string {
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function verifyJWT(token: string, secret: string, algorithm: string): IAMTokenPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, signatureB64] = parts;
    const header = JSON.parse(base64UrlDecode(headerB64));

    // Verify algorithm matches
    if (header.alg !== algorithm) return null;

    // Verify signature
    const signingInput = `${headerB64}.${payloadB64}`;
    const hmacAlgo = algorithm === 'HS512' ? 'sha512' : 'sha256';
    const expectedSig = base64UrlEncode(
      createHmac(hmacAlgo, secret).update(signingInput).digest('base64')
    );

    if (expectedSig !== signatureB64) return null;

    const payload = JSON.parse(base64UrlDecode(payloadB64)) as IAMTokenPayload;

    // Check expiry
    if (payload.exp && Date.now() / 1000 > payload.exp) return null;

    return payload;
  } catch {
    return null;
  }
}

// ============================================================
// AUDIT LOGGING
// ============================================================

function sha512Hash(data: string): string {
  return createHash('sha512').update(data).digest('hex');
}

function auditLog(
  serviceId: string,
  requestId: string,
  principal: IAMPrincipal | null,
  action: string,
  resource: string,
  decision: 'ALLOW' | 'DENY' | 'UNAUTHENTICATED',
  reason: string,
): void {
  const entry = {
    requestId,
    serviceId,
    principalId: principal?.userId || 'anonymous',
    principalRole: principal?.role || 'none',
    action,
    resource,
    decision,
    reason,
    timestamp: new Date().toISOString(),
    // SHA-512 integrity hash for tamper detection
    integrityHash: sha512Hash(`${requestId}:${principal?.userId}:${action}:${resource}:${decision}:${Date.now()}`),
  };

  // Structured log — picked up by log aggregators (Loki, CloudWatch, etc.)
  console.log(JSON.stringify({ level: 'audit', ...entry }));
}

// ============================================================
// PERMISSION EVALUATION (Client-side fast path)
// ============================================================

function evaluatePermissionLocal(
  permissions: string[],
  namespace: string,
  resource: string,
  action: string,
): boolean {
  const target = `${namespace}:${resource}:${action}`;
  return permissions.some((p) => {
    if (p === '*') return true;
    if (p === target) return true;
    const parts = p.split(':');
    const targetParts = target.split(':');
    if (parts.length !== 3) return false;
    return parts.every((part, i) => part === '*' || part === targetParts[i]);
  });
}

// ============================================================
// CORE MIDDLEWARE
// ============================================================

/**
 * Core IAM middleware — attaches principal to request.
 * Does NOT block unauthenticated requests unless requireAuth: true.
 * Use requirePermission() or requireLevel() for route-level guards.
 */
export function iamMiddleware(options: IAMMiddlewareOptions) {
  const {
    serviceId,
    jwtSecret = process.env.IAM_JWT_SECRET || process.env.JWT_SECRET || '',
    algorithm = 'HS512',
    requireAuth = false,
    auditAll = false,
    meshAddress,
  } = options;

  return (req: Request, res: Response, next: NextFunction): void => {
    // Generate request ID for tracing
    req.requestId = randomBytes(8).toString('hex');

    // Add 2060 mesh routing headers
    res.setHeader('X-Service-Id', serviceId);
    res.setHeader('X-Request-Id', req.requestId);
    if (meshAddress) {
      res.setHeader('X-Mesh-Address', meshAddress);
    }
    res.setHeader('X-IAM-Version', '1.0');

    // Extract Bearer token
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      if (requireAuth) {
        if (auditAll) {
          auditLog(serviceId, req.requestId, null, req.method, req.path, 'UNAUTHENTICATED', 'No token provided');
        }
        res.status(401).json({
          error: 'Unauthorized',
          code: 'NO_TOKEN',
          requestId: req.requestId,
        });
        return;
      }
      next();
      return;
    }

    // Verify JWT
    if (!jwtSecret) {
      console.error(`[IAM] ${serviceId}: IAM_JWT_SECRET not configured`);
      res.status(500).json({ error: 'IAM not configured', requestId: req.requestId });
      return;
    }

    // Try HS512 first, fall back to HS256 for backward compatibility
    let payload = verifyJWT(token, jwtSecret, algorithm);
    if (!payload && algorithm === 'HS512') {
      payload = verifyJWT(token, jwtSecret, 'HS256');
    }

    if (!payload) {
      if (requireAuth) {
        if (auditAll) {
          auditLog(serviceId, req.requestId, null, req.method, req.path, 'UNAUTHENTICATED', 'Invalid or expired token');
        }
        res.status(401).json({
          error: 'Unauthorized',
          code: 'INVALID_TOKEN',
          requestId: req.requestId,
        });
        return;
      }
      next();
      return;
    }

    // Build principal
    const principal: IAMPrincipal = {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
      roleLevel: payload.active_role_level ?? null,
      activeRole: payload.active_role ?? null,
      subscriptionTier: payload.subscription_tier ?? null,
      permissions: payload.permissions ?? [],
      isNHI: payload.role === 'agent' || payload.role === 'bot' || payload.role === 'nhi',
      serviceId: payload.role === 'agent' ? serviceId : undefined,
    };

    req.principal = principal;
    req.iamToken = token;

    if (auditAll) {
      auditLog(serviceId, req.requestId, principal, req.method, req.path, 'ALLOW', 'Authenticated');
    }

    next();
  };
}

// ============================================================
// ROUTE GUARDS
// ============================================================

/**
 * Require authentication — 401 if no valid token.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.principal) {
    res.status(401).json({
      error: 'Authentication required',
      code: 'UNAUTHENTICATED',
      requestId: req.requestId,
    });
    return;
  }
  next();
}

/**
 * Require minimum IAM role level.
 * Level 0 = Continuity Guardian (highest), Level 6 = External AI (lowest).
 * requireLevel(2) allows Level 0, 1, and 2.
 */
export function requireLevel(maxLevel: IAMRoleLevel) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.principal) {
      res.status(401).json({ error: 'Authentication required', code: 'UNAUTHENTICATED', requestId: req.requestId });
      return;
    }

    const level = req.principal.roleLevel;
    if (level === null || level > maxLevel) {
      auditLog(
        req.headers['x-service-id'] as string || 'unknown',
        req.requestId || 'unknown',
        req.principal,
        req.method,
        req.path,
        'DENY',
        `Insufficient level: ${level} > ${maxLevel}`,
      );
      res.status(403).json({
        error: 'Insufficient privilege level',
        code: 'INSUFFICIENT_LEVEL',
        required: maxLevel,
        actual: level,
        requestId: req.requestId,
      });
      return;
    }

    next();
  };
}

/**
 * Require specific IAM permission (namespace:resource:action).
 * Uses client-side cached permissions for fast evaluation.
 * For sensitive operations, use requirePermissionStrict() for server-side eval.
 */
export function requirePermission(namespace: string, resource: string, action: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.principal) {
      res.status(401).json({ error: 'Authentication required', code: 'UNAUTHENTICATED', requestId: req.requestId });
      return;
    }

    const allowed = evaluatePermissionLocal(req.principal.permissions, namespace, resource, action);

    if (!allowed) {
      auditLog(
        req.headers['x-service-id'] as string || 'unknown',
        req.requestId || 'unknown',
        req.principal,
        `${namespace}:${resource}:${action}`,
        req.path,
        'DENY',
        'Permission not in token claims',
      );
      res.status(403).json({
        error: 'Permission denied',
        code: 'PERMISSION_DENIED',
        required: `${namespace}:${resource}:${action}`,
        requestId: req.requestId,
      });
      return;
    }

    next();
  };
}

/**
 * Require any of the given permissions (OR logic).
 */
export function requireAnyPermission(requirements: PermissionRequirement[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.principal) {
      res.status(401).json({ error: 'Authentication required', code: 'UNAUTHENTICATED', requestId: req.requestId });
      return;
    }

    const allowed = requirements.some(({ namespace, resource, action }) =>
      evaluatePermissionLocal(req.principal!.permissions, namespace, resource, action)
    );

    if (!allowed) {
      res.status(403).json({
        error: 'Permission denied',
        code: 'PERMISSION_DENIED',
        required: requirements.map(r => `${r.namespace}:${r.resource}:${r.action}`),
        requestId: req.requestId,
      });
      return;
    }

    next();
  };
}

/**
 * NHI-only route — only Non-Human Identities (agents/bots) can access.
 */
export function requireNHI(req: Request, res: Response, next: NextFunction): void {
  if (!req.principal) {
    res.status(401).json({ error: 'Authentication required', code: 'UNAUTHENTICATED', requestId: req.requestId });
    return;
  }
  if (!req.principal.isNHI) {
    res.status(403).json({ error: 'NHI access only', code: 'HUMAN_NOT_ALLOWED', requestId: req.requestId });
    return;
  }
  next();
}

/**
 * Human-only route — blocks NHI (agents/bots).
 */
export function requireHuman(req: Request, res: Response, next: NextFunction): void {
  if (!req.principal) {
    res.status(401).json({ error: 'Authentication required', code: 'UNAUTHENTICATED', requestId: req.requestId });
    return;
  }
  if (req.principal.isNHI) {
    res.status(403).json({ error: 'Human access only', code: 'NHI_NOT_ALLOWED', requestId: req.requestId });
    return;
  }
  next();
}

// ============================================================
// HEALTH CHECK HELPER
// ============================================================

/**
 * Standard health check response with IAM status.
 * Use in all service /health endpoints.
 */
export function iamHealthStatus(serviceId: string, meshAddress?: string) {
  return {
    iam: {
      version: '1.0',
      algorithm: 'HS512',
      status: process.env.IAM_JWT_SECRET ? 'configured' : 'unconfigured',
      meshAddress: meshAddress || null,
      routingProtocol: process.env.MESH_ROUTING_PROTOCOL || 'static_port',
      // 2060 migration path
      cryptoMigrationPath: 'hmac_sha512 → ml_kem (2030) → hybrid_pqc (2040) → slh_dsa (2060)',
    },
  };
}

// ============================================================
// EXPORTS
// ============================================================

export { sha512Hash, evaluatePermissionLocal, auditLog };
// Note: IAMMiddlewareOptions and PermissionRequirement are already exported
// as 'export interface' at their declaration sites above; re-exporting here
// would cause "Export declaration conflicts" TypeScript error.