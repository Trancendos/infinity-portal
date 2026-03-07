/**
 * Policy Engine — Compliance as Code
 * 
 * Evaluates artifacts against machine-readable policies.
 * Every publish, promote, and access operation is evaluated.
 * Non-compliant artifacts are quarantined, not silently rejected.
 */

import { createModuleLogger } from '../utils/logger.js';
import { z } from 'zod';

const log = createModuleLogger('security:policy');

// ─── Policy Types ────────────────────────────────────────────────────────────

export const PolicyRuleSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('vulnerability'),
    maxCritical: z.number().int().nonnegative().default(0),
    maxHigh: z.number().int().nonnegative().default(5),
    maxMedium: z.number().int().nonnegative().default(20),
    cveSlaHours: z.object({
      critical: z.number().default(24),
      high: z.number().default(72),
      medium: z.number().default(168),
    }).default({}),
  }),
  z.object({
    type: z.literal('license'),
    allowed: z.array(z.string()).default([]),
    denied: z.array(z.string()).default([]),
    requireSpdx: z.boolean().default(true),
    blockCopyleft: z.boolean().default(false),
  }),
  z.object({
    type: z.literal('size'),
    maxArtifactSizeBytes: z.number().int().positive().default(524288000), // 500MB
    maxRepositorySizeBytes: z.number().int().positive().default(10737418240), // 10GB
  }),
  z.object({
    type: z.literal('promotion'),
    requireScan: z.boolean().default(true),
    requireSign: z.boolean().default(false),
    requireApproval: z.boolean().default(false),
    minApprovals: z.number().int().nonnegative().default(1),
    requireCleanScan: z.boolean().default(true),
  }),
  z.object({
    type: z.literal('retention'),
    maxAgeDays: z.number().int().positive().default(365),
    minVersionsToKeep: z.number().int().positive().default(5),
    archiveAfterDays: z.number().int().positive().default(180),
  }),
  z.object({
    type: z.literal('access'),
    allowedRoles: z.array(z.string()).default(['admin', 'developer', 'ci-cd']),
    denyAnonymous: z.boolean().default(true),
    requireMfa: z.boolean().default(false),
  }),
]);

export type PolicyRule = z.infer<typeof PolicyRuleSchema>;

export interface PolicyDefinition {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  priority: number;
  scope: {
    tenantId?: string;
    repositoryId?: string;
    artifactType?: string;
    environment?: string;
  };
  rules: PolicyRule[];
  actions: {
    quarantine: boolean;
    block: boolean;
    notify: boolean;
    escalate: boolean;
  };
}

export interface PolicyEvaluation {
  policyId: string;
  policyName: string;
  passed: boolean;
  violations: PolicyViolation[];
  timestamp: string;
}

export interface PolicyViolation {
  rule: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  details: Record<string, unknown>;
  action: 'quarantine' | 'block' | 'notify' | 'escalate';
}

// ─── Policy Engine ───────────────────────────────────────────────────────────

export class PolicyEngine {
  private policies: Map<string, PolicyDefinition> = new Map();

  constructor() {
    this.registerDefaultPolicies();
    log.info('Policy engine initialised');
  }

  /**
   * Register a policy.
   */
  registerPolicy(policy: PolicyDefinition): void {
    this.policies.set(policy.id, policy);
    log.info({ policyId: policy.id, name: policy.name }, 'Policy registered');
  }

  /**
   * Remove a policy.
   */
  removePolicy(policyId: string): void {
    this.policies.delete(policyId);
    log.info({ policyId }, 'Policy removed');
  }

