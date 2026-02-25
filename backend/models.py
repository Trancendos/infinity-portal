# models.py — Unified database models for Infinity OS
# Merges SQL schema (001_core.sql) + ORM models with:
# - UUID primary keys everywhere
# - 5-tier role system (super_admin, org_admin, auditor, power_user, user)
# - Soft deletes for GDPR compliance
# - All governance tables (AI systems, audit, DPIA, HITL, provenance)
# - File system, modules, notifications, consent records

import uuid
from datetime import datetime, timezone
from enum import Enum as PyEnum
from sqlalchemy import (
    Column, String, DateTime, JSON, Boolean, BigInteger, Integer,
    Enum as SQLEnum, ForeignKey, Text, Index, ARRAY, UniqueConstraint,
)
from sqlalchemy.orm import declarative_base, relationship
from sqlalchemy.dialects.postgresql import UUID as PG_UUID

Base = declarative_base()


def utcnow():
    return datetime.now(timezone.utc)


def new_uuid():
    return str(uuid.uuid4())


# ============================================================
# ENUMS
# ============================================================

class UserRole(str, PyEnum):
    SUPER_ADMIN = "super_admin"
    ORG_ADMIN = "org_admin"
    AUDITOR = "auditor"
    POWER_USER = "power_user"
    USER = "user"


class RiskLevel(str, PyEnum):
    PROHIBITED = "PROHIBITED"
    HIGH_RISK = "HIGH_RISK"
    LIMITED_RISK = "LIMITED_RISK"
    MINIMAL_RISK = "MINIMAL_RISK"


class AuditEventType(str, PyEnum):
    # AI events
    GENERATION_SUCCESS = "ai.generation.success"
    GENERATION_FAILED = "ai.generation.failed"
    GOVERNANCE_REJECTED = "ai.governance.rejected"
    # Compliance events
    DPIA_COMPLETED = "compliance.dpia.completed"
    DPIA_APPROVED = "compliance.dpia.approved"
    PROVENANCE_SIGNED = "provenance.signed"
    SYSTEM_REGISTERED = "compliance.system.registered"
    # Auth events
    USER_LOGIN = "auth.user.login"
    USER_LOGOUT = "auth.user.logout"
    USER_REGISTER = "auth.user.register"
    USER_INVITED = "auth.user.invited"
    USER_ROLE_CHANGED = "auth.user.role_changed"
    USER_DEACTIVATED = "auth.user.deactivated"
    PASSWORD_RESET = "auth.password.reset"
    TOKEN_REVOKED = "auth.token.revoked"
    # Model events
    MODEL_ENABLED = "model.enabled"
    MODEL_DISABLED = "model.disabled"
    # HITL events
    HITL_APPROVED = "hitl.approved"
    HITL_REJECTED = "hitl.rejected"
    HITL_QUEUED = "hitl.queued"
    # File events
    FILE_CREATED = "file.created"
    FILE_UPDATED = "file.updated"
    FILE_DELETED = "file.deleted"
    FILE_SHARED = "file.shared"
    # Org events
    ORG_CREATED = "org.created"
    ORG_UPDATED = "org.updated"
    ORG_MEMBER_ADDED = "org.member.added"
    ORG_MEMBER_REMOVED = "org.member.removed"
    # Git events
    REPO_CREATED = "git.repo.created"
    REPO_PUSHED = "git.repo.pushed"
    REPO_SYNCED = "git.repo.synced"
    # Build events
    BUILD_STARTED = "build.started"
    BUILD_COMPLETED = "build.completed"
    BUILD_FAILED = "build.failed"


class TaskStatus(str, PyEnum):
    PROCESSED = "processed"
    PENDING_REVIEW = "pending_human_oversight"
    REJECTED = "rejected_by_oversight"


class OrgPlan(str, PyEnum):
    FREE = "free"
    PRO = "pro"
    ENTERPRISE = "enterprise"


class FileType(str, PyEnum):
    FILE = "file"
    DIRECTORY = "directory"
    SYMLINK = "symlink"


