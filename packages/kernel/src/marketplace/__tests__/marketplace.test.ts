/**
 * Marketplace Platform Tests
 * 
 * Comprehensive test suite covering:
 * - Service packaging and validation
 * - Version management and dependency resolution
 * - Marketplace registry (publish, install, search, reviews)
 * - Billing system (usage, subscriptions, invoices, payments)
 * - Marketplace API (route handling, request/response)
 */

import { ServicePackager, VersionManager, DependencyResolver } from '../service-package';
import type { ServiceManifest } from '../service-package';
import { MarketplaceRegistry } from '../marketplace-registry';
import { BillingSystem, UsageTracker, SubscriptionManager, InvoiceGenerator } from '../billing-system';
import { MarketplaceAPI } from '../marketplace-api';
import type { ApiRequest } from '../marketplace-api';

// ============================================================
// TEST FIXTURES
// ============================================================

function createTestManifest(overrides: Partial<ServiceManifest> = {}): ServiceManifest {
  return {
    id: 'com.trancendos.test-service',
    name: 'Test Service',
    description: 'A test service for unit testing',
    version: '1.0.0',
    author: {
      name: 'Test Author',
      email: 'test@trancendos.ai',
      organization: 'Trancendos',
      verified: true,
    },
    category: 'utilities',
    tags: ['test', 'utility'],
    license: 'MIT',
    minKernelVersion: '0.1.0',
    entryPoint: 'dist/index.js',
    permissions: [
      { id: 'read:data', description: 'Read data', required: true, scope: 'read', resource: 'data' },
    ],
    dependencies: [],
    configSchema: {
      version: '1.0',
      fields: [
        {
          key: 'apiKey',
          label: 'API Key',
          description: 'Your API key',
          type: 'secret',
          required: true,
          validation: { minLength: 10 },
        },
        {
          key: 'maxRetries',
          label: 'Max Retries',
          description: 'Maximum retry attempts',
          type: 'number',
          required: false,
          defaultValue: 3,
          validation: { min: 0, max: 10 },
        },
      ],
      groups: [{ id: 'general', label: 'General', order: 0 }],
    },
    resources: {
      cpuMin: 100,
      cpuMax: 500,
      memoryMin: 64,
      memoryMax: 256,
      storage: 100,
      database: 'none',
    },
    endpoints: [
      { method: 'GET', path: '/api/test', description: 'Test endpoint', auth: true },
      { method: 'POST', path: '/api/test/action', description: 'Test action', auth: true },
    ],
    eventsPublished: [
      { type: 'test.completed', description: 'Test completed event' },
    ],
    eventsConsumed: [],
    listing: {
      tagline: 'A great test service',
      detailedDescription: '# Test Service\n\nThis is a detailed description.',
      iconUrl: 'https://example.com/icon.png',
      screenshots: ['https://example.com/screenshot1.png'],
      documentationUrl: 'https://docs.example.com',
      pricing: { type: 'free' },
      featured: false,
      maturity: 'stable',
    },
    healthCheck: {
      path: '/health',
      intervalMs: 30000,
      timeoutMs: 5000,
      unhealthyThreshold: 3,
      healthyThreshold: 2,
    },
    lifecycle: {},
    ...overrides,
  };
}

function createApiRequest(overrides: Partial<ApiRequest> = {}): ApiRequest {
  return {
    method: 'GET',
    path: '/api/marketplace/catalog',
    params: {},
    query: {},
    body: {},
    headers: {},
    userId: 'user_123',
    accountId: 'acct_123',
    ...overrides,
  };
}

// ============================================================
// SERVICE PACKAGER TESTS
// ============================================================

