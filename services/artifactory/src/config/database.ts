/**
 * PostgreSQL Database Schema — Drizzle ORM
 * 
 * Drizzle is the ecosystem standard (used in trancendos-ecosystem).
 * SQL-first, full type safety, migration system included.
 * 
 * Row-level security patterns for multi-tenant isolation.
 */

import { pgTable, uuid, varchar, text, integer, bigint, boolean, timestamp, jsonb, pgEnum, index, uniqueIndex } from 'drizzle-orm/pg-core';

// ─── Enums ───────────────────────────────────────────────────────────────────

export const artifactTypeEnum = pgEnum('artifact_type', [
  'npm', 'docker', 'generic', 'helm', 'terraform', 'pypi', 'wasm', 'docs', 'migration', 'config',
]);

export const storageTierEnum = pgEnum('storage_tier', ['hot', 'warm', 'cold']);

export const lifecycleEnvEnum = pgEnum('lifecycle_env', ['dev', 'staging', 'production', 'archived']);

export const repositoryTypeEnum = pgEnum('repository_type', ['local', 'remote', 'virtual']);

export const tenantStatusEnum = pgEnum('tenant_status', ['active', 'suspended', 'archived']);

export const scanStatusEnum = pgEnum('scan_status', ['pending', 'clean', 'warnings', 'quarantined', 'error']);

export const policyTypeEnum = pgEnum('policy_type', [
  'vulnerability', 'license', 'retention', 'promotion', 'access', 'size', 'rate-limit',
]);

// ─── Tenants ─────────────────────────────────────────────────────────────────

export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 256 }).notNull(),
  slug: varchar('slug', { length: 64 }).notNull().unique(),
  status: tenantStatusEnum('status').notNull().default('active'),
  maxStorageBytes: bigint('max_storage_bytes', { mode: 'number' }).notNull().default(10737418240),
  maxBandwidthBytes: bigint('max_bandwidth_bytes', { mode: 'number' }).notNull().default(107374182400),
  maxApiCallsPerHour: integer('max_api_calls_per_hour').notNull().default(10000),
  maxRepositories: integer('max_repositories').notNull().default(50),
  maxArtifacts: integer('max_artifacts').notNull().default(10000),
  usageStorageBytes: bigint('usage_storage_bytes', { mode: 'number' }).notNull().default(0),
  usageBandwidthBytes: bigint('usage_bandwidth_bytes', { mode: 'number' }).notNull().default(0),
  usageApiCalls: integer('usage_api_calls').notNull().default(0),
  keycloakRealmId: varchar('keycloak_realm_id', { length: 256 }),
  encryptionKeyId: varchar('encryption_key_id', { length: 256 }),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  slugIdx: uniqueIndex('tenants_slug_idx').on(table.slug),
  statusIdx: index('tenants_status_idx').on(table.status),
}));

// ─── Repositories ────────────────────────────────────────────────────────────

export const repositories = pgTable('repositories', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 256 }).notNull(),
  type: repositoryTypeEnum('type').notNull(),
  artifactType: artifactTypeEnum('artifact_type').notNull(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  description: text('description').default(''),
  upstreamUrl: varchar('upstream_url', { length: 1024 }),
  retentionDays: integer('retention_days').notNull().default(365),
  maxSizeBytes: bigint('max_size_bytes', { mode: 'number' }),
  allowOverwrite: boolean('allow_overwrite').notNull().default(false),
  scanOnIngest: boolean('scan_on_ingest').notNull().default(true),
  signRequired: boolean('sign_required').notNull().default(false),
  promotionRequired: boolean('promotion_required').notNull().default(false),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  tenantNameIdx: uniqueIndex('repos_tenant_name_idx').on(table.tenantId, table.name),
  typeIdx: index('repos_type_idx').on(table.type),
  artifactTypeIdx: index('repos_artifact_type_idx').on(table.artifactType),
}));

// ─── Artifacts ───────────────────────────────────────────────────────────────

