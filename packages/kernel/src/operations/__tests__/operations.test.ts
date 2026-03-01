/**
 * Operations Module Tests
 */

import { OperationsSystem, BackupManager, BenchmarkSuite, DeploymentChecklistGenerator } from '../disaster-recovery';

describe('BackupManager', () => {
  let manager: BackupManager;

  beforeEach(() => {
    manager = new BackupManager();
  });

  it('should create backups', () => {
    manager.setPolicy({
      name: 'daily-db',
      source: 'postgresql://db',
      schedule: { frequency: 'daily', time: '02:00' },
      type: 'full',
      retentionDays: 30,
      destination: 's3://backups/db',
      encryption: true,
      compression: true,
      verifyAfterBackup: true,
      notifyOnFailure: true,
    });

    const backup = manager.createBackup({
      name: 'daily-db',
      source: 'postgresql://db',
      schedule: { frequency: 'daily', time: '02:00' },
      type: 'full',
      retentionDays: 30,
      destination: 's3://backups/db',
      encryption: true,
      compression: true,
      verifyAfterBackup: true,
      notifyOnFailure: true,
    });

    expect(backup.id).toBeDefined();
    expect(backup.status).toBe('completed');
    expect(backup.sizeBytes).toBeGreaterThan(0);
    expect(backup.checksum).toBeDefined();
  });

  it('should list recovery points', () => {
    const policy = {
      name: 'test', source: 'db', schedule: { frequency: 'daily' as const },
      type: 'full' as const, retentionDays: 7, destination: 's3://test',
      encryption: false, compression: false, verifyAfterBackup: false, notifyOnFailure: false,
    };

    manager.createBackup(policy);
    manager.createBackup(policy);

    const points = manager.getRecoveryPoints();
    expect(points).toHaveLength(2);
    expect(points[0].verified).toBe(true);
  });

  it('should filter recovery points by source', () => {
    const policy1 = {
      name: 'db', source: 'postgresql://db', schedule: { frequency: 'daily' as const },
      type: 'full' as const, retentionDays: 7, destination: 's3://test',
      encryption: false, compression: false, verifyAfterBackup: false, notifyOnFailure: false,
    };
    const policy2 = { ...policy1, name: 'redis', source: 'redis://cache' };

    manager.createBackup(policy1);
    manager.createBackup(policy2);

    const dbPoints = manager.getRecoveryPoints('postgresql://db');
    expect(dbPoints).toHaveLength(1);
  });

  it('should report backup stats', () => {
    const policy = {
      name: 'test', source: 'db', schedule: { frequency: 'daily' as const },
      type: 'full' as const, retentionDays: 7, destination: 's3://test',
      encryption: false, compression: false, verifyAfterBackup: false, notifyOnFailure: false,
    };

    manager.createBackup(policy);
    manager.createBackup(policy);

    const stats = manager.getStats();
    expect(stats.total).toBe(2);
    expect(stats.totalSizeBytes).toBeGreaterThan(0);
  });
});