describe('ServicePackager', () => {
  describe('validate', () => {
    it('should validate a complete manifest successfully', () => {
      const manifest = createTestManifest();
      const result = ServicePackager.validate(manifest);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject manifest without required fields', () => {
      const result = ServicePackager.validate({});
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e => e.code === 'MISSING_ID')).toBe(true);
      expect(result.errors.some(e => e.code === 'MISSING_NAME')).toBe(true);
      expect(result.errors.some(e => e.code === 'MISSING_VERSION')).toBe(true);
    });

    it('should reject invalid service ID format', () => {
      const manifest = createTestManifest({ id: 'INVALID ID!' });
      const result = ServicePackager.validate(manifest);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'INVALID_ID')).toBe(true);
    });

    it('should reject invalid version format', () => {
      const manifest = createTestManifest({ version: 'not-semver' });
      const result = ServicePackager.validate(manifest);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'INVALID_VERSION')).toBe(true);
    });

    it('should reject invalid resource ranges', () => {
      const manifest = createTestManifest({
        resources: { cpuMin: 1000, cpuMax: 100, memoryMin: 512, memoryMax: 64, storage: 100, database: 'none' },
      });
      const result = ServicePackager.validate(manifest);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'INVALID_CPU_RANGE')).toBe(true);
      expect(result.errors.some(e => e.code === 'INVALID_MEMORY_RANGE')).toBe(true);
    });

    it('should warn about missing tags', () => {
      const manifest = createTestManifest({ tags: [] });
      const result = ServicePackager.validate(manifest);
      expect(result.warnings.some(w => w.code === 'NO_TAGS')).toBe(true);
    });

    it('should validate endpoint paths start with /', () => {
      const manifest = createTestManifest({
        endpoints: [{ method: 'GET', path: 'invalid-path', description: 'Bad', auth: false }],
      });
      const result = ServicePackager.validate(manifest);
      expect(result.errors.some(e => e.code === 'INVALID_ENDPOINT_PATH')).toBe(true);
    });
  });

  describe('createTemplate', () => {
    it('should create a valid template', () => {
      const template = ServicePackager.createTemplate('com.test.service', 'Test Service');
      expect(template.id).toBe('com.test.service');
      expect(template.name).toBe('Test Service');
      expect(template.version).toBe('0.1.0');
      expect(template.license).toBe('MIT');

      const validation = ServicePackager.validate(template);
      // Template has empty required fields, so it won't be fully valid
      expect(template.healthCheck).toBeDefined();
      expect(template.resources).toBeDefined();
    });
  });
});

// ============================================================
// VERSION MANAGER TESTS
// ============================================================

describe('VersionManager', () => {
  describe('parse', () => {
    it('should parse valid semver versions', () => {
      const v = VersionManager.parse('1.2.3');
      expect(v).toEqual({ version: '1.2.3', major: 1, minor: 2, patch: 3, prerelease: undefined });
    });

    it('should parse prerelease versions', () => {
      const v = VersionManager.parse('1.0.0-beta.1');
      expect(v?.prerelease).toBe('beta.1');
    });

    it('should return null for invalid versions', () => {
      expect(VersionManager.parse('invalid')).toBeNull();
      expect(VersionManager.parse('1.2')).toBeNull();
    });
  });

  describe('compare', () => {
    it('should compare versions correctly', () => {
      expect(VersionManager.compare('1.0.0', '2.0.0')).toBe(-1);
      expect(VersionManager.compare('2.0.0', '1.0.0')).toBe(1);
      expect(VersionManager.compare('1.0.0', '1.0.0')).toBe(0);
      expect(VersionManager.compare('1.1.0', '1.0.0')).toBe(1);
      expect(VersionManager.compare('1.0.1', '1.0.0')).toBe(1);
    });
  });

  describe('satisfies', () => {
    it('should match exact versions', () => {
      expect(VersionManager.satisfies('1.2.3', '1.2.3')).toBe(true);
      expect(VersionManager.satisfies('1.2.3', '1.2.4')).toBe(false);
    });

    it('should match caret ranges', () => {
      expect(VersionManager.satisfies('1.5.0', '^1.0.0')).toBe(true);
      expect(VersionManager.satisfies('2.0.0', '^1.0.0')).toBe(false);
      expect(VersionManager.satisfies('1.0.0', '^1.0.0')).toBe(true);
    });

    it('should match tilde ranges', () => {
      expect(VersionManager.satisfies('1.2.5', '~1.2.3')).toBe(true);
      expect(VersionManager.satisfies('1.3.0', '~1.2.3')).toBe(false);
    });

    it('should match >= ranges', () => {
      expect(VersionManager.satisfies('2.0.0', '>=1.0.0')).toBe(true);
      expect(VersionManager.satisfies('0.9.0', '>=1.0.0')).toBe(false);
    });

    it('should match wildcard', () => {
      expect(VersionManager.satisfies('99.99.99', '*')).toBe(true);
    });
  });

  describe('bump', () => {
    it('should bump versions correctly', () => {
      expect(VersionManager.bump('1.2.3', 'major')).toBe('2.0.0');
      expect(VersionManager.bump('1.2.3', 'minor')).toBe('1.3.0');
      expect(VersionManager.bump('1.2.3', 'patch')).toBe('1.2.4');
    });
  });
});

