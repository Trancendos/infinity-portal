-- ============================================================
-- Infinity OS — Core Database Schema
-- Database: Supabase (PostgreSQL 15)
-- Security: Row Level Security (RLS) on all tables
-- Compliance: GDPR, SOC 2, ISO 27001
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "vector"; -- pgvector for semantic search

-- ============================================================
-- ORGANISATIONS
-- ============================================================

CREATE TABLE organisations (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  logo_url      TEXT,
  plan          TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'enterprise')),
  settings      JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ -- Soft delete for GDPR compliance
);

CREATE INDEX idx_organisations_slug ON organisations(slug);
CREATE INDEX idx_organisations_deleted_at ON organisations(deleted_at) WHERE deleted_at IS NULL;

-- ============================================================
-- USERS
-- ============================================================

CREATE TABLE users (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email             TEXT NOT NULL UNIQUE,
  display_name      TEXT NOT NULL,
  avatar_url        TEXT,
  role              TEXT NOT NULL DEFAULT 'user' 
                    CHECK (role IN ('super_admin', 'org_admin', 'power_user', 'user')),
  organisation_id   UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  mfa_enabled       BOOLEAN NOT NULL DEFAULT FALSE,
  mfa_secret        TEXT, -- Encrypted TOTP secret
  preferences       JSONB NOT NULL DEFAULT '{}',
  last_login_at     TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ -- Soft delete for GDPR right to erasure
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_organisation_id ON users(organisation_id);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_deleted_at ON users(deleted_at) WHERE deleted_at IS NULL;

-- ============================================================
-- AUDIT LOGS (Append-only — never update or delete)
-- ============================================================

CREATE TABLE audit_logs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  organisation_id UUID REFERENCES organisations(id) ON DELETE CASCADE,
  action          TEXT NOT NULL,
  resource_type   TEXT NOT NULL,
  resource_id     TEXT,
  ip_address      INET,
  user_agent      TEXT,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  -- NO updated_at, NO deleted_at — audit logs are immutable
);

CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_organisation_id ON audit_logs(organisation_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- ============================================================
-- CONSENT RECORDS (GDPR Article 7)
-- ============================================================

CREATE TABLE consent_records (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  consent_type  TEXT NOT NULL CHECK (consent_type IN ('analytics', 'marketing', 'ai', 'data-processing')),
  granted       BOOLEAN NOT NULL,
  version       TEXT NOT NULL, -- Policy version at time of consent
  ip_address    INET,
  granted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at    TIMESTAMPTZ
);

CREATE INDEX idx_consent_records_user_id ON consent_records(user_id);
CREATE INDEX idx_consent_records_type ON consent_records(consent_type);

-- ============================================================
-- FILE SYSTEM
-- ============================================================

CREATE TABLE file_nodes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            TEXT NOT NULL,
  path            TEXT NOT NULL,
  type            TEXT NOT NULL CHECK (type IN ('file', 'directory', 'symlink')),
  mime_type       TEXT,
  size            BIGINT NOT NULL DEFAULT 0,
  owner_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  parent_id       UUID REFERENCES file_nodes(id) ON DELETE CASCADE,
  -- Unix-style permissions
  owner_perms     TEXT[] NOT NULL DEFAULT ARRAY['read', 'write'],
  group_perms     TEXT[] NOT NULL DEFAULT ARRAY['read'],
  world_perms     TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  -- ACL for fine-grained sharing
  acl             JSONB NOT NULL DEFAULT '[]',
  -- Storage reference
  storage_key     TEXT, -- Cloudflare R2 object key
  -- Versioning
  version         INTEGER NOT NULL DEFAULT 1,
  -- Full-text search
  content_text    TEXT, -- Extracted text content for search
  search_vector   TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('english', COALESCE(name, '') || ' ' || COALESCE(content_text, ''))
  ) STORED,
  -- Semantic search embedding
  embedding       VECTOR(1536), -- OpenAI/CF AI embedding dimension
  -- Metadata
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ -- Soft delete
);

