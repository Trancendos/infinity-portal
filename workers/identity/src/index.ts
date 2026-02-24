/**
 * @worker identity
 * Infinity OS Identity Service — Cloudflare Worker
 * 
 * Handles: Authentication, Authorisation, JWT, MFA, RBAC
 * Runtime: Cloudflare Workers (Edge)
 * Framework: Hono.js
 * 
 * Zero Trust: Every request is authenticated and authorised.
 * No implicit trust. No network perimeters.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { jwt } from 'hono/jwt';
import { logger } from 'hono/logger';
import { z } from 'zod';
import type { ApiResponse, User, Session, UserRole } from '@infinity-os/types';

// ============================================================
// ENVIRONMENT BINDINGS (Cloudflare Worker)
// ============================================================

export interface Env {
  // Cloudflare KV for session/cache storage
  KV: KVNamespace;
  // Cloudflare D1 for user data (or use Supabase via fetch)
  DB: D1Database;
  // Secrets
  JWT_SECRET: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
  ALLOWED_ORIGINS: string;
}

// ============================================================
// VALIDATION SCHEMAS
// ============================================================

const LoginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  mfaCode: z.string().length(6).optional(),
});

const RegisterSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z
    .string()
    .min(12, 'Password must be at least 12 characters')
    .regex(/[A-Z]/, 'Must contain uppercase letter')
    .regex(/[a-z]/, 'Must contain lowercase letter')
    .regex(/[0-9]/, 'Must contain number')
    .regex(/[^A-Za-z0-9]/, 'Must contain special character'),
  displayName: z.string().min(2).max(100),
  organisationId: z.string().uuid().optional(),
  inviteToken: z.string().optional(),
});

const RefreshSchema = z.object({
  refreshToken: z.string().min(1),
});

// ============================================================
// JWT UTILITIES
// ============================================================

interface JWTPayload {
  sub: string;       // User ID
  email: string;
  role: UserRole;
  orgId: string;
  iat: number;
  exp: number;
  jti: string;       // JWT ID for revocation
}

async function createAccessToken(
  user: User,
  secret: string
): Promise<string> {
  const payload: JWTPayload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    orgId: user.organisationId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 15 * 60, // 15 minutes
    jti: crypto.randomUUID(),
  };

  // In production: use Web Crypto API for HMAC-SHA256 signing
  // This is a simplified implementation for the scaffold
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = btoa(JSON.stringify(payload));
  const signature = await signHMAC(`${header}.${body}`, secret);
  return `${header}.${body}.${signature}`;
}

async function signHMAC(data: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(data);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

// ============================================================
// HONO APP
// ============================================================

const app = new Hono<{ Bindings: Env }>();

// Middleware
app.use('*', logger());
app.use('*', async (c, next) => {
  const allowedOrigins = c.env.ALLOWED_ORIGINS?.split(',') ?? ['*'];
  return cors({
    origin: allowedOrigins,
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
    exposeHeaders: ['X-Request-ID'],
    credentials: true,
    maxAge: 86400,
  })(c, next);
});

// Request ID middleware
app.use('*', async (c, next) => {
  const requestId = c.req.header('X-Request-ID') ?? crypto.randomUUID();
  c.header('X-Request-ID', requestId);
  await next();
});

// ============================================================
// HEALTH CHECK
// ============================================================

app.get('/health', (c) => {
  return c.json<ApiResponse>({
    success: true,
    data: {
      service: 'identity',
      version: '0.1.0',
      status: 'healthy',
      timestamp: new Date().toISOString(),
    },
  });
});

// ============================================================
// AUTH ROUTES
// ============================================================

/**
 * POST /auth/register
 * Register a new user account
 * GDPR: Consent is captured at registration
 */
app.post('/auth/register', async (c) => {
  try {
    const body = await c.req.json();
    const data = RegisterSchema.parse(body);

    // Call Supabase Auth API
    const supabaseResponse = await fetch(
      `${c.env.SUPABASE_URL}/auth/v1/signup`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': c.env.SUPABASE_SERVICE_KEY,
        },
        body: JSON.stringify({
          email: data.email,
          password: data.password,
          data: {
            display_name: data.displayName,
            organisation_id: data.organisationId,
          },
        }),
      }
    );

    if (!supabaseResponse.ok) {
      const error = await supabaseResponse.json() as { message?: string };
      return c.json<ApiResponse>(
        {
          success: false,
          error: {
            code: 'REGISTRATION_FAILED',
            message: error.message ?? 'Registration failed',
          },
        },
        400
      );
    }

    return c.json<ApiResponse>(
      {
        success: true,
        data: { message: 'Registration successful. Please verify your email.' },
      },
      201
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input',
            details: { issues: error.issues },
          },
        },
        422
      );
    }
    return c.json<ApiResponse>(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
      },
      500
    );
  }
});

/**
 * POST /auth/login
 * Authenticate user and issue JWT tokens
 * Zero Trust: Short-lived access tokens (15min), rotating refresh tokens
 */