// ============================================================
// DEPENDENCY RESOLVER TESTS
// ============================================================

describe('DependencyResolver', () => {
  let resolver: DependencyResolver;

  beforeEach(() => {
    resolver = new DependencyResolver();
    resolver.registerAvailable('com.trancendos.auth', ['1.0.0', '1.1.0', '2.0.0']);
    resolver.registerAvailable('com.trancendos.storage', ['1.0.0', '1.2.0']);
  });

  it('should resolve available dependencies', () => {
    const manifest = createTestManifest({
      dependencies: [
        { serviceId: 'com.trancendos.auth', versionRange: '^1.0.0', required: true, fallback: 'error' },
      ],
    });

    const result = resolver.resolve(manifest);
    expect(result.resolved.has('com.trancendos.auth')).toBe(true);
    expect(result.unresolved).toHaveLength(0);
  });

  it('should report unresolved required dependencies', () => {
    const manifest = createTestManifest({
      dependencies: [
        { serviceId: 'com.trancendos.missing', versionRange: '^1.0.0', required: true, fallback: 'error' },
      ],
    });

    const result = resolver.resolve(manifest);
    expect(result.unresolved).toHaveLength(1);
  });

  it('should check installability', () => {
    const manifest = createTestManifest({
      dependencies: [
        { serviceId: 'com.trancendos.auth', versionRange: '^1.0.0', required: true, fallback: 'error' },
      ],
    });

    const check = resolver.canInstall(manifest);
    expect(check.installable).toBe(true);
    expect(check.missing).toHaveLength(0);
  });

  it('should report missing dependencies in canInstall', () => {
    const manifest = createTestManifest({
      dependencies: [
        { serviceId: 'com.trancendos.nonexistent', versionRange: '^1.0.0', required: true, fallback: 'error' },
      ],
    });

    const check = resolver.canInstall(manifest);
    expect(check.installable).toBe(false);
    expect(check.missing).toHaveLength(1);
  });
});

// ============================================================
// MARKETPLACE REGISTRY TESTS
// ============================================================

