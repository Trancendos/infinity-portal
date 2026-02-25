# models.py - Complete database models
import uuid
from datetime import datetime
from enum import Enum as PyEnum
from sqlalchemy import (
    Column, String, DateTime, JSON, Boolean,
    Enum as SQLEnum, ForeignKey, Text, Integer, Index
)
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()


class RiskLevel(str, PyEnum):
    """EU AI Act risk classification"""
    PROHIBITED = "PROHIBITED"
    HIGH_RISK = "HIGH_RISK"
    LIMITED_RISK = "LIMITED_RISK"
    MINIMAL_RISK = "MINIMAL_RISK"


class AuditEventType(str, PyEnum):
    """Audit event types for compliance logging"""
    GENERATION_SUCCESS = "ai.generation.success"
    GENERATION_FAILED = "ai.generation.failed"
    GOVERNANCE_REJECTED = "ai.governance.rejected"
    DPIA_COMPLETED = "compliance.dpia.completed"
    PROVENANCE_SIGNED = "provenance.signed"
    USER_LOGIN = "auth.user.login"
    USER_REGISTER = "auth.user.register"
    MODEL_ENABLED = "model.enabled"
    MODEL_DISABLED = "model.disabled"
    HITL_APPROVED = "hitl.approved"
    HITL_REJECTED = "hitl.rejected"
    HITL_QUEUED = "hitl.queued"


class TaskStatus(str, PyEnum):
    """HITL task statuses"""
    PROCESSED = "processed"
    PENDING_REVIEW = "pending_human_oversight"
    REJECTED = "rejected_by_oversight"


class User(Base):
    """User account model"""
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    organisation_id = Column(String, ForeignKey("organisations.id"), index=True, default="default")
    role = Column(String, default="user", index=True)  # "user", "admin", "auditor"
    is_active = Column(Boolean, default=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_login = Column(DateTime, nullable=True)

    # Relationships
    organisation = relationship("Organisation", back_populates="users")
    audit_logs = relationship("AuditLog", back_populates="user")

    __table_args__ = (
        Index("idx_user_org_active", "organisation_id", "is_active"),
    )


class Organisation(Base):
    """Multi-tenant organisation model"""
    __tablename__ = "organisations"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False, index=True)
    region_iso_code = Column(String, default="US")
    compliance_tier = Column(String, default="standard")  # "standard", "high", "sovereign"
    is_active = Column(Boolean, default=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    users = relationship("User", back_populates="organisation")
    ai_systems = relationship("AISystemRecord", back_populates="organisation")


class AISystemRecord(Base):
    """AI system registration for governance"""
    __tablename__ = "ai_systems"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    organisation_id = Column(String, ForeignKey("organisations.id"), index=True)
    name = Column(String, nullable=False, index=True)
    description = Column(Text)
    purpose = Column(String)
    risk_level = Column(SQLEnum(RiskLevel), nullable=False, index=True)
    data_sources = Column(JSON, default=list)
    model_ids = Column(JSON, default=list)
    human_oversight_level = Column(String)  # "minimal", "moderate", "high"
    transparency_measures = Column(JSON, default=dict)
    dpia_completed = Column(Boolean, default=False, index=True)
    dpia_details = Column(JSON)
    last_audit = Column(DateTime, default=datetime.utcnow)
    compliance_status = Column(String, default="ACTIVE", index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    organisation = relationship("Organisation", back_populates="ai_systems")
    audit_logs = relationship("AuditLog", back_populates="ai_system")
    dpia_records = relationship("DPIARecord", back_populates="ai_system")
    provenance_manifests = relationship("ProvenanceManifest", back_populates="ai_system")
    hitl_tasks = relationship("HITLTask", back_populates="ai_system")

    __table_args__ = (
        Index("idx_ai_system_org_status", "organisation_id", "compliance_status"),
    )


class AuditLog(Base):
    """Compliance audit logging"""
    __tablename__ = "audit_logs"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
    event_type = Column(SQLEnum(AuditEventType), nullable=False, index=True)
    system_id = Column(String, ForeignKey("ai_systems.id"), nullable=True, index=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=True, index=True)
    organisation_id = Column(String, index=True)
    risk_level = Column(SQLEnum(RiskLevel), nullable=True, index=True)
    model_used = Column(String, nullable=True)
    governance_metadata = Column(JSON, nullable=True)
    error_message = Column(Text, nullable=True)
    ip_address = Column(String, nullable=True)
    user_agent = Column(String, nullable=True)
    request_id = Column(String, index=True, unique=True)

    # Relationships
    ai_system = relationship("AISystemRecord", back_populates="audit_logs")
    user = relationship("User", back_populates="audit_logs")

    __table_args__ = (
        Index("idx_audit_log_org_timestamp", "organisation_id", "timestamp"),
        Index("idx_audit_log_event_type_timestamp", "event_type", "timestamp"),
    )


class ProvenanceManifest(Base):
    """C2PA provenance manifest storage"""
    __tablename__ = "provenance_manifests"

    request_id = Column(String, primary_key=True, index=True)
    system_id = Column(String, ForeignKey("ai_systems.id"), nullable=True, index=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=True, index=True)
    organisation_id = Column(String, index=True)
    content_hash = Column(String, index=True, unique=True)
    manifest_url = Column(String, nullable=True)
    manifest_data = Column(JSON, nullable=True)
    signing_status = Column(String, default="PENDING", index=True)
    signed_at = Column(DateTime, nullable=True)
    temporal_workflow_id = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    ai_system = relationship("AISystemRecord", back_populates="provenance_manifests")

    __table_args__ = (
        Index("idx_provenance_manifest_status", "signing_status", "created_at"),
    )


class DPIARecord(Base):
    """Data Protection Impact Assessment records"""
    __tablename__ = "dpia_records"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    system_id = Column(String, ForeignKey("ai_systems.id"), unique=True, index=True)
    assessment_date = Column(DateTime, default=datetime.utcnow, index=True)
    data_categories = Column(JSON, default=list)
    risk_assessment = Column(JSON, nullable=True)
    safeguards_implemented = Column(JSON, default=list)
    approval_status = Column(String, default="PENDING", index=True)
    approved_by = Column(String, nullable=True)
    approved_at = Column(DateTime, nullable=True)
    next_review_date = Column(DateTime, nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    ai_system = relationship("AISystemRecord", back_populates="dpia_records")


class HITLTask(Base):
    """Human-in-the-Loop task queue for high-risk AI decisions"""
    __tablename__ = "hitl_tasks"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
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
    reviewed_at = Column(DateTime, nullable=True)
    organisation_id = Column(String, index=True)
    manifest_id = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    ai_system = relationship("AISystemRecord", back_populates="hitl_tasks")

    __table_args__ = (
        Index("idx_hitl_org_status", "organisation_id", "status"),
        Index("idx_hitl_status_created", "status", "created_at"),
    )
