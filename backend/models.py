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


class TaskPriority(str, PyEnum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class TaskType(str, PyEnum):
    STORY = "story"
    BUG = "bug"
    TASK = "task"
    EPIC = "epic"
    SUBTASK = "subtask"
    SPIKE = "spike"


class BoardColumnType(str, PyEnum):
    BACKLOG = "backlog"
    TODO = "todo"
    IN_PROGRESS = "in_progress"
    IN_REVIEW = "in_review"
    TESTING = "testing"
    DONE = "done"
    ARCHIVED = "archived"


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
    event_type = Column(String, nullable=False, index=True)
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
    extra_data = Column(JSON, default=dict)
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
    extra_data = Column(JSON, default=dict)
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
    extra_data = Column(JSON, default=dict)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    __table_args__ = (
        Index("idx_fed_org_type", "organisation_id", "service_type"),
    )


# ============================================================
# KANBAN BOARD (Task Management)
# ============================================================

class Board(Base):
    """Kanban board for project/task management"""
    __tablename__ = "boards"

    id = Column(String, primary_key=True, default=new_uuid)
    organisation_id = Column(String, ForeignKey("organisations.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    owner_id = Column(String, ForeignKey("users.id"), nullable=False)
    is_default = Column(Boolean, default=False)
    settings = Column(JSON, default=dict)  # WIP limits, colors, etc.
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    deleted_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    columns = relationship("BoardColumn", back_populates="board", order_by="BoardColumn.position")
    tasks = relationship("Task", back_populates="board")
    labels = relationship("TaskLabel", back_populates="board")

    __table_args__ = (
        Index("idx_board_org", "organisation_id"),
    )


class BoardColumn(Base):
    """Swim lane / column in a Kanban board"""
    __tablename__ = "board_columns"

    id = Column(String, primary_key=True, default=new_uuid)
    board_id = Column(String, ForeignKey("boards.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String, nullable=False)
    column_type = Column(SQLEnum(BoardColumnType), nullable=False, default=BoardColumnType.TODO)
    position = Column(Integer, nullable=False, default=0)
    wip_limit = Column(Integer, nullable=True)  # Work-in-progress limit
    color = Column(String, nullable=True)  # Hex color for the column header
    is_done_column = Column(Boolean, default=False)  # Marks tasks as "complete" when moved here
    created_at = Column(DateTime(timezone=True), default=utcnow)

    # Relationships
    board = relationship("Board", back_populates="columns")
    tasks = relationship("Task", back_populates="column", order_by="Task.position")

    __table_args__ = (
        Index("idx_col_board_pos", "board_id", "position"),
    )


class TaskLabel(Base):
    """Labels/tags for categorizing tasks"""
    __tablename__ = "task_labels"

    id = Column(String, primary_key=True, default=new_uuid)
    board_id = Column(String, ForeignKey("boards.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String, nullable=False)
    color = Column(String, default="#6366f1")  # Hex color
    created_at = Column(DateTime(timezone=True), default=utcnow)

    board = relationship("Board", back_populates="labels")


class Task(Base):
    """Individual task card on the Kanban board"""
    __tablename__ = "tasks"

    id = Column(String, primary_key=True, default=new_uuid)
    board_id = Column(String, ForeignKey("boards.id", ondelete="CASCADE"), nullable=False, index=True)
    column_id = Column(String, ForeignKey("board_columns.id", ondelete="SET NULL"), nullable=True, index=True)
    parent_id = Column(String, ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True, index=True)  # For subtasks
    organisation_id = Column(String, ForeignKey("organisations.id"), nullable=False, index=True)

    # Core fields
    key = Column(String, nullable=False, index=True)  # e.g. "INF-42"
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    task_type = Column(SQLEnum(TaskType), default=TaskType.TASK)
    priority = Column(SQLEnum(TaskPriority), default=TaskPriority.MEDIUM)
    position = Column(Integer, default=0)  # Order within column

    # Assignment
    creator_id = Column(String, ForeignKey("users.id"), nullable=False)
    assignee_id = Column(String, ForeignKey("users.id"), nullable=True, index=True)

    # Metadata
    labels = Column(JSON, default=list)  # List of label IDs
    story_points = Column(Integer, nullable=True)
    due_date = Column(DateTime(timezone=True), nullable=True)
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    estimated_hours = Column(Integer, nullable=True)
    actual_hours = Column(Integer, nullable=True)
    tags = Column(JSON, default=list)  # Free-form tags

    # Timestamps
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    deleted_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    board = relationship("Board", back_populates="tasks")
    column = relationship("BoardColumn", back_populates="tasks")
    creator = relationship("User", foreign_keys=[creator_id])
    assignee = relationship("User", foreign_keys=[assignee_id])
    subtasks = relationship("Task", backref="parent", remote_side=[id], foreign_keys=[parent_id])
    comments = relationship("TaskComment", back_populates="task", order_by="TaskComment.created_at")
    history = relationship("TaskHistory", back_populates="task", order_by="TaskHistory.created_at.desc()")
    attachments = relationship("TaskAttachment", back_populates="task")

    __table_args__ = (
        Index("idx_task_board_col", "board_id", "column_id"),
        Index("idx_task_org_assignee", "organisation_id", "assignee_id"),
        Index("idx_task_key", "key"),
    )


class TaskComment(Base):
    """Comments on a task card"""
    __tablename__ = "task_comments"

    id = Column(String, primary_key=True, default=new_uuid)
    task_id = Column(String, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True)
    author_id = Column(String, ForeignKey("users.id"), nullable=False)
    content = Column(Text, nullable=False)
    is_internal = Column(Boolean, default=False)  # Internal notes vs public comments
    edited_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    deleted_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    task = relationship("Task", back_populates="comments")
    author = relationship("User")


class TaskHistory(Base):
    """Audit trail / action history for a task"""
    __tablename__ = "task_history"

    id = Column(String, primary_key=True, default=new_uuid)
    task_id = Column(String, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    action = Column(String, nullable=False)  # "created", "moved", "assigned", "commented", "priority_changed", etc.
    field_name = Column(String, nullable=True)  # Which field changed
    old_value = Column(Text, nullable=True)
    new_value = Column(Text, nullable=True)
    extra_data = Column(JSON, default=dict)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    # Relationships
    task = relationship("Task", back_populates="history")
    user = relationship("User")

    __table_args__ = (
        Index("idx_history_task_time", "task_id", "created_at"),
    )


class TaskAttachment(Base):
    """File attachments on a task"""
    __tablename__ = "task_attachments"

    id = Column(String, primary_key=True, default=new_uuid)
    task_id = Column(String, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True)
    uploader_id = Column(String, ForeignKey("users.id"), nullable=False)
    filename = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    file_size = Column(BigInteger, default=0)
    mime_type = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    task = relationship("Task", back_populates="attachments")
    uploader = relationship("User")

# ============================================================
# API INTEGRATION HUB
# ============================================================

class ConnectorStatus(str, PyEnum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    ERROR = "error"
    PENDING_AUTH = "pending_auth"
    RATE_LIMITED = "rate_limited"


class ConnectorAuthType(str, PyEnum):
    API_KEY = "api_key"
    OAUTH2 = "oauth2"
    BEARER = "bearer"
    BASIC = "basic"
    WEBHOOK_SECRET = "webhook_secret"
    NONE = "none"


class WebhookEventType(str, PyEnum):
    INCOMING = "incoming"
    OUTGOING = "outgoing"


class IntegrationConnector(Base):
    """External API integration connector"""
    __tablename__ = "integration_connectors"

    id = Column(String, primary_key=True, default=new_uuid)
    organisation_id = Column(String, ForeignKey("organisations.id"), nullable=False, index=True)
    created_by = Column(String, ForeignKey("users.id"), nullable=False)

    name = Column(String, nullable=False)
    slug = Column(String, nullable=False, index=True)
    description = Column(Text, nullable=True)
    icon_url = Column(String, nullable=True)
    category = Column(String, nullable=False, default="general", index=True)

    base_url = Column(String, nullable=False)
    auth_type = Column(SQLEnum(ConnectorAuthType), default=ConnectorAuthType.BEARER)
    auth_config = Column(JSON, default=dict)
    headers = Column(JSON, default=dict)
    rate_limit_rpm = Column(Integer, default=60)

    status = Column(SQLEnum(ConnectorStatus), default=ConnectorStatus.INACTIVE)
    last_health_check = Column(DateTime(timezone=True), nullable=True)
    last_error = Column(Text, nullable=True)
    request_count = Column(BigInteger, default=0)
    error_count = Column(BigInteger, default=0)

    capabilities = Column(JSON, default=list)
    supported_events = Column(JSON, default=list)
    config_schema = Column(JSON, default=dict)
    user_config = Column(JSON, default=dict)

    is_built_in = Column(Boolean, default=False)
    is_sandboxed = Column(Boolean, default=True)
    version = Column(String, default="1.0.0")

    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    deleted_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("idx_connector_org_slug", "organisation_id", "slug"),
    )


class WebhookEndpoint(Base):
    """Webhook endpoint for integration connectors"""
    __tablename__ = "webhook_endpoints"

    id = Column(String, primary_key=True, default=new_uuid)
    connector_id = Column(String, ForeignKey("integration_connectors.id", ondelete="CASCADE"), nullable=False, index=True)

    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    event_type = Column(SQLEnum(WebhookEventType), default=WebhookEventType.INCOMING)
    url = Column(String, nullable=True)
    path_suffix = Column(String, nullable=True, unique=True, index=True)
    hmac_secret = Column(String, nullable=True)

    is_active = Column(Boolean, default=True)
    event_filters = Column(JSON, default=list)
    headers = Column(JSON, default=dict)
    max_retries = Column(Integer, default=3)
    retry_delay_seconds = Column(Integer, default=60)

    trigger_count = Column(BigInteger, default=0)
    failure_count = Column(BigInteger, default=0)
    last_triggered = Column(DateTime(timezone=True), nullable=True)
    last_error = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class WebhookDelivery(Base):
    """Audit log for webhook deliveries"""
    __tablename__ = "webhook_deliveries"

    id = Column(String, primary_key=True, default=new_uuid)
    webhook_id = Column(String, ForeignKey("webhook_endpoints.id", ondelete="CASCADE"), nullable=False, index=True)

    event_type = Column(String, nullable=False)
    payload_hash = Column(String, nullable=True)
    request_headers = Column(JSON, default=dict)
    response_status = Column(Integer, nullable=True)
    response_body = Column(Text, nullable=True)
    latency_ms = Column(Integer, nullable=True)
    success = Column(Boolean, default=False)
    error_message = Column(Text, nullable=True)
    attempt_number = Column(Integer, default=1)

    created_at = Column(DateTime(timezone=True), default=utcnow)

    __table_args__ = (
        Index("idx_delivery_webhook_time", "webhook_id", "created_at"),
    )


# ============================================================
# ITSM — IT SERVICE MANAGEMENT
# ============================================================

class IncidentSeverity(str, PyEnum):
    P1 = "P1"
    P2 = "P2"
    P3 = "P3"
    P4 = "P4"
    P5 = "P5"


class IncidentStatus(str, PyEnum):
    OPEN = "open"
    ACKNOWLEDGED = "acknowledged"
    IN_PROGRESS = "in_progress"
    ON_HOLD = "on_hold"
    RESOLVED = "resolved"
    CLOSED = "closed"


class ChangeType(str, PyEnum):
    STANDARD = "standard"
    NORMAL = "normal"
    EMERGENCY = "emergency"


class ChangeStatus(str, PyEnum):
    DRAFT = "draft"
    SUBMITTED = "submitted"
    APPROVED = "approved"
    REJECTED = "rejected"
    IMPLEMENTING = "implementing"
    COMPLETED = "completed"
    ROLLED_BACK = "rolled_back"
    CANCELLED = "cancelled"


class CMDBItemStatus(str, PyEnum):
    ACTIVE = "active"
    MAINTENANCE = "maintenance"
    RETIRED = "retired"
    DISPOSED = "disposed"


class ITSMIncident(Base):
    """ITSM Incident tracking — ITIL-aligned"""
    __tablename__ = "itsm_incidents"

    id = Column(String, primary_key=True, default=new_uuid)
    key = Column(String, unique=True, nullable=False, index=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    severity = Column(String, nullable=False, default=IncidentSeverity.P3.value)
    status = Column(String, nullable=False, default=IncidentStatus.OPEN.value)
    category = Column(String, nullable=True)
    subcategory = Column(String, nullable=True)

    assignee_id = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    reporter_id = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=False)
    organisation_id = Column(String, ForeignKey("organisations.id", ondelete="CASCADE"), nullable=False, index=True)
    sla_id = Column(String, ForeignKey("itsm_sla_definitions.id", ondelete="SET NULL"), nullable=True)
    problem_id = Column(String, ForeignKey("itsm_problems.id", ondelete="SET NULL"), nullable=True, index=True)

    resolution = Column(Text, nullable=True)
    escalation_level = Column(Integer, default=0)
    impact = Column(String, nullable=True)
    urgency = Column(String, nullable=True)
    affected_services = Column(JSON, default=list)
    tags = Column(JSON, default=list)

    acknowledged_at = Column(DateTime(timezone=True), nullable=True)
    resolved_at = Column(DateTime(timezone=True), nullable=True)
    closed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    deleted_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("idx_incident_org_status", "organisation_id", "status"),
        Index("idx_incident_severity", "severity"),
    )


class ITSMProblem(Base):
    """ITSM Problem management — root cause analysis"""
    __tablename__ = "itsm_problems"

    id = Column(String, primary_key=True, default=new_uuid)
    key = Column(String, unique=True, nullable=False, index=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    root_cause = Column(Text, nullable=True)
    workaround = Column(Text, nullable=True)
    status = Column(String, nullable=False, default="open")
    owner_id = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    organisation_id = Column(String, ForeignKey("organisations.id", ondelete="CASCADE"), nullable=False, index=True)

    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    deleted_at = Column(DateTime(timezone=True), nullable=True)


class ITSMChange(Base):
    """ITSM Change management"""
    __tablename__ = "itsm_changes"

    id = Column(String, primary_key=True, default=new_uuid)
    key = Column(String, unique=True, nullable=False, index=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    change_type = Column(String, nullable=False, default=ChangeType.NORMAL.value)
    risk_level = Column(String, nullable=True)
    impact = Column(String, nullable=True)
    rollback_plan = Column(Text, nullable=True)
    implementation_plan = Column(Text, nullable=True)
    status = Column(String, nullable=False, default=ChangeStatus.DRAFT.value)

    requester_id = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=False)
    assignee_id = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    cab_approver_id = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    organisation_id = Column(String, ForeignKey("organisations.id", ondelete="CASCADE"), nullable=False, index=True)

    scheduled_start = Column(DateTime(timezone=True), nullable=True)
    scheduled_end = Column(DateTime(timezone=True), nullable=True)
    actual_start = Column(DateTime(timezone=True), nullable=True)
    actual_end = Column(DateTime(timezone=True), nullable=True)
    cab_approved_at = Column(DateTime(timezone=True), nullable=True)

    affected_cis = Column(JSON, default=list)
    tags = Column(JSON, default=list)

    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    deleted_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("idx_change_org_status", "organisation_id", "status"),
    )


class ITSMServiceRequest(Base):
    """ITSM Service catalog requests"""
    __tablename__ = "itsm_service_requests"

    id = Column(String, primary_key=True, default=new_uuid)
    key = Column(String, unique=True, nullable=False, index=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    catalog_item = Column(String, nullable=True)
    fulfillment_status = Column(String, nullable=False, default="pending")

    requester_id = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=False)
    approver_id = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    assignee_id = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    organisation_id = Column(String, ForeignKey("organisations.id", ondelete="CASCADE"), nullable=False, index=True)

    approved_at = Column(DateTime(timezone=True), nullable=True)
    fulfilled_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    deleted_at = Column(DateTime(timezone=True), nullable=True)


class ITSMSLADefinition(Base):
    """SLA policy definitions"""
    __tablename__ = "itsm_sla_definitions"

    id = Column(String, primary_key=True, default=new_uuid)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    priority = Column(String, nullable=False)
    response_time_mins = Column(Integer, nullable=False)
    resolution_time_mins = Column(Integer, nullable=False)
    business_hours_only = Column(Boolean, default=True)
    escalation_rules = Column(JSON, default=list)
    organisation_id = Column(String, ForeignKey("organisations.id", ondelete="CASCADE"), nullable=False, index=True)
    is_active = Column(Boolean, default=True)

    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class ITSMSLATracking(Base):
    """SLA compliance tracking per incident"""
    __tablename__ = "itsm_sla_tracking"

    id = Column(String, primary_key=True, default=new_uuid)
    incident_id = Column(String, ForeignKey("itsm_incidents.id", ondelete="CASCADE"), nullable=False, index=True)
    sla_id = Column(String, ForeignKey("itsm_sla_definitions.id", ondelete="CASCADE"), nullable=False)

    response_deadline = Column(DateTime(timezone=True), nullable=False)
    resolution_deadline = Column(DateTime(timezone=True), nullable=False)
    response_met = Column(Boolean, nullable=True)
    resolution_met = Column(Boolean, nullable=True)
    breach_notified = Column(Boolean, default=False)

    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class ITSMCMDBItem(Base):
    """Configuration Management Database items"""
    __tablename__ = "itsm_cmdb_items"

    id = Column(String, primary_key=True, default=new_uuid)
    name = Column(String, nullable=False)
    ci_type = Column(String, nullable=False)
    status = Column(String, nullable=False, default=CMDBItemStatus.ACTIVE.value)
    environment = Column(String, nullable=True)
    owner_id = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    organisation_id = Column(String, ForeignKey("organisations.id", ondelete="CASCADE"), nullable=False, index=True)
    dependencies = Column(JSON, default=list)
    attributes = Column(JSON, default=dict)
    description = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    deleted_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("idx_cmdb_org_type", "organisation_id", "ci_type"),
    )


# ============================================================
# PRINCE2 GATE PROCESS — PROJECT LIFECYCLE MANAGEMENT
# ============================================================

class GateStatus(str, PyEnum):
    PENDING = "pending"
    IN_REVIEW = "in_review"
    APPROVED = "approved"
    REJECTED = "rejected"
    SKIPPED = "skipped"


class ProjectStatus(str, PyEnum):
    DRAFT = "draft"
    ACTIVE = "active"
    ON_HOLD = "on_hold"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class PLMProject(Base):
    """PRINCE2 Project container"""
    __tablename__ = "plm_projects"

    id = Column(String, primary_key=True, default=new_uuid)
    key = Column(String, unique=True, nullable=False, index=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    status = Column(String, nullable=False, default=ProjectStatus.DRAFT.value)
    owner_id = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=False)
    organisation_id = Column(String, ForeignKey("organisations.id", ondelete="CASCADE"), nullable=False, index=True)
    current_gate = Column(Integer, default=0)
    started_at = Column(DateTime(timezone=True), nullable=True)
    target_date = Column(DateTime(timezone=True), nullable=True)
    budget = Column(String, nullable=True)
    tags = Column(JSON, default=list)

    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    deleted_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("idx_project_org_status", "organisation_id", "status"),
    )


class PLMGate(Base):
    """PRINCE2 Gate definitions per project"""
    __tablename__ = "plm_gates"

    id = Column(String, primary_key=True, default=new_uuid)
    project_id = Column(String, ForeignKey("plm_projects.id", ondelete="CASCADE"), nullable=False, index=True)
    gate_number = Column(Integer, nullable=False)
    gate_name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    status = Column(String, nullable=False, default=GateStatus.PENDING.value)
    required_approvers = Column(Integer, default=1)
    deadline = Column(DateTime(timezone=True), nullable=True)
    submitted_at = Column(DateTime(timezone=True), nullable=True)
    approved_at = Column(DateTime(timezone=True), nullable=True)
    rejected_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    __table_args__ = (
        UniqueConstraint("project_id", "gate_number", name="uq_project_gate"),
    )


class PLMGateReview(Base):
    """Individual gate reviews by reviewers"""
    __tablename__ = "plm_gate_reviews"

    id = Column(String, primary_key=True, default=new_uuid)
    gate_id = Column(String, ForeignKey("plm_gates.id", ondelete="CASCADE"), nullable=False, index=True)
    reviewer_id = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=False)
    decision = Column(String, nullable=False)  # approve, reject, defer
    comments = Column(Text, nullable=True)
    evidence_urls = Column(JSON, default=list)

    reviewed_at = Column(DateTime(timezone=True), default=utcnow)


class PLMGateCriteria(Base):
    """Checklist items per gate"""
    __tablename__ = "plm_gate_criteria"

    id = Column(String, primary_key=True, default=new_uuid)
    gate_id = Column(String, ForeignKey("plm_gates.id", ondelete="CASCADE"), nullable=False, index=True)
    description = Column(String, nullable=False)
    is_mandatory = Column(Boolean, default=True)
    is_met = Column(Boolean, default=False)
    verified_by = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    verified_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), default=utcnow)


class PLMDeliverable(Base):
    """Gate deliverables/artifacts"""
    __tablename__ = "plm_deliverables"

    id = Column(String, primary_key=True, default=new_uuid)
    gate_id = Column(String, ForeignKey("plm_gates.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String, nullable=False)
    deliverable_type = Column(String, nullable=True)
    file_node_id = Column(String, ForeignKey("file_nodes.id", ondelete="SET NULL"), nullable=True)
    document_id = Column(String, nullable=True)
    external_url = Column(String, nullable=True)
    status = Column(String, nullable=False, default="pending")

    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


# ============================================================
# DOCUMENT MANAGEMENT SYSTEM
# ============================================================

class DocumentSource(str, PyEnum):
    LOCAL = "local"
    GOOGLE_DRIVE = "google_drive"
    ONEDRIVE = "onedrive"
    DROPBOX = "dropbox"


class SyncDirection(str, PyEnum):
    PULL = "pull"
    PUSH = "push"
    BIDIRECTIONAL = "bidirectional"


class SyncStatus(str, PyEnum):
    IDLE = "idle"
    SYNCING = "syncing"
    ERROR = "error"
    PAUSED = "paused"


class Document(Base):
    """Document registry — central catalog of all documents"""
    __tablename__ = "documents"

    id = Column(String, primary_key=True, default=new_uuid)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    file_node_id = Column(String, ForeignKey("file_nodes.id", ondelete="SET NULL"), nullable=True)
    mime_type = Column(String, nullable=True)
    size = Column(BigInteger, default=0)
    source = Column(String, nullable=False, default=DocumentSource.LOCAL.value)
    source_id = Column(String, nullable=True)
    source_path = Column(String, nullable=True)
    hash_sha256 = Column(String, nullable=True, index=True)
    organisation_id = Column(String, ForeignKey("organisations.id", ondelete="CASCADE"), nullable=False, index=True)
    category_id = Column(String, ForeignKey("document_categories.id", ondelete="SET NULL"), nullable=True, index=True)
    uploaded_by = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    is_extracted = Column(Boolean, default=False)
    extracted_text = Column(Text, nullable=True)
    extracted_entities = Column(JSON, default=dict)
    page_count = Column(Integer, nullable=True)
    language = Column(String, nullable=True)

    tags = Column(JSON, default=list)
    extra_data = Column(JSON, default=dict)

    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    deleted_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("idx_doc_org_source", "organisation_id", "source"),
        Index("idx_doc_hash", "hash_sha256"),
    )


class DocumentTag(Base):
    """Smart tags on documents"""
    __tablename__ = "document_tags"

    id = Column(String, primary_key=True, default=new_uuid)
    document_id = Column(String, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True)
    tag_name = Column(String, nullable=False)
    tag_type = Column(String, nullable=False, default="manual")  # auto, manual, rule
    confidence = Column(Integer, nullable=True)  # 0-100 for AI tags
    source = Column(String, nullable=False, default="user")  # ai, user, rule

    created_at = Column(DateTime(timezone=True), default=utcnow)

    __table_args__ = (
        UniqueConstraint("document_id", "tag_name", name="uq_doc_tag"),
    )


class DocumentCategory(Base):
    """Category taxonomy for documents"""
    __tablename__ = "document_categories"

    id = Column(String, primary_key=True, default=new_uuid)
    name = Column(String, nullable=False)
    slug = Column(String, nullable=False)
    parent_id = Column(String, ForeignKey("document_categories.id", ondelete="SET NULL"), nullable=True)
    description = Column(Text, nullable=True)
    icon = Column(String, nullable=True)
    auto_rules = Column(JSON, default=dict)
    organisation_id = Column(String, ForeignKey("organisations.id", ondelete="CASCADE"), nullable=False, index=True)

    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    __table_args__ = (
        UniqueConstraint("organisation_id", "slug", name="uq_org_cat_slug"),
    )


class CloudSyncConfig(Base):
    """Per-provider cloud sync configuration"""
    __tablename__ = "cloud_sync_configs"

    id = Column(String, primary_key=True, default=new_uuid)
    organisation_id = Column(String, ForeignKey("organisations.id", ondelete="CASCADE"), nullable=False, index=True)
    provider = Column(String, nullable=False)
    connector_id = Column(String, ForeignKey("integration_connectors.id", ondelete="SET NULL"), nullable=True)
    root_folder_path = Column(String, nullable=True)
    sync_direction = Column(String, nullable=False, default=SyncDirection.PULL.value)
    sync_frequency_mins = Column(Integer, default=60)
    status = Column(String, nullable=False, default=SyncStatus.IDLE.value)
    last_sync = Column(DateTime(timezone=True), nullable=True)
    last_error = Column(Text, nullable=True)
    items_synced = Column(Integer, default=0)
    extra_data = Column(JSON, default=dict)

    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class CloudSyncItem(Base):
    """Individual synced items from cloud providers"""
    __tablename__ = "cloud_sync_items"

    id = Column(String, primary_key=True, default=new_uuid)
    config_id = Column(String, ForeignKey("cloud_sync_configs.id", ondelete="CASCADE"), nullable=False, index=True)
    remote_id = Column(String, nullable=False)
    remote_path = Column(String, nullable=False)
    local_document_id = Column(String, ForeignKey("documents.id", ondelete="SET NULL"), nullable=True)
    sync_status = Column(String, nullable=False, default="synced")
    last_modified_remote = Column(DateTime(timezone=True), nullable=True)
    last_modified_local = Column(DateTime(timezone=True), nullable=True)
    conflict_resolution = Column(String, nullable=True)

    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    __table_args__ = (
        UniqueConstraint("config_id", "remote_id", name="uq_sync_remote"),
    )


class DuplicateGroup(Base):
    """Detected duplicate document groups"""
    __tablename__ = "duplicate_groups"

    id = Column(String, primary_key=True, default=new_uuid)
    organisation_id = Column(String, ForeignKey("organisations.id", ondelete="CASCADE"), nullable=False, index=True)
    hash_sha256 = Column(String, nullable=True)
    match_type = Column(String, nullable=False, default="hash")  # hash, filename, content
    file_count = Column(Integer, default=0)
    primary_document_id = Column(String, ForeignKey("documents.id", ondelete="SET NULL"), nullable=True)
    document_ids = Column(JSON, default=list)
    status = Column(String, nullable=False, default="pending")  # pending, resolved, ignored

    detected_at = Column(DateTime(timezone=True), default=utcnow)
    resolved_at = Column(DateTime(timezone=True), nullable=True)


# ============================================================
# ASSET MANAGEMENT
# ============================================================

class AssetType(str, PyEnum):
    HARDWARE = "hardware"
    SOFTWARE = "software"
    SERVICE = "service"
    LICENSE = "license"
    CLOUD_RESOURCE = "cloud_resource"
    NETWORK = "network"
    DATA = "data"


class AssetStatus(str, PyEnum):
    ACTIVE = "active"
    MAINTENANCE = "maintenance"
    RETIRED = "retired"
    DISPOSED = "disposed"
    IN_STOCK = "in_stock"
    ON_ORDER = "on_order"


class Asset(Base):
    """Asset registry — full CMDB"""
    __tablename__ = "assets"

    id = Column(String, primary_key=True, default=new_uuid)
    asset_tag = Column(String, unique=True, nullable=False, index=True)
    name = Column(String, nullable=False)
    asset_type = Column(String, nullable=False)
    status = Column(String, nullable=False, default=AssetStatus.ACTIVE.value)
    description = Column(Text, nullable=True)
    owner_id = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    organisation_id = Column(String, ForeignKey("organisations.id", ondelete="CASCADE"), nullable=False, index=True)
    location = Column(String, nullable=True)
    vendor = Column(String, nullable=True)
    serial_number = Column(String, nullable=True)
    model_number = Column(String, nullable=True)
    purchase_date = Column(DateTime(timezone=True), nullable=True)
    warranty_expiry = Column(DateTime(timezone=True), nullable=True)
    cost = Column(String, nullable=True)
    attributes = Column(JSON, default=dict)
    tags = Column(JSON, default=list)

    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    deleted_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("idx_asset_org_type", "organisation_id", "asset_type"),
        Index("idx_asset_status", "status"),
    )


class AssetRelationship(Base):
    """Relationships between assets"""
    __tablename__ = "asset_relationships"

    id = Column(String, primary_key=True, default=new_uuid)
    parent_id = Column(String, ForeignKey("assets.id", ondelete="CASCADE"), nullable=False, index=True)
    child_id = Column(String, ForeignKey("assets.id", ondelete="CASCADE"), nullable=False, index=True)
    relationship_type = Column(String, nullable=False)  # contains, depends_on, connects_to, runs_on, licensed_for

    created_at = Column(DateTime(timezone=True), default=utcnow)

    __table_args__ = (
        UniqueConstraint("parent_id", "child_id", "relationship_type", name="uq_asset_rel"),
    )


class AssetLifecycleEvent(Base):
    """Full lifecycle history for assets"""
    __tablename__ = "asset_lifecycle_events"

    id = Column(String, primary_key=True, default=new_uuid)
    asset_id = Column(String, ForeignKey("assets.id", ondelete="CASCADE"), nullable=False, index=True)
    event_type = Column(String, nullable=False)  # created, assigned, moved, maintained, upgraded, retired, disposed
    actor_id = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    details = Column(JSON, default=dict)
    notes = Column(Text, nullable=True)

    occurred_at = Column(DateTime(timezone=True), default=utcnow)


class AssetMaintenance(Base):
    """Maintenance schedule and records"""
    __tablename__ = "asset_maintenance"

    id = Column(String, primary_key=True, default=new_uuid)
    asset_id = Column(String, ForeignKey("assets.id", ondelete="CASCADE"), nullable=False, index=True)
    maintenance_type = Column(String, nullable=False)  # preventive, corrective, inspection
    description = Column(Text, nullable=True)
    scheduled_date = Column(DateTime(timezone=True), nullable=False)
    completed_date = Column(DateTime(timezone=True), nullable=True)
    technician = Column(String, nullable=True)
    cost = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    organisation_id = Column(String, ForeignKey("organisations.id", ondelete="CASCADE"), nullable=False, index=True)

    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


# ============================================================
# KNOWLEDGE BASE
# ============================================================

class KBArticleStatus(str, PyEnum):
    DRAFT = "draft"
    PUBLISHED = "published"
    ARCHIVED = "archived"


class KBArticle(Base):
    """Knowledge base articles — wiki-style"""
    __tablename__ = "kb_articles"

    id = Column(String, primary_key=True, default=new_uuid)
    title = Column(String, nullable=False)
    slug = Column(String, nullable=False, index=True)
    content_markdown = Column(Text, nullable=True)
    content_html = Column(Text, nullable=True)
    summary = Column(Text, nullable=True)
    category_id = Column(String, ForeignKey("kb_categories.id", ondelete="SET NULL"), nullable=True, index=True)
    author_id = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=False)
    organisation_id = Column(String, ForeignKey("organisations.id", ondelete="CASCADE"), nullable=False, index=True)
    status = Column(String, nullable=False, default=KBArticleStatus.DRAFT.value)
    version = Column(Integer, default=1)
    view_count = Column(Integer, default=0)
    helpful_count = Column(Integer, default=0)
    tags = Column(JSON, default=list)
    related_incident_ids = Column(JSON, default=list)

    published_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    deleted_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        UniqueConstraint("organisation_id", "slug", name="uq_org_article_slug"),
        Index("idx_kb_org_status", "organisation_id", "status"),
    )


