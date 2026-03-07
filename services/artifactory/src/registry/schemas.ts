/**
 * Artifact Schemas — Zod-Validated Contracts
 * 
 * Every artifact in the Trancendos ecosystem conforms to these schemas.
 * Zod is the universal validation standard across all Trancendos services.
 * These schemas are the single source of truth for artifact structure.
 */

import { z } from 'zod';

// ─── Enums ───────────────────────────────────────────────────────────────────

export const ArtifactType = z.enum([
  'npm',
  'docker',
  'generic',
  'helm',
  'terraform',
  'pypi',
  'wasm',
  'docs',
  'migration',
  'config',
]);
export type ArtifactType = z.infer<typeof ArtifactType>;

export const StorageTier = z.enum(['hot', 'warm', 'cold']);
export type StorageTier = z.infer<typeof StorageTier>;

export const LifecycleEnvironment = z.enum(['dev', 'staging', 'production', 'archived']);
export type LifecycleEnvironment = z.infer<typeof LifecycleEnvironment>;

export const ScanSeverity = z.enum(['none', 'low', 'medium', 'high', 'critical']);
export type ScanSeverity = z.infer<typeof ScanSeverity>;

export const QuarantineReason = z.enum([
  'vulnerability_critical',
  'vulnerability_high',
  'license_incompatible',
  'secret_detected',
  'policy_violation',
  'anomaly_detected',
  'manual_hold',
]);
export type QuarantineReason = z.infer<typeof QuarantineReason>;

export const EventType = z.enum([
  'artifact.published',
  'artifact.promoted',
  'artifact.quarantined',
  'artifact.released',
  'artifact.deleted',
  'artifact.scanned',
  'artifact.signed',
  'artifact.archived',
  'artifact.downloaded',
  'tenant.created',
  'tenant.updated',
  'tenant.deleted',
  'policy.changed',
  'security.alert',
  'system.health',
  'system.config.changed',
]);
export type EventType = z.infer<typeof EventType>;

export const Role = z.enum([
  'admin',
  'developer',
  'ci-cd',
  'auditor',
  'tenant-admin',
  'security-officer',
  'external',
  'readonly',
]);
export type Role = z.infer<typeof Role>;

// ─── Scan Result ─────────────────────────────────────────────────────────────

export const VulnerabilitySchema = z.object({
  id: z.string(),
  severity: ScanSeverity,
  package: z.string(),
  installedVersion: z.string(),
  fixedVersion: z.string().optional(),
  title: z.string(),
  description: z.string().optional(),
  url: z.string().url().optional(),
});
export type Vulnerability = z.infer<typeof VulnerabilitySchema>;

export const ScanResultSchema = z.object({
  scanner: z.enum(['trivy', 'grype', 'openscap', 'trufflehog', 'checkov', 'semgrep', 'codeql']),
  scannedAt: z.string().datetime(),
  duration: z.number().int().nonnegative(),
  status: z.enum(['clean', 'warnings', 'quarantined', 'error']),
  vulnerabilities: z.array(VulnerabilitySchema).default([]),
  summary: z.object({
    critical: z.number().int().nonnegative().default(0),
    high: z.number().int().nonnegative().default(0),
    medium: z.number().int().nonnegative().default(0),
    low: z.number().int().nonnegative().default(0),
    none: z.number().int().nonnegative().default(0),
  }),
});
export type ScanResult = z.infer<typeof ScanResultSchema>;

// ─── Provenance (SLSA Level 3) ──────────────────────────────────────────────

export const ProvenanceSchema = z.object({
  buildType: z.string(),
  builder: z.object({
    id: z.string(),
    version: z.string().optional(),
  }),
  source: z.object({
    repository: z.string().url(),
    ref: z.string(),
    commit: z.string().regex(/^[a-f0-9]{40}$/),
  }),
  buildConfig: z.record(z.unknown()).optional(),
  buildStartedAt: z.string().datetime(),
  buildFinishedAt: z.string().datetime(),
  reproducible: z.boolean().default(false),
});
export type Provenance = z.infer<typeof ProvenanceSchema>;