describe('BenchmarkSuite', () => {
  let suite: BenchmarkSuite;

  beforeEach(() => {
    suite = new BenchmarkSuite();
  });

  it('should run benchmarks', () => {
    const result = suite.run('API Performance', [
      {
        name: 'GET /api/users',
        endpoint: '/api/users',
        method: 'GET',
        concurrency: 50,
        duration: 30,
        threshold: { maxLatencyMs: 200, maxErrorRate: 0.05, minRps: 100 },
      },
      {
        name: 'POST /api/data',
        endpoint: '/api/data',
        method: 'POST',
        concurrency: 20,
        duration: 30,
        threshold: { maxLatencyMs: 500, maxErrorRate: 0.05, minRps: 50 },
      },
    ]);

    expect(result.id).toBeDefined();
    expect(result.status).toBe('completed');
    expect(result.tests).toHaveLength(2);
    expect(result.metrics.requestsPerSecond).toBeGreaterThan(0);
    expect(result.metrics.totalRequests).toBeGreaterThan(0);
  });

  it('should track benchmark history', () => {
    suite.run('Test 1', [
      { name: 'T1', endpoint: '/t1', method: 'GET', concurrency: 10, duration: 10, threshold: { maxLatencyMs: 500, maxErrorRate: 0.1, minRps: 10 } },
    ]);
    suite.run('Test 2', [
      { name: 'T2', endpoint: '/t2', method: 'GET', concurrency: 10, duration: 10, threshold: { maxLatencyMs: 500, maxErrorRate: 0.1, minRps: 10 } },
    ]);

    const history = suite.getHistory();
    expect(history).toHaveLength(2);
  });

  it('should compare benchmark results', () => {
    const r1 = suite.run('Before', [
      { name: 'T', endpoint: '/t', method: 'GET', concurrency: 10, duration: 10, threshold: { maxLatencyMs: 500, maxErrorRate: 0.1, minRps: 10 } },
    ]);
    const r2 = suite.run('After', [
      { name: 'T', endpoint: '/t', method: 'GET', concurrency: 10, duration: 10, threshold: { maxLatencyMs: 500, maxErrorRate: 0.1, minRps: 10 } },
    ]);

    const comparison = suite.compare(r1.id, r2.id);
    expect(comparison).toBeDefined();
    expect(comparison!.improvement).toBeDefined();
    expect(comparison!.regression).toBeDefined();
  });
});

describe('DeploymentChecklistGenerator', () => {
  it('should generate a complete checklist', () => {
    const checklist = DeploymentChecklistGenerator.generate('production', '2.0.0');

    expect(checklist.id).toBeDefined();
    expect(checklist.environment).toBe('production');
    expect(checklist.version).toBe('2.0.0');
    expect(checklist.preDeployChecks.length).toBeGreaterThan(5);
    expect(checklist.deploySteps.length).toBeGreaterThan(3);
    expect(checklist.postDeployChecks.length).toBeGreaterThan(3);
    expect(checklist.rollbackPlan.steps.length).toBeGreaterThan(3);
  });

  it('should include required checks', () => {
    const checklist = DeploymentChecklistGenerator.generate('production', '1.0.0');
    const requiredPre = checklist.preDeployChecks.filter(c => c.required);
    expect(requiredPre.length).toBeGreaterThan(5);
  });

  it('should include rollback triggers', () => {
    const checklist = DeploymentChecklistGenerator.generate('production', '1.0.0');
    expect(checklist.rollbackPlan.rollbackTriggers.length).toBeGreaterThan(0);
    expect(checklist.rollbackPlan.autoRollbackOnFailure).toBe(true);
  });

  it('should generate incident playbooks', () => {
    const playbooks = DeploymentChecklistGenerator.generatePlaybooks();
    expect(playbooks.length).toBeGreaterThanOrEqual(3);

    const p1 = playbooks.find(p => p.severity === 'P1');
    expect(p1).toBeDefined();
    expect(p1!.steps.length).toBeGreaterThan(3);
    expect(p1!.escalation.length).toBeGreaterThan(0);
  });
});

describe('OperationsSystem', () => {
  let ops: OperationsSystem;

  beforeEach(() => {
    ops = new OperationsSystem();
  });

  it('should assess production readiness', () => {
    const assessment = ops.assessProductionReadiness();
    expect(assessment.score).toBeGreaterThan(0);
    expect(assessment.maxScore).toBeGreaterThan(0);
    expect(assessment.percentage).toBeGreaterThanOrEqual(90);
    expect(assessment.categories.length).toBeGreaterThanOrEqual(5);
  });

  it('should generate deployment checklist', () => {
    const checklist = ops.generateChecklist('production', '2.0.0');
    expect(checklist).toBeDefined();
    expect(checklist.preDeployChecks.length).toBeGreaterThan(0);
  });

  it('should generate playbooks', () => {
    const playbooks = ops.generatePlaybooks();
    expect(playbooks.length).toBeGreaterThan(0);
  });

  it('should have backup and benchmark subsystems', () => {
    expect(ops.backups).toBeDefined();
    expect(ops.benchmarks).toBeDefined();
  });
});