export const artifacts = pgTable('artifacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  contentHash: varchar('content_hash', { length: 128 }).notNull(),
  blake3Hash: varchar('blake3_hash', { length: 128 }),
  type: artifactTypeEnum('type').notNull(),
  name: varchar('name', { length: 512 }).notNull(),
  version: varchar('version', { length: 128 }).notNull(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  repositoryId: uuid('repository_id').notNull().references(() => repositories.id, { onDelete: 'cascade' }),
  storageKey: varchar('storage_key', { length: 1024 }).notNull(),
  size: bigint('size', { mode: 'number' }).notNull(),
  mimeType: varchar('mime_type', { length: 256 }).default('application/octet-stream'),
  tags: jsonb('tags').default([]),
  metadata: jsonb('metadata').default({}),

  // Security
  scanned: boolean('scanned').notNull().default(false),
  scanStatus: scanStatusEnum('scan_status').default('pending'),
  scanResults: jsonb('scan_results').default([]),
  signed: boolean('signed').notNull().default(false),
  signatureRef: varchar('signature_ref', { length: 512 }),
  sbomRef: varchar('sbom_ref', { length: 512 }),
  provenance: jsonb('provenance'),
  quarantined: boolean('quarantined').notNull().default(false),
  quarantineReason: varchar('quarantine_reason', { length: 256 }),
  quarantinedAt: timestamp('quarantined_at', { withTimezone: true }),
  quarantinedBy: varchar('quarantined_by', { length: 256 }),
  licenses: jsonb('licenses').default([]),

  // Lifecycle
  environment: lifecycleEnvEnum('environment').notNull().default('dev'),
  storageTier: storageTierEnum('storage_tier').notNull().default('hot'),
  accessCount: integer('access_count').notNull().default(0),
  lastAccessedAt: timestamp('last_accessed_at', { withTimezone: true }),
  promotedAt: timestamp('promoted_at', { withTimezone: true }),
  retentionPolicy: varchar('retention_policy', { length: 256 }),

  // Publisher
  publisherUserId: varchar('publisher_user_id', { length: 256 }).notNull(),
  publisherUsername: varchar('publisher_username', { length: 256 }).notNull(),
  publisherMethod: varchar('publisher_method', { length: 32 }).notNull().default('api'),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  contentHashIdx: index('artifacts_content_hash_idx').on(table.contentHash),
  tenantRepoIdx: index('artifacts_tenant_repo_idx').on(table.tenantId, table.repositoryId),
  nameVersionIdx: uniqueIndex('artifacts_name_version_idx').on(table.tenantId, table.repositoryId, table.name, table.version),
  typeIdx: index('artifacts_type_idx').on(table.type),
  envIdx: index('artifacts_env_idx').on(table.environment),
  tierIdx: index('artifacts_tier_idx').on(table.storageTier),
  quarantineIdx: index('artifacts_quarantine_idx').on(table.quarantined),
  createdAtIdx: index('artifacts_created_at_idx').on(table.createdAt),
  lastAccessIdx: index('artifacts_last_access_idx').on(table.lastAccessedAt),
}));

// ─── Audit Log ───────────────────────────────────────────────────────────────

export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenants.id),
  artifactId: uuid('artifact_id').references(() => artifacts.id, { onDelete: 'set null' }),
  action: varchar('action', { length: 128 }).notNull(),
  actor: varchar('actor', { length: 256 }).notNull(),
  actorRole: varchar('actor_role', { length: 64 }),
  details: jsonb('details').default({}),
  ip: varchar('ip', { length: 45 }),
  userAgent: varchar('user_agent', { length: 512 }),
  traceId: varchar('trace_id', { length: 128 }),
  correlationId: varchar('correlation_id', { length: 128 }),
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  tenantIdx: index('audit_tenant_idx').on(table.tenantId),
  artifactIdx: index('audit_artifact_idx').on(table.artifactId),
  actionIdx: index('audit_action_idx').on(table.action),
  actorIdx: index('audit_actor_idx').on(table.actor),
  timestampIdx: index('audit_timestamp_idx').on(table.timestamp),
}));

// ─── Policies ────────────────────────────────────────────────────────────────

export const policies = pgTable('policies', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 256 }).notNull(),
  type: policyTypeEnum('type').notNull(),
  tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
  repositoryId: uuid('repository_id').references(() => repositories.id, { onDelete: 'cascade' }),
  enabled: boolean('enabled').notNull().default(true),
  priority: integer('priority').notNull().default(100),
  rules: jsonb('rules').notNull(),
  actions: jsonb('actions').default({ quarantine: false, block: false, notify: true, escalate: false }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  tenantIdx: index('policies_tenant_idx').on(table.tenantId),
  typeIdx: index('policies_type_idx').on(table.type),
  enabledIdx: index('policies_enabled_idx').on(table.enabled),
}));

// ─── Dependency Graph ────────────────────────────────────────────────────────

export const dependencyEdges = pgTable('dependency_edges', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourceArtifactId: uuid('source_artifact_id').notNull().references(() => artifacts.id, { onDelete: 'cascade' }),
  targetArtifactId: uuid('target_artifact_id').notNull().references(() => artifacts.id, { onDelete: 'cascade' }),
  dependencyType: varchar('dependency_type', { length: 64 }).notNull().default('depends-on'),
  versionConstraint: varchar('version_constraint', { length: 128 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  sourceIdx: index('deps_source_idx').on(table.sourceArtifactId),
  targetIdx: index('deps_target_idx').on(table.targetArtifactId),
  edgeIdx: uniqueIndex('deps_edge_idx').on(table.sourceArtifactId, table.targetArtifactId, table.dependencyType),
}));

// ─── Configuration Events (Event-Sourced Config Mesh) ────────────────────────

export const configEvents = pgTable('config_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: varchar('key', { length: 256 }).notNull(),
  value: jsonb('value').notNull(),
  previousValue: jsonb('previous_value'),
  changedBy: varchar('changed_by', { length: 256 }).notNull(),
  reason: text('reason'),
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  keyIdx: index('config_key_idx').on(table.key),
  timestampIdx: index('config_timestamp_idx').on(table.timestamp),
}));