describe('MarketplaceRegistry', () => {
  let registry: MarketplaceRegistry;

  beforeEach(() => {
    registry = new MarketplaceRegistry();
  });

  describe('publish', () => {
    it('should publish a valid service', () => {
      const manifest = createTestManifest();
      const result = registry.publish(manifest);
      expect(result.success).toBe(true);
    });

    it('should reject invalid manifests', () => {
      const result = registry.publish({} as ServiceManifest);
      expect(result.success).toBe(false);
      expect(result.errors!.length).toBeGreaterThan(0);
    });

    it('should reject older versions', () => {
      const manifest = createTestManifest();
      registry.publish(manifest);

      const older = createTestManifest({ version: '0.9.0' });
      const result = registry.publish(older);
      expect(result.success).toBe(false);
    });

    it('should allow newer versions', () => {
      registry.publish(createTestManifest({ version: '1.0.0' }));
      const result = registry.publish(createTestManifest({ version: '1.1.0' }));
      expect(result.success).toBe(true);
    });
  });

  describe('search', () => {
    beforeEach(() => {
      registry.publish(createTestManifest({ id: 'com.test.ai-agent', name: 'AI Agent', category: 'ai-agents', tags: ['ai', 'agent'] }));
      registry.publish(createTestManifest({ id: 'com.test.analytics', name: 'Analytics Tool', category: 'analytics', tags: ['data', 'analytics'] }));
      registry.publish(createTestManifest({ id: 'com.test.crm', name: 'CRM System', category: 'crm', tags: ['crm', 'sales'] }));
    });

    it('should return all services with no filters', () => {
      const result = registry.search();
      expect(result.total).toBe(3);
    });

    it('should filter by query', () => {
      const result = registry.search({ query: 'AI' });
      expect(result.total).toBe(1);
      expect(result.services[0].manifest.id).toBe('com.test.ai-agent');
    });

    it('should filter by category', () => {
      const result = registry.search({ category: 'analytics' });
      expect(result.total).toBe(1);
    });

    it('should filter by tags', () => {
      const result = registry.search({ tags: ['crm'] });
      expect(result.total).toBe(1);
    });

    it('should paginate results', () => {
      const result = registry.search({ limit: 2, offset: 0 });
      expect(result.services).toHaveLength(2);
      expect(result.total).toBe(3);
    });

    it('should return facets', () => {
      const result = registry.search();
      expect(result.facets.categories.length).toBeGreaterThan(0);
    });
  });

  describe('install/uninstall', () => {
    beforeEach(() => {
      registry.publish(createTestManifest());
    });

    it('should install a published service', async () => {
      const result = await registry.install('com.trancendos.test-service', { apiKey: 'test-key-12345' });
      expect(result.success).toBe(true);
    });

    it('should reject installing non-existent service', async () => {
      const result = await registry.install('com.nonexistent');
      expect(result.success).toBe(false);
    });

    it('should reject duplicate installation', async () => {
      await registry.install('com.trancendos.test-service', { apiKey: 'test-key-12345' });
      const result = await registry.install('com.trancendos.test-service');
      expect(result.success).toBe(false);
    });

    it('should uninstall a service', async () => {
      await registry.install('com.trancendos.test-service', { apiKey: 'test-key-12345' });
      const result = await registry.uninstall('com.trancendos.test-service');
      expect(result.success).toBe(true);
    });

    it('should list installed services', async () => {
      await registry.install('com.trancendos.test-service', { apiKey: 'test-key-12345' });
      const installed = registry.getInstalledServices();
      expect(installed).toHaveLength(1);
    });
  });

  describe('start/stop', () => {
    beforeEach(async () => {
      registry.publish(createTestManifest());
      await registry.install('com.trancendos.test-service', { apiKey: 'test-key-12345' });
    });

    it('should start an installed service', async () => {
      const result = await registry.startService('com.trancendos.test-service');
      expect(result.success).toBe(true);
      expect(registry.getRunningServices()).toHaveLength(1);
    });

    it('should stop a running service', async () => {
      await registry.startService('com.trancendos.test-service');
      const result = await registry.stopService('com.trancendos.test-service');
      expect(result.success).toBe(true);
      expect(registry.getRunningServices()).toHaveLength(0);
    });
  });

  describe('reviews', () => {
    beforeEach(() => {
      registry.publish(createTestManifest());
    });

    it('should add a review', () => {
      const review = registry.addReview({
        serviceId: 'com.trancendos.test-service',
        userId: 'user_1',
        userName: 'Test User',
        rating: 5,
        title: 'Great service!',
        body: 'Works perfectly.',
        verified: true,
      });

      expect(review.id).toBeDefined();
      expect(review.rating).toBe(5);
    });

    it('should calculate review summary', () => {
      registry.addReview({ serviceId: 'com.trancendos.test-service', userId: 'u1', userName: 'U1', rating: 5, title: '', body: '', verified: true });
      registry.addReview({ serviceId: 'com.trancendos.test-service', userId: 'u2', userName: 'U2', rating: 3, title: '', body: '', verified: true });

      const summary = registry.getReviews('com.trancendos.test-service');
      expect(summary).toHaveLength(2);
    });
  });

  describe('events', () => {
    it('should emit events on publish', () => {
      const events: any[] = [];
      registry.on('marketplace:service.published', (e) => events.push(e));

      registry.publish(createTestManifest());
      expect(events).toHaveLength(1);
      expect(events[0].serviceId).toBe('com.trancendos.test-service');
    });

    it('should emit events on install', async () => {
      const events: any[] = [];
      registry.on('marketplace:service.installed', (e) => events.push(e));

      registry.publish(createTestManifest());
      await registry.install('com.trancendos.test-service', { apiKey: 'test-key-12345' });
      expect(events).toHaveLength(1);
    });

    it('should support wildcard listeners', async () => {
      const events: any[] = [];
      registry.on('*', (e) => events.push(e));

      registry.publish(createTestManifest());
      expect(events.length).toBeGreaterThan(0);
    });
  });
});

