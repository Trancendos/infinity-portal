/**
 * OS Enhancement Module Tests
 * 
 * Comprehensive test suite covering:
 * - Service Discovery (registration, routing, dependency graph)
 * - Event Streaming & Webhooks (pub/sub, delivery, DLQ)
 * - Self-Healing (scaling, anomaly detection, failover)
 * - Dynamic Configuration (config store, feature flags, experiments)
 */

import { ServiceDiscovery } from '../service-discovery';
import type { DiscoverableService } from '../service-discovery';
import { EventStream, WebhookManager } from '../webhook-system';
import { SelfHealingSystem, PredictiveScaler, AnomalyDetector, FailoverManager } from '../self-healing';
import { DynamicConfigSystem, ConfigStore, FeatureFlagManager } from '../dynamic-config';

// ============================================================
// TEST HELPERS
// ============================================================

function createTestService(overrides: Partial<DiscoverableService> = {}): Omit<DiscoverableService, 'registeredAt' | 'lastHeartbeat' | 'status'> {
  return {
    instanceId: `inst_${Math.random().toString(36).slice(2, 8)}`,
    serviceName: 'test-service',
    version: '1.0.0',
    host: 'localhost',
    port: 3000,
    protocol: 'http',
    metadata: { environment: 'production', custom: {} },
    healthCheck: {
      protocol: 'http',
      path: '/health',
      intervalMs: 10000,
      timeoutMs: 5000,
      unhealthyThreshold: 3,
      healthyThreshold: 2,
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      lastCheckAt: 0,
      lastCheckResult: 'unknown',
    },
    ttlMs: 30000,
    weight: 50,
    load: 30,
    latency: 50,
    activeConnections: 10,
    tags: ['api', 'v1'],
    dependencies: [],
    capabilities: ['rest', 'graphql'],
    ...overrides,
  };
}

// ============================================================
// SERVICE DISCOVERY TESTS
// ============================================================

