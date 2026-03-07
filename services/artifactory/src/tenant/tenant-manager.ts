/**
 * THE ARTIFACTORY — Tenant Manager
 * Multi-tenant provisioning, lifecycle, and isolation.
 * Part of the Trancendos Ecosystem.
 *
 * Manages tenant creation, suspension, quota enforcement,
 * and Keycloak realm integration for complete tenant isolation.
 *
 * @module tenant/tenant-manager
 * @version 1.0.0
 */

import { z } from 'zod';
import { createModuleLogger } from '../utils/logger.js';

const logger = createModuleLogger('tenant-manager');

// ─── Schemas ─────────────────────────────────────────────────────────

export const TenantPlanSchema = z.enum([
  'free',
  'starter',
  'professional',
  'enterprise',
  'unlimited',
]);

export type TenantPlan = z.infer<typeof TenantPlanSchema>;

export const TenantStatusSchema = z.enum([
  'provisioning',
  'active',
  'suspended',
  'deactivated',
  'migrating',
]);

export type TenantStatus = z.infer<typeof TenantStatusSchema>;

export const CreateTenantRequestSchema = z.object({
  name: z.string().min(2).max(128),
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/, {
    message: 'Slug must be lowercase alphanumeric with hyphens, 3-64 chars',
  }),
  plan: TenantPlanSchema.default('free'),
  ownerEmail: z.string().email(),
  ownerName: z.string().min(1).max(256),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type CreateTenantRequest = z.infer<typeof CreateTenantRequestSchema>;

export const UpdateTenantRequestSchema = z.object({
  name: z.string().min(2).max(128).optional(),
  plan: TenantPlanSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type UpdateTenantRequest = z.infer<typeof UpdateTenantRequestSchema>;

export const TenantQuotaSchema = z.object({
  maxStorageBytes: z.number().int().positive(),
  maxArtifacts: z.number().int().positive(),
  maxRepositories: z.number().int().positive(),
  maxUsersPerTenant: z.number().int().positive(),
  maxBandwidthBytesPerMonth: z.number().int().positive(),
  maxRequestsPerMinute: z.number().int().positive(),
});

export type TenantQuota = z.infer<typeof TenantQuotaSchema>;

export const TenantUsageSchema = z.object({
  storageBytes: z.number().int().nonnegative(),
  artifactCount: z.number().int().nonnegative(),
  repositoryCount: z.number().int().nonnegative(),
  userCount: z.number().int().nonnegative(),
  bandwidthBytesThisMonth: z.number().int().nonnegative(),
  requestsThisMinute: z.number().int().nonnegative(),
});

export type TenantUsage = z.infer<typeof TenantUsageSchema>;

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan: TenantPlan;
  status: TenantStatus;
  ownerEmail: string;
  ownerName: string;
  keycloakRealmId: string | null;
  quota: TenantQuota;
  usage: TenantUsage;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  suspendedAt: string | null;
  suspendedReason: string | null;
}

// ─── Plan Quotas ─────────────────────────────────────────────────────

const PLAN_QUOTAS: Record<TenantPlan, TenantQuota> = {
  free: {
    maxStorageBytes: 1 * 1024 * 1024 * 1024,        // 1 GB
    maxArtifacts: 500,
    maxRepositories: 5,
    maxUsersPerTenant: 3,
    maxBandwidthBytesPerMonth: 5 * 1024 * 1024 * 1024,  // 5 GB
    maxRequestsPerMinute: 60,
  },
  starter: {
    maxStorageBytes: 10 * 1024 * 1024 * 1024,       // 10 GB
    maxArtifacts: 5_000,
    maxRepositories: 25,
    maxUsersPerTenant: 10,
    maxBandwidthBytesPerMonth: 50 * 1024 * 1024 * 1024, // 50 GB
    maxRequestsPerMinute: 300,
  },
  professional: {
    maxStorageBytes: 100 * 1024 * 1024 * 1024,      // 100 GB
    maxArtifacts: 50_000,
    maxRepositories: 100,
    maxUsersPerTenant: 50,
    maxBandwidthBytesPerMonth: 500 * 1024 * 1024 * 1024, // 500 GB
    maxRequestsPerMinute: 1_000,
  },
  enterprise: {
    maxStorageBytes: 1024 * 1024 * 1024 * 1024,     // 1 TB
    maxArtifacts: 500_000,
    maxRepositories: 1_000,
    maxUsersPerTenant: 500,
    maxBandwidthBytesPerMonth: 5 * 1024 * 1024 * 1024 * 1024, // 5 TB
    maxRequestsPerMinute: 10_000,
  },
  unlimited: {
    maxStorageBytes: Number.MAX_SAFE_INTEGER,
    maxArtifacts: Number.MAX_SAFE_INTEGER,
    maxRepositories: Number.MAX_SAFE_INTEGER,
    maxUsersPerTenant: Number.MAX_SAFE_INTEGER,
    maxBandwidthBytesPerMonth: Number.MAX_SAFE_INTEGER,
    maxRequestsPerMinute: Number.MAX_SAFE_INTEGER,
  },
};

// ─── Interfaces ──────────────────────────────────────────────────────

export interface TenantDatabase {
  createTenant(tenant: Omit<Tenant, 'createdAt' | 'updatedAt'>): Promise<Tenant>;
  getTenant(id: string): Promise<Tenant | null>;
  getTenantBySlug(slug: string): Promise<Tenant | null>;
  updateTenant(id: string, updates: Partial<Tenant>): Promise<Tenant>;
  listTenants(options: {
    status?: TenantStatus;
    plan?: TenantPlan;
    limit: number;
    offset: number;
  }): Promise<{ tenants: Tenant[]; total: number }>;
  deleteTenant(id: string): Promise<void>;
  updateUsage(id: string, usage: Partial<TenantUsage>): Promise<void>;
  getUsage(id: string): Promise<TenantUsage>;
}

export interface KeycloakAdmin {
  createRealm(realmName: string, displayName: string): Promise<string>;
  deleteRealm(realmId: string): Promise<void>;
  disableRealm(realmId: string): Promise<void>;
  enableRealm(realmId: string): Promise<void>;
  createClient(realmId: string, clientId: string, redirectUris: string[]): Promise<string>;
  createRole(realmId: string, roleName: string, description: string): Promise<void>;
}

export interface TenantEventEmitter {
  emit(event: string, data: Record<string, unknown>): Promise<void>;
}

export interface TenantManagerDependencies {
  database: TenantDatabase;
  keycloak?: KeycloakAdmin;
  eventEmitter?: TenantEventEmitter;
}

// ─── Tenant Manager ──────────────────────────────────────────────────

export class TenantManager {
  private readonly db: TenantDatabase;
  private readonly keycloak?: KeycloakAdmin;
  private readonly events?: TenantEventEmitter;

  constructor(deps: TenantManagerDependencies) {
    this.db = deps.database;
    this.keycloak = deps.keycloak;
    this.events = deps.eventEmitter;
  }

  /**
   * Provision a new tenant with Keycloak realm and default repositories.
   */
  async createTenant(request: CreateTenantRequest): Promise<Tenant> {
    const validated = CreateTenantRequestSchema.parse(request);

    // Check for slug uniqueness
    const existing = await this.db.getTenantBySlug(validated.slug);
    if (existing) {
      throw new TenantConflictError(
        `Tenant with slug "${validated.slug}" already exists`
      );
    }

    const tenantId = crypto.randomUUID();
    const quota = PLAN_QUOTAS[validated.plan];

    logger.info(
      { tenantId, slug: validated.slug, plan: validated.plan },
      'Provisioning new tenant'
    );

    // Create Keycloak realm if available
    let keycloakRealmId: string | null = null;
    if (this.keycloak) {
      try {
        keycloakRealmId = await this.keycloak.createRealm(
          `artifactory-${validated.slug}`,
          `${validated.name} — Artifactory`
        );

        // Create default roles
        await this.keycloak.createRole(keycloakRealmId, 'artifact-reader', 'Can read artifacts');
        await this.keycloak.createRole(keycloakRealmId, 'artifact-publisher', 'Can publish artifacts');
        await this.keycloak.createRole(keycloakRealmId, 'artifact-admin', 'Full artifact management');
        await this.keycloak.createRole(keycloakRealmId, 'tenant-admin', 'Tenant administration');

        // Create default client
        await this.keycloak.createClient(
          keycloakRealmId,
          `artifactory-${validated.slug}-client`,
          [`https://${validated.slug}.artifactory.trancendos.com/*`]
        );

        logger.info(
          { tenantId, keycloakRealmId },
          'Keycloak realm provisioned'
        );
      } catch (err) {
        logger.error(
          { err, tenantId },
          'Failed to provision Keycloak realm — tenant created without SSO'
        );
      }
    }

    const tenant = await this.db.createTenant({
      id: tenantId,
      name: validated.name,
      slug: validated.slug,
      plan: validated.plan,
      status: 'active',
      ownerEmail: validated.ownerEmail,
      ownerName: validated.ownerName,
      keycloakRealmId,
      quota,
      usage: {
        storageBytes: 0,
        artifactCount: 0,
        repositoryCount: 0,
        userCount: 1,
        bandwidthBytesThisMonth: 0,
        requestsThisMinute: 0,
      },
      metadata: validated.metadata ?? {},
      suspendedAt: null,
      suspendedReason: null,
    });

    // Emit provisioning event
    if (this.events) {
      await this.events.emit('tenant.created', {
        tenantId: tenant.id,
        slug: tenant.slug,
        plan: tenant.plan,
        ownerEmail: tenant.ownerEmail,
        timestamp: new Date().toISOString(),
      });
    }

    logger.info(
      { tenantId: tenant.id, slug: tenant.slug, plan: tenant.plan },
      'Tenant provisioned successfully'
    );

    return tenant;
  }

  /**
   * Get a tenant by ID.
   */
  async getTenant(id: string): Promise<Tenant> {
    const tenant = await this.db.getTenant(id);
    if (!tenant) {
      throw new TenantNotFoundError(`Tenant not found: ${id}`);
    }
    return tenant;
  }

  /**
   * Get a tenant by slug.
   */
  async getTenantBySlug(slug: string): Promise<Tenant> {
    const tenant = await this.db.getTenantBySlug(slug);
    if (!tenant) {
      throw new TenantNotFoundError(`Tenant not found: ${slug}`);
    }
    return tenant;
  }

  /**
   * Update tenant details.
   */
  async updateTenant(id: string, request: UpdateTenantRequest): Promise<Tenant> {
    const validated = UpdateTenantRequestSchema.parse(request);
    const existing = await this.getTenant(id);

    const updates: Partial<Tenant> = {};

    if (validated.name) updates.name = validated.name;
    if (validated.metadata) updates.metadata = { ...existing.metadata, ...validated.metadata };

    // Plan change triggers quota update
    if (validated.plan && validated.plan !== existing.plan) {
      updates.plan = validated.plan;
      updates.quota = PLAN_QUOTAS[validated.plan];

      logger.info(
        { tenantId: id, oldPlan: existing.plan, newPlan: validated.plan },
        'Tenant plan changed'
      );

      if (this.events) {
        await this.events.emit('tenant.plan-changed', {
          tenantId: id,
          oldPlan: existing.plan,
          newPlan: validated.plan,
          timestamp: new Date().toISOString(),
        });
      }
    }

    const updated = await this.db.updateTenant(id, updates);

    logger.info({ tenantId: id }, 'Tenant updated');
    return updated;
  }

  /**
   * Suspend a tenant — blocks all artifact operations.
   */
  async suspendTenant(id: string, reason: string, actor: string): Promise<Tenant> {
    const tenant = await this.getTenant(id);

    if (tenant.status === 'suspended') {
      throw new TenantStateError(`Tenant "${id}" is already suspended`);
    }

    if (tenant.status === 'deactivated') {
      throw new TenantStateError(`Cannot suspend deactivated tenant "${id}"`);
    }

    // Disable Keycloak realm
    if (this.keycloak && tenant.keycloakRealmId) {
      try {
        await this.keycloak.disableRealm(tenant.keycloakRealmId);
      } catch (err) {
        logger.error({ err, tenantId: id }, 'Failed to disable Keycloak realm');
      }
    }

    const updated = await this.db.updateTenant(id, {
      status: 'suspended',
      suspendedAt: new Date().toISOString(),
      suspendedReason: reason,
    });

    if (this.events) {
      await this.events.emit('tenant.suspended', {
        tenantId: id,
        reason,
        actor,
        timestamp: new Date().toISOString(),
      });
    }

    logger.warn({ tenantId: id, reason, actor }, 'Tenant suspended');
    return updated;
  }

  /**
   * Reactivate a suspended tenant.
   */
  async reactivateTenant(id: string, actor: string): Promise<Tenant> {
    const tenant = await this.getTenant(id);

    if (tenant.status !== 'suspended') {
      throw new TenantStateError(
        `Cannot reactivate tenant "${id}" — current status: ${tenant.status}`
      );
    }

    // Re-enable Keycloak realm
    if (this.keycloak && tenant.keycloakRealmId) {
      try {
        await this.keycloak.enableRealm(tenant.keycloakRealmId);
      } catch (err) {
        logger.error({ err, tenantId: id }, 'Failed to re-enable Keycloak realm');
      }
    }

    const updated = await this.db.updateTenant(id, {
      status: 'active',
      suspendedAt: null,
      suspendedReason: null,
    });

    if (this.events) {
      await this.events.emit('tenant.reactivated', {
        tenantId: id,
        actor,
        timestamp: new Date().toISOString(),
      });
    }

    logger.info({ tenantId: id, actor }, 'Tenant reactivated');
    return updated;
  }

  /**
   * Deactivate a tenant permanently — marks for deletion.
   */
  async deactivateTenant(id: string, actor: string): Promise<Tenant> {
    const tenant = await this.getTenant(id);

    if (tenant.status === 'deactivated') {
      throw new TenantStateError(`Tenant "${id}" is already deactivated`);
    }

    // Disable Keycloak realm
    if (this.keycloak && tenant.keycloakRealmId) {
      try {
        await this.keycloak.disableRealm(tenant.keycloakRealmId);
      } catch (err) {
        logger.error({ err, tenantId: id }, 'Failed to disable Keycloak realm');
      }
    }

    const updated = await this.db.updateTenant(id, {
      status: 'deactivated',
      suspendedAt: new Date().toISOString(),
      suspendedReason: `Deactivated by ${actor}`,
    });

    if (this.events) {
      await this.events.emit('tenant.deactivated', {
        tenantId: id,
        actor,
        timestamp: new Date().toISOString(),
      });
    }

    logger.warn({ tenantId: id, actor }, 'Tenant deactivated');
    return updated;
  }

  /**
   * List tenants with filtering and pagination.
   */
  async listTenants(options: {
    status?: TenantStatus;
    plan?: TenantPlan;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ tenants: Tenant[]; total: number }> {
    return this.db.listTenants({
      status: options.status,
      plan: options.plan,
      limit: options.limit ?? 50,
      offset: options.offset ?? 0,
    });
  }

  /**
   * Check if a tenant operation is within quota limits.
   */
  async checkQuota(
    tenantId: string,
    operation: 'publish' | 'create-repo' | 'add-user',
    additionalBytes?: number
  ): Promise<{ allowed: boolean; reason?: string; usage: TenantUsage; quota: TenantQuota }> {
    const tenant = await this.getTenant(tenantId);

    if (tenant.status !== 'active') {
      return {
        allowed: false,
        reason: `Tenant is ${tenant.status}`,
        usage: tenant.usage,
        quota: tenant.quota,
      };
    }

    const usage = await this.db.getUsage(tenantId);

    switch (operation) {
      case 'publish': {
        if (usage.artifactCount >= tenant.quota.maxArtifacts) {
          return {
            allowed: false,
            reason: `Artifact limit reached: ${usage.artifactCount}/${tenant.quota.maxArtifacts}`,
            usage,
            quota: tenant.quota,
          };
        }
        if (additionalBytes && (usage.storageBytes + additionalBytes) > tenant.quota.maxStorageBytes) {
          return {
            allowed: false,
            reason: `Storage limit would be exceeded: ${usage.storageBytes + additionalBytes}/${tenant.quota.maxStorageBytes} bytes`,
            usage,
            quota: tenant.quota,
          };
        }
        break;
      }
      case 'create-repo': {
        if (usage.repositoryCount >= tenant.quota.maxRepositories) {
          return {
            allowed: false,
            reason: `Repository limit reached: ${usage.repositoryCount}/${tenant.quota.maxRepositories}`,
            usage,
            quota: tenant.quota,
          };
        }
        break;
      }
      case 'add-user': {
        if (usage.userCount >= tenant.quota.maxUsersPerTenant) {
          return {
            allowed: false,
            reason: `User limit reached: ${usage.userCount}/${tenant.quota.maxUsersPerTenant}`,
            usage,
            quota: tenant.quota,
          };
        }
        break;
      }
    }

    return { allowed: true, usage, quota: tenant.quota };
  }

  /**
   * Record usage increment for a tenant.
   */
  async recordUsage(
    tenantId: string,
    increment: Partial<TenantUsage>
  ): Promise<void> {
    await this.db.updateUsage(tenantId, increment);
  }

  /**
   * Get quota utilization percentages for a tenant.
   */
  async getUtilization(tenantId: string): Promise<Record<string, number>> {
    const tenant = await this.getTenant(tenantId);
    const usage = await this.db.getUsage(tenantId);

    return {
      storage: (usage.storageBytes / tenant.quota.maxStorageBytes) * 100,
      artifacts: (usage.artifactCount / tenant.quota.maxArtifacts) * 100,
      repositories: (usage.repositoryCount / tenant.quota.maxRepositories) * 100,
      users: (usage.userCount / tenant.quota.maxUsersPerTenant) * 100,
      bandwidth: (usage.bandwidthBytesThisMonth / tenant.quota.maxBandwidthBytesPerMonth) * 100,
    };
  }

  /**
   * Get the plan quota configuration for a given plan.
   */
  getPlanQuota(plan: TenantPlan): TenantQuota {
    return { ...PLAN_QUOTAS[plan] };
  }
}

// ─── Errors ──────────────────────────────────────────────────────────

export class TenantNotFoundError extends Error {
  public readonly statusCode = 404;
  constructor(message: string) {
    super(message);
    this.name = 'TenantNotFoundError';
  }
}

export class TenantConflictError extends Error {
  public readonly statusCode = 409;
  constructor(message: string) {
    super(message);
    this.name = 'TenantConflictError';
  }
}

export class TenantStateError extends Error {
  public readonly statusCode = 400;
  constructor(message: string) {
    super(message);
    this.name = 'TenantStateError';
  }
}

export class TenantQuotaExceededError extends Error {
  public readonly statusCode = 429;
  constructor(message: string) {
    super(message);
    this.name = 'TenantQuotaExceededError';
  }
}