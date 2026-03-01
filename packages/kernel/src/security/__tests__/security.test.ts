/**
 * Security Module Tests
 */

import { SecurityMiddleware, HeaderSecurity, InputSanitizer, AuditLogger, ApiKeyManager, defaultSecurityConfig } from '../security-middleware';

describe('HeaderSecurity', () => {
  const headers = new HeaderSecurity();

  it('should generate all OWASP security headers', () => {
    const result = headers.getHeaders('test-req-id');
    expect(result['X-Content-Type-Options']).toBe('nosniff');
    expect(result['X-Frame-Options']).toBe('DENY');
    expect(result['X-XSS-Protection']).toBe('0');
    expect(result['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(result['X-Request-ID']).toBe('test-req-id');
    expect(result['Cache-Control']).toContain('no-store');
  });

  it('should generate HSTS header', () => {
    const result = headers.getHeaders();
    expect(result['Strict-Transport-Security']).toContain('max-age=');
    expect(result['Strict-Transport-Security']).toContain('includeSubDomains');
    expect(result['Strict-Transport-Security']).toContain('preload');
  });

  it('should generate CSP header', () => {
    const result = headers.getHeaders();
    expect(result['Content-Security-Policy']).toContain("default-src 'self'");
    expect(result['Content-Security-Policy']).toContain("frame-ancestors 'none'");
  });

  it('should auto-generate request ID if not provided', () => {
    const result = headers.getHeaders();
    expect(result['X-Request-ID']).toMatch(/^req_/);
  });
});

describe('InputSanitizer', () => {
  const sanitizer = new InputSanitizer();

  it('should detect and remove XSS payloads', () => {
    const result = sanitizer.sanitizeString('<script>alert("xss")</script>Hello');
    expect(result.sanitized).toBe(true);
    expect(result.threats).toContain('xss_detected');
    expect(result.cleaned).not.toContain('<script>');
  });

  it('should detect javascript: protocol', () => {
    const result = sanitizer.sanitizeString('javascript:alert(1)');
    expect(result.threats).toContain('xss_detected');
  });

  it('should detect SQL injection patterns', () => {
    const result = sanitizer.sanitizeString("'; DROP TABLE users; --");
    expect(result.threats).toContain('sqli_detected');
  });

  it('should detect path traversal', () => {
    const result = sanitizer.sanitizeString('../../etc/passwd');
    expect(result.threats).toContain('path_traversal_detected');
    expect(result.cleaned).not.toContain('../');
  });

  it('should strip HTML tags', () => {
    const result = sanitizer.sanitizeString('<b>bold</b> and <i>italic</i>');
    expect(result.threats).toContain('html_stripped');
  });

  it('should truncate long inputs', () => {
    const longInput = 'a'.repeat(20000);
    const result = sanitizer.sanitizeString(longInput);
    expect(result.cleaned.length).toBeLessThanOrEqual(defaultSecurityConfig.sanitization.maxStringLength + 100); // Allow for escaping
  });

  it('should sanitize objects recursively', () => {
    const result = sanitizer.sanitizeObject({
      name: '<script>alert("xss")</script>Test',
      nested: { value: '../../etc/passwd' },
    });
    expect(result.threats.length).toBeGreaterThan(0);
  });

  it('should detect threats without modifying', () => {
    const threats = sanitizer.detectThreats('<script>alert(1)</script>');
    expect(threats).toContain('xss');
  });

  it('should return clean result for safe input', () => {
    const result = sanitizer.sanitizeString('Hello, World!');
    expect(result.threats.filter(t => t !== 'html_stripped')).toHaveLength(0);
  });
});

describe('AuditLogger', () => {
  let logger: AuditLogger;

  beforeEach(() => {
    logger = new AuditLogger();
  });

  it('should log security events', () => {
    const entry = logger.log({
      severity: 'warning',
      category: 'authentication',
      action: 'failed_login',
      description: 'Failed login attempt',
      sourceIp: '192.168.1.1',
      userId: 'user_1',
      metadata: {},
      blocked: false,
    });

    expect(entry.id).toBeDefined();
    expect(entry.timestamp).toBeGreaterThan(0);
  });

  it('should query by severity', () => {
    logger.log({ severity: 'info', category: 'auth', action: 'login', description: 'Login', metadata: {}, blocked: false });
    logger.log({ severity: 'critical', category: 'auth', action: 'breach', description: 'Breach', metadata: {}, blocked: true });

    const critical = logger.query({ severity: 'critical' });
    expect(critical).toHaveLength(1);
  });

  it('should query by blocked status', () => {
    logger.log({ severity: 'warning', category: 'rate_limit', action: 'exceeded', description: 'Rate limited', metadata: {}, blocked: true });
    logger.log({ severity: 'info', category: 'request', action: 'processed', description: 'OK', metadata: {}, blocked: false });

    const blocked = logger.query({ blocked: true });
    expect(blocked).toHaveLength(1);
  });

  it('should generate security summary', () => {
    logger.log({ severity: 'warning', category: 'xss', action: 'detected', description: 'XSS', sourceIp: '1.2.3.4', metadata: {}, blocked: true });
    logger.log({ severity: 'critical', category: 'sqli', action: 'detected', description: 'SQLi', sourceIp: '1.2.3.4', metadata: {}, blocked: true });

    const summary = logger.getSummary();
    expect(summary.totalEvents).toBe(2);
    expect(summary.blockedRequests).toBe(2);
    expect(summary.topSourceIps[0].ip).toBe('1.2.3.4');
  });
});

describe('ApiKeyManager', () => {
  let manager: ApiKeyManager;

  beforeEach(() => {
    manager = new ApiKeyManager();
  });

  it('should generate API keys', () => {
    const { key, rawKey } = manager.generate({
      name: 'Test Key',
      scopes: ['read', 'write'],
      ownerId: 'user_1',
    });

    expect(key.id).toBeDefined();
    expect(key.status).toBe('active');
    expect(rawKey).toMatch(/^inf_/);
    expect(rawKey.length).toBeGreaterThan(20);
  });

  it('should validate API keys', () => {
    const { rawKey } = manager.generate({
      name: 'Test Key',
      scopes: ['read'],
      ownerId: 'user_1',
    });

    const result = manager.validate(rawKey);
    expect(result.valid).toBe(true);
    expect(result.key).toBeDefined();
  });

  it('should reject invalid keys', () => {
    const result = manager.validate('invalid_key_12345678');
    expect(result.valid).toBe(false);
  });

  it('should revoke keys', () => {
    const { key, rawKey } = manager.generate({
      name: 'Test Key',
      scopes: ['read'],
      ownerId: 'user_1',
    });

    manager.revoke(key.id);
    const result = manager.validate(rawKey);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('revoked');
  });

  it('should rotate keys', () => {
    const { key } = manager.generate({
      name: 'Test Key',
      scopes: ['read', 'write'],
      ownerId: 'user_1',
    });

    const rotated = manager.rotate(key.id);
    expect(rotated).toBeDefined();
    expect(rotated!.newKey.id).not.toBe(key.id);
  });

  it('should check scopes', () => {
    const { key } = manager.generate({
      name: 'Test Key',
      scopes: ['read', 'write'],
      ownerId: 'user_1',
    });

    expect(manager.hasScope(key.id, 'read')).toBe(true);
    expect(manager.hasScope(key.id, 'admin')).toBe(false);
  });

  it('should support wildcard scope', () => {
    const { key } = manager.generate({
      name: 'Admin Key',
      scopes: ['*'],
      ownerId: 'admin_1',
    });

    expect(manager.hasScope(key.id, 'anything')).toBe(true);
  });

  it('should track usage', () => {
    const { key, rawKey } = manager.generate({
      name: 'Test Key',
      scopes: ['read'],
      ownerId: 'user_1',
    });

    manager.validate(rawKey);
    manager.validate(rawKey);
    manager.validate(rawKey);

    const keys = manager.listByOwner('user_1');
    expect(keys[0].usageCount).toBe(3);
  });
});

describe('SecurityMiddleware', () => {
  let middleware: SecurityMiddleware;

  beforeEach(() => {
    middleware = new SecurityMiddleware();
  });

  it('should process clean requests', () => {
    const result = middleware.processRequest({
      method: 'GET',
      path: '/api/users',
      headers: { 'content-type': 'application/json' },
      sourceIp: '127.0.0.1',
    });

    expect(result.allowed).toBe(true);
    expect(result.requestId).toBeDefined();
    expect(result.securityHeaders['X-Content-Type-Options']).toBe('nosniff');
  });

  it('should block requests with too-long URLs', () => {
    const result = middleware.processRequest({
      method: 'GET',
      path: '/api/' + 'a'.repeat(3000),
      headers: {},
    });

    expect(result.allowed).toBe(false);
    expect(result.threats).toContain('url_too_long');
  });

  it('should sanitize request bodies', () => {
    const result = middleware.processRequest({
      method: 'POST',
      path: '/api/data',
      headers: {},
      body: { name: '<script>alert("xss")</script>Test' },
    });

    expect(result.allowed).toBe(true);
    expect(result.threats.length).toBeGreaterThan(0);
  });

  it('should block invalid API keys', () => {
    const result = middleware.processRequest({
      method: 'GET',
      path: '/api/data',
      headers: { 'x-api-key': 'invalid_key_12345678' },
    });

    expect(result.allowed).toBe(false);
    expect(result.threats).toContain('invalid_api_key');
  });

  it('should accept valid API keys', () => {
    const { rawKey } = middleware.apiKeys.generate({
      name: 'Test',
      scopes: ['read'],
      ownerId: 'user_1',
    });

    const result = middleware.processRequest({
      method: 'GET',
      path: '/api/data',
      headers: { 'x-api-key': rawKey },
    });

    expect(result.allowed).toBe(true);
  });

  it('should provide security dashboard', () => {
    middleware.processRequest({ method: 'GET', path: '/api/test', headers: {} });

    const dashboard = middleware.getDashboard();
    expect(dashboard.config.hsts).toBe(true);
    expect(dashboard.config.sanitization).toBe(true);
    expect(dashboard.auditSummary).toBeDefined();
  });
});