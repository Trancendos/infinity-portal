/**
 * API Middleware Stack
 * 
 * Keycloak JWT auth, RBAC, rate limiting, request validation.
 * Follows Express + Helmet + Morgan pattern (Pattern B ecosystem standard).
 */

import { Request, Response, NextFunction } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { z } from 'zod';
import { createModuleLogger } from '../utils/logger.js';
import { getConfig } from '../config/environment.js';
import type { Role } from '../registry/schemas.js';

const log = createModuleLogger('api:middleware');

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AuthenticatedUser {
  userId: string;
  username: string;
  email?: string;
  roles: string[];
  tenantId: string;
  method: 'cli' | 'ci-cd' | 'api' | 'mesh';
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      tenantId?: string;
      repositoryId?: string;
      traceId?: string;
    }
  }
}

// ─── Trace ID Middleware ─────────────────────────────────────────────────────

export function traceIdMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const { randomUUID } = require('crypto');
  req.traceId = (req.headers['x-trace-id'] as string) || randomUUID();
  next();
}

// ─── Keycloak JWT Authentication ─────────────────────────────────────────────

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJWKS() {
  if (!jwks) {
    const config = getConfig();
    const jwksUrl = new URL(`${config.KEYCLOAK_URL}/realms/${config.KEYCLOAK_REALM}/protocol/openid-connect/certs`);
    jwks = createRemoteJWKSet(jwksUrl);
  }
  return jwks;
}

export function authMiddleware(options?: { optional?: boolean }) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      if (options?.optional) {
        // Anonymous access allowed for this route
        req.user = undefined;
        req.tenantId = 'default';
        next();
        return;
      }
      res.status(401).json({ error: 'Authentication required', code: 'AUTH_REQUIRED' });
      return;
    }

    const token = authHeader.substring(7);

    try {
      const config = getConfig();

      // In development mode, accept a simple token format for testing
      if (config.NODE_ENV === 'development' && token.startsWith('dev-')) {
        req.user = {
          userId: 'dev-user',
          username: 'developer',
          email: 'dev@trancendos.com',
          roles: ['admin', 'developer', 'ci-cd'],
          tenantId: 'default',
          method: 'api',
        };
        req.tenantId = 'default';
        next();
        return;
      }

      const { payload } = await jwtVerify(token, getJWKS(), {
        issuer: config.JWT_ISSUER,
        audience: config.KEYCLOAK_CLIENT_ID,
      });

      req.user = {
        userId: (payload.sub as string) || '',
        username: (payload.preferred_username as string) || (payload.sub as string) || '',
        email: payload.email as string,
        roles: (payload.realm_access as any)?.roles || [],
        tenantId: (payload.tenant_id as string) || 'default',
        method: detectAuthMethod(req),
      };
      req.tenantId = req.user.tenantId;

      next();
    } catch (error: any) {
      log.warn({ error: error.message, ip: req.ip }, 'JWT verification failed');
      res.status(401).json({ error: 'Invalid or expired token', code: 'AUTH_INVALID' });
    }
  };
}

function detectAuthMethod(req: Request): 'cli' | 'ci-cd' | 'api' | 'mesh' {
  const userAgent = req.get('user-agent') || '';
  if (userAgent.includes('npm') || userAgent.includes('docker') || userAgent.includes('helm') || userAgent.includes('pip')) return 'cli';
  if (userAgent.includes('GitHub-Actions') || userAgent.includes('CI')) return 'ci-cd';
  if (req.headers['x-mesh-source']) return 'mesh';
  return 'api';
}

// ─── RBAC Middleware ─────────────────────────────────────────────────────────

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required', code: 'AUTH_REQUIRED' });
      return;
    }

    const hasRole = roles.some(role => req.user!.roles.includes(role));
    if (!hasRole) {
      log.warn({
        userId: req.user.userId,
        requiredRoles: roles,
        userRoles: req.user.roles,
        path: req.path,
      }, 'Access denied — insufficient roles');

      res.status(403).json({
        error: 'Insufficient permissions',
        code: 'RBAC_DENIED',
        required: roles,
        current: req.user.roles,
      });
      return;
    }

    next();
  };
}

// ─── Rate Limiting ───────────────────────────────────────────────────────────

const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

export function rateLimitMiddleware(options?: { windowMs?: number; maxRequests?: number }) {
  const windowMs = options?.windowMs || 60000;
  const maxRequests = options?.maxRequests || 1000;

  // Cleanup expired entries periodically
  setInterval(() => {
    const now = Date.now();
    for (const [key, value] of rateLimitStore) {
      if (value.resetAt < now) {
        rateLimitStore.delete(key);
      }
    }
  }, windowMs);

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.user?.tenantId || req.ip || 'anonymous';
    const now = Date.now();

    let entry = rateLimitStore.get(key);
    if (!entry || entry.resetAt < now) {
      entry = { count: 0, resetAt: now + windowMs };
      rateLimitStore.set(key, entry);
    }

    entry.count++;

    res.set({
      'X-RateLimit-Limit': String(maxRequests),
      'X-RateLimit-Remaining': String(Math.max(0, maxRequests - entry.count)),
      'X-RateLimit-Reset': String(Math.ceil(entry.resetAt / 1000)),
    });

    if (entry.count > maxRequests) {
      log.warn({ key, count: entry.count, maxRequests }, 'Rate limit exceeded');
      res.status(429).json({
        error: 'Rate limit exceeded',
        code: 'RATE_LIMITED',
        retryAfter: Math.ceil((entry.resetAt - now) / 1000),
      });
      return;
    }

    next();
  };
}

// ─── Zod Request Validation ──────────────────────────────────────────────────

export function validateBody(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: result.error.flatten(),
      });
      return;
    }
    req.body = result.data;
    next();
  };
}

export function validateQuery(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      res.status(400).json({
        error: 'Query validation failed',
        code: 'VALIDATION_ERROR',
        details: result.error.flatten(),
      });
      return;
    }
    req.query = result.data;
    next();
  };
}

// ─── Error Handler ───────────────────────────────────────────────────────────

export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction): void {
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal server error';

  log.error({
    error: err.message,
    stack: err.stack,
    statusCode,
    path: req.path,
    method: req.method,
    traceId: req.traceId,
    userId: req.user?.userId,
  }, 'Request error');

  res.status(statusCode).json({
    error: message,
    code: err.name || 'INTERNAL_ERROR',
    traceId: req.traceId,
    timestamp: new Date().toISOString(),
  });
}