// ─── License ─────────────────────────────────────────────────────────────────

export const LicenseInfoSchema = z.object({
  spdxId: z.string(),
  name: z.string(),
  compatible: z.boolean(),
  copyleft: z.boolean().default(false),
  url: z.string().url().optional(),
});
export type LicenseInfo = z.infer<typeof LicenseInfoSchema>;

// ─── Core Artifact Schema ────────────────────────────────────────────────────

export const ArtifactSchema = z.object({
  id: z.string().uuid(),
  contentHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  blake3Hash: z.string().regex(/^blake3:[a-f0-9]{64}$/).optional(),
  type: ArtifactType,
  name: z.string().min(1).max(512),
  version: z.string().min(1).max(128),
  tenant: z.string().uuid(),
  repository: z.string().min(1).max(256),
  size: z.number().int().positive(),
  mimeType: z.string().default('application/octet-stream'),
  tags: z.array(z.string()).default([]),
  metadata: z.record(z.unknown()).default({}),

  security: z.object({
    scanned: z.boolean().default(false),
    scanResults: z.array(ScanResultSchema).default([]),
    signed: z.boolean().default(false),
    signatureRef: z.string().optional(),
    sbomRef: z.string().optional(),
    provenance: ProvenanceSchema.optional(),
    quarantined: z.boolean().default(false),
    quarantineReason: QuarantineReason.optional(),
    quarantinedAt: z.string().datetime().optional(),
    quarantinedBy: z.string().optional(),
    licenses: z.array(LicenseInfoSchema).default([]),
  }).default({}),

  lifecycle: z.object({
    environment: LifecycleEnvironment.default('dev'),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    promotedAt: z.string().datetime().optional(),
    lastAccessedAt: z.string().datetime().optional(),
    accessCount: z.number().int().nonnegative().default(0),
    retentionPolicy: z.string().optional(),
    storageTier: StorageTier.default('hot'),
  }),

  publisher: z.object({
    userId: z.string(),
    username: z.string(),
    method: z.enum(['cli', 'ci-cd', 'api', 'mesh']),
    ip: z.string().optional(),
    userAgent: z.string().optional(),
  }),
});
export type Artifact = z.infer<typeof ArtifactSchema>;

// ─── Artifact Event Schema ───────────────────────────────────────────────────

export const ArtifactEventSchema = z.object({
  id: z.string().uuid(),
  timestamp: z.string().datetime(),
  source: z.literal('the-artifactory'),
  type: EventType,
  payload: z.object({
    artifact: ArtifactSchema.partial().optional(),
    artifactId: z.string().uuid().optional(),
    tenant: z.string().uuid().optional(),
    environment: LifecycleEnvironment.optional(),
    severity: z.enum(['info', 'warning', 'critical']).optional(),
    details: z.record(z.unknown()).default({}),
  }),
  correlationId: z.string().uuid(),
  traceId: z.string(),
});
export type ArtifactEvent = z.infer<typeof ArtifactEventSchema>;

// ─── API Request Schemas ─────────────────────────────────────────────────────

export const PublishArtifactRequest = z.object({
  name: z.string().min(1).max(512),
  version: z.string().min(1).max(128),
  type: ArtifactType,
  repository: z.string().min(1).max(256),
  tags: z.array(z.string()).default([]),
  metadata: z.record(z.unknown()).default({}),
});
export type PublishArtifactRequest = z.infer<typeof PublishArtifactRequest>;