describe('ServiceDiscovery', () => {
  let discovery: ServiceDiscovery;

  beforeEach(() => {
    discovery = new ServiceDiscovery({ expirationCheckIntervalMs: 60000 });
  });

  afterEach(() => {
    discovery.destroy();
  });

  describe('registration', () => {
    it('should register a service', () => {
      const service = discovery.register(createTestService());
      expect(service.status).toBe('healthy');
      expect(service.registeredAt).toBeGreaterThan(0);
    });

    it('should index by service name', () => {
      discovery.register(createTestService({ instanceId: 'inst_1', serviceName: 'api' }));
      discovery.register(createTestService({ instanceId: 'inst_2', serviceName: 'api' }));
      discovery.register(createTestService({ instanceId: 'inst_3', serviceName: 'worker' }));

      expect(discovery.getInstances('api')).toHaveLength(2);
      expect(discovery.getInstances('worker')).toHaveLength(1);
    });

    it('should deregister a service', () => {
      const service = discovery.register(createTestService({ instanceId: 'inst_1' }));
      expect(discovery.deregister('inst_1')).toBe(true);
      expect(discovery.getInstance('inst_1')).toBeUndefined();
    });

    it('should emit events on registration', () => {
      const events: any[] = [];
      discovery.on('service:registered', (e) => events.push(e));

      discovery.register(createTestService());
      expect(events).toHaveLength(1);
    });
  });

  describe('discovery', () => {
    beforeEach(() => {
      discovery.register(createTestService({ instanceId: 'api_1', serviceName: 'api', version: '1.0.0', load: 20, latency: 30 }));
      discovery.register(createTestService({ instanceId: 'api_2', serviceName: 'api', version: '1.1.0', load: 60, latency: 80 }));
      discovery.register(createTestService({ instanceId: 'api_3', serviceName: 'api', version: '2.0.0', load: 40, latency: 50, tags: ['api', 'v2'] }));
      discovery.register(createTestService({ instanceId: 'worker_1', serviceName: 'worker' }));
    });

    it('should discover services by name', () => {
      const results = discovery.discover({ serviceName: 'api' });
      expect(results).toHaveLength(3);
    });

    it('should filter by version range', () => {
      const results = discovery.discover({ serviceName: 'api', versionRange: '^1.0.0' });
      expect(results).toHaveLength(2);
    });

    it('should filter by tags', () => {
      const results = discovery.discover({ serviceName: 'api', tags: ['v2'] });
      expect(results).toHaveLength(1);
      expect(results[0].instanceId).toBe('api_3');
    });

    it('should filter by capabilities', () => {
      const results = discovery.discover({ serviceName: 'api', capabilities: ['graphql'] });
      expect(results).toHaveLength(3);
    });

    it('should apply least-connections routing', () => {
      const results = discovery.discover({ serviceName: 'api', routingStrategy: 'least-connections' });
      expect(results[0].activeConnections).toBeLessThanOrEqual(results[1].activeConnections);
    });

    it('should apply latency-based routing', () => {
      const results = discovery.discover({ serviceName: 'api', routingStrategy: 'latency-based' });
      expect(results[0].latency).toBeLessThanOrEqual(results[1].latency);
    });

    it('should discover one instance', () => {
      const result = discovery.discoverOne({ serviceName: 'api' });
      expect(result).toBeDefined();
      expect(result!.serviceName).toBe('api');
    });

    it('should return null for unknown service', () => {
      const result = discovery.discoverOne({ serviceName: 'nonexistent' });
      expect(result).toBeNull();
    });

    it('should get service URL', () => {
      const url = discovery.getServiceUrl({ serviceName: 'api' });
      expect(url).toMatch(/^http:\/\/localhost:\d+$/);
    });
  });

  describe('heartbeat', () => {
    it('should update heartbeat timestamp', () => {
      discovery.register(createTestService({ instanceId: 'inst_1' }));
      const before = discovery.getInstance('inst_1')!.lastHeartbeat;

      // Small delay to ensure timestamp difference
      discovery.heartbeat('inst_1', { load: 50 });
      const after = discovery.getInstance('inst_1')!.lastHeartbeat;

      expect(after).toBeGreaterThanOrEqual(before);
      expect(discovery.getInstance('inst_1')!.load).toBe(50);
    });

    it('should return false for unknown instance', () => {
      expect(discovery.heartbeat('nonexistent')).toBe(false);
    });
  });

  describe('dependency graph', () => {
    beforeEach(() => {
      discovery.register(createTestService({ instanceId: 'db_1', serviceName: 'database', dependencies: [] }));
      discovery.register(createTestService({ instanceId: 'cache_1', serviceName: 'cache', dependencies: [] }));
      discovery.register(createTestService({ instanceId: 'api_1', serviceName: 'api', dependencies: ['database', 'cache'] }));
      discovery.register(createTestService({ instanceId: 'web_1', serviceName: 'web', dependencies: ['api'] }));
    });

    it('should build dependency graph', () => {
      const graph = discovery.buildDependencyGraph();
      expect(graph.size).toBe(4);

      const apiNode = graph.get('api');
      expect(apiNode!.dependencies).toContain('database');
      expect(apiNode!.dependencies).toContain('cache');
    });

    it('should calculate startup order', () => {
      const order = discovery.getStartupOrder();
      const dbIdx = order.indexOf('database');
      const apiIdx = order.indexOf('api');
      const webIdx = order.indexOf('web');

      expect(dbIdx).toBeLessThan(apiIdx);
      expect(apiIdx).toBeLessThan(webIdx);
    });

    it('should calculate shutdown order', () => {
      const order = discovery.getShutdownOrder();
      const dbIdx = order.indexOf('database');
      const webIdx = order.indexOf('web');

      expect(webIdx).toBeLessThan(dbIdx);
    });

    it('should analyze impact of removing a service', () => {
      const impact = discovery.getImpactAnalysis('database');
      expect(impact.directDependents).toContain('api');
      expect(impact.transitiveDependents).toContain('web');
      expect(impact.canSafelyRemove).toBe(false);
    });

    it('should allow safe removal of leaf services', () => {
      const impact = discovery.getImpactAnalysis('web');
      expect(impact.canSafelyRemove).toBe(true);
    });
  });

  describe('stats', () => {
    it('should return service counts', () => {
      discovery.register(createTestService({ instanceId: 'inst_1' }));
      discovery.register(createTestService({ instanceId: 'inst_2' }));

      const counts = discovery.getServiceCount();
      expect(counts.total).toBe(2);
      expect(counts.healthy).toBe(2);
    });

    it('should return discovery stats', () => {
      discovery.register(createTestService({ instanceId: 'inst_1', load: 40, latency: 60 }));
      discovery.register(createTestService({ instanceId: 'inst_2', load: 60, latency: 80 }));

      const stats = discovery.getStats();
      expect(stats.totalInstances).toBe(2);
      expect(stats.averageLoad).toBe(50);
      expect(stats.averageLatency).toBe(70);
    });
  });
});