class KBCategory(Base):
    """Knowledge base category tree"""
    __tablename__ = "kb_categories"

    id = Column(String, primary_key=True, default=new_uuid)
    name = Column(String, nullable=False)
    slug = Column(String, nullable=False)
    parent_id = Column(String, ForeignKey("kb_categories.id", ondelete="SET NULL"), nullable=True)
    description = Column(Text, nullable=True)
    icon = Column(String, nullable=True)
    position = Column(Integer, default=0)
    organisation_id = Column(String, ForeignKey("organisations.id", ondelete="CASCADE"), nullable=False, index=True)

    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    __table_args__ = (
        UniqueConstraint("organisation_id", "slug", name="uq_org_kb_cat_slug"),
    )


class KBArticleVersion(Base):
    """Version history for KB articles"""
    __tablename__ = "kb_article_versions"

    id = Column(String, primary_key=True, default=new_uuid)
    article_id = Column(String, ForeignKey("kb_articles.id", ondelete="CASCADE"), nullable=False, index=True)
    version = Column(Integer, nullable=False)
    content_markdown = Column(Text, nullable=True)
    changed_by = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    change_summary = Column(String, nullable=True)

    created_at = Column(DateTime(timezone=True), default=utcnow)

    __table_args__ = (
        UniqueConstraint("article_id", "version", name="uq_article_version"),
    )