  /**
   * Evaluate an artifact against all applicable policies.
   */
  evaluatePublish(context: {
    artifactType: string;
    size: number;
    tenantId: string;
    repositoryId: string;
    scanResults?: Array<{ summary: { critical: number; high: number; medium: number } }>;
    licenses?: Array<{ spdxId: string; compatible: boolean; copyleft: boolean }>;
  }): PolicyEvaluation[] {
    const evaluations: PolicyEvaluation[] = [];
    const applicablePolicies = this.getApplicablePolicies(context.tenantId, context.repositoryId, context.artifactType);

    for (const policy of applicablePolicies) {
      const violations: PolicyViolation[] = [];

      for (const rule of policy.rules) {
        switch (rule.type) {
          case 'size':
            if (context.size > rule.maxArtifactSizeBytes) {
              violations.push({
                rule: 'size',
                severity: 'critical',
                message: `Artifact size ${context.size} exceeds maximum ${rule.maxArtifactSizeBytes}`,
                details: { actualSize: context.size, maxSize: rule.maxArtifactSizeBytes },
                action: policy.actions.block ? 'block' : 'notify',
              });
            }
            break;

          case 'vulnerability':
            if (context.scanResults) {
              for (const scan of context.scanResults) {
                if (scan.summary.critical > rule.maxCritical) {
                  violations.push({
                    rule: 'vulnerability',
                    severity: 'critical',
                    message: `${scan.summary.critical} critical vulnerabilities (max: ${rule.maxCritical})`,
                    details: { critical: scan.summary.critical, maxCritical: rule.maxCritical },
                    action: policy.actions.quarantine ? 'quarantine' : 'notify',
                  });
                }
                if (scan.summary.high > rule.maxHigh) {
                  violations.push({
                    rule: 'vulnerability',
                    severity: 'warning',
                    message: `${scan.summary.high} high vulnerabilities (max: ${rule.maxHigh})`,
                    details: { high: scan.summary.high, maxHigh: rule.maxHigh },
                    action: policy.actions.quarantine ? 'quarantine' : 'notify',
                  });
                }
              }
            }
            break;

          case 'license':
            if (context.licenses) {
              for (const license of context.licenses) {
                if (rule.denied.includes(license.spdxId)) {
                  violations.push({
                    rule: 'license',
                    severity: 'critical',
                    message: `Denied license detected: ${license.spdxId}`,
                    details: { license: license.spdxId },
                    action: policy.actions.quarantine ? 'quarantine' : 'block',
                  });
                }
                if (rule.blockCopyleft && license.copyleft) {
                  violations.push({
                    rule: 'license',
                    severity: 'warning',
                    message: `Copyleft license detected: ${license.spdxId}`,
                    details: { license: license.spdxId },
                    action: 'notify',
                  });
                }
              }
            }
            break;

          case 'access':
            // Access policies evaluated at middleware layer
            break;

          case 'promotion':
            // Promotion policies evaluated during promote operation
            break;

          case 'retention':
            // Retention policies evaluated by lifecycle manager
            break;
        }
      }

      evaluations.push({
        policyId: policy.id,
        policyName: policy.name,
        passed: violations.length === 0,
        violations,
        timestamp: new Date().toISOString(),
      });
    }

    const totalViolations = evaluations.reduce((sum, e) => sum + e.violations.length, 0);
    if (totalViolations > 0) {
      log.warn({
        tenantId: context.tenantId,
        artifactType: context.artifactType,
        totalViolations,
        policies: evaluations.filter(e => !e.passed).map(e => e.policyName),
      }, 'Policy violations detected');
    }

    return evaluations;
  }