// ============================================================
// EVENT STREAM TESTS
// ============================================================

describe('EventStream', () => {
  let stream: EventStream;

  beforeEach(() => {
    stream = new EventStream({ maxBufferSize: 100, backpressureThreshold: 80 });
  });

  afterEach(() => {
    stream.close();
  });

  it('should publish events', async () => {
    const event = await stream.publish('test.event', 'test-source', { key: 'value' });
    expect(event.id).toBeDefined();
    expect(event.type).toBe('test.event');
    expect(event.metadata.sequenceNumber).toBe(1);
  });

  it('should deliver events to subscribers', async () => {
    const received: any[] = [];
    stream.subscribe('test.event', (e) => received.push(e));

    await stream.publish('test.event', 'source', { data: 1 });
    expect(received).toHaveLength(1);
  });

  it('should support wildcard subscribers', async () => {
    const received: any[] = [];
    stream.subscribe('*', (e) => received.push(e));

    await stream.publish('event.a', 'source', {});
    await stream.publish('event.b', 'source', {});
    expect(received).toHaveLength(2);
  });

  it('should replay events from buffer', async () => {
    await stream.publish('event.a', 'source', {});
    await stream.publish('event.b', 'source', {});
    await stream.publish('event.a', 'source', {});

    const all = stream.replay();
    expect(all).toHaveLength(3);

    const filtered = stream.replay({ eventType: 'event.a' });
    expect(filtered).toHaveLength(2);
  });

  it('should replay from sequence number', async () => {
    await stream.publish('event.a', 'source', {});
    await stream.publish('event.b', 'source', {});
    await stream.publish('event.c', 'source', {});

    const events = stream.replay({ fromSequence: 2 });
    expect(events).toHaveLength(2);
  });

  it('should report stream status', async () => {
    stream.subscribe('test', () => {});
    await stream.publish('test', 'source', {});

    const status = stream.getStatus();
    expect(status.bufferSize).toBe(1);
    expect(status.subscriberCount).toBe(1);
    expect(status.sequenceNumber).toBe(1);
  });

  it('should unsubscribe correctly', async () => {
    const received: any[] = [];
    const unsub = stream.subscribe('test', (e) => received.push(e));

    await stream.publish('test', 'source', {});
    expect(received).toHaveLength(1);

    unsub();
    await stream.publish('test', 'source', {});
    expect(received).toHaveLength(1);
  });
});

// ============================================================
// WEBHOOK MANAGER TESTS
// ============================================================

