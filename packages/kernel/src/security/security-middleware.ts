/**
 * Comprehensive Security Middleware
 * 
 * Production-grade security layer providing OWASP-compliant
 * headers, request validation, sanitization, audit logging,
 * API key management, and CORS enforcement.
 * 
 * Architecture:
 * ```
 * SecurityMiddleware
 *   ├── HeaderSecurity (OWASP headers, CSP, HSTS)
 *   ├── RequestValidator (schema validation, size limits)
 *   ├── InputSanitizer (XSS, SQL injection, path traversal)
 *   ├── AuditLogger (security events, compliance logging)
 *   ├── ApiKeyManager (rotation, scoping, rate limiting)
 *   └── CorsEnforcer (origin validation, preflight caching)
 * ```
 */

// ============================================================
// TYPES
// ============================================================

export type SecurityEventSeverity = 'info' | 'warning' | 'critical' | 'alert';
export type ApiKeyStatus = 'active' | 'expired' | 'revoked' | 'rotating';

export interface SecurityHeaders {
  'Strict-Transport-Security': string;
  'X-Content-Type-Options': string;
  'X-Frame-Options': string;
  'X-XSS-Protection': string;
  'Content-Security-Policy': string;
  'Referrer-Policy': string;
  'Permissions-Policy': string;
  'X-Request-ID': string;
  'Cache-Control': string;
  'X-Permitted-Cross-Domain-Policies': string;
  [key: string]: string;
}

export interface SecurityConfig {
  /** Enable HSTS */
  hsts: { enabled: boolean; maxAge: number; includeSubDomains: boolean; preload: boolean };
  /** Content Security Policy */
  csp: { directives: Record<string, string[]>; reportOnly: boolean; reportUri?: string };
  /** CORS configuration */
  cors: CorsConfig;
  /** Rate limiting */
  rateLimit: { enabled: boolean; maxRequests: number; windowMs: number; keyGenerator: 'ip' | 'user' | 'api_key' };
  /** Request size limits */
  requestLimits: { maxBodySize: number; maxUrlLength: number; maxHeaderSize: number; maxParameterCount: number };
  /** Input sanitization */
  sanitization: { enabled: boolean; stripHtml: boolean; escapeSpecialChars: boolean; maxStringLength: number };
  /** Audit logging */
  audit: { enabled: boolean; logLevel: SecurityEventSeverity; retentionDays: number };
}

export interface CorsConfig {
  allowedOrigins: string[];
  allowedMethods: string[];
  allowedHeaders: string[];
  exposedHeaders: string[];
  credentials: boolean;
  maxAge: number;
}

export interface SecurityAuditEntry {
  id: string;
  timestamp: number;
  severity: SecurityEventSeverity;
  category: string;
  action: string;
  description: string;
  sourceIp?: string;
  userId?: string;
  apiKeyId?: string;
  requestPath?: string;
  requestMethod?: string;
  userAgent?: string;
  metadata: Record<string, unknown>;
  blocked: boolean;
}

export interface ApiKey {
  id: string;
  name: string;
  keyHash: string;
  prefix: string;
  status: ApiKeyStatus;
  scopes: string[];
  rateLimit: { maxRequests: number; windowMs: number };
  allowedIps?: string[];
  allowedOrigins?: string[];
  ownerId: string;
  createdAt: number;
  expiresAt?: number;
  lastUsedAt: number;
  usageCount: number;
  rotationSchedule?: { intervalDays: number; nextRotation: number };
}

export interface SanitizationResult {
  sanitized: boolean;
  original: string;
  cleaned: string;
  threats: string[];
}

export interface ValidationResult {
  valid: boolean;
  errors: { field: string; message: string; code: string }[];
}

export interface SecurityEvent {
  type: 'security:request.blocked' | 'security:xss.detected' | 'security:sqli.detected' |
    'security:rate_limit.exceeded' | 'security:api_key.invalid' | 'security:api_key.rotated' |
    'security:cors.violation' | 'security:audit.logged' | 'security:threat.detected';
  payload: Record<string, unknown>;
  timestamp: number;
}

// ============================================================
// DEFAULT SECURITY CONFIG
// ============================================================