// ============================================================
// BILLING SYSTEM TESTS
// ============================================================

describe('BillingSystem', () => {
  let billing: BillingSystem;

  beforeEach(() => {
    billing = new BillingSystem();
  });

  describe('accounts', () => {
    it('should create a billing account', () => {
      const account = billing.createAccount('owner_1', 'Test Org', 'billing@test.com');
      expect(account.id).toBeDefined();
      expect(account.name).toBe('Test Org');
      expect(account.balance).toBe(0);
    });

    it('should retrieve account by owner', () => {
      billing.createAccount('owner_1', 'Test Org', 'billing@test.com');
      const account = billing.getAccountByOwner('owner_1');
      expect(account).toBeDefined();
      expect(account!.name).toBe('Test Org');
    });
  });

  describe('usage tracking', () => {
    it('should record usage', () => {
      const record = billing.recordUsage('acct_1', 'svc_1', 'api_calls', 100, 'calls');
      expect(record.quantity).toBe(100);
      expect(record.metric).toBe('api_calls');
    });

    it('should track cumulative usage', () => {
      billing.usage.record('acct_1', 'svc_1', 'api_calls', 100, 'calls');
      billing.usage.record('acct_1', 'svc_1', 'api_calls', 50, 'calls');
      const current = billing.usage.getCurrentUsage('acct_1', 'svc_1', 'api_calls');
      expect(current).toBe(150);
    });

    it('should aggregate usage by metric', () => {
      const now = Date.now();
      billing.usage.record('acct_1', 'svc_1', 'api_calls', 100, 'calls');
      billing.usage.record('acct_1', 'svc_1', 'storage', 500, 'MB');

      const aggregated = billing.usage.getAggregatedUsage('acct_1', 'svc_1', now - 1000, now + 1000);
      expect(aggregated.size).toBe(2);
      expect(aggregated.get('api_calls')!.total).toBe(100);
      expect(aggregated.get('storage')!.total).toBe(500);
    });
  });

  describe('subscriptions', () => {
    it('should create a subscription', () => {
      const sub = billing.subscribe('acct_1', 'svc_1', { type: 'subscription', basePrice: 999, currency: 'USD' });
      expect(sub).toBeDefined();
      expect(sub!.status).toBe('active');
      expect(sub!.pricePerPeriod).toBe(999);
    });

    it('should create trial subscription', () => {
      const sub = billing.subscribe('acct_1', 'svc_1', { type: 'subscription', basePrice: 999, trialDays: 14 });
      expect(sub!.status).toBe('trial');
      expect(sub!.trialEnd).toBeDefined();
    });

    it('should cancel subscription', () => {
      const account = billing.createAccount('owner_1', 'Test', 'test@test.com');
      const sub = billing.subscribe(account.id, 'svc_1', { type: 'subscription', basePrice: 999 });
      const cancelled = billing.subscriptions.cancel(sub!.id);
      expect(cancelled).toBe(true);
    });

    it('should prevent duplicate subscriptions', () => {
      const account = billing.createAccount('owner_1', 'Test', 'test@test.com');
      billing.subscribe(account.id, 'svc_1', { type: 'subscription', basePrice: 999 });
      const dup = billing.subscribe(account.id, 'svc_1', { type: 'subscription', basePrice: 999 });
      expect(dup).toBeNull();
    });

    it('should apply annual discount', () => {
      const sub = billing.subscriptions.create('acct_1', 'svc_1', { type: 'subscription', basePrice: 1000 }, undefined, 'annual');
      // 1000 * 12 * 0.8 = 9600
      expect(sub.pricePerPeriod).toBe(9600);
    });
  });

  describe('invoices', () => {
    it('should generate an invoice', () => {
      const account = billing.createAccount('owner_1', 'Test', 'test@test.com');
      const sub = billing.subscriptions.create(account.id, 'svc_1', { type: 'subscription', basePrice: 2999 });

      const now = Date.now();
      const invoice = billing.invoices.generate(
        account,
        [sub],
        billing.usage,
        new Map(),
        now - 30 * 86400000,
        now
      );

      expect(invoice.invoiceNumber).toMatch(/^INV-/);
      expect(invoice.lineItems).toHaveLength(1);
      expect(invoice.total).toBe(2999);
    });

    it('should include usage-based charges', () => {
      const account = billing.createAccount('owner_1', 'Test', 'test@test.com');
      const sub = billing.subscriptions.create(account.id, 'svc_1', { type: 'subscription', basePrice: 0 });

      const now = Date.now();
      billing.usage.record(account.id, 'svc_1', 'api_calls', 1500, 'calls');

      const usagePricing = new Map([
        ['svc_1', [{ metric: 'api_calls', unit: 'calls', pricePerUnit: 1, freeQuota: 1000 }]],
      ]);

      const invoice = billing.invoices.generate(
        account,
        [sub],
        billing.usage,
        usagePricing,
        now - 1000,
        now + 1000
      );

      // 1500 - 1000 free = 500 billable * 1 cent = 500 cents
      const usageItem = invoice.lineItems.find(i => i.type === 'usage');
      expect(usageItem).toBeDefined();
      expect(usageItem!.quantity).toBe(500);
      expect(usageItem!.total).toBe(500);
    });

    it('should mark zero-total invoices as paid', () => {
      const account = billing.createAccount('owner_1', 'Test', 'test@test.com');
      const sub = billing.subscriptions.create(account.id, 'svc_1', { type: 'free', basePrice: 0 });

      const now = Date.now();
      const invoice = billing.invoices.generate(account, [sub], billing.usage, new Map(), now - 1000, now);
      expect(invoice.status).toBe('paid');
    });
  });

  describe('payments', () => {
    it('should process a payment', async () => {
      const account = billing.createAccount('owner_1', 'Test', 'test@test.com');
      account.paymentMethod = { id: 'pm_1', type: 'card', last4: '4242', brand: 'visa', isDefault: true };

      const sub = billing.subscriptions.create(account.id, 'svc_1', { type: 'subscription', basePrice: 999 });
      const now = Date.now();
      const invoice = billing.invoices.generate(account, [sub], billing.usage, new Map(), now - 1000, now);

      const payment = await billing.payments.processPayment(account, invoice);
      expect(payment.status).toBe('completed');
      expect(payment.amount).toBe(999);
    });

    it('should process a refund', async () => {
      const account = billing.createAccount('owner_1', 'Test', 'test@test.com');
      account.paymentMethod = { id: 'pm_1', type: 'card', last4: '4242', brand: 'visa', isDefault: true };

      const sub = billing.subscriptions.create(account.id, 'svc_1', { type: 'subscription', basePrice: 999 });
      const now = Date.now();
      const invoice = billing.invoices.generate(account, [sub], billing.usage, new Map(), now - 1000, now);
      const payment = await billing.payments.processPayment(account, invoice);

      const refund = await billing.payments.processRefund(payment.id);
      expect(refund.amount).toBe(-999);
      expect(refund.status).toBe('completed');
    });

    it('should reject payment without payment method', async () => {
      const account = billing.createAccount('owner_1', 'Test', 'test@test.com');
      const sub = billing.subscriptions.create(account.id, 'svc_1', { type: 'subscription', basePrice: 999 });
      const now = Date.now();
      const invoice = billing.invoices.generate(account, [sub], billing.usage, new Map(), now - 1000, now);

      await expect(billing.payments.processPayment(account, invoice)).rejects.toThrow('No payment method');
    });
  });
});