class ConsentType(str, PyEnum):
    ANALYTICS = "analytics"
    MARKETING = "marketing"
    AI = "ai"
    DATA_PROCESSING = "data-processing"


class NotificationPriority(str, PyEnum):
    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"
    URGENT = "urgent"


class ModuleStatus(str, PyEnum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    SUSPENDED = "suspended"


class RepoVisibility(str, PyEnum):
    PRIVATE = "private"
    INTERNAL = "internal"
    PUBLIC = "public"


class BuildStatus(str, PyEnum):
    QUEUED = "queued"
    BUILDING = "building"
    SUCCESS = "success"
    FAILED = "failed"
    CANCELLED = "cancelled"


class BuildTarget(str, PyEnum):
    PWA = "pwa"
    ANDROID_APK = "android_apk"
    DESKTOP_ELECTRON = "desktop_electron"
    DESKTOP_TAURI = "desktop_tauri"
    DOCKER = "docker"
    NPM_PACKAGE = "npm_package"
    PIP_PACKAGE = "pip_package"


# ============================================================
# ORGANISATIONS
# ============================================================

class Organisation(Base):
    __tablename__ = "organisations"

    id = Column(String, primary_key=True, default=new_uuid)
    name = Column(String, nullable=False, index=True)
    slug = Column(String, unique=True, nullable=False, index=True)
    logo_url = Column(String, nullable=True)
    plan = Column(SQLEnum(OrgPlan), default=OrgPlan.FREE, nullable=False)
    region_iso_code = Column(String, default="GB")
    compliance_tier = Column(String, default="standard")
    settings = Column(JSON, nullable=False, default=dict)
    is_active = Column(Boolean, default=True, index=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    deleted_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    users = relationship("User", back_populates="organisation")
    ai_systems = relationship("AISystemRecord", back_populates="organisation")
    repositories = relationship("Repository", back_populates="organisation")

    __table_args__ = (
        Index("idx_org_deleted", "deleted_at", postgresql_where=Column("deleted_at").is_(None)),
    )


# ============================================================
# USERS
# ============================================================

class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=new_uuid)
    email = Column(String, unique=True, nullable=False, index=True)
    display_name = Column(String, nullable=False, default="")
    avatar_url = Column(String, nullable=True)
    password_hash = Column(String, nullable=False)
    role = Column(SQLEnum(UserRole), default=UserRole.USER, nullable=False, index=True)
    organisation_id = Column(String, ForeignKey("organisations.id"), nullable=False, index=True)
    mfa_enabled = Column(Boolean, default=False)
    mfa_secret = Column(String, nullable=True)
    preferences = Column(JSON, nullable=False, default=dict)
    is_active = Column(Boolean, default=True, index=True)
    last_login_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, index=True)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    deleted_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    organisation = relationship("Organisation", back_populates="users")
    audit_logs = relationship("AuditLog", back_populates="user", foreign_keys="AuditLog.user_id")
    owned_files = relationship("FileNode", back_populates="owner", foreign_keys="FileNode.owner_id")
    notifications = relationship("Notification", back_populates="user")
    consent_records = relationship("ConsentRecord", back_populates="user")

    __table_args__ = (
        Index("idx_user_org_active", "organisation_id", "is_active"),
        Index("idx_user_deleted", "deleted_at", postgresql_where=Column("deleted_at").is_(None)),
    )


# ============================================================
# PERMISSIONS (Fine-grained IAM)
# ============================================================

class Permission(Base):
    __tablename__ = "permissions"

    id = Column(String, primary_key=True, default=new_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    scope = Column(String, nullable=False, index=True)  # e.g. "ai:generate", "users:manage"
    resource_type = Column(String, nullable=True)  # e.g. "ai_system", "file"
    resource_id = Column(String, nullable=True)  # specific resource ID
    granted_by = Column(String, ForeignKey("users.id"), nullable=True)
    granted_at = Column(DateTime(timezone=True), default=utcnow)
    expires_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("idx_perm_user_scope", "user_id", "scope"),
    )