class LearningPath(Base):
    """Guided learning sequences"""
    __tablename__ = "learning_paths"

    id = Column(String, primary_key=True, default=new_uuid)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    article_ids = Column(JSON, default=list)
    estimated_duration_mins = Column(Integer, nullable=True)
    difficulty = Column(String, nullable=True)  # beginner, intermediate, advanced
    organisation_id = Column(String, ForeignKey("organisations.id", ondelete="CASCADE"), nullable=False, index=True)
    created_by = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class LearningProgress(Base):
    """User progress on learning paths"""
    __tablename__ = "learning_progress"

    id = Column(String, primary_key=True, default=new_uuid)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    path_id = Column(String, ForeignKey("learning_paths.id", ondelete="CASCADE"), nullable=False, index=True)
    current_article_index = Column(Integer, default=0)
    completed_articles = Column(JSON, default=list)

    started_at = Column(DateTime(timezone=True), default=utcnow)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        UniqueConstraint("user_id", "path_id", name="uq_user_path"),
    )


class AIKnowledgeExtraction(Base):
    """AI-derived insights from captured data"""
    __tablename__ = "ai_knowledge_extractions"

    id = Column(String, primary_key=True, default=new_uuid)
    source_type = Column(String, nullable=False)  # audit_log, incident, change, document
    source_id = Column(String, nullable=False)
    extracted_knowledge = Column(Text, nullable=False)
    confidence = Column(Integer, nullable=True)
    tags = Column(JSON, default=list)
    validated_by = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    validated_at = Column(DateTime(timezone=True), nullable=True)
    organisation_id = Column(String, ForeignKey("organisations.id", ondelete="CASCADE"), nullable=False, index=True)

    created_at = Column(DateTime(timezone=True), default=utcnow)

    __table_args__ = (
        Index("idx_ai_extract_source", "source_type", "source_id"),
    )