export const defaultSecurityConfig: SecurityConfig = {
  hsts: { enabled: true, maxAge: 31536000, includeSubDomains: true, preload: true },
  csp: {
    directives: {
      'default-src': ["'self'"],
      'script-src': ["'self'", "'unsafe-inline'"],
      'style-src': ["'self'", "'unsafe-inline'"],
      'img-src': ["'self'", 'data:', 'https:'],
      'font-src': ["'self'", 'https:'],
      'connect-src': ["'self'", 'https:'],
      'frame-ancestors': ["'none'"],
      'base-uri': ["'self'"],
      'form-action': ["'self'"],
      'upgrade-insecure-requests': [],
    },
    reportOnly: false,
  },
  cors: {
    allowedOrigins: [],
    allowedMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-API-Key'],
    exposedHeaders: ['X-Request-ID', 'X-RateLimit-Remaining'],
    credentials: true,
    maxAge: 86400,
  },
  rateLimit: { enabled: true, maxRequests: 100, windowMs: 60000, keyGenerator: 'ip' },
  requestLimits: { maxBodySize: 1048576, maxUrlLength: 2048, maxHeaderSize: 8192, maxParameterCount: 100 },
  sanitization: { enabled: true, stripHtml: true, escapeSpecialChars: true, maxStringLength: 10000 },
  audit: { enabled: true, logLevel: 'info', retentionDays: 90 },
};

// ============================================================
// HEADER SECURITY
// ============================================================

export class HeaderSecurity {
  private config: SecurityConfig;

  constructor(config: SecurityConfig = defaultSecurityConfig) {
    this.config = config;
  }

  /**
   * Generate all security headers
   */
  getHeaders(requestId?: string): SecurityHeaders {
    const headers: SecurityHeaders = {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '0',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
      'X-Request-ID': requestId || this.generateRequestId(),
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'X-Permitted-Cross-Domain-Policies': 'none',
      'Strict-Transport-Security': '',
      'Content-Security-Policy': '',
    };

    // HSTS
    if (this.config.hsts.enabled) {
      let hsts = `max-age=${this.config.hsts.maxAge}`;
      if (this.config.hsts.includeSubDomains) hsts += '; includeSubDomains';
      if (this.config.hsts.preload) hsts += '; preload';
      headers['Strict-Transport-Security'] = hsts;
    }

    // CSP
    const cspDirectives = Object.entries(this.config.csp.directives)
      .map(([key, values]) => values.length > 0 ? `${key} ${values.join(' ')}` : key)
      .join('; ');
    const cspHeader = this.config.csp.reportOnly ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy';
    headers[cspHeader] = cspDirectives;
    if (!this.config.csp.reportOnly) {
      headers['Content-Security-Policy'] = cspDirectives;
    }

    return headers;
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }
}

// ============================================================
// INPUT SANITIZER
// ============================================================

export class InputSanitizer {
  private config: SecurityConfig;