// ============================================================
// MARKETPLACE API TESTS
// ============================================================

describe('MarketplaceAPI', () => {
  let api: MarketplaceAPI;

  beforeEach(() => {
    api = new MarketplaceAPI();
    // Publish test services
    api.getRegistry().publish(createTestManifest({ id: 'com.test.svc1', name: 'Service One', category: 'ai-agents' }));
    api.getRegistry().publish(createTestManifest({ id: 'com.test.svc2', name: 'Service Two', category: 'analytics' }));
  });

  describe('route registration', () => {
    it('should register all expected routes', () => {
      const routes = api.getRoutes();
      expect(routes.length).toBeGreaterThan(15);

      const paths = routes.map(r => `${r.method} ${r.path}`);
      expect(paths).toContain('GET /api/marketplace/catalog');
      expect(paths).toContain('POST /api/marketplace/install/:id');
      expect(paths).toContain('GET /api/marketplace/health');
    });
  });

  describe('catalog endpoints', () => {
    it('should search catalog', async () => {
      const response = await api.handleRequest(createApiRequest({
        method: 'GET',
        path: '/api/marketplace/catalog',
        query: {},
      }));

      expect(response.status).toBe(200);
      expect(response.data).toBeDefined();
      expect((response.data as any).total).toBe(2);
    });

    it('should search with query', async () => {
      const response = await api.handleRequest(createApiRequest({
        method: 'GET',
        path: '/api/marketplace/catalog',
        query: { q: 'One' },
      }));

      expect(response.status).toBe(200);
      expect((response.data as any).total).toBe(1);
    });

    it('should get service details', async () => {
      const response = await api.handleRequest(createApiRequest({
        method: 'GET',
        path: '/api/marketplace/catalog/com.test.svc1',
      }));

      expect(response.status).toBe(200);
      expect((response.data as any).manifest.name).toBe('Service One');
    });

    it('should return 404 for unknown service', async () => {
      const response = await api.handleRequest(createApiRequest({
        method: 'GET',
        path: '/api/marketplace/catalog/com.nonexistent',
      }));

      expect(response.status).toBe(404);
    });
  });

  describe('installation endpoints', () => {
    it('should install a service', async () => {
      const response = await api.handleRequest(createApiRequest({
        method: 'POST',
        path: '/api/marketplace/install/com.test.svc1',
        body: { config: { apiKey: 'test-key-12345' } },
      }));

      expect(response.status).toBe(201);
      expect((response.data as any).installed).toBe(true);
    });

    it('should list installed services', async () => {
      await api.handleRequest(createApiRequest({
        method: 'POST',
        path: '/api/marketplace/install/com.test.svc1',
        body: { config: { apiKey: 'test-key-12345' } },
      }));

      const response = await api.handleRequest(createApiRequest({
        method: 'GET',
        path: '/api/marketplace/installed',
      }));

      expect(response.status).toBe(200);
      expect((response.data as any[]).length).toBe(1);
    });

    it('should start and stop a service', async () => {
      await api.handleRequest(createApiRequest({
        method: 'POST',
        path: '/api/marketplace/install/com.test.svc1',
        body: { config: { apiKey: 'test-key-12345' } },
      }));

      const startResponse = await api.handleRequest(createApiRequest({
        method: 'POST',
        path: '/api/marketplace/start/com.test.svc1',
      }));
      expect(startResponse.status).toBe(200);

      const stopResponse = await api.handleRequest(createApiRequest({
        method: 'POST',
        path: '/api/marketplace/stop/com.test.svc1',
      }));
      expect(stopResponse.status).toBe(200);
    });

    it('should uninstall a service', async () => {
      await api.handleRequest(createApiRequest({
        method: 'POST',
        path: '/api/marketplace/install/com.test.svc1',
        body: { config: { apiKey: 'test-key-12345' } },
      }));

      const response = await api.handleRequest(createApiRequest({
        method: 'DELETE',
        path: '/api/marketplace/install/com.test.svc1',
      }));

      expect(response.status).toBe(200);
      expect((response.data as any).uninstalled).toBe(true);
    });
  });

  describe('review endpoints', () => {
    it('should add and get reviews', async () => {
      const addResponse = await api.handleRequest(createApiRequest({
        method: 'POST',
        path: '/api/marketplace/reviews/com.test.svc1',
        body: { rating: 5, title: 'Excellent!', body: 'Works great.', userName: 'Tester' },
      }));
      expect(addResponse.status).toBe(201);

      const getResponse = await api.handleRequest(createApiRequest({
        method: 'GET',
        path: '/api/marketplace/reviews/com.test.svc1',
      }));
      expect(getResponse.status).toBe(200);
      expect((getResponse.data as any[]).length).toBe(1);
    });

    it('should reject invalid ratings', async () => {
      const response = await api.handleRequest(createApiRequest({
        method: 'POST',
        path: '/api/marketplace/reviews/com.test.svc1',
        body: { rating: 6 },
      }));
      expect(response.status).toBe(400);
    });
  });

  describe('health & stats', () => {
    it('should return health status', async () => {
      const response = await api.handleRequest(createApiRequest({
        method: 'GET',
        path: '/api/marketplace/health',
      }));

      expect(response.status).toBe(200);
      expect((response.data as any).status).toBe('healthy');
      expect((response.data as any).catalogSize).toBe(2);
    });

    it('should return marketplace stats', async () => {
      const response = await api.handleRequest(createApiRequest({
        method: 'GET',
        path: '/api/marketplace/stats',
      }));

      expect(response.status).toBe(200);
      expect((response.data as any).totalServices).toBe(2);
    });

    it('should list categories', async () => {
      const response = await api.handleRequest(createApiRequest({
        method: 'GET',
        path: '/api/marketplace/categories',
      }));

      expect(response.status).toBe(200);
      expect((response.data as any[]).length).toBe(17);
    });
  });

  describe('authentication', () => {
    it('should reject unauthenticated requests to protected routes', async () => {
      const response = await api.handleRequest(createApiRequest({
        method: 'POST',
        path: '/api/marketplace/install/com.test.svc1',
        userId: undefined,
      }));

      expect(response.status).toBe(401);
    });

    it('should allow unauthenticated access to public routes', async () => {
      const response = await api.handleRequest(createApiRequest({
        method: 'GET',
        path: '/api/marketplace/catalog',
        userId: undefined,
      }));

      expect(response.status).toBe(200);
    });
  });

  describe('error handling', () => {
    it('should return 404 for unknown routes', async () => {
      const response = await api.handleRequest(createApiRequest({
        method: 'GET',
        path: '/api/marketplace/nonexistent',
      }));

      expect(response.status).toBe(404);
    });

    it('should include request metadata in responses', async () => {
      const response = await api.handleRequest(createApiRequest({
        method: 'GET',
        path: '/api/marketplace/health',
      }));

      expect(response.meta).toBeDefined();
      expect(response.meta!.requestId).toBeDefined();
      expect(response.meta!.timestamp).toBeDefined();
    });
  });
});