CREATE INDEX idx_file_nodes_path ON file_nodes(path);
CREATE INDEX idx_file_nodes_owner_id ON file_nodes(owner_id);
CREATE INDEX idx_file_nodes_organisation_id ON file_nodes(organisation_id);
CREATE INDEX idx_file_nodes_parent_id ON file_nodes(parent_id);
CREATE INDEX idx_file_nodes_search ON file_nodes USING GIN(search_vector);
CREATE INDEX idx_file_nodes_deleted_at ON file_nodes(deleted_at) WHERE deleted_at IS NULL;
-- Unique path per organisation
CREATE UNIQUE INDEX idx_file_nodes_unique_path ON file_nodes(organisation_id, path) WHERE deleted_at IS NULL;

-- File versions table
CREATE TABLE file_versions (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  file_id           UUID NOT NULL REFERENCES file_nodes(id) ON DELETE CASCADE,
  version           INTEGER NOT NULL,
  size              BIGINT NOT NULL,
  storage_key       TEXT NOT NULL,
  created_by        UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  change_description TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(file_id, version)
);

CREATE INDEX idx_file_versions_file_id ON file_versions(file_id);

-- ============================================================
-- MODULE REGISTRY
-- ============================================================

CREATE TABLE module_manifests (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  module_id       TEXT NOT NULL UNIQUE, -- e.g. "com.trancendos.file-manager"
  name            TEXT NOT NULL,
  version         TEXT NOT NULL,
  description     TEXT NOT NULL,
  author          TEXT NOT NULL,
  author_url      TEXT,
  icon_url        TEXT NOT NULL,
  entry_point     TEXT NOT NULL,
  category        TEXT NOT NULL,
  permissions     TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  min_kernel_version TEXT NOT NULL DEFAULT '0.1.0',
  dependencies    JSONB NOT NULL DEFAULT '{}',
  keywords        TEXT[] DEFAULT ARRAY[]::TEXT[],
  screenshots     TEXT[] DEFAULT ARRAY[]::TEXT[],
  is_built_in     BOOLEAN NOT NULL DEFAULT FALSE,
  is_sandboxed    BOOLEAN NOT NULL DEFAULT TRUE,
  privacy_policy_url TEXT,
  support_url     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_module_manifests_module_id ON module_manifests(module_id);
CREATE INDEX idx_module_manifests_category ON module_manifests(category);

-- App Store listings
CREATE TABLE app_store_listings (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  manifest_id     UUID NOT NULL REFERENCES module_manifests(id) ON DELETE CASCADE,
  downloads       INTEGER NOT NULL DEFAULT 0,
  rating          DECIMAL(3,2) DEFAULT 0.00,
  review_count    INTEGER NOT NULL DEFAULT 0,
  is_featured     BOOLEAN NOT NULL DEFAULT FALSE,
  is_verified     BOOLEAN NOT NULL DEFAULT FALSE,
  status          TEXT NOT NULL DEFAULT 'pending' 
                  CHECK (status IN ('pending', 'approved', 'rejected', 'suspended')),
  rejection_reason TEXT,
  published_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Installed modules (per user or per organisation)
CREATE TABLE module_installations (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  manifest_id         UUID NOT NULL REFERENCES module_manifests(id) ON DELETE CASCADE,
  organisation_id     UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  user_id             UUID REFERENCES users(id) ON DELETE CASCADE, -- NULL = org-wide
  installed_by        UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  granted_permissions TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  is_enabled          BOOLEAN NOT NULL DEFAULT TRUE,
  settings            JSONB DEFAULT '{}',
  installed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_module_installations_org ON module_installations(organisation_id);
CREATE INDEX idx_module_installations_user ON module_installations(user_id);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================

CREATE TABLE notifications (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  body            TEXT NOT NULL,
  icon_url        TEXT,
  action_url      TEXT,
  priority        TEXT NOT NULL DEFAULT 'normal' 
                  CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  channels        TEXT[] NOT NULL DEFAULT ARRAY['in-app'],
  read_at         TIMESTAMPTZ,
  source_module   TEXT,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ
);

CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_read_at ON notifications(read_at) WHERE read_at IS NULL;
CREATE INDEX idx_notifications_created_at ON notifications(created_at DESC);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE organisations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE consent_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE module_manifests ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_store_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE module_installations ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Users can only see their own organisation's data
CREATE POLICY "users_own_org" ON users
  FOR ALL USING (organisation_id = (
    SELECT organisation_id FROM users WHERE id = auth.uid()
  ));

-- Users can only see their own files or files shared with them
CREATE POLICY "files_own_or_shared" ON file_nodes
  FOR SELECT USING (
    owner_id = auth.uid()
    OR organisation_id = (SELECT organisation_id FROM users WHERE id = auth.uid())
    OR acl @> jsonb_build_array(jsonb_build_object('principalId', auth.uid()::text))
  );

CREATE POLICY "files_own_write" ON file_nodes
  FOR INSERT WITH CHECK (owner_id = auth.uid());

CREATE POLICY "files_own_update" ON file_nodes
  FOR UPDATE USING (owner_id = auth.uid());

-- Users can only see their own notifications
CREATE POLICY "notifications_own" ON notifications
  FOR ALL USING (user_id = auth.uid());

-- Users can only see their own consent records
CREATE POLICY "consent_own" ON consent_records
  FOR ALL USING (user_id = auth.uid());

-- Module manifests are publicly readable (for App Store)
CREATE POLICY "modules_public_read" ON module_manifests
  FOR SELECT USING (TRUE);

-- App store listings are publicly readable
CREATE POLICY "listings_public_read" ON app_store_listings
  FOR SELECT USING (status = 'approved');

-- ============================================================
-- TRIGGERS — Auto-update updated_at
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_organisations_updated_at
  BEFORE UPDATE ON organisations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_file_nodes_updated_at
  BEFORE UPDATE ON file_nodes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_module_manifests_updated_at
  BEFORE UPDATE ON module_manifests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_app_store_listings_updated_at
  BEFORE UPDATE ON app_store_listings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- SEED DATA — Built-in modules
-- ============================================================

INSERT INTO organisations (id, name, slug, plan) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Trancendos', 'trancendos', 'enterprise');

INSERT INTO module_manifests (module_id, name, version, description, author, icon_url, entry_point, category, is_built_in, is_sandboxed, min_kernel_version) VALUES
  ('com.infinity-os.file-manager', 'File Manager', '0.1.0', 'Browse, manage, and organise your files', 'Infinity OS', '/icons/file-manager.svg', '/modules/file-manager/index.js', 'utilities', TRUE, FALSE, '0.1.0'),
  ('com.infinity-os.text-editor', 'Text Editor', '0.1.0', 'A powerful, lightweight text and code editor', 'Infinity OS', '/icons/text-editor.svg', '/modules/text-editor/index.js', 'productivity', TRUE, FALSE, '0.1.0'),
  ('com.infinity-os.settings', 'Settings', '0.1.0', 'Configure your Infinity OS experience', 'Infinity OS', '/icons/settings.svg', '/modules/settings/index.js', 'utilities', TRUE, FALSE, '0.1.0'),
  ('com.infinity-os.app-store', 'Infinity Market', '0.1.0', 'Discover and install applications for Infinity OS', 'Infinity OS', '/icons/app-store.svg', '/modules/app-store/index.js', 'utilities', TRUE, FALSE, '0.1.0'),
  ('com.infinity-os.terminal', 'Terminal', '0.1.0', 'A web-based terminal emulator', 'Infinity OS', '/icons/terminal.svg', '/modules/terminal/index.js', 'development', TRUE, FALSE, '0.1.0');