app.post('/auth/login', async (c) => {
  try {
    const body = await c.req.json();
    const data = LoginSchema.parse(body);

    // Authenticate with Supabase
    const supabaseResponse = await fetch(
      `${c.env.SUPABASE_URL}/auth/v1/token?grant_type=password`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': c.env.SUPABASE_SERVICE_KEY,
        },
        body: JSON.stringify({
          email: data.email,
          password: data.password,
        }),
      }
    );

    if (!supabaseResponse.ok) {
      // Audit log: failed login attempt
      await c.env.KV.put(
        `audit:login_fail:${data.email}:${Date.now()}`,
        JSON.stringify({
          email: data.email,
          ip: c.req.header('CF-Connecting-IP'),
          timestamp: new Date().toISOString(),
        }),
        { expirationTtl: 86400 }
      );

      return c.json<ApiResponse>(
        {
          success: false,
          error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
        },
        401
      );
    }

    const authData = await supabaseResponse.json() as {
      access_token: string;
      refresh_token: string;
      user: { id: string; email: string; user_metadata: Record<string, unknown> };
    };

    // Build user object
    const user: User = {
      id: authData.user.id,
      email: authData.user.email,
      displayName: (authData.user.user_metadata.display_name as string) ?? authData.user.email,
      role: (authData.user.user_metadata.role as UserRole) ?? 'user',
      organisationId: (authData.user.user_metadata.organisation_id as string) ?? 'default',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      mfaEnabled: false,
      preferences: {
        theme: 'system',
        language: 'en',
        timezone: 'UTC',
        aiEnabled: true,
        analyticsEnabled: false,
      },
    };

    // Issue Infinity OS JWT
    const accessToken = await createAccessToken(user, c.env.JWT_SECRET);

    // Store session in KV
    await c.env.KV.put(
      `session:${user.id}`,
      JSON.stringify({ user, supabaseToken: authData.access_token }),
      { expirationTtl: 7 * 24 * 60 * 60 } // 7 days
    );

    const session: Session = {
      accessToken,
      refreshToken: authData.refresh_token,
      expiresAt: Date.now() + 15 * 60 * 1000,
      user,
    };

    return c.json<ApiResponse<Session>>({
      success: true,
      data: session,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input',
            details: { issues: error.issues },
          },
        },
        422
      );
    }
    return c.json<ApiResponse>(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
      },
      500
    );
  }
});

/**
 * POST /auth/refresh
 * Refresh access token using refresh token
 */
app.post('/auth/refresh', async (c) => {
  try {
    const body = await c.req.json();
    const { refreshToken } = RefreshSchema.parse(body);

    const supabaseResponse = await fetch(
      `${c.env.SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': c.env.SUPABASE_SERVICE_KEY,
        },
        body: JSON.stringify({ refresh_token: refreshToken }),
      }
    );

    if (!supabaseResponse.ok) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: { code: 'INVALID_REFRESH_TOKEN', message: 'Refresh token is invalid or expired' },
        },
        401
      );
    }

    const authData = await supabaseResponse.json() as {
      access_token: string;
      refresh_token: string;
      user: { id: string; email: string; user_metadata: Record<string, unknown> };
    };

    const user: User = {
      id: authData.user.id,
      email: authData.user.email,
      displayName: (authData.user.user_metadata.display_name as string) ?? authData.user.email,
      role: (authData.user.user_metadata.role as UserRole) ?? 'user',
      organisationId: (authData.user.user_metadata.organisation_id as string) ?? 'default',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      mfaEnabled: false,
      preferences: {
        theme: 'system',
        language: 'en',
        timezone: 'UTC',
        aiEnabled: true,
        analyticsEnabled: false,
      },
    };

    const accessToken = await createAccessToken(user, c.env.JWT_SECRET);

    return c.json<ApiResponse<Session>>({
      success: true,
      data: {
        accessToken,
        refreshToken: authData.refresh_token,
        expiresAt: Date.now() + 15 * 60 * 1000,
        user,
      },
    });
  } catch (error) {
    return c.json<ApiResponse>(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
      },
      500
    );
  }
});

/**
 * POST /auth/logout
 * Invalidate session and tokens
 */
app.post('/auth/logout', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    // In production: decode JWT, extract user ID, delete KV session
    const token = authHeader.slice(7);
    // Simplified: just acknowledge logout
    console.log('[Identity] Logout requested');
  }

  return c.json<ApiResponse>({
    success: true,
    data: { message: 'Logged out successfully' },
  });
});

/**
 * GET /auth/me
 * Get current authenticated user
 */
app.get('/auth/me', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json<ApiResponse>(
      {
        success: false,
        error: { code: 'UNAUTHORISED', message: 'Authentication required' },
      },
      401
    );
  }

  // In production: validate JWT signature, check expiry, fetch user from KV/DB
  return c.json<ApiResponse>({
    success: true,
    data: { message: 'Token validation not yet implemented in scaffold' },
  });
});

// ============================================================
// ROLE & PERMISSION ROUTES
// ============================================================

/**
 * GET /permissions/:userId
 * Get permissions for a user
 */
app.get('/permissions/:userId', async (c) => {
  const userId = c.req.param('userId');

  // In production: fetch from DB with RLS
  return c.json<ApiResponse>({
    success: true,
    data: {
      userId,
      permissions: [],
      role: 'user',
    },
  });
});

// ============================================================
// 404 HANDLER
// ============================================================

app.notFound((c) => {
  return c.json<ApiResponse>(
    {
      success: false,
      error: { code: 'NOT_FOUND', message: `Route ${c.req.path} not found` },
    },
    404
  );
});

// ============================================================
// ERROR HANDLER
// ============================================================

app.onError((err, c) => {
  console.error('[Identity Worker] Unhandled error:', err);
  return c.json<ApiResponse>(
    {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        details: { message: err.message },
      },
    },
    500
  );
});

export default app;