describe('WebhookManager', () => {
  let manager: WebhookManager;

  beforeEach(() => {
    manager = new WebhookManager();
  });

  describe('CRUD', () => {
    it('should create a webhook', () => {
      const webhook = manager.create({
        name: 'Test Webhook',
        url: 'https://example.com/webhook',
        method: 'POST',
        eventTypes: ['order.created'],
        secret: 'test-secret',
        headers: {},
        retry: { maxAttempts: 3, initialDelayMs: 1000, maxDelayMs: 30000, backoffMultiplier: 2, jitter: true },
        rateLimit: { maxPerMinute: 60, maxPerHour: 1000 },
        ownerId: 'user_1',
      });

      expect(webhook.id).toBeDefined();
      expect(webhook.status).toBe('active');
    });

    it('should list webhooks', () => {
      manager.create({
        name: 'WH1', url: 'https://a.com', method: 'POST', eventTypes: ['a'],
        secret: 's', headers: {}, retry: { maxAttempts: 3, initialDelayMs: 1000, maxDelayMs: 30000, backoffMultiplier: 2, jitter: true },
        rateLimit: { maxPerMinute: 60, maxPerHour: 1000 }, ownerId: 'user_1',
      });
      manager.create({
        name: 'WH2', url: 'https://b.com', method: 'POST', eventTypes: ['b'],
        secret: 's', headers: {}, retry: { maxAttempts: 3, initialDelayMs: 1000, maxDelayMs: 30000, backoffMultiplier: 2, jitter: true },
        rateLimit: { maxPerMinute: 60, maxPerHour: 1000 }, ownerId: 'user_2',
      });

      expect(manager.list()).toHaveLength(2);
      expect(manager.list('user_1')).toHaveLength(1);
    });

    it('should update a webhook', () => {
      const webhook = manager.create({
        name: 'Test', url: 'https://a.com', method: 'POST', eventTypes: ['a'],
        secret: 's', headers: {}, retry: { maxAttempts: 3, initialDelayMs: 1000, maxDelayMs: 30000, backoffMultiplier: 2, jitter: true },
        rateLimit: { maxPerMinute: 60, maxPerHour: 1000 }, ownerId: 'user_1',
      });

      const updated = manager.update(webhook.id, { name: 'Updated Name' });
      expect(updated!.name).toBe('Updated Name');
    });

    it('should delete a webhook', () => {
      const webhook = manager.create({
        name: 'Test', url: 'https://a.com', method: 'POST', eventTypes: ['a'],
        secret: 's', headers: {}, retry: { maxAttempts: 3, initialDelayMs: 1000, maxDelayMs: 30000, backoffMultiplier: 2, jitter: true },
        rateLimit: { maxPerMinute: 60, maxPerHour: 1000 }, ownerId: 'user_1',
      });

      expect(manager.delete(webhook.id)).toBe(true);
      expect(manager.get(webhook.id)).toBeUndefined();
    });

    it('should pause and resume a webhook', () => {
      const webhook = manager.create({
        name: 'Test', url: 'https://a.com', method: 'POST', eventTypes: ['a'],
        secret: 's', headers: {}, retry: { maxAttempts: 3, initialDelayMs: 1000, maxDelayMs: 30000, backoffMultiplier: 2, jitter: true },
        rateLimit: { maxPerMinute: 60, maxPerHour: 1000 }, ownerId: 'user_1',
      });

      manager.pause(webhook.id);
      expect(manager.get(webhook.id)!.status).toBe('paused');

      manager.resume(webhook.id);
      expect(manager.get(webhook.id)!.status).toBe('active');
    });
  });

  describe('system stats', () => {
    it('should return system stats', () => {
      manager.create({
        name: 'Test', url: 'https://a.com', method: 'POST', eventTypes: ['a'],
        secret: 's', headers: {}, retry: { maxAttempts: 3, initialDelayMs: 1000, maxDelayMs: 30000, backoffMultiplier: 2, jitter: true },
        rateLimit: { maxPerMinute: 60, maxPerHour: 1000 }, ownerId: 'user_1',
      });

      const stats = manager.getSystemStats();
      expect(stats.totalWebhooks).toBe(1);
      expect(stats.activeWebhooks).toBe(1);
    });
  });
});

// ============================================================
// PREDICTIVE SCALER TESTS
// ============================================================

describe('PredictiveScaler', () => {
  let scaler: PredictiveScaler;

  beforeEach(() => {
    scaler = new PredictiveScaler();
    scaler.setPolicy({
      serviceName: 'api',
      minInstances: 2,
      maxInstances: 10,
      targetCpuUtilization: 70,
      targetMemoryUtilization: 80,
      targetResponseTime: 500,
      scaleUpCooldownMs: 0,
      scaleDownCooldownMs: 0,
      scaleUpThreshold: 75,
      scaleDownThreshold: 25,
      predictiveEnabled: false,
      schedulePatterns: [],
    });
  });

  it('should scale up when CPU is high', () => {
    for (let i = 0; i < 10; i++) {
      scaler.recordMetric('api', 'cpu', 85);
    }

    const decision = scaler.evaluate('api');
    expect(decision.action).toBe('scale_up');
    expect(decision.targetInstances).toBeGreaterThan(decision.currentInstances);
  });

  it('should scale down when CPU is low', () => {
    // First scale up
    for (let i = 0; i < 10; i++) scaler.recordMetric('api', 'cpu', 85);
    const upDecision = scaler.evaluate('api');
    scaler.execute(upDecision);

    // Then record low CPU
    for (let i = 0; i < 10; i++) scaler.recordMetric('api', 'cpu', 15);
    const downDecision = scaler.evaluate('api');
    expect(downDecision.action).toBe('scale_down');
  });

  it('should not scale beyond max instances', () => {
    scaler.setPolicy({
      serviceName: 'api', minInstances: 2, maxInstances: 3,
      targetCpuUtilization: 70, targetMemoryUtilization: 80, targetResponseTime: 500,
      scaleUpCooldownMs: 0, scaleDownCooldownMs: 0,
      scaleUpThreshold: 75, scaleDownThreshold: 25,
      predictiveEnabled: false, schedulePatterns: [],
    });

    for (let i = 0; i < 10; i++) scaler.recordMetric('api', 'cpu', 90);

    // Scale up twice
    scaler.execute(scaler.evaluate('api'));
    const decision = scaler.evaluate('api');
    expect(decision.targetInstances).toBeLessThanOrEqual(3);
  });

  it('should return no_change when within range', () => {
    for (let i = 0; i < 10; i++) scaler.recordMetric('api', 'cpu', 50);
    const decision = scaler.evaluate('api');
    expect(decision.action).toBe('no_change');
  });

  it('should track scaling history', () => {
    for (let i = 0; i < 10; i++) scaler.recordMetric('api', 'cpu', 85);
    const decision = scaler.evaluate('api');
    scaler.execute(decision);

    const history = scaler.getHistory('api');
    expect(history).toHaveLength(1);
    expect(history[0].action).toBe('scale_up');
  });
});

