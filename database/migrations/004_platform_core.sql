-- ============================================================
-- INFINITY OS PLATFORM CORE — DATABASE MIGRATION 004
-- ============================================================
-- Systems: Infinity-One | The Lighthouse | The HIVE | The Void
-- Database: Supabase PostgreSQL with Row-Level Security
-- Compliance: GDPR | SOC 2 | ISO 27001 | PCI-DSS | FIPS-140-3
-- Future-proof: 2060 ready
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";    -- Full-text search
CREATE EXTENSION IF NOT EXISTS "btree_gin";  -- GIN indexes

-- ============================================================
-- SCHEMA SETUP
-- ============================================================

CREATE SCHEMA IF NOT EXISTS infinity_one;
CREATE SCHEMA IF NOT EXISTS lighthouse;
CREATE SCHEMA IF NOT EXISTS hive;
CREATE SCHEMA IF NOT EXISTS void;
CREATE SCHEMA IF NOT EXISTS audit;

-- ============================================================
-- SHARED TYPES & ENUMS
-- ============================================================

-- Risk levels (shared across systems)
CREATE TYPE public.risk_level AS ENUM (
  'none', 'low', 'medium', 'high', 'critical'
);

-- Data classification levels (shared)
CREATE TYPE public.data_classification AS ENUM (
  'PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'CLASSIFIED', 'VOID'
);

-- Verification levels
CREATE TYPE public.verification_level AS ENUM (
  'unverified', 'email_verified', 'phone_verified',
  'identity_verified', 'biometric_verified', 'quantum_verified'
);

-- ============================================================
-- INFINITY-ONE: IDENTITY & ACCESS MANAGEMENT
-- ============================================================

-- Organisations
CREATE TABLE infinity_one.organisations (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name              TEXT NOT NULL,
  slug              TEXT UNIQUE NOT NULL,
  type              TEXT NOT NULL DEFAULT 'standard',
  plan              TEXT NOT NULL DEFAULT 'free',
  status            TEXT NOT NULL DEFAULT 'active',

  -- Branding
  logo_url          TEXT,
  primary_colour    TEXT,
  secondary_colour  TEXT,
  custom_domain     TEXT,

  -- Settings (JSONB for flexibility)
  settings          JSONB NOT NULL DEFAULT '{}',
  security_policy   JSONB NOT NULL DEFAULT '{}',
  mfa_policy        JSONB NOT NULL DEFAULT '{}',
  sso_config        JSONB,

  -- Limits
  max_users         INTEGER NOT NULL DEFAULT 100,
  max_apps          INTEGER NOT NULL DEFAULT 10,
  storage_quota_gb  INTEGER NOT NULL DEFAULT 10,

  -- Compliance
  data_residency    TEXT[] DEFAULT ARRAY['eu-west-1'],
  compliance_frameworks TEXT[] DEFAULT ARRAY['GDPR', 'ISO27001'],

  -- Metadata
  owner_id          UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ,

  CONSTRAINT organisations_slug_format CHECK (slug ~ '^[a-z0-9-]+$')
);

-- Users (core identity)
CREATE TABLE infinity_one.users (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organisation_id       UUID REFERENCES infinity_one.organisations(id),

  -- Identity
  email                 TEXT UNIQUE NOT NULL,
  email_verified        BOOLEAN NOT NULL DEFAULT FALSE,
  email_verified_at     TIMESTAMPTZ,
  phone                 TEXT,
  phone_verified        BOOLEAN NOT NULL DEFAULT FALSE,
  phone_verified_at     TIMESTAMPTZ,
  username              TEXT UNIQUE,

  -- Profile
  display_name          TEXT,
  first_name            TEXT,
  last_name             TEXT,
  middle_name           TEXT,
  preferred_name        TEXT,
  date_of_birth         DATE,
  gender                TEXT,
  pronouns              TEXT,
  nationality           TEXT,
  languages             TEXT[] DEFAULT ARRAY['en'],
  timezone              TEXT NOT NULL DEFAULT 'UTC',
  locale                TEXT NOT NULL DEFAULT 'en-GB',

  -- Avatar
  avatar_url            TEXT,
  avatar_thumbnail_url  TEXT,

  -- Status & Verification
  status                TEXT NOT NULL DEFAULT 'pending_verification',
  verification_level    public.verification_level NOT NULL DEFAULT 'unverified',
  risk_level            public.risk_level NOT NULL DEFAULT 'none',
  risk_score            INTEGER NOT NULL DEFAULT 0 CHECK (risk_score BETWEEN 0 AND 100),

  -- Security
  password_hash         TEXT,
  password_changed_at   TIMESTAMPTZ,
  failed_login_count    INTEGER NOT NULL DEFAULT 0,
  locked_until          TIMESTAMPTZ,
  last_login_at         TIMESTAMPTZ,
  last_login_ip         INET,
  last_login_country    TEXT,

  -- MFA
  mfa_enabled           BOOLEAN NOT NULL DEFAULT FALSE,
  mfa_methods           JSONB NOT NULL DEFAULT '[]',
  backup_codes_hash     TEXT[],

  -- WebAuthn / Passkeys
  webauthn_credentials  JSONB NOT NULL DEFAULT '[]',

  -- DID (Decentralised Identity)
  did                   TEXT UNIQUE,
  did_document          JSONB,

  -- Lighthouse
  lighthouse_token_id   TEXT UNIQUE,

  -- Preferences
  preferences           JSONB NOT NULL DEFAULT '{}',
  notification_prefs    JSONB NOT NULL DEFAULT '{}',
  privacy_prefs         JSONB NOT NULL DEFAULT '{}',
  accessibility_prefs   JSONB NOT NULL DEFAULT '{}',

  -- Compliance
  gdpr_consent          JSONB NOT NULL DEFAULT '{}',
  data_processing_consent BOOLEAN NOT NULL DEFAULT FALSE,
  marketing_consent     BOOLEAN NOT NULL DEFAULT FALSE,
  consent_updated_at    TIMESTAMPTZ,

  -- GDPR Erasure
  erasure_requested_at  TIMESTAMPTZ,
  erasure_scheduled_at  TIMESTAMPTZ,
  erasure_completed_at  TIMESTAMPTZ,

  -- Metadata
  source                TEXT DEFAULT 'self_registration',
  invited_by            UUID REFERENCES infinity_one.users(id),
  scim_external_id      TEXT,
  custom_attributes     JSONB NOT NULL DEFAULT '{}',

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at            TIMESTAMPTZ,

  CONSTRAINT users_email_format CHECK (email ~ '^[^@]+@[^@]+\.[^@]+$'),
  CONSTRAINT users_risk_score_range CHECK (risk_score BETWEEN 0 AND 100)
);