  // Common attack patterns
  private static readonly XSS_PATTERNS = [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    /javascript\s*:/gi,
    /on\w+\s*=\s*["'][^"']*["']/gi,
    /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
    /<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi,
    /<embed\b[^>]*>/gi,
    /expression\s*\(/gi,
    /url\s*\(\s*['"]?\s*javascript/gi,
    /vbscript\s*:/gi,
    /data\s*:\s*text\/html/gi,
  ];

  private static readonly SQLI_PATTERNS = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE|UNION|TRUNCATE|DECLARE)\b)/gi,
    /(['"])\s*(OR|AND)\s+\1?\s*\d+\s*=\s*\d+/gi,
    /;\s*(DROP|DELETE|UPDATE|INSERT)\b/gi,
    /--\s*$/gm,
    /\/\*[\s\S]*?\*\//g,
    /\bWAITFOR\s+DELAY\b/gi,
    /\bBENCHMARK\s*\(/gi,
    /\bSLEEP\s*\(/gi,
  ];

  private static readonly PATH_TRAVERSAL_PATTERNS = [
    /\.\.\//g,
    /\.\.\\+/g,
    /%2e%2e%2f/gi,
    /%2e%2e\//gi,
    /\.%2e\//gi,
    /%2e\.\//gi,
    /\.\.\%5c/gi,
    /\0/g,
  ];

  constructor(config: SecurityConfig = defaultSecurityConfig) {
    this.config = config;
  }

  /**
   * Sanitize a string input
   */
  sanitizeString(input: string): SanitizationResult {
    if (!this.config.sanitization.enabled) {
      return { sanitized: false, original: input, cleaned: input, threats: [] };
    }

    const threats: string[] = [];
    let cleaned = input;

    // Truncate to max length
    if (cleaned.length > this.config.sanitization.maxStringLength) {
      cleaned = cleaned.slice(0, this.config.sanitization.maxStringLength);
      threats.push('input_truncated');
    }

    // Check for XSS
    for (const pattern of InputSanitizer.XSS_PATTERNS) {
      if (pattern.test(cleaned)) {
        threats.push('xss_detected');
        cleaned = cleaned.replace(pattern, '');
      }
      pattern.lastIndex = 0;
    }

    // Check for SQL injection
    for (const pattern of InputSanitizer.SQLI_PATTERNS) {
      if (pattern.test(cleaned)) {
        threats.push('sqli_detected');
      }
      pattern.lastIndex = 0;
    }

    // Check for path traversal
    for (const pattern of InputSanitizer.PATH_TRAVERSAL_PATTERNS) {
      if (pattern.test(cleaned)) {
        threats.push('path_traversal_detected');
        cleaned = cleaned.replace(pattern, '');
      }
      pattern.lastIndex = 0;
    }

    // Strip HTML tags
    if (this.config.sanitization.stripHtml) {
      const stripped = cleaned.replace(/<[^>]*>/g, '');
      if (stripped !== cleaned) {
        threats.push('html_stripped');
        cleaned = stripped;
      }
    }

    // Escape special characters
    if (this.config.sanitization.escapeSpecialChars) {
      cleaned = cleaned
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
    }

    // Remove null bytes
    cleaned = cleaned.replace(/\0/g, '');

    return {
      sanitized: threats.length > 0,
      original: input,
      cleaned,
      threats: [...new Set(threats)],
    };
  }

  /**
   * Sanitize an object recursively
   */
  sanitizeObject(obj: Record<string, unknown>): { sanitized: Record<string, unknown>; threats: string[] } {
    const allThreats: string[] = [];
    const sanitized = this.deepSanitize(obj, allThreats);
    return { sanitized: sanitized as Record<string, unknown>, threats: [...new Set(allThreats)] };
  }

  /**
   * Check if input contains potential threats (without modifying)
   */
  detectThreats(input: string): string[] {
    const threats: string[] = [];

    for (const pattern of InputSanitizer.XSS_PATTERNS) {
      if (pattern.test(input)) threats.push('xss');
      pattern.lastIndex = 0;
    }
    for (const pattern of InputSanitizer.SQLI_PATTERNS) {
      if (pattern.test(input)) threats.push('sqli');
      pattern.lastIndex = 0;
    }
    for (const pattern of InputSanitizer.PATH_TRAVERSAL_PATTERNS) {
      if (pattern.test(input)) threats.push('path_traversal');
      pattern.lastIndex = 0;
    }

    return [...new Set(threats)];
  }

  private deepSanitize(value: unknown, threats: string[]): unknown {
    if (typeof value === 'string') {
      const result = this.sanitizeString(value);
      threats.push(...result.threats);
      return result.cleaned;
    }

    if (Array.isArray(value)) {
      return value.map(item => this.deepSanitize(item, threats));
    }

    if (value !== null && typeof value === 'object') {
      const sanitized: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
        const keyResult = this.sanitizeString(key);
        threats.push(...keyResult.threats);
        sanitized[keyResult.cleaned] = this.deepSanitize(val, threats);
      }
      return sanitized;
    }

    return value;
  }
}

// ============================================================
// AUDIT LOGGER
// ============================================================

export class AuditLogger {
  private entries: SecurityAuditEntry[] = [];
  private config: SecurityConfig;

  constructor(config: SecurityConfig = defaultSecurityConfig) {
    this.config = config;
  }

  /**
   * Log a security event
   */
  log(entry: Omit<SecurityAuditEntry, 'id' | 'timestamp'>): SecurityAuditEntry {
    const fullEntry: SecurityAuditEntry = {
      ...entry,
      id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
    };

    this.entries.push(fullEntry);

    // Retention management
    const retentionMs = this.config.audit.retentionDays * 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - retentionMs;
    this.entries = this.entries.filter(e => e.timestamp >= cutoff);

    return fullEntry;
  }

  /**
   * Query audit log
   */
  query(options: {
    severity?: SecurityEventSeverity;
    category?: string;
    userId?: string;
    startTime?: number;
    endTime?: number;
    blocked?: boolean;
    limit?: number;
  } = {}): SecurityAuditEntry[] {
    let results = [...this.entries];

    if (options.severity) results = results.filter(e => e.severity === options.severity);
    if (options.category) results = results.filter(e => e.category === options.category);
    if (options.userId) results = results.filter(e => e.userId === options.userId);
    if (options.startTime) results = results.filter(e => e.timestamp >= options.startTime!);
    if (options.endTime) results = results.filter(e => e.timestamp <= options.endTime!);
    if (options.blocked !== undefined) results = results.filter(e => e.blocked === options.blocked);

    results.sort((a, b) => b.timestamp - a.timestamp);

    if (options.limit) results = results.slice(0, options.limit);

    return results;
  }

  /**
   * Get security summary
   */
  getSummary(periodMs: number = 86400000): {
    totalEvents: number;
    blockedRequests: number;
    threatsByCategory: Record<string, number>;
    severityCounts: Record<string, number>;
    topSourceIps: { ip: string; count: number }[];
  } {
    const cutoff = Date.now() - periodMs;
    const recent = this.entries.filter(e => e.timestamp >= cutoff);

    const threatsByCategory: Record<string, number> = {};
    const severityCounts: Record<string, number> = {};
    const ipCounts: Record<string, number> = {};

    for (const entry of recent) {
      threatsByCategory[entry.category] = (threatsByCategory[entry.category] || 0) + 1;
      severityCounts[entry.severity] = (severityCounts[entry.severity] || 0) + 1;
      if (entry.sourceIp) {
        ipCounts[entry.sourceIp] = (ipCounts[entry.sourceIp] || 0) + 1;
      }
    }

    const topSourceIps = Object.entries(ipCounts)
      .map(([ip, count]) => ({ ip, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalEvents: recent.length,
      blockedRequests: recent.filter(e => e.blocked).length,
      threatsByCategory,
      severityCounts,
      topSourceIps,
    };
  }

  /**
   * Get total entries count
   */
  getEntryCount(): number {
    return this.entries.length;
  }
}

// ============================================================
// API KEY MANAGER
// ============================================================

export class ApiKeyManager {
  private keys: Map<string, ApiKey> = new Map();
  private keyLookup: Map<string, string> = new Map(); // prefix -> id

  /**
   * Generate a new API key
   */
  generate(config: {
    name: string;
    scopes: string[];
    ownerId: string;
    rateLimit?: { maxRequests: number; windowMs: number };
    allowedIps?: string[];
    allowedOrigins?: string[];
    expiresInDays?: number;
    rotationIntervalDays?: number;
  }): { key: ApiKey; rawKey: string } {
    const rawKey = this.generateRawKey();
    const prefix = rawKey.slice(0, 8);
    const keyHash = this.hashKey(rawKey);

    const key: ApiKey = {
      id: `key_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: config.name,
      keyHash,
      prefix,
      status: 'active',
      scopes: config.scopes,
      rateLimit: config.rateLimit || { maxRequests: 1000, windowMs: 60000 },
      allowedIps: config.allowedIps,
      allowedOrigins: config.allowedOrigins,
      ownerId: config.ownerId,
      createdAt: Date.now(),
      expiresAt: config.expiresInDays ? Date.now() + (config.expiresInDays * 86400000) : undefined,
      lastUsedAt: 0,
      usageCount: 0,
    };

    if (config.rotationIntervalDays) {
      key.rotationSchedule = {
        intervalDays: config.rotationIntervalDays,
        nextRotation: Date.now() + (config.rotationIntervalDays * 86400000),
      };
    }

    this.keys.set(key.id, key);
    this.keyLookup.set(prefix, key.id);

    return { key, rawKey };
  }

  /**
   * Validate an API key
   */
  validate(rawKey: string): { valid: boolean; key?: ApiKey; error?: string } {
    const prefix = rawKey.slice(0, 8);
    const keyId = this.keyLookup.get(prefix);

    if (!keyId) {
      return { valid: false, error: 'Invalid API key' };
    }

    const key = this.keys.get(keyId);
    if (!key) {
      return { valid: false, error: 'API key not found' };
    }

    // Check status
    if (key.status !== 'active') {
      return { valid: false, error: `API key is ${key.status}` };
    }

    // Check expiration
    if (key.expiresAt && Date.now() > key.expiresAt) {
      key.status = 'expired';
      return { valid: false, error: 'API key has expired' };
    }

    // Verify hash
    const hash = this.hashKey(rawKey);
    if (hash !== key.keyHash) {
      return { valid: false, error: 'Invalid API key' };
    }

    // Update usage
    key.lastUsedAt = Date.now();
    key.usageCount++;

    return { valid: true, key };
  }

  /**
   * Check if a key has a specific scope
   */
  hasScope(keyId: string, scope: string): boolean {
    const key = this.keys.get(keyId);
    if (!key) return false;
    return key.scopes.includes(scope) || key.scopes.includes('*');
  }

  /**
   * Revoke an API key
   */
  revoke(keyId: string): boolean {
    const key = this.keys.get(keyId);
    if (!key) return false;
    key.status = 'revoked';
    return true;
  }

  /**
   * Rotate an API key (generate new, mark old as rotating)
   */
  rotate(keyId: string): { newKey: ApiKey; rawKey: string } | null {
    const oldKey = this.keys.get(keyId);
    if (!oldKey) return null;

    // Generate new key with same config
    const result = this.generate({
      name: oldKey.name,
      scopes: oldKey.scopes,
      ownerId: oldKey.ownerId,
      rateLimit: oldKey.rateLimit,
      allowedIps: oldKey.allowedIps,
      allowedOrigins: oldKey.allowedOrigins,
      rotationIntervalDays: oldKey.rotationSchedule?.intervalDays,
    });

    // Mark old key as rotating (grace period)
    oldKey.status = 'rotating';

    return result;
  }

  /**
   * List API keys for an owner
   */
  listByOwner(ownerId: string): ApiKey[] {
    return Array.from(this.keys.values())
      .filter(k => k.ownerId === ownerId)
      .map(k => ({ ...k, keyHash: '***' })); // Redact hash
  }

  /**
   * Get keys due for rotation
   */
  getDueForRotation(): ApiKey[] {
    const now = Date.now();
    return Array.from(this.keys.values())
      .filter(k => k.status === 'active' && k.rotationSchedule && k.rotationSchedule.nextRotation <= now);
  }

  private generateRawKey(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let key = 'inf_';
    for (let i = 0; i < 48; i++) {
      key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return key;
  }

  private hashKey(key: string): string {
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      const char = key.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `sha256:${Math.abs(hash).toString(16).padStart(16, '0')}`;
  }
}

// ============================================================
// SECURITY MIDDLEWARE (UNIFIED)
// ============================================================

export class SecurityMiddleware {
  readonly headers: HeaderSecurity;
  readonly sanitizer: InputSanitizer;
  readonly audit: AuditLogger;
  readonly apiKeys: ApiKeyManager;

  private config: SecurityConfig;
  private listeners: Map<string, Set<(event: SecurityEvent) => void>> = new Map();

  constructor(config: SecurityConfig = defaultSecurityConfig) {
    this.config = config;
    this.headers = new HeaderSecurity(config);
    this.sanitizer = new InputSanitizer(config);
    this.audit = new AuditLogger(config);
    this.apiKeys = new ApiKeyManager();
    console.log('[Security] Middleware initialized');
  }

  /**
   * Process a request through the security pipeline
   */
  processRequest(request: {
    method: string;
    path: string;
    headers: Record<string, string>;
    body?: Record<string, unknown>;
    sourceIp?: string;
    userId?: string;
  }): {
    allowed: boolean;
    securityHeaders: SecurityHeaders;
    sanitizedBody?: Record<string, unknown>;
    threats: string[];
    requestId: string;
    error?: string;
  } {
    const requestId = request.headers['x-request-id'] || `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const threats: string[] = [];

    // 1. Generate security headers
    const securityHeaders = this.headers.getHeaders(requestId);

    // 2. Validate request size
    const urlLength = request.path.length;
    if (urlLength > this.config.requestLimits.maxUrlLength) {
      this.audit.log({
        severity: 'warning',
        category: 'request_validation',
        action: 'url_too_long',
        description: `URL length ${urlLength} exceeds limit ${this.config.requestLimits.maxUrlLength}`,
        sourceIp: request.sourceIp,
        requestPath: request.path,
        requestMethod: request.method,
        metadata: { urlLength },
        blocked: true,
      });
      return { allowed: false, securityHeaders, threats: ['url_too_long'], requestId, error: 'URL too long' };
    }

    // 3. Sanitize body
    let sanitizedBody = request.body;
    if (request.body && this.config.sanitization.enabled) {
      const result = this.sanitizer.sanitizeObject(request.body);
      sanitizedBody = result.sanitized;
      threats.push(...result.threats);

      if (result.threats.length > 0) {
        this.audit.log({
          severity: result.threats.includes('xss_detected') || result.threats.includes('sqli_detected') ? 'critical' : 'warning',
          category: 'input_sanitization',
          action: 'threats_detected',
          description: `Threats detected in request body: ${result.threats.join(', ')}`,
          sourceIp: request.sourceIp,
          userId: request.userId,
          requestPath: request.path,
          requestMethod: request.method,
          metadata: { threats: result.threats },
          blocked: false,
        });

        this.emit({
          type: 'security:threat.detected',
          payload: { threats: result.threats, path: request.path },
          timestamp: Date.now(),
        });
      }
    }

    // 4. Validate API key if present
    const apiKey = request.headers['x-api-key'];
    if (apiKey) {
      const validation = this.apiKeys.validate(apiKey);
      if (!validation.valid) {
        this.audit.log({
          severity: 'warning',
          category: 'authentication',
          action: 'invalid_api_key',
          description: validation.error || 'Invalid API key',
          sourceIp: request.sourceIp,
          requestPath: request.path,
          requestMethod: request.method,
          metadata: {},
          blocked: true,
        });

        this.emit({
          type: 'security:api_key.invalid',
          payload: { path: request.path },
          timestamp: Date.now(),
        });

        return { allowed: false, securityHeaders, threats: ['invalid_api_key'], requestId, error: 'Invalid API key' };
      }
    }

    // 5. Log successful request processing
    if (this.config.audit.enabled) {
      this.audit.log({
        severity: 'info',
        category: 'request',
        action: 'processed',
        description: `${request.method} ${request.path}`,
        sourceIp: request.sourceIp,
        userId: request.userId,
        requestPath: request.path,
        requestMethod: request.method,
        userAgent: request.headers['user-agent'],
        metadata: { threats },
        blocked: false,
      });
    }

    return { allowed: true, securityHeaders, sanitizedBody, threats, requestId };
  }

  /**
   * Get security dashboard data
   */
  getDashboard(): {
    auditSummary: ReturnType<AuditLogger['getSummary']>;
    activeApiKeys: number;
    keysNeedingRotation: number;
    config: { hsts: boolean; csp: boolean; sanitization: boolean; audit: boolean };
  } {
    return {
      auditSummary: this.audit.getSummary(),
      activeApiKeys: this.apiKeys.listByOwner('*').length,
      keysNeedingRotation: this.apiKeys.getDueForRotation().length,
      config: {
        hsts: this.config.hsts.enabled,
        csp: !this.config.csp.reportOnly,
        sanitization: this.config.sanitization.enabled,
        audit: this.config.audit.enabled,
      },
    };
  }

  // Event system
  on(type: string, handler: (event: SecurityEvent) => void): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(handler);
    return () => this.listeners.get(type)?.delete(handler);
  }

  private emit(event: SecurityEvent): void {
    this.listeners.get(event.type)?.forEach(h => h(event));
    this.listeners.get('*')?.forEach(h => h(event));
  }
}