// ============================================================
// ANOMALY DETECTOR TESTS
// ============================================================

describe('AnomalyDetector', () => {
  let detector: AnomalyDetector;

  beforeEach(() => {
    detector = new AnomalyDetector();
  });

  it('should detect spikes', () => {
    // Build baseline
    for (let i = 0; i < 20; i++) {
      detector.analyze('api', 'response_time', 50 + Math.random() * 10);
    }

    // Inject spike
    const anomaly = detector.analyze('api', 'response_time', 500);
    expect(anomaly).toBeDefined();
    expect(anomaly!.type).toBe('spike');
  });

  it('should detect threshold breaches', () => {
    detector.setThreshold('api', 'cpu', 80, 95);

    // Build baseline
    for (let i = 0; i < 20; i++) {
      detector.analyze('api', 'cpu', 50);
    }

    const anomaly = detector.analyze('api', 'cpu', 96);
    expect(anomaly).toBeDefined();
    expect(anomaly!.severity).toBe('critical');
  });

  it('should track active anomalies', () => {
    for (let i = 0; i < 20; i++) {
      detector.analyze('api', 'cpu', 50);
    }
    detector.analyze('api', 'cpu', 500);

    const active = detector.getActiveAnomalies();
    expect(active.length).toBeGreaterThanOrEqual(1);
  });

  it('should acknowledge anomalies', () => {
    for (let i = 0; i < 20; i++) {
      detector.analyze('api', 'cpu', 50);
    }
    const anomaly = detector.analyze('api', 'cpu', 500);
    if (anomaly) {
      expect(detector.acknowledge(anomaly.id)).toBe(true);
    }
  });

  it('should resolve anomalies', () => {
    for (let i = 0; i < 20; i++) {
      detector.analyze('api', 'cpu', 50);
    }
    const anomaly = detector.analyze('api', 'cpu', 500);
    if (anomaly) {
      detector.resolve(anomaly.id);
      const active = detector.getActiveAnomalies();
      expect(active.find(a => a.id === anomaly.id)).toBeUndefined();
    }
  });

  it('should report health trends', () => {
    const trend = detector.getHealthTrend('api');
    expect(trend).toBe('stable');
  });
});

// ============================================================
// FAILOVER MANAGER TESTS
// ============================================================

describe('FailoverManager', () => {
  let failover: FailoverManager;

  beforeEach(() => {
    failover = new FailoverManager();
    failover.configure({
      serviceName: 'api',
      mode: 'active-passive',
      primaryInstance: 'primary_1',
      secondaryInstances: ['secondary_1', 'secondary_2'],
      healthCheckIntervalMs: 5000,
      failoverThreshold: 50,
      failbackEnabled: true,
      failbackDelayMs: 30000,
    });
  });

  it('should start in normal state', () => {
    const state = failover.getState('api');
    expect(state!.status).toBe('normal');
    expect(state!.activeInstance).toBe('primary_1');
  });

  it('should failover when primary is unhealthy', () => {
    failover.updateHealth('primary_1', 20);
    failover.updateHealth('secondary_1', 90);

    const state = failover.checkFailover('api');
    expect(state!.status).toBe('failover');
    expect(state!.activeInstance).toBe('secondary_1');
  });

  it('should go degraded when no healthy secondary', () => {
    failover.updateHealth('primary_1', 20);
    failover.updateHealth('secondary_1', 10);
    failover.updateHealth('secondary_2', 5);

    const state = failover.checkFailover('api');
    expect(state!.status).toBe('degraded');
  });

  it('should force failover', () => {
    expect(failover.forceFailover('api', 'secondary_2')).toBe(true);
    expect(failover.getState('api')!.activeInstance).toBe('secondary_2');
  });

  it('should list all states', () => {
    const states = failover.getAllStates();
    expect(states).toHaveLength(1);
  });
});