  /**
   * Evaluate promotion request against applicable policies.
   */
  evaluatePromotion(context: {
    tenantId: string;
    repositoryId: string;
    artifactType: string;
    targetEnvironment: string;
    scanned: boolean;
    signed: boolean;
    scanStatus: string;
  }): PolicyEvaluation[] {
    const evaluations: PolicyEvaluation[] = [];
    const applicablePolicies = this.getApplicablePolicies(context.tenantId, context.repositoryId, context.artifactType);

    for (const policy of applicablePolicies) {
      const violations: PolicyViolation[] = [];

      for (const rule of policy.rules) {
        if (rule.type === 'promotion') {
          if (rule.requireScan && !context.scanned) {
            violations.push({
              rule: 'promotion',
              severity: 'critical',
              message: 'Artifact must be scanned before promotion',
              details: { scanned: context.scanned },
              action: 'block',
            });
          }
          if (rule.requireSign && !context.signed) {
            violations.push({
              rule: 'promotion',
              severity: 'critical',
              message: 'Artifact must be signed before promotion',
              details: { signed: context.signed },
              action: 'block',
            });
          }
          if (rule.requireCleanScan && context.scanStatus !== 'clean') {
            violations.push({
              rule: 'promotion',
              severity: 'critical',
              message: `Artifact scan status must be clean for promotion (current: ${context.scanStatus})`,
              details: { scanStatus: context.scanStatus },
              action: 'block',
            });
          }
        }
      }

      evaluations.push({
        policyId: policy.id,
        policyName: policy.name,
        passed: violations.length === 0,
        violations,
        timestamp: new Date().toISOString(),
      });
    }

    return evaluations;
  }

  /**
   * Get all policies applicable to a given scope.
   */
  private getApplicablePolicies(tenantId: string, repositoryId: string, artifactType: string): PolicyDefinition[] {
    return Array.from(this.policies.values())
      .filter(p => p.enabled)
      .filter(p => {
        if (p.scope.tenantId && p.scope.tenantId !== tenantId) return false;
        if (p.scope.repositoryId && p.scope.repositoryId !== repositoryId) return false;
        if (p.scope.artifactType && p.scope.artifactType !== artifactType) return false;
        return true;
      })
      .sort((a, b) => b.priority - a.priority);
  }

  /**
   * Register default ecosystem-wide policies.
   */
  private registerDefaultPolicies(): void {
    this.registerPolicy({
      id: 'default-vulnerability',
      name: 'Default Vulnerability Policy',
      description: 'Quarantine artifacts with critical vulnerabilities',
      enabled: true,
      priority: 100,
      scope: {},
      rules: [{
        type: 'vulnerability',
        maxCritical: 0,
        maxHigh: 5,
        maxMedium: 20,
        cveSlaHours: { critical: 24, high: 72, medium: 168 },
      }],
      actions: { quarantine: true, block: false, notify: true, escalate: true },
    });

    this.registerPolicy({
      id: 'default-license',
      name: 'Default License Policy',
      description: 'Block incompatible licenses',
      enabled: true,
      priority: 90,
      scope: {},
      rules: [{
        type: 'license',
        allowed: ['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'MPL-2.0', 'Unlicense', 'CC0-1.0'],
        denied: ['GPL-2.0', 'GPL-3.0', 'AGPL-3.0', 'SSPL-1.0'],
        requireSpdx: true,
        blockCopyleft: false,
      }],
      actions: { quarantine: true, block: false, notify: true, escalate: false },
    });

    this.registerPolicy({
      id: 'default-size',
      name: 'Default Size Policy',
      description: 'Limit artifact sizes',
      enabled: true,
      priority: 80,
      scope: {},
      rules: [{
        type: 'size',
        maxArtifactSizeBytes: 524288000,
        maxRepositorySizeBytes: 10737418240,
      }],
      actions: { quarantine: false, block: true, notify: true, escalate: false },
    });

    this.registerPolicy({
      id: 'default-promotion',
      name: 'Default Promotion Policy',
      description: 'Require scan and clean status for production promotion',
      enabled: true,
      priority: 100,
      scope: {},
      rules: [{
        type: 'promotion',
        requireScan: true,
        requireSign: false,
        requireApproval: false,
        minApprovals: 1,
        requireCleanScan: true,
      }],
      actions: { quarantine: false, block: true, notify: true, escalate: false },
    });

    log.info({ policyCount: this.policies.size }, 'Default policies registered');
  }

  /**
   * List all registered policies.
   */
  listPolicies(): PolicyDefinition[] {
    return Array.from(this.policies.values());
  }

  /**
   * Get a specific policy by ID.
   */
  getPolicy(policyId: string): PolicyDefinition | undefined {
    return this.policies.get(policyId);
  }
}