export const SearchArtifactsRequest = z.object({
  query: z.string().min(1).max(256),
  type: ArtifactType.optional(),
  repository: z.string().optional(),
  tenant: z.string().uuid().optional(),
  environment: LifecycleEnvironment.optional(),
  tags: z.array(z.string()).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
export type SearchArtifactsRequest = z.infer<typeof SearchArtifactsRequest>;

export const PromoteArtifactRequest = z.object({
  artifactId: z.string().uuid(),
  targetEnvironment: LifecycleEnvironment,
  reason: z.string().min(1).max(1024),
  approvedBy: z.string().optional(),
});
export type PromoteArtifactRequest = z.infer<typeof PromoteArtifactRequest>;

export const QuarantineArtifactRequest = z.object({
  artifactId: z.string().uuid(),
  reason: QuarantineReason,
  details: z.string().min(1).max(2048),
});
export type QuarantineArtifactRequest = z.infer<typeof QuarantineArtifactRequest>;

// ─── Repository Schema ───────────────────────────────────────────────────────

export const RepositoryType = z.enum(['local', 'remote', 'virtual']);
export type RepositoryType = z.infer<typeof RepositoryType>;

export const RepositorySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(256),
  type: RepositoryType,
  artifactType: ArtifactType,
  tenant: z.string().uuid(),
  description: z.string().max(1024).default(''),
  url: z.string().url().optional(),
  upstreamUrl: z.string().url().optional(),
  policies: z.object({
    retentionDays: z.number().int().positive().default(365),
    maxSize: z.number().int().positive().optional(),
    allowOverwrite: z.boolean().default(false),
    scanOnIngest: z.boolean().default(true),
    signRequired: z.boolean().default(false),
    promotionRequired: z.boolean().default(false),
  }).default({}),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Repository = z.infer<typeof RepositorySchema>;

// ─── Tenant Schema ───────────────────────────────────────────────────────────

export const TenantSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(256),
  slug: z.string().min(1).max(64).regex(/^[a-z0-9-]+$/),
  status: z.enum(['active', 'suspended', 'archived']),
  quotas: z.object({
    maxStorageBytes: z.number().int().positive().default(10737418240), // 10GB
    maxBandwidthBytes: z.number().int().positive().default(107374182400), // 100GB
    maxApiCallsPerHour: z.number().int().positive().default(10000),
    maxRepositories: z.number().int().positive().default(50),
    maxArtifacts: z.number().int().positive().default(10000),
  }).default({}),
  usage: z.object({
    storageBytes: z.number().int().nonnegative().default(0),
    bandwidthBytes: z.number().int().nonnegative().default(0),
    apiCallsThisHour: z.number().int().nonnegative().default(0),
    repositoryCount: z.number().int().nonnegative().default(0),
    artifactCount: z.number().int().nonnegative().default(0),
  }).default({}),
  keycloakRealmId: z.string().optional(),
  encryptionKeyId: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Tenant = z.infer<typeof TenantSchema>;

// ─── Health Schema ───────────────────────────────────────────────────────────

export const HealthStatus = z.enum(['healthy', 'degraded', 'unhealthy']);
export type HealthStatus = z.infer<typeof HealthStatus>;

export const HealthCheckSchema = z.object({
  status: HealthStatus,
  service: z.literal('the-artifactory'),
  version: z.string(),
  uptime: z.number(),
  timestamp: z.string().datetime(),
  components: z.object({
    database: HealthStatus,
    storage: HealthStatus,
    search: HealthStatus,
    cache: HealthStatus,
    auth: HealthStatus,
  }),
  metrics: z.object({
    totalArtifacts: z.number().int().nonnegative(),
    totalStorage: z.number().int().nonnegative(),
    requestsPerMinute: z.number().nonnegative(),
    cacheHitRate: z.number().min(0).max(1),
    averageLatency: z.number().nonnegative(),
  }),
});
export type HealthCheck = z.infer<typeof HealthCheckSchema>;

// ─── Policy Schema ───────────────────────────────────────────────────────────

export const PolicySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(256),
  type: z.enum([
    'vulnerability',
    'license',
    'retention',
    'promotion',
    'access',
    'size',
    'rate-limit',
  ]),
  tenant: z.string().uuid().optional(),
  repository: z.string().optional(),
  enabled: z.boolean().default(true),
  priority: z.number().int().min(0).max(1000).default(100),
  rules: z.record(z.unknown()),
  actions: z.object({
    quarantine: z.boolean().default(false),
    block: z.boolean().default(false),
    notify: z.boolean().default(true),
    escalate: z.boolean().default(false),
  }).default({}),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Policy = z.infer<typeof PolicySchema>;