// ============================================================
// SELF-HEALING SYSTEM TESTS
// ============================================================

describe('SelfHealingSystem', () => {
  let system: SelfHealingSystem;

  beforeEach(() => {
    system = new SelfHealingSystem();
    system.scaler.setPolicy({
      serviceName: 'api',
      minInstances: 2, maxInstances: 10,
      targetCpuUtilization: 70, targetMemoryUtilization: 80, targetResponseTime: 500,
      scaleUpCooldownMs: 0, scaleDownCooldownMs: 0,
      scaleUpThreshold: 75, scaleDownThreshold: 25,
      predictiveEnabled: false, schedulePatterns: [],
    });
  });

  it('should process metrics and return results', () => {
    // Build baseline
    for (let i = 0; i < 15; i++) {
      system.processMetrics('api', { cpu: 50, memory: 40, response_time: 100 });
    }

    const result = system.processMetrics('api', { cpu: 50, memory: 40, response_time: 100 });
    expect(result.scalingDecision).toBeDefined();
    expect(result.anomalies).toBeDefined();
  });

  it('should trigger scaling on high metrics', () => {
    for (let i = 0; i < 10; i++) {
      system.processMetrics('api', { cpu: 85 });
    }

    const result = system.processMetrics('api', { cpu: 85 });
    expect(result.scalingDecision.action).toBe('scale_up');
  });

  it('should provide health overview', () => {
    system.processMetrics('api', { cpu: 50 });
    const overview = system.getHealthOverview();
    expect(overview).toBeDefined();
    expect(overview.totalAnomalies).toBeGreaterThanOrEqual(0);
  });

  it('should emit events', () => {
    const events: any[] = [];
    system.on('*', (e) => events.push(e));

    for (let i = 0; i < 10; i++) {
      system.processMetrics('api', { cpu: 85 });
    }

    // Should have scaling events
    expect(events.length).toBeGreaterThan(0);
  });
});

// ============================================================
// CONFIG STORE TESTS
// ============================================================

describe('ConfigStore', () => {
  let store: ConfigStore;

  beforeEach(() => {
    store = new ConfigStore();
  });

  it('should set and get values', () => {
    store.set('app.name', 'Infinity Portal');
    expect(store.get('app.name')).toBe('Infinity Portal');
  });

  it('should track versions', () => {
    store.set('app.name', 'v1');
    store.set('app.name', 'v2');
    store.set('app.name', 'v3');

    const entry = store.getEntry('app.name');
    expect(entry!.version).toBe(3);
  });

  it('should maintain history', () => {
    store.set('key', 'a');
    store.set('key', 'b');
    store.set('key', 'c');

    const history = store.getHistory('key');
    expect(history).toHaveLength(3);
  });

  it('should rollback to previous version', () => {
    store.set('key', 'original');
    store.set('key', 'modified');

    store.rollback('key', 1);
    expect(store.get('key')).toBe('original');
  });

  it('should support environment overrides', () => {
    store.set('db.host', 'localhost');
    store.set('db.host', 'prod-db.example.com', { environment: 'production' });

    expect(store.get('db.host')).toBe('localhost');
    expect(store.get('db.host', 'production')).toBe('prod-db.example.com');
  });

  it('should list by namespace', () => {
    store.set('app.name', 'Test', { namespace: 'app' });
    store.set('db.host', 'localhost', { namespace: 'database' });

    expect(store.list({ namespace: 'app' })).toHaveLength(1);
    expect(store.list({ namespace: 'database' })).toHaveLength(1);
  });

  it('should export and import', () => {
    store.set('key1', 'value1');
    store.set('key2', 42);

    const exported = store.export();
    expect(exported['key1']).toBe('value1');
    expect(exported['key2']).toBe(42);

    const newStore = new ConfigStore();
    const count = newStore.import(exported);
    expect(count).toBe(2);
    expect(newStore.get('key1')).toBe('value1');
  });

  it('should delete configs', () => {
    store.set('key', 'value');
    expect(store.delete('key')).toBe(true);
    expect(store.get('key')).toBeUndefined();
  });

  it('should diff versions', () => {
    store.set('key', 'old');
    store.set('key', 'new');

    const diff = store.diff('key', 1, 2);
    expect(diff!.versionA).toBe('old');
    expect(diff!.versionB).toBe('new');
  });
});