# ============================================================
# DEPENDENCY MANAGEMENT
# ============================================================

class DependencyMapType(str, PyEnum):
    REPOSITORY = "repository"
    SERVICE = "service"
    INFRASTRUCTURE = "infrastructure"
    MIXED = "mixed"


class NodeHealthStatus(str, PyEnum):
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    DOWN = "down"
    UNKNOWN = "unknown"


class DependencyMap(Base):
    """Named dependency graphs"""
    __tablename__ = "dependency_maps"

    id = Column(String, primary_key=True, default=new_uuid)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    map_type = Column(String, nullable=False, default=DependencyMapType.MIXED.value)
    auto_discovered = Column(Boolean, default=False)
    organisation_id = Column(String, ForeignKey("organisations.id", ondelete="CASCADE"), nullable=False, index=True)

    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class DependencyNode(Base):
    """Nodes in a dependency graph"""
    __tablename__ = "dependency_nodes"

    id = Column(String, primary_key=True, default=new_uuid)
    map_id = Column(String, ForeignKey("dependency_maps.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String, nullable=False)
    node_type = Column(String, nullable=False)  # repo, service, package, infra
    source_url = Column(String, nullable=True)
    version = Column(String, nullable=True)
    health_status = Column(String, nullable=False, default=NodeHealthStatus.UNKNOWN.value)
    health_check_url = Column(String, nullable=True)
    last_checked = Column(DateTime(timezone=True), nullable=True)
    extra_data = Column(JSON, default=dict)

    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class DependencyEdge(Base):
    """Relationships between dependency nodes"""
    __tablename__ = "dependency_edges"

    id = Column(String, primary_key=True, default=new_uuid)
    map_id = Column(String, ForeignKey("dependency_maps.id", ondelete="CASCADE"), nullable=False, index=True)
    source_id = Column(String, ForeignKey("dependency_nodes.id", ondelete="CASCADE"), nullable=False, index=True)
    target_id = Column(String, ForeignKey("dependency_nodes.id", ondelete="CASCADE"), nullable=False, index=True)
    edge_type = Column(String, nullable=False)  # depends_on, blocks, triggers, deploys_to
    weight = Column(Integer, default=1)
    is_critical = Column(Boolean, default=False)
    label = Column(String, nullable=True)

    created_at = Column(DateTime(timezone=True), default=utcnow)

    __table_args__ = (
        UniqueConstraint("map_id", "source_id", "target_id", "edge_type", name="uq_dep_edge"),
    )


class DeploymentChain(Base):
    """Ordered deployment sequences"""
    __tablename__ = "deployment_chains"

    id = Column(String, primary_key=True, default=new_uuid)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    node_ids = Column(JSON, default=list)
    auto_rollback = Column(Boolean, default=True)
    organisation_id = Column(String, ForeignKey("organisations.id", ondelete="CASCADE"), nullable=False, index=True)

    last_executed = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class DeploymentExecution(Base):
    """Execution history for deployment chains"""
    __tablename__ = "deployment_executions"

    id = Column(String, primary_key=True, default=new_uuid)
    chain_id = Column(String, ForeignKey("deployment_chains.id", ondelete="CASCADE"), nullable=False, index=True)
    status = Column(String, nullable=False, default="running")  # running, completed, failed, rolled_back
    triggered_by = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    logs = Column(JSON, default=list)
    current_step = Column(Integer, default=0)
    total_steps = Column(Integer, default=0)

    started_at = Column(DateTime(timezone=True), default=utcnow)
    completed_at = Column(DateTime(timezone=True), nullable=True)


class RepoSyncConfig(Base):
    """Central repository management configurations"""
    __tablename__ = "repo_sync_configs"

    id = Column(String, primary_key=True, default=new_uuid)
    repo_url = Column(String, nullable=False)
    repo_name = Column(String, nullable=False)
    branch = Column(String, nullable=False, default="main")
    sync_frequency_mins = Column(Integer, default=60)
    last_synced = Column(DateTime(timezone=True), nullable=True)
    health_check_url = Column(String, nullable=True)
    health_status = Column(String, nullable=False, default=NodeHealthStatus.UNKNOWN.value)
    auto_deploy = Column(Boolean, default=False)
    deploy_chain_id = Column(String, ForeignKey("deployment_chains.id", ondelete="SET NULL"), nullable=True)
    organisation_id = Column(String, ForeignKey("organisations.id", ondelete="CASCADE"), nullable=False, index=True)
    extra_data = Column(JSON, default=dict)

    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


# ============================================================
# DIGITAL TWIN
# ============================================================

class DTwinSnapshot(Base):
    """Point-in-time system state snapshots"""
    __tablename__ = "dtwin_snapshots"

    id = Column(String, primary_key=True, default=new_uuid)
    snapshot_type = Column(String, nullable=False, default="full")  # full, incremental
    data = Column(JSON, default=dict)
    metrics = Column(JSON, default=dict)
    node_count = Column(Integer, default=0)
    service_count = Column(Integer, default=0)
    created_by = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    organisation_id = Column(String, ForeignKey("organisations.id", ondelete="CASCADE"), nullable=False, index=True)

    created_at = Column(DateTime(timezone=True), default=utcnow)


class DTwinSimulation(Base):
    """What-if scenario simulations"""
    __tablename__ = "dtwin_simulations"

    id = Column(String, primary_key=True, default=new_uuid)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    scenario = Column(JSON, default=dict)
    results = Column(JSON, default=dict)
    status = Column(String, nullable=False, default="pending")  # pending, running, completed, failed
    created_by = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    organisation_id = Column(String, ForeignKey("organisations.id", ondelete="CASCADE"), nullable=False, index=True)

    created_at = Column(DateTime(timezone=True), default=utcnow)
    completed_at = Column(DateTime(timezone=True), nullable=True)


class DTwinAnomaly(Base):
    """Detected system anomalies"""
    __tablename__ = "dtwin_anomalies"

    id = Column(String, primary_key=True, default=new_uuid)
    source = Column(String, nullable=False)
    anomaly_type = Column(String, nullable=False)
    severity = Column(String, nullable=False, default="medium")
    description = Column(Text, nullable=True)
    affected_components = Column(JSON, default=list)
    organisation_id = Column(String, ForeignKey("organisations.id", ondelete="CASCADE"), nullable=False, index=True)

    detected_at = Column(DateTime(timezone=True), default=utcnow)
    resolved_at = Column(DateTime(timezone=True), nullable=True)


class DTwinMetric(Base):
    """Aggregated metrics for the digital twin"""
    __tablename__ = "dtwin_metrics"

    id = Column(String, primary_key=True, default=new_uuid)
    metric_name = Column(String, nullable=False)
    metric_value = Column(String, nullable=False)
    dimensions = Column(JSON, default=dict)
    organisation_id = Column(String, ForeignKey("organisations.id", ondelete="CASCADE"), nullable=False, index=True)

    timestamp = Column(DateTime(timezone=True), default=utcnow)

    __table_args__ = (
        Index("idx_metric_name_time", "metric_name", "timestamp"),
    )