# ============================================================
# API KEYS
# ============================================================

class APIKey(Base):
    __tablename__ = "api_keys"

    id = Column(String, primary_key=True, default=new_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    organisation_id = Column(String, ForeignKey("organisations.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    key_hash = Column(String, nullable=False, unique=True)
    key_prefix = Column(String, nullable=False)  # First 8 chars for identification
    scopes = Column(JSON, default=list)  # List of allowed scopes
    last_used_at = Column(DateTime(timezone=True), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)


# ============================================================
# TOKEN REVOCATION
# ============================================================

class RevokedToken(Base):
    __tablename__ = "revoked_tokens"

    id = Column(String, primary_key=True, default=new_uuid)
    jti = Column(String, unique=True, nullable=False, index=True)  # JWT ID
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    revoked_at = Column(DateTime(timezone=True), default=utcnow)
    expires_at = Column(DateTime(timezone=True), nullable=False)  # When the token would have expired


# ============================================================
# AI SYSTEM RECORDS
# ============================================================

class AISystemRecord(Base):
    __tablename__ = "ai_systems"

    id = Column(String, primary_key=True, default=new_uuid)
    organisation_id = Column(String, ForeignKey("organisations.id"), nullable=False, index=True)
    name = Column(String, nullable=False, index=True)
    description = Column(Text, nullable=True)
    purpose = Column(String, nullable=True)
    risk_level = Column(SQLEnum(RiskLevel), nullable=False, index=True)
    data_sources = Column(JSON, default=list)
    model_ids = Column(JSON, default=list)
    human_oversight_level = Column(String, default="minimal")
    transparency_measures = Column(JSON, default=dict)
    dpia_completed = Column(Boolean, default=False, index=True)
    dpia_details = Column(JSON, nullable=True)
    last_audit = Column(DateTime(timezone=True), default=utcnow)
    compliance_status = Column(String, default="ACTIVE", index=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, index=True)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    # Relationships
    organisation = relationship("Organisation", back_populates="ai_systems")
    audit_logs = relationship("AuditLog", back_populates="ai_system")
    dpia_records = relationship("DPIARecord", back_populates="ai_system")
    provenance_manifests = relationship("ProvenanceManifest", back_populates="ai_system")
    hitl_tasks = relationship("HITLTask", back_populates="ai_system")

    __table_args__ = (
        Index("idx_ai_system_org_status", "organisation_id", "compliance_status"),
    )


# ============================================================
# AUDIT LOGS (Append-only — never update or delete)
# ============================================================

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(String, primary_key=True, default=new_uuid)
    timestamp = Column(DateTime(timezone=True), default=utcnow, index=True)
    event_type = Column(SQLEnum(AuditEventType), nullable=False, index=True)
    system_id = Column(String, ForeignKey("ai_systems.id"), nullable=True, index=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=True, index=True)
    organisation_id = Column(String, nullable=False, index=True)
    risk_level = Column(SQLEnum(RiskLevel), nullable=True, index=True)
    model_used = Column(String, nullable=True)
    resource_type = Column(String, nullable=True)
    resource_id = Column(String, nullable=True)
    governance_metadata = Column(JSON, nullable=True)
    error_message = Column(Text, nullable=True)
    ip_address = Column(String, nullable=True)
    user_agent = Column(String, nullable=True)
    request_id = Column(String, index=True, unique=True)

    # Relationships
    ai_system = relationship("AISystemRecord", back_populates="audit_logs")
    user = relationship("User", back_populates="audit_logs", foreign_keys=[user_id])

    __table_args__ = (
        Index("idx_audit_org_timestamp", "organisation_id", "timestamp"),
        Index("idx_audit_event_timestamp", "event_type", "timestamp"),
    )


# ============================================================
# PROVENANCE MANIFESTS (C2PA)
# ============================================================

class ProvenanceManifest(Base):
    __tablename__ = "provenance_manifests"

    request_id = Column(String, primary_key=True, index=True)
    system_id = Column(String, ForeignKey("ai_systems.id"), nullable=True, index=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=True, index=True)
    organisation_id = Column(String, nullable=False, index=True)
    content_hash = Column(String, index=True, unique=True)
    manifest_url = Column(String, nullable=True)
    manifest_data = Column(JSON, nullable=True)
    signing_status = Column(String, default="PENDING", index=True)
    signed_at = Column(DateTime(timezone=True), nullable=True)
    temporal_workflow_id = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, index=True)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    # Relationships
    ai_system = relationship("AISystemRecord", back_populates="provenance_manifests")

    __table_args__ = (
        Index("idx_provenance_status", "signing_status", "created_at"),
    )


# ============================================================
# DPIA RECORDS
# ============================================================

class DPIARecord(Base):
    __tablename__ = "dpia_records"

    id = Column(String, primary_key=True, default=new_uuid)
    system_id = Column(String, ForeignKey("ai_systems.id"), unique=True, index=True)
    assessment_date = Column(DateTime(timezone=True), default=utcnow, index=True)
    data_categories = Column(JSON, default=list)
    risk_assessment = Column(JSON, nullable=True)
    safeguards_implemented = Column(JSON, default=list)
    approval_status = Column(String, default="PENDING", index=True)
    approved_by = Column(String, nullable=True)
    approved_at = Column(DateTime(timezone=True), nullable=True)
    next_review_date = Column(DateTime(timezone=True), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    # Relationships
    ai_system = relationship("AISystemRecord", back_populates="dpia_records")


# ============================================================
# HITL TASKS
# ============================================================

class HITLTask(Base):
    __tablename__ = "hitl_tasks"

    id = Column(String, primary_key=True, default=new_uuid)
    system_id = Column(String, ForeignKey("ai_systems.id"), nullable=True, index=True)
    system_name = Column(String, nullable=False)
    task_type = Column(String, nullable=False, index=True)
    prompt = Column(Text, nullable=False)
    proposed_output = Column(Text, nullable=True)
    risk_level = Column(SQLEnum(RiskLevel), nullable=False, index=True)
    status = Column(SQLEnum(TaskStatus), default=TaskStatus.PENDING_REVIEW, index=True)
    submitted_by = Column(String, ForeignKey("users.id"), nullable=True, index=True)
    reviewed_by = Column(String, ForeignKey("users.id"), nullable=True)
    review_comments = Column(Text, nullable=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    organisation_id = Column(String, nullable=False, index=True)
    manifest_id = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, index=True)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    # Relationships
    ai_system = relationship("AISystemRecord", back_populates="hitl_tasks")

    __table_args__ = (
        Index("idx_hitl_org_status", "organisation_id", "status"),
        Index("idx_hitl_status_created", "status", "created_at"),
    )


# ============================================================
# FILE SYSTEM
# ============================================================

class FileNode(Base):
    __tablename__ = "file_nodes"

    id = Column(String, primary_key=True, default=new_uuid)
    name = Column(String, nullable=False)
    path = Column(String, nullable=False)
    type = Column(SQLEnum(FileType), nullable=False)
    mime_type = Column(String, nullable=True)
    size = Column(BigInteger, default=0)
    owner_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    organisation_id = Column(String, ForeignKey("organisations.id"), nullable=False, index=True)
    parent_id = Column(String, ForeignKey("file_nodes.id"), nullable=True, index=True)
    storage_key = Column(String, nullable=True)  # R2/MinIO object key
    version = Column(Integer, default=1)
    content_text = Column(Text, nullable=True)  # Extracted text for search
    acl = Column(JSON, default=list)
    metadata = Column(JSON, default=dict)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    deleted_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    owner = relationship("User", back_populates="owned_files", foreign_keys=[owner_id])
    children = relationship("FileNode", back_populates="parent", foreign_keys=[parent_id])
    parent = relationship("FileNode", back_populates="children", remote_side=[id], foreign_keys=[parent_id])
    versions = relationship("FileVersion", back_populates="file_node")

    __table_args__ = (
        Index("idx_file_path", "path"),
        Index("idx_file_org", "organisation_id"),
        UniqueConstraint("organisation_id", "path", name="uq_file_org_path"),
    )


class FileVersion(Base):
    __tablename__ = "file_versions"

    id = Column(String, primary_key=True, default=new_uuid)
    file_id = Column(String, ForeignKey("file_nodes.id"), nullable=False, index=True)
    version = Column(Integer, nullable=False)
    size = Column(BigInteger, nullable=False)
    storage_key = Column(String, nullable=False)
    created_by = Column(String, ForeignKey("users.id"), nullable=False)
    change_description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    # Relationships
    file_node = relationship("FileNode", back_populates="versions")

    __table_args__ = (
        UniqueConstraint("file_id", "version", name="uq_file_version"),
    )


# ============================================================
# MODULE REGISTRY
# ============================================================

class ModuleManifest(Base):
    __tablename__ = "module_manifests"

    id = Column(String, primary_key=True, default=new_uuid)
    module_id = Column(String, unique=True, nullable=False, index=True)
    name = Column(String, nullable=False)
    version = Column(String, nullable=False)
    description = Column(Text, nullable=False)
    author = Column(String, nullable=False)
    author_url = Column(String, nullable=True)
    icon_url = Column(String, nullable=False)
    entry_point = Column(String, nullable=False)
    category = Column(String, nullable=False, index=True)
    permissions = Column(JSON, default=list)
    min_kernel_version = Column(String, default="0.1.0")
    dependencies = Column(JSON, default=dict)
    keywords = Column(JSON, default=list)
    screenshots = Column(JSON, default=list)
    is_built_in = Column(Boolean, default=False)
    is_sandboxed = Column(Boolean, default=True)
    privacy_policy_url = Column(String, nullable=True)
    support_url = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class AppStoreListing(Base):
    __tablename__ = "app_store_listings"

    id = Column(String, primary_key=True, default=new_uuid)
    manifest_id = Column(String, ForeignKey("module_manifests.id"), nullable=False)
    downloads = Column(Integer, default=0)
    rating = Column(String, default="0.00")
    review_count = Column(Integer, default=0)
    is_featured = Column(Boolean, default=False)
    is_verified = Column(Boolean, default=False)
    status = Column(SQLEnum(ModuleStatus), default=ModuleStatus.PENDING)
    rejection_reason = Column(Text, nullable=True)
    published_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class ModuleInstallation(Base):
    __tablename__ = "module_installations"

    id = Column(String, primary_key=True, default=new_uuid)
    manifest_id = Column(String, ForeignKey("module_manifests.id"), nullable=False)
    organisation_id = Column(String, ForeignKey("organisations.id"), nullable=False, index=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=True, index=True)
    installed_by = Column(String, ForeignKey("users.id"), nullable=False)
    granted_permissions = Column(JSON, default=list)
    is_enabled = Column(Boolean, default=True)
    settings = Column(JSON, default=dict)
    installed_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


# ============================================================
# NOTIFICATIONS
# ============================================================

class Notification(Base):
    __tablename__ = "notifications"

    id = Column(String, primary_key=True, default=new_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    title = Column(String, nullable=False)
    body = Column(Text, nullable=False)
    icon_url = Column(String, nullable=True)
    action_url = Column(String, nullable=True)
    priority = Column(SQLEnum(NotificationPriority), default=NotificationPriority.NORMAL)
    channels = Column(JSON, default=lambda: ["in-app"])
    read_at = Column(DateTime(timezone=True), nullable=True)
    source_module = Column(String, nullable=True)
    metadata = Column(JSON, default=dict)
    created_at = Column(DateTime(timezone=True), default=utcnow, index=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    user = relationship("User", back_populates="notifications")


# ============================================================
# CONSENT RECORDS (GDPR Article 7)
# ============================================================

class ConsentRecord(Base):
    __tablename__ = "consent_records"

    id = Column(String, primary_key=True, default=new_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    consent_type = Column(SQLEnum(ConsentType), nullable=False, index=True)
    granted = Column(Boolean, nullable=False)
    version = Column(String, nullable=False)
    ip_address = Column(String, nullable=True)
    granted_at = Column(DateTime(timezone=True), default=utcnow)
    revoked_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    user = relationship("User", back_populates="consent_records")


# ============================================================
# GIT REPOSITORIES (Internal Git Hosting)
# ============================================================

class Repository(Base):
    __tablename__ = "repositories"

    id = Column(String, primary_key=True, default=new_uuid)
    organisation_id = Column(String, ForeignKey("organisations.id"), nullable=False, index=True)
    owner_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    slug = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    visibility = Column(SQLEnum(RepoVisibility), default=RepoVisibility.PRIVATE)
    default_branch = Column(String, default="main")
    storage_path = Column(String, nullable=False)  # Path to bare git repo
    # GitHub sync
    github_remote_url = Column(String, nullable=True)
    github_sync_enabled = Column(Boolean, default=False)
    last_synced_at = Column(DateTime(timezone=True), nullable=True)
    # Stats
    size_bytes = Column(BigInteger, default=0)
    commit_count = Column(Integer, default=0)
    branch_count = Column(Integer, default=1)
    # Metadata
    topics = Column(JSON, default=list)
    is_archived = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    deleted_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    organisation = relationship("Organisation", back_populates="repositories")
    builds = relationship("BuildJob", back_populates="repository")

    __table_args__ = (
        UniqueConstraint("organisation_id", "slug", name="uq_repo_org_slug"),
        Index("idx_repo_org", "organisation_id"),
    )


# ============================================================
# BUILD JOBS (Multi-Platform Packaging)
# ============================================================

class BuildJob(Base):
    __tablename__ = "build_jobs"

    id = Column(String, primary_key=True, default=new_uuid)
    repository_id = Column(String, ForeignKey("repositories.id"), nullable=True, index=True)
    organisation_id = Column(String, nullable=False, index=True)
    triggered_by = Column(String, ForeignKey("users.id"), nullable=False)
    target = Column(SQLEnum(BuildTarget), nullable=False)
    status = Column(SQLEnum(BuildStatus), default=BuildStatus.QUEUED, index=True)
    # Build config
    source_path = Column(String, nullable=False)
    build_command = Column(String, nullable=True)
    output_path = Column(String, nullable=True)
    # Results
    artifact_url = Column(String, nullable=True)
    artifact_size = Column(BigInteger, nullable=True)
    build_log = Column(Text, nullable=True)
    error_message = Column(Text, nullable=True)
    duration_seconds = Column(Integer, nullable=True)
    # Metadata
    config = Column(JSON, default=dict)
    created_at = Column(DateTime(timezone=True), default=utcnow, index=True)
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    repository = relationship("Repository", back_populates="builds")

    __table_args__ = (
        Index("idx_build_org_status", "organisation_id", "status"),
    )


# ============================================================
# FEDERATION (Ecosystem Integration)
# ============================================================

class FederatedService(Base):
    __tablename__ = "federated_services"

    id = Column(String, primary_key=True, default=new_uuid)
    organisation_id = Column(String, ForeignKey("organisations.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    service_type = Column(String, nullable=False)  # "agent", "space", "external"
    endpoint_url = Column(String, nullable=False)
    health_check_url = Column(String, nullable=True)
    auth_method = Column(String, default="bearer")  # "bearer", "api_key", "mtls"
    auth_credentials_ref = Column(String, nullable=True)  # Reference to secrets store
    status = Column(String, default="active")  # "active", "degraded", "offline"
    capabilities = Column(JSON, default=list)
    last_health_check = Column(DateTime(timezone=True), nullable=True)
    metadata = Column(JSON, default=dict)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    __table_args__ = (
        Index("idx_fed_org_type", "organisation_id", "service_type"),
    )