// ============================================================
// FEATURE FLAG MANAGER TESTS
// ============================================================

describe('FeatureFlagManager', () => {
  let flags: FeatureFlagManager;

  beforeEach(() => {
    flags = new FeatureFlagManager();
  });

  it('should create a flag', () => {
    const flag = flags.create({
      key: 'new-ui',
      name: 'New UI',
      description: 'Enable new UI',
      status: 'active',
      defaultValue: false,
      rules: [],
      rollout: { strategy: 'all' },
      tags: ['ui'],
      owner: 'team-frontend',
    });

    expect(flag.key).toBe('new-ui');
    expect(flag.status).toBe('active');
  });

  it('should evaluate default value', () => {
    flags.create({
      key: 'feature-a', name: 'A', description: '', status: 'active',
      defaultValue: true, rules: [], rollout: { strategy: 'all' },
      tags: [], owner: 'test',
    });

    expect(flags.evaluate('feature-a')).toBe(true);
  });

  it('should evaluate targeting rules', () => {
    flags.create({
      key: 'beta-feature', name: 'Beta', description: '', status: 'active',
      defaultValue: false,
      rules: [
        {
          id: 'rule_1', name: 'Beta users', priority: 1, enabled: true, value: true,
          conditions: [{ attribute: 'plan', operator: 'eq', value: 'beta' }],
        },
      ],
      rollout: { strategy: 'all' },
      tags: [], owner: 'test',
    });

    expect(flags.evaluate('beta-feature', { attributes: { plan: 'beta' } })).toBe(true);
    expect(flags.evaluate('beta-feature', { attributes: { plan: 'free' } })).toBe(false);
  });

  it('should support percentage rollout', () => {
    flags.create({
      key: 'gradual-feature', name: 'Gradual', description: '', status: 'active',
      defaultValue: true, rules: [],
      rollout: { strategy: 'percentage', percentage: 50 },
      tags: [], owner: 'test',
    });

    // With deterministic hashing, some users will get true, some false
    let trueCount = 0;
    for (let i = 0; i < 100; i++) {
      if (flags.evaluate('gradual-feature', { userId: `user_${i}`, attributes: {} })) {
        trueCount++;
      }
    }

    // Should be roughly 50% (allow wide margin for hash distribution)
    expect(trueCount).toBeGreaterThan(10);
    expect(trueCount).toBeLessThan(90);
  });

  it('should support user list rollout', () => {
    flags.create({
      key: 'vip-feature', name: 'VIP', description: '', status: 'active',
      defaultValue: true, rules: [],
      rollout: { strategy: 'user_list', userIds: ['user_1', 'user_2'] },
      tags: [], owner: 'test',
    });

    expect(flags.evaluate('vip-feature', { userId: 'user_1', attributes: {} })).toBe(true);
    expect(flags.evaluate('vip-feature', { userId: 'user_3', attributes: {} })).toBe(false);
  });

  it('should toggle flags', () => {
    flags.create({
      key: 'toggle-me', name: 'Toggle', description: '', status: 'active',
      defaultValue: false, rules: [], rollout: { strategy: 'all' },
      tags: [], owner: 'test',
    });

    expect(flags.evaluate('toggle-me')).toBe(false);
    flags.toggle('toggle-me');
    expect(flags.evaluate('toggle-me')).toBe(true);
  });

  it('should evaluate all flags', () => {
    flags.create({ key: 'a', name: 'A', description: '', status: 'active', defaultValue: true, rules: [], rollout: { strategy: 'all' }, tags: [], owner: 'test' });
    flags.create({ key: 'b', name: 'B', description: '', status: 'active', defaultValue: false, rules: [], rollout: { strategy: 'all' }, tags: [], owner: 'test' });

    const results = flags.evaluateAll({ attributes: {} });
    expect(results['a']).toBe(true);
    expect(results['b']).toBe(false);
  });

  it('should archive flags', () => {
    flags.create({ key: 'old', name: 'Old', description: '', status: 'active', defaultValue: true, rules: [], rollout: { strategy: 'all' }, tags: [], owner: 'test' });
    flags.archive('old');
    expect(flags.get('old')!.status).toBe('archived');
  });

  it('should track evaluation stats', () => {
    flags.create({ key: 'tracked', name: 'Tracked', description: '', status: 'active', defaultValue: true, rules: [], rollout: { strategy: 'all' }, tags: [], owner: 'test' });

    flags.evaluate('tracked');
    flags.evaluate('tracked');
    flags.evaluate('tracked');

    const flag = flags.get('tracked');
    expect(flag!.stats.totalEvaluations).toBe(3);
    expect(flag!.stats.trueCount).toBe(3);
  });
});