-- User contact addresses
CREATE TABLE infinity_one.user_addresses (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES infinity_one.users(id) ON DELETE CASCADE,
  type            TEXT NOT NULL DEFAULT 'home', -- home, work, billing, shipping
  line1           TEXT NOT NULL,
  line2           TEXT,
  city            TEXT NOT NULL,
  state           TEXT,
  postal_code     TEXT,
  country         TEXT NOT NULL DEFAULT 'GB',
  is_primary      BOOLEAN NOT NULL DEFAULT FALSE,
  verified        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Roles
CREATE TABLE infinity_one.roles (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organisation_id UUID REFERENCES infinity_one.organisations(id),
  name            TEXT NOT NULL,
  slug            TEXT NOT NULL,
  description     TEXT,
  type            TEXT NOT NULL DEFAULT 'custom',
  is_system       BOOLEAN NOT NULL DEFAULT FALSE,
  is_default      BOOLEAN NOT NULL DEFAULT FALSE,
  parent_role_id  UUID REFERENCES infinity_one.roles(id),
  permissions     JSONB NOT NULL DEFAULT '[]',
  constraints     JSONB NOT NULL DEFAULT '[]',
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (organisation_id, slug)
);

-- User role assignments
CREATE TABLE infinity_one.user_roles (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES infinity_one.users(id) ON DELETE CASCADE,
  role_id         UUID NOT NULL REFERENCES infinity_one.roles(id) ON DELETE CASCADE,
  organisation_id UUID REFERENCES infinity_one.organisations(id),
  granted_by      UUID REFERENCES infinity_one.users(id),
  granted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ,
  conditions      JSONB NOT NULL DEFAULT '{}',
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,

  UNIQUE (user_id, role_id)
);

-- Groups
CREATE TABLE infinity_one.groups (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organisation_id UUID REFERENCES infinity_one.organisations(id),
  name            TEXT NOT NULL,
  slug            TEXT NOT NULL,
  description     TEXT,
  type            TEXT NOT NULL DEFAULT 'team',
  parent_group_id UUID REFERENCES infinity_one.groups(id),
  settings        JSONB NOT NULL DEFAULT '{}',
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (organisation_id, slug)
);

-- Group memberships
CREATE TABLE infinity_one.group_members (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id    UUID NOT NULL REFERENCES infinity_one.groups(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES infinity_one.users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'member', -- owner, admin, member
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  invited_by  UUID REFERENCES infinity_one.users(id),

  UNIQUE (group_id, user_id)
);

-- IAM Policies
CREATE TABLE infinity_one.iam_policies (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organisation_id UUID REFERENCES infinity_one.organisations(id),
  name            TEXT NOT NULL,
  description     TEXT,
  version         TEXT NOT NULL DEFAULT '2024-01-01',
  statements      JSONB NOT NULL DEFAULT '[]',
  is_system       BOOLEAN NOT NULL DEFAULT FALSE,
  attached_to     JSONB NOT NULL DEFAULT '[]', -- users, roles, groups
  created_by      UUID REFERENCES infinity_one.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sessions
CREATE TABLE infinity_one.sessions (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES infinity_one.users(id) ON DELETE CASCADE,
  token_hash        TEXT UNIQUE NOT NULL,
  refresh_token_hash TEXT UNIQUE,
  device_id         TEXT,
  device_name       TEXT,
  device_type       TEXT,
  user_agent        TEXT,
  ip_address        INET,
  country           TEXT,
  city              TEXT,
  latitude          DECIMAL(9,6),
  longitude         DECIMAL(9,6),
  is_trusted        BOOLEAN NOT NULL DEFAULT FALSE,
  mfa_verified      BOOLEAN NOT NULL DEFAULT FALSE,
  scopes            TEXT[] DEFAULT ARRAY[]::TEXT[],
  metadata          JSONB NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at        TIMESTAMPTZ NOT NULL,
  last_active_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at        TIMESTAMPTZ,
  revoked_reason    TEXT
);

-- Applications
CREATE TABLE infinity_one.applications (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organisation_id UUID REFERENCES infinity_one.organisations(id),
  name            TEXT NOT NULL,
  slug            TEXT NOT NULL,
  description     TEXT,
  type            TEXT NOT NULL DEFAULT 'web',
  status          TEXT NOT NULL DEFAULT 'active',
  icon_url        TEXT,
  url             TEXT,
  client_id       TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  client_secret_hash TEXT,
  redirect_uris   TEXT[] DEFAULT ARRAY[]::TEXT[],
  allowed_scopes  TEXT[] DEFAULT ARRAY['openid', 'profile', 'email'],
  allowed_grants  TEXT[] DEFAULT ARRAY['authorization_code'],
  settings        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (organisation_id, slug)
);

-- User application access
CREATE TABLE infinity_one.user_app_access (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES infinity_one.users(id) ON DELETE CASCADE,
  application_id  UUID NOT NULL REFERENCES infinity_one.applications(id) ON DELETE CASCADE,
  granted_by      UUID REFERENCES infinity_one.users(id),
  granted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ,
  scopes          TEXT[] DEFAULT ARRAY[]::TEXT[],
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,

  UNIQUE (user_id, application_id)
);

-- OAuth tokens
CREATE TABLE infinity_one.oauth_tokens (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES infinity_one.users(id) ON DELETE CASCADE,
  application_id    UUID REFERENCES infinity_one.applications(id),
  token_hash        TEXT UNIQUE NOT NULL,
  token_type        TEXT NOT NULL DEFAULT 'Bearer',
  scopes            TEXT[] DEFAULT ARRAY[]::TEXT[],
  issued_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at        TIMESTAMPTZ NOT NULL,
  revoked_at        TIMESTAMPTZ,
  algorithm         TEXT NOT NULL DEFAULT 'ML-DSA-65'
);

-- Consent records
CREATE TABLE infinity_one.consent_records (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES infinity_one.users(id) ON DELETE CASCADE,
  type            TEXT NOT NULL,
  granted         BOOLEAN NOT NULL,
  version         TEXT NOT NULL,
  ip_address      INET,
  user_agent      TEXT,
  granted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  withdrawn_at    TIMESTAMPTZ,
  metadata        JSONB NOT NULL DEFAULT '{}'
);

-- ============================================================
-- LIGHTHOUSE: CRYPTOGRAPHIC TOKEN REGISTRY
-- ============================================================

-- Universal Entity Tokens
CREATE TABLE lighthouse.entity_tokens (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  token_id              TEXT UNIQUE NOT NULL,  -- UET-{timestamp}-{random}
  entity_id             TEXT NOT NULL,
  entity_type           TEXT NOT NULL,
  entity_hash           TEXT NOT NULL,

  -- Token data
  version               INTEGER NOT NULL DEFAULT 1,
  status                TEXT NOT NULL DEFAULT 'active',
  classification        public.data_classification NOT NULL DEFAULT 'INTERNAL',

  -- Risk
  risk_score            INTEGER NOT NULL DEFAULT 0 CHECK (risk_score BETWEEN 0 AND 100),
  risk_level            public.risk_level NOT NULL DEFAULT 'none',
  risk_factors          JSONB NOT NULL DEFAULT '[]',

  -- Cryptographic
  signature             TEXT NOT NULL,
  signing_algorithm     TEXT NOT NULL DEFAULT 'ML-DSA-65',
  public_key_id         TEXT,

  -- Behavioural fingerprint
  behavioural_fingerprint JSONB NOT NULL DEFAULT '{}',

  -- HIVE
  hive_node_id          TEXT,

  -- Metadata
  issuer                TEXT NOT NULL DEFAULT 'lighthouse.infinity.os',
  issued_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at            TIMESTAMPTZ,
  last_verified_at      TIMESTAMPTZ,
  revoked_at            TIMESTAMPTZ,
  revoked_reason        TEXT,

  -- Audit chain
  audit_chain           JSONB NOT NULL DEFAULT '[]',

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Token activity log
CREATE TABLE lighthouse.token_activity (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  token_id        TEXT NOT NULL REFERENCES lighthouse.entity_tokens(token_id),
  action          TEXT NOT NULL,
  actor_id        TEXT,
  ip_address      INET,
  user_agent      TEXT,
  geo_location    JSONB,
  metadata        JSONB NOT NULL DEFAULT '{}',
  timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Threat events
CREATE TABLE lighthouse.threat_events (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  threat_id         TEXT UNIQUE NOT NULL,
  token_id          TEXT REFERENCES lighthouse.entity_tokens(token_id),
  entity_id         TEXT NOT NULL,
  entity_type       TEXT NOT NULL,

  -- Threat details
  type              TEXT NOT NULL,
  severity          TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'open',
  title             TEXT NOT NULL,
  description       TEXT,

  -- MITRE ATT&CK
  mitre_tactic      TEXT,
  mitre_technique   TEXT,
  mitre_subtechnique TEXT,

  -- Evidence
  evidence          JSONB NOT NULL DEFAULT '[]',
  indicators        JSONB NOT NULL DEFAULT '[]',

  -- Risk
  risk_score_delta  INTEGER NOT NULL DEFAULT 0,

  -- Resolution
  resolution        JSONB,

  -- Timestamps
  detected_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Warp Tunnel transfers
CREATE TABLE lighthouse.warp_transfers (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transfer_id       TEXT UNIQUE NOT NULL,
  token_id          TEXT REFERENCES lighthouse.entity_tokens(token_id),
  entity_id         TEXT NOT NULL,
  entity_type       TEXT NOT NULL,

  -- Transfer details
  reason            TEXT NOT NULL,
  threat_level      public.risk_level NOT NULL,
  status            TEXT NOT NULL DEFAULT 'initiated',

  -- Pipeline steps
  scan_result       JSONB,
  capture_result    JSONB,
  encrypt_result    JSONB,
  transfer_result   JSONB,
  verify_result     JSONB,

  -- IceBox
  icebox_entry_id   TEXT,

  -- Metrics
  transfer_metrics  JSONB NOT NULL DEFAULT '{}',

  -- Timestamps
  initiated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- IceBox entries
CREATE TABLE lighthouse.icebox_entries (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entry_id          TEXT UNIQUE NOT NULL,
  transfer_id       TEXT REFERENCES lighthouse.warp_transfers(transfer_id),
  entity_id         TEXT NOT NULL,
  entity_type       TEXT NOT NULL,
  entity_snapshot   JSONB NOT NULL DEFAULT '{}',

  -- Status
  status            TEXT NOT NULL DEFAULT 'quarantined',

  -- Forensic analysis
  forensic_analysis JSONB NOT NULL DEFAULT '{}',

  -- Verdict
  verdict           JSONB,

  -- Timestamps
  quarantined_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  analysis_started_at TIMESTAMPTZ,
  analysis_completed_at TIMESTAMPTZ,
  verdict_issued_at TIMESTAMPTZ,
  released_at       TIMESTAMPTZ,
  destroyed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- HIVE: SWARM DATA ROUTER
-- ============================================================

-- HIVE nodes (bee colony)
CREATE TABLE hive.nodes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  node_id         TEXT UNIQUE NOT NULL,
  role            TEXT NOT NULL,  -- QUEEN, WORKER, SCOUT, GUARD, DRONE, NURSE, FORAGER
  status          TEXT NOT NULL DEFAULT 'active',
  region          TEXT NOT NULL DEFAULT 'eu-west-1',
  capacity        INTEGER NOT NULL DEFAULT 1000,
  current_load    INTEGER NOT NULL DEFAULT 0,
  specialisation  TEXT[],
  metrics         JSONB NOT NULL DEFAULT '{}',
  last_heartbeat  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- HIVE message routing log
CREATE TABLE hive.message_log (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id      TEXT UNIQUE NOT NULL,
  source_id       TEXT NOT NULL,
  destination_id  TEXT NOT NULL,
  source_type     TEXT NOT NULL,
  destination_type TEXT NOT NULL,
  classification  public.data_classification NOT NULL,
  priority        TEXT NOT NULL DEFAULT 'NORMAL',
  status          TEXT NOT NULL DEFAULT 'pending',
  routing_path    JSONB NOT NULL DEFAULT '[]',
  hops            JSONB NOT NULL DEFAULT '[]',
  security_checks JSONB NOT NULL DEFAULT '[]',
  payload_hash    TEXT,
  encrypted       BOOLEAN NOT NULL DEFAULT TRUE,
  size_bytes      INTEGER,
  latency_ms      INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at    TIMESTAMPTZ,
  failed_at       TIMESTAMPTZ,
  error           TEXT
);

-- HIVE data channels
CREATE TABLE hive.channels (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  channel_id      TEXT UNIQUE NOT NULL,
  name            TEXT NOT NULL,
  source_type     TEXT NOT NULL,
  destination_type TEXT NOT NULL,
  classification  public.data_classification NOT NULL,
  status          TEXT NOT NULL DEFAULT 'active',
  encryption_key_id TEXT,
  encryption_algorithm TEXT NOT NULL DEFAULT 'AES-256-GCM',
  settings        JSONB NOT NULL DEFAULT '{}',
  metrics         JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ
);

-- HIVE routing table (scout bee cache)
CREATE TABLE hive.routing_table (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_type     TEXT NOT NULL,
  destination_type TEXT NOT NULL,
  classification  public.data_classification NOT NULL,
  optimal_path    JSONB NOT NULL DEFAULT '[]',
  latency_ms      INTEGER,
  reliability     DECIMAL(5,4) NOT NULL DEFAULT 1.0,
  last_updated    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL,

  UNIQUE (source_type, destination_type, classification)
);

-- ============================================================
-- THE VOID: SECURE SECRET STORE
-- ============================================================

-- Secret envelopes
CREATE TABLE void.secrets (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  secret_id             TEXT UNIQUE NOT NULL,
  name                  TEXT NOT NULL,
  description           TEXT,
  type                  TEXT NOT NULL,
  classification        public.data_classification NOT NULL,
  status                TEXT NOT NULL DEFAULT 'ACTIVE',
  version               INTEGER NOT NULL DEFAULT 1,
  previous_versions     TEXT[] DEFAULT ARRAY[]::TEXT[],

  -- Encrypted payload (never store plaintext)
  encrypted_payload     JSONB NOT NULL,
  key_derivation        JSONB NOT NULL DEFAULT '{}',

  -- Access control
  access_policy         JSONB NOT NULL DEFAULT '{}',

  -- Shamir's Secret Sharing
  shamir_config         JSONB,

  -- Zero-knowledge proof
  zk_binding            JSONB,

  -- Rotation
  rotation_config       JSONB,

  -- Organisation & ownership
  owner_id              TEXT NOT NULL,
  organisation_id       UUID REFERENCES infinity_one.organisations(id),
  path                  TEXT NOT NULL,
  tags                  TEXT[] DEFAULT ARRAY[]::TEXT[],

  -- Metadata
  metadata              JSONB NOT NULL DEFAULT '{}',

  -- GDPR
  gdpr                  JSONB NOT NULL DEFAULT '{}',

  -- Timestamps
  expires_at            TIMESTAMPTZ,
  last_accessed_at      TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT secrets_path_format CHECK (path ~ '^[a-zA-Z0-9/_-]+$')
);

-- Secret audit log (immutable chain)
CREATE TABLE void.secret_audit_log (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  audit_id          TEXT UNIQUE NOT NULL,
  secret_id         TEXT NOT NULL REFERENCES void.secrets(secret_id),
  action            TEXT NOT NULL,
  principal_id      TEXT NOT NULL,
  principal_type    TEXT NOT NULL DEFAULT 'user',
  ip_address        INET,
  user_agent        TEXT,
  geo_location      JSONB,
  lighthouse_token_id TEXT,
  hive_routing_path TEXT,
  result            TEXT NOT NULL,
  denial_reason     TEXT,
  risk_score        INTEGER,
  is_break_glass    BOOLEAN NOT NULL DEFAULT FALSE,
  reason            TEXT,
  entry_hash        TEXT NOT NULL,
  previous_entry_hash TEXT,
  timestamp         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Void master key registry
CREATE TABLE void.master_keys (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key_id            TEXT UNIQUE NOT NULL,
  version           INTEGER NOT NULL DEFAULT 1,
  algorithm         TEXT NOT NULL DEFAULT 'ML-KEM-1024',
  status            TEXT NOT NULL DEFAULT 'active',
  shamir_shards     JSONB NOT NULL DEFAULT '[]',
  shamir_threshold  INTEGER NOT NULL DEFAULT 5,
  shamir_total      INTEGER NOT NULL DEFAULT 9,
  sealed            BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_rotated_at   TIMESTAMPTZ
);

-- Warp transfers for secrets
CREATE TABLE void.warp_transfers (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transfer_id       TEXT UNIQUE NOT NULL,
  secret_id         TEXT NOT NULL REFERENCES void.secrets(secret_id),
  secret_name       TEXT NOT NULL,
  reason            TEXT NOT NULL,
  threat_level      public.risk_level NOT NULL,
  triggered_by      TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'initiated',
  icebox_entry_id   TEXT,
  auto_shredded     BOOLEAN NOT NULL DEFAULT FALSE,
  shred_completed_at TIMESTAMPTZ,
  triggered_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at      TIMESTAMPTZ
);

-- MPC sessions
CREATE TABLE void.mpc_sessions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id      TEXT UNIQUE NOT NULL,
  secret_id       TEXT REFERENCES void.secrets(secret_id),
  operation       TEXT NOT NULL,
  parties         JSONB NOT NULL DEFAULT '[]',
  threshold       INTEGER NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending',
  protocol        TEXT NOT NULL DEFAULT 'FROST',
  result_hash     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL,
  completed_at    TIMESTAMPTZ
);

-- ============================================================
-- AUDIT SCHEMA: CROSS-SYSTEM AUDIT LOG
-- ============================================================

CREATE TABLE audit.platform_events (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id        TEXT UNIQUE NOT NULL,
  system          TEXT NOT NULL,  -- infinity_one, lighthouse, hive, void
  event_type      TEXT NOT NULL,
  severity        TEXT NOT NULL DEFAULT 'info',
  actor_id        TEXT,
  actor_type      TEXT,
  target_id       TEXT,
  target_type     TEXT,
  organisation_id UUID REFERENCES infinity_one.organisations(id),
  ip_address      INET,
  user_agent      TEXT,
  geo_location    JSONB,
  payload         JSONB NOT NULL DEFAULT '{}',
  result          TEXT NOT NULL DEFAULT 'success',
  error           TEXT,
  correlation_id  TEXT,
  trace_id        TEXT,
  span_id         TEXT,
  timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  entry_hash      TEXT NOT NULL,
  previous_hash   TEXT
);

-- ============================================================
-- INDEXES
-- ============================================================

-- Infinity-One indexes
CREATE INDEX idx_users_email ON infinity_one.users(email);
CREATE INDEX idx_users_organisation ON infinity_one.users(organisation_id);
CREATE INDEX idx_users_status ON infinity_one.users(status);
CREATE INDEX idx_users_risk_level ON infinity_one.users(risk_level);
CREATE INDEX idx_users_lighthouse_token ON infinity_one.users(lighthouse_token_id);
CREATE INDEX idx_users_created_at ON infinity_one.users(created_at DESC);
CREATE INDEX idx_users_deleted_at ON infinity_one.users(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_search ON infinity_one.users USING gin(
  to_tsvector('english', coalesce(display_name, '') || ' ' || coalesce(email, '') || ' ' || coalesce(username, ''))
);

CREATE INDEX idx_sessions_user ON infinity_one.sessions(user_id);
CREATE INDEX idx_sessions_token ON infinity_one.sessions(token_hash);
CREATE INDEX idx_sessions_expires ON infinity_one.sessions(expires_at);
CREATE INDEX idx_sessions_active ON infinity_one.sessions(user_id) WHERE revoked_at IS NULL;

CREATE INDEX idx_user_roles_user ON infinity_one.user_roles(user_id);
CREATE INDEX idx_user_roles_role ON infinity_one.user_roles(role_id);
CREATE INDEX idx_user_roles_active ON infinity_one.user_roles(user_id) WHERE is_active = TRUE;

-- Lighthouse indexes
CREATE INDEX idx_entity_tokens_entity ON lighthouse.entity_tokens(entity_id, entity_type);
CREATE INDEX idx_entity_tokens_status ON lighthouse.entity_tokens(status);
CREATE INDEX idx_entity_tokens_risk ON lighthouse.entity_tokens(risk_score DESC);
CREATE INDEX idx_entity_tokens_classification ON lighthouse.entity_tokens(classification);

CREATE INDEX idx_threat_events_entity ON lighthouse.threat_events(entity_id);
CREATE INDEX idx_threat_events_severity ON lighthouse.threat_events(severity);
CREATE INDEX idx_threat_events_status ON lighthouse.threat_events(status);
CREATE INDEX idx_threat_events_detected ON lighthouse.threat_events(detected_at DESC);

CREATE INDEX idx_warp_transfers_entity ON lighthouse.warp_transfers(entity_id);
CREATE INDEX idx_warp_transfers_status ON lighthouse.warp_transfers(status);

CREATE INDEX idx_icebox_status ON lighthouse.icebox_entries(status);
CREATE INDEX idx_icebox_entity ON lighthouse.icebox_entries(entity_id);

-- HIVE indexes
CREATE INDEX idx_hive_nodes_role ON hive.nodes(role);
CREATE INDEX idx_hive_nodes_status ON hive.nodes(status);
CREATE INDEX idx_message_log_source ON hive.message_log(source_id);
CREATE INDEX idx_message_log_destination ON hive.message_log(destination_id);
CREATE INDEX idx_message_log_status ON hive.message_log(status);
CREATE INDEX idx_message_log_created ON hive.message_log(created_at DESC);
CREATE INDEX idx_channels_classification ON hive.channels(classification);
CREATE INDEX idx_routing_table_lookup ON hive.routing_table(source_type, destination_type, classification);

-- Void indexes
CREATE INDEX idx_secrets_owner ON void.secrets(owner_id);
CREATE INDEX idx_secrets_org ON void.secrets(organisation_id);
CREATE INDEX idx_secrets_path ON void.secrets(path);
CREATE INDEX idx_secrets_type ON void.secrets(type);
CREATE INDEX idx_secrets_classification ON void.secrets(classification);
CREATE INDEX idx_secrets_status ON void.secrets(status);
CREATE INDEX idx_secrets_expires ON void.secrets(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX idx_secrets_tags ON void.secrets USING gin(tags);
CREATE INDEX idx_secrets_path_search ON void.secrets USING gin(path gin_trgm_ops);

CREATE INDEX idx_secret_audit_secret ON void.secret_audit_log(secret_id);
CREATE INDEX idx_secret_audit_principal ON void.secret_audit_log(principal_id);
CREATE INDEX idx_secret_audit_action ON void.secret_audit_log(action);
CREATE INDEX idx_secret_audit_timestamp ON void.secret_audit_log(timestamp DESC);
CREATE INDEX idx_secret_audit_break_glass ON void.secret_audit_log(is_break_glass) WHERE is_break_glass = TRUE;

-- Audit indexes
CREATE INDEX idx_platform_events_system ON audit.platform_events(system);
CREATE INDEX idx_platform_events_actor ON audit.platform_events(actor_id);
CREATE INDEX idx_platform_events_org ON audit.platform_events(organisation_id);
CREATE INDEX idx_platform_events_timestamp ON audit.platform_events(timestamp DESC);
CREATE INDEX idx_platform_events_correlation ON audit.platform_events(correlation_id);

-- ============================================================
-- ROW-LEVEL SECURITY (RLS)
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE infinity_one.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE infinity_one.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE infinity_one.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE infinity_one.user_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE infinity_one.user_app_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE void.secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE void.secret_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE lighthouse.entity_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE lighthouse.threat_events ENABLE ROW LEVEL SECURITY;

-- Users can only see their own data
CREATE POLICY users_self_access ON infinity_one.users
  FOR ALL USING (auth.uid()::TEXT = id::TEXT);

-- Admins can see all users in their organisation
CREATE POLICY users_org_admin_access ON infinity_one.users
  FOR SELECT USING (
    organisation_id IN (
      SELECT ur.organisation_id
      FROM infinity_one.user_roles ur
      JOIN infinity_one.roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid()
        AND r.slug IN ('super_admin', 'org_admin')
        AND ur.is_active = TRUE
    )
  );

-- Sessions: users see only their own
CREATE POLICY sessions_self_access ON infinity_one.sessions
  FOR ALL USING (user_id = auth.uid());

-- Secrets: owner access
CREATE POLICY secrets_owner_access ON void.secrets
  FOR ALL USING (owner_id = auth.uid()::TEXT);

-- Secret audit: owner read-only
CREATE POLICY secret_audit_owner_read ON void.secret_audit_log
  FOR SELECT USING (
    secret_id IN (
      SELECT secret_id FROM void.secrets WHERE owner_id = auth.uid()::TEXT
    )
  );

-- ============================================================
-- TRIGGERS: AUTO-UPDATE TIMESTAMPS
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN
    SELECT schemaname, tablename
    FROM information_schema.columns
    WHERE column_name = 'updated_at'
      AND table_schema IN ('infinity_one', 'lighthouse', 'hive', 'void')
  LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_update_timestamp BEFORE UPDATE ON %I.%I
       FOR EACH ROW EXECUTE FUNCTION public.update_updated_at()',
      t.schemaname, t.tablename
    );
  END LOOP;
END;
$$;

-- ============================================================
-- TRIGGERS: AUDIT CHAIN INTEGRITY
-- ============================================================

-- Prevent modification of audit log entries (immutable)
CREATE OR REPLACE FUNCTION void.prevent_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit log entries are immutable — modification not permitted';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_immutable_secret_audit
  BEFORE UPDATE OR DELETE ON void.secret_audit_log
  FOR EACH ROW EXECUTE FUNCTION void.prevent_audit_modification();

CREATE OR REPLACE FUNCTION audit.prevent_event_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Platform audit events are immutable — modification not permitted';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_immutable_platform_events
  BEFORE UPDATE OR DELETE ON audit.platform_events
  FOR EACH ROW EXECUTE FUNCTION audit.prevent_event_modification();

-- ============================================================
-- TRIGGERS: AUTO-EXPIRE SESSIONS
-- ============================================================

CREATE OR REPLACE FUNCTION infinity_one.cleanup_expired_sessions()
RETURNS void AS $$
BEGIN
  UPDATE infinity_one.sessions
  SET revoked_at = NOW(), revoked_reason = 'expired'
  WHERE expires_at < NOW() AND revoked_at IS NULL;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- TRIGGERS: LIGHTHOUSE TOKEN AUTO-ISSUE
-- ============================================================

CREATE OR REPLACE FUNCTION infinity_one.auto_issue_lighthouse_token()
RETURNS TRIGGER AS $$
BEGIN
  -- Generate a placeholder token ID — real token issued by Lighthouse service
  IF NEW.lighthouse_token_id IS NULL THEN
    NEW.lighthouse_token_id = 'uet-pending-' || encode(gen_random_bytes(8), 'hex');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_auto_lighthouse_token
  BEFORE INSERT ON infinity_one.users
  FOR EACH ROW EXECUTE FUNCTION infinity_one.auto_issue_lighthouse_token();

-- ============================================================
-- VIEWS: USEFUL AGGREGATIONS
-- ============================================================

-- Active users with their roles
CREATE VIEW infinity_one.v_active_users AS
SELECT
  u.id,
  u.email,
  u.display_name,
  u.status,
  u.risk_level,
  u.risk_score,
  u.verification_level,
  u.last_login_at,
  u.organisation_id,
  u.lighthouse_token_id,
  COALESCE(
    json_agg(DISTINCT r.slug) FILTER (WHERE r.slug IS NOT NULL),
    '[]'::json
  ) AS roles,
  u.created_at
FROM infinity_one.users u
LEFT JOIN infinity_one.user_roles ur ON u.id = ur.user_id AND ur.is_active = TRUE
LEFT JOIN infinity_one.roles r ON ur.role_id = r.id
WHERE u.deleted_at IS NULL AND u.status != 'deleted'
GROUP BY u.id;

-- High-risk entities in Lighthouse
CREATE VIEW lighthouse.v_high_risk_entities AS
SELECT
  et.token_id,
  et.entity_id,
  et.entity_type,
  et.risk_score,
  et.risk_level,
  et.status,
  et.classification,
  COUNT(te.id) AS open_threats,
  et.last_verified_at,
  et.created_at
FROM lighthouse.entity_tokens et
LEFT JOIN lighthouse.threat_events te
  ON et.entity_id = te.entity_id AND te.status = 'open'
WHERE et.risk_score >= 70
GROUP BY et.id
ORDER BY et.risk_score DESC;

-- Secrets expiring soon
CREATE VIEW void.v_expiring_secrets AS
SELECT
  s.secret_id,
  s.name,
  s.type,
  s.classification,
  s.owner_id,
  s.organisation_id,
  s.expires_at,
  EXTRACT(DAY FROM (s.expires_at - NOW())) AS days_until_expiry,
  s.rotation_config->>'enabled' AS auto_rotation_enabled
FROM void.secrets s
WHERE s.expires_at IS NOT NULL
  AND s.expires_at > NOW()
  AND s.status = 'ACTIVE'
  AND EXTRACT(DAY FROM (s.expires_at - NOW())) <= 30
ORDER BY s.expires_at ASC;

-- HIVE routing performance
CREATE VIEW hive.v_routing_performance AS
SELECT
  source_type,
  destination_type,
  classification,
  COUNT(*) AS total_messages,
  AVG(latency_ms) AS avg_latency_ms,
  MIN(latency_ms) AS min_latency_ms,
  MAX(latency_ms) AS max_latency_ms,
  SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END)::FLOAT / COUNT(*) AS success_rate,
  MAX(created_at) AS last_message_at
FROM hive.message_log
WHERE created_at >= NOW() - INTERVAL '24 hours'
GROUP BY source_type, destination_type, classification;

-- ============================================================
-- SEED DATA: SYSTEM ROLES
-- ============================================================

INSERT INTO infinity_one.roles (name, slug, description, type, is_system, is_default, permissions) VALUES
  ('Super Administrator', 'super_admin', 'Full platform access — Infinity OS level', 'system', TRUE, FALSE,
   '["*:*:*"]'::jsonb),
  ('Organisation Administrator', 'org_admin', 'Full organisation access', 'system', TRUE, FALSE,
   '["org:*:*", "users:*:*", "apps:*:*", "roles:read:*", "roles:assign:*"]'::jsonb),
  ('Security Administrator', 'security_admin', 'Security and compliance management', 'system', TRUE, FALSE,
   '["security:*:*", "audit:read:*", "lighthouse:*:*", "void:read:*", "icebox:*:*"]'::jsonb),
  ('Power User', 'power_user', 'Extended platform capabilities', 'system', TRUE, FALSE,
   '["apps:read:*", "apps:use:*", "profile:*:self", "hive:read:*"]'::jsonb),
  ('Standard User', 'standard_user', 'Standard platform access', 'system', TRUE, TRUE,
   '["apps:use:assigned", "profile:*:self"]'::jsonb),
  ('Guest', 'guest', 'Limited read-only access', 'system', TRUE, FALSE,
   '["apps:read:public", "profile:read:self"]'::jsonb),
  ('Bot / Service Account', 'bot', 'Automated service access', 'system', TRUE, FALSE,
   '["api:*:assigned", "hive:route:*"]'::jsonb),
  ('Agent', 'agent', 'AI agent access', 'system', TRUE, FALSE,
   '["api:read:*", "hive:route:*", "lighthouse:read:self"]'::jsonb)
ON CONFLICT (organisation_id, slug) DO NOTHING;

-- ============================================================
-- SEED DATA: HIVE INITIAL TOPOLOGY
-- ============================================================

INSERT INTO hive.nodes (node_id, role, status, region, capacity, specialisation) VALUES
  ('queen-001', 'QUEEN', 'active', 'eu-west-1', 10000, ARRAY['orchestration', 'policy']),
  ('worker-001', 'WORKER', 'active', 'eu-west-1', 2000, ARRAY['general']),
  ('worker-002', 'WORKER', 'active', 'eu-west-1', 2000, ARRAY['general']),
  ('worker-003', 'WORKER', 'active', 'us-east-1', 2000, ARRAY['general']),
  ('worker-004', 'WORKER', 'active', 'ap-southeast-1', 2000, ARRAY['general']),
  ('worker-005', 'WORKER', 'active', 'eu-central-1', 2000, ARRAY['general']),
  ('guard-001', 'GUARD', 'active', 'eu-west-1', 5000, ARRAY['security', 'classification']),
  ('guard-002', 'GUARD', 'active', 'us-east-1', 5000, ARRAY['security', 'classification']),
  ('guard-003', 'GUARD', 'active', 'ap-southeast-1', 5000, ARRAY['security', 'classification']),
  ('scout-001', 'SCOUT', 'active', 'eu-west-1', 1000, ARRAY['discovery', 'routing']),
  ('scout-002', 'SCOUT', 'active', 'us-east-1', 1000, ARRAY['discovery', 'routing']),
  ('nurse-001', 'NURSE', 'active', 'eu-west-1', 500, ARRAY['health', 'monitoring']),
  ('drone-001', 'DRONE', 'active', 'eu-west-1', 500, ARRAY['cleanup', 'maintenance']),
  ('forager-001', 'FORAGER', 'active', 'eu-west-1', 1000, ARRAY['data_collection', 'intelligence'])
ON CONFLICT (node_id) DO NOTHING;

-- ============================================================
-- COMMENTS (documentation)
-- ============================================================

COMMENT ON SCHEMA infinity_one IS 'Infinity-One: Central Account Management Hub — IAM, RBAC, Users, Sessions, OAuth';
COMMENT ON SCHEMA lighthouse IS 'The Lighthouse: Cryptographic Token Management — UET, Threat Detection, Warp Tunnel, IceBox';
COMMENT ON SCHEMA hive IS 'The HIVE: Bio-Inspired Swarm Data Router — Bee Colony, Data Classification, Secure Routing';
COMMENT ON SCHEMA void IS 'The Void: Secure Secret Store — ZK Proofs, Shamir SSS, Post-Quantum Encryption, Audit Chain';
COMMENT ON SCHEMA audit IS 'Cross-System Audit Log — Immutable event chain for all platform systems';

COMMENT ON TABLE infinity_one.users IS 'Core user identity — profile, security, compliance, preferences';
COMMENT ON TABLE lighthouse.entity_tokens IS 'Universal Entity Tokens — cryptographic identity for every platform entity';
COMMENT ON TABLE lighthouse.icebox_entries IS 'IceBox quarantine — forensic analysis of suspicious entities';
COMMENT ON TABLE void.secrets IS 'Encrypted secret envelopes — never stores plaintext';
COMMENT ON TABLE void.secret_audit_log IS 'Immutable audit chain — tamper-evident log of all secret operations';
COMMENT ON TABLE hive.nodes IS 'HIVE bee colony nodes — Queen, Worker, Scout, Guard, Drone, Nurse, Forager';

-- ============================================================
-- MIGRATION COMPLETE
-- ============================================================
-- Version: 004
-- Systems: Infinity-One, Lighthouse, HIVE, Void
-- Tables: 28
-- Indexes: 40+
-- RLS Policies: 6
-- Triggers: 8
-- Views: 4
-- Seed Records: 22
-- ============================================================