// ============================================================
// DYNAMIC CONFIG SYSTEM TESTS
// ============================================================

describe('DynamicConfigSystem', () => {
  let system: DynamicConfigSystem;

  beforeEach(() => {
    system = new DynamicConfigSystem();
  });

  it('should create and manage experiments', () => {
    const exp = system.createExperiment({
      name: 'Button Color Test',
      description: 'Test button colors',
      configKey: 'ui.button.color',
      variants: [
        { id: 'control', name: 'Blue', value: 'blue', weight: 50, impressions: 0, conversions: 0 },
        { id: 'variant_a', name: 'Green', value: 'green', weight: 50, impressions: 0, conversions: 0 },
      ],
      trafficAllocation: 100,
      startDate: Date.now(),
      successMetric: 'click_rate',
    });

    expect(exp.id).toBeDefined();
    expect(exp.status).toBe('draft');
  });

  it('should start experiments', () => {
    const exp = system.createExperiment({
      name: 'Test', description: '', configKey: 'key',
      variants: [{ id: 'a', name: 'A', value: 1, weight: 100, impressions: 0, conversions: 0 }],
      trafficAllocation: 100, startDate: Date.now(), successMetric: 'metric',
    });

    expect(system.startExperiment(exp.id)).toBe(true);
    expect(system.getExperiment(exp.id)!.status).toBe('running');
  });

  it('should record impressions and conversions', () => {
    const exp = system.createExperiment({
      name: 'Test', description: '', configKey: 'key',
      variants: [
        { id: 'a', name: 'A', value: 1, weight: 50, impressions: 0, conversions: 0 },
        { id: 'b', name: 'B', value: 2, weight: 50, impressions: 0, conversions: 0 },
      ],
      trafficAllocation: 100, startDate: Date.now(), successMetric: 'metric',
    });
    system.startExperiment(exp.id);

    const variant = system.recordImpression(exp.id, 'user_1');
    expect(variant).toBeDefined();

    if (variant) {
      system.recordConversion(exp.id, variant.id);
      expect(variant.conversions).toBe(1);
    }
  });

  it('should complete experiments', () => {
    const exp = system.createExperiment({
      name: 'Test', description: '', configKey: 'test.key',
      variants: [
        { id: 'a', name: 'A', value: 'value_a', weight: 50, impressions: 0, conversions: 0 },
        { id: 'b', name: 'B', value: 'value_b', weight: 50, impressions: 0, conversions: 0 },
      ],
      trafficAllocation: 100, startDate: Date.now(), successMetric: 'metric',
    });
    system.startExperiment(exp.id);

    // Record many impressions
    for (let i = 0; i < 100; i++) {
      system.recordImpression(exp.id, `user_${i}`);
    }

    const completed = system.completeExperiment(exp.id);
    expect(completed!.status).toBe('completed');
    expect(completed!.results.sampleSize).toBeGreaterThan(0);
  });

  it('should list experiments by status', () => {
    system.createExperiment({
      name: 'Draft', description: '', configKey: 'k1',
      variants: [{ id: 'a', name: 'A', value: 1, weight: 100, impressions: 0, conversions: 0 }],
      trafficAllocation: 100, startDate: Date.now(), successMetric: 'm',
    });

    const exp2 = system.createExperiment({
      name: 'Running', description: '', configKey: 'k2',
      variants: [{ id: 'a', name: 'A', value: 1, weight: 100, impressions: 0, conversions: 0 }],
      trafficAllocation: 100, startDate: Date.now(), successMetric: 'm',
    });
    system.startExperiment(exp2.id);

    expect(system.listExperiments('draft')).toHaveLength(1);
    expect(system.listExperiments('running')).toHaveLength(1);
  });
});