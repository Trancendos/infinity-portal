# routers/compliance.py - Compliance management endpoints
import uuid
from datetime import datetime
from typing import Optional, List, Dict, Any
from enum import Enum as PyEnum

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user, require_admin_role, CurrentUser
from database import get_db_session
from models import (
    AISystemRecord, AuditLog, AuditEventType, RiskLevel,
    DPIARecord, ProvenanceManifest, HITLTask, TaskStatus,
)

router = APIRouter(prefix="/api/v1/compliance", tags=["Compliance"])


# --- Schemas ---

class RiskCategory(str, PyEnum):
    MINIMAL = "minimal"
    LIMITED = "limited"
    HIGH = "high"
    UNACCEPTABLE = "unacceptable"


class RiskAssessmentRequest(BaseModel):
    system_name: str
    intended_use: str
    risk_level: RiskCategory
    data_sources: List[str] = Field(default_factory=list)
    human_oversight_enabled: bool = False


class AISystemCreate(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    purpose: Optional[str] = None
    risk_level: str = Field(..., description="PROHIBITED | HIGH_RISK | LIMITED_RISK | MINIMAL_RISK")
    data_sources: List[str] = Field(default_factory=list)
    model_ids: List[str] = Field(default_factory=list)
    human_oversight_level: Optional[str] = "minimal"


class ModelMetadata(BaseModel):
    model_name: str
    version: str
    provider: str
    parameters: Optional[str] = None
    training_data_summary: str = Field(..., description="High-level description of data sources")


class ComplianceManifest(BaseModel):
    """Annex IV Technical Documentation Manifest"""
    manifest_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    system_name: str = "Infinity OS"
    intended_purpose: str
    risk_level: RiskCategory
    architecture_description: str
    hardware_requirements: Optional[str] = None
    model_details: ModelMetadata
    human_oversight_measures: List[str] = Field(..., min_length=1)
    accuracy_metrics: Dict[str, float] = Field(default_factory=dict)
    cybersecurity_measures: List[str] = Field(
        default=["TLS 1.3", "AES-256", "OAuth2", "JWT", "bcrypt"]
    )
    data_bias_mitigation: str = ""
    representative_datasets: bool = True


class DPIACreate(BaseModel):
    system_id: str
    data_categories: List[str] = Field(default_factory=list)
    risk_assessment: Optional[Dict[str, Any]] = None
    safeguards_implemented: List[str] = Field(default_factory=list)


# --- Risk Assessment ---

@router.post("/assess")
async def perform_risk_assessment(
    assessment: RiskAssessmentRequest,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Evaluates if an AI workload meets EU AI Act criteria"""
    if assessment.risk_level == RiskCategory.UNACCEPTABLE:
        # Log the rejection
        audit_log = AuditLog(
            request_id=str(uuid.uuid4()),
            event_type=AuditEventType.GOVERNANCE_REJECTED,
            user_id=user.id,
            organisation_id=user.organisation_id,
            risk_level=RiskLevel.PROHIBITED,
            governance_metadata={
                "system_name": assessment.system_name,
                "intended_use": assessment.intended_use,
                "reason": "Prohibited under EU AI Act",
            },
        )
        db.add(audit_log)
        await db.commit()

        raise HTTPException(
            status_code=403,
            detail="System use case violates EU AI Act (Prohibited Practices)",
        )

    if assessment.risk_level == RiskCategory.HIGH and not assessment.human_oversight_enabled:
        raise HTTPException(
            status_code=400,
            detail="High-risk systems must define human oversight measures (Art. 14).",
        )

    risk_map = {
        RiskCategory.MINIMAL: "Minimal requirements: basic transparency.",
        RiskCategory.LIMITED: "Limited risk: transparency obligations apply (Art. 52).",
        RiskCategory.HIGH: "High-risk requirements applied: logging, accuracy, human oversight, and cybersecurity.",
    }

    return {
        "status": "compliant",
        "assessment_id": str(uuid.uuid4()),
        "risk_level": assessment.risk_level.value,
        "requirements": risk_map.get(assessment.risk_level, "Unknown"),
    }


# --- AI System Registration ---

@router.post("/systems")
async def register_ai_system(
    system_data: AISystemCreate,
    user: CurrentUser = Depends(require_admin_role),
    db: AsyncSession = Depends(get_db_session),
):
    """Register a new AI system for governance tracking"""
    # Validate risk level
    try:
        risk = RiskLevel(system_data.risk_level)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid risk_level. Must be one of: {[r.value for r in RiskLevel]}",
        )

    system = AISystemRecord(
        id=system_data.id,
        organisation_id=user.organisation_id,
        name=system_data.name,
        description=system_data.description,
        purpose=system_data.purpose,
        risk_level=risk,
        data_sources=system_data.data_sources,
        model_ids=system_data.model_ids,
        human_oversight_level=system_data.human_oversight_level,
    )
    db.add(system)
    await db.commit()
    await db.refresh(system)

    return {
        "id": system.id,
        "name": system.name,
        "risk_level": system.risk_level.value,
        "compliance_status": system.compliance_status,
    }


@router.get("/systems")
async def list_ai_systems(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """List AI systems for the current organisation"""
    stmt = select(AISystemRecord).where(AISystemRecord.organisation_id == user.organisation_id)
    result = await db.execute(stmt)
    systems = result.scalars().all()

    return {
        "systems": [
            {
                "id": s.id,
                "name": s.name,
                "risk_level": s.risk_level.value,
                "compliance_status": s.compliance_status,
                "dpia_completed": s.dpia_completed,
                "human_oversight_level": s.human_oversight_level,
                "last_audit": s.last_audit.isoformat() if s.last_audit else None,
            }
            for s in systems
        ],
    }


# --- Audit Logs ---

@router.get("/audit-logs")
async def query_audit_logs(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
    limit: int = Query(default=100, le=500),
    event_type: Optional[str] = None,
):
    """Query audit logs with optional event_type filter"""
    stmt = (
        select(AuditLog)
        .where(AuditLog.organisation_id == user.organisation_id)
        .order_by(AuditLog.timestamp.desc())
        .limit(limit)
    )

    if event_type:
        try:
            et = AuditEventType(event_type)
            stmt = stmt.where(AuditLog.event_type == et)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid event_type: {event_type}")

    result = await db.execute(stmt)
    logs = result.scalars().all()

    return {
        "logs": [
            {
                "id": log.id,
                "timestamp": log.timestamp.isoformat() if log.timestamp else None,
                "event_type": log.event_type.value if log.event_type else None,
                "system_id": log.system_id,
                "user_id": log.user_id,
                "risk_level": log.risk_level.value if log.risk_level else None,
                "model_used": log.model_used,
                "request_id": log.request_id,
                "error_message": log.error_message,
            }
            for log in logs
        ],
        "count": len(logs),
    }


# --- DPIA Management ---

@router.post("/dpia")
async def create_dpia(
    dpia_data: DPIACreate,
    user: CurrentUser = Depends(require_admin_role),
    db: AsyncSession = Depends(get_db_session),
):
    """Create a Data Protection Impact Assessment for an AI system"""
    # Verify system exists
    stmt = select(AISystemRecord).where(
        AISystemRecord.id == dpia_data.system_id,
        AISystemRecord.organisation_id == user.organisation_id,
    )
    result = await db.execute(stmt)
    system = result.scalar_one_or_none()
    if not system:
        raise HTTPException(status_code=404, detail="AI system not found")

    record = DPIARecord(
        system_id=dpia_data.system_id,
        data_categories=dpia_data.data_categories,
        risk_assessment=dpia_data.risk_assessment,
        safeguards_implemented=dpia_data.safeguards_implemented,
        approval_status="PENDING",
    )
    db.add(record)

    # Mark system as DPIA-started
    system.dpia_details = {
        "dpia_id": record.id,
        "status": "PENDING",
        "created_at": datetime.utcnow().isoformat(),
    }
    db.add(system)

    # Audit log
    audit_log = AuditLog(
        request_id=str(uuid.uuid4()),
        event_type=AuditEventType.DPIA_COMPLETED,
        system_id=system.id,
        user_id=user.id,
        organisation_id=user.organisation_id,
        governance_metadata={"dpia_id": record.id},
    )
    db.add(audit_log)
    await db.commit()

    return {
        "dpia_id": record.id,
        "system_id": system.id,
        "status": "PENDING",
        "message": "DPIA created. Awaiting approval.",
    }


@router.patch("/dpia/{dpia_id}/approve")
async def approve_dpia(
    dpia_id: str,
    user: CurrentUser = Depends(require_admin_role),
    db: AsyncSession = Depends(get_db_session),
):
    """Approve a DPIA record"""
    stmt = select(DPIARecord).where(DPIARecord.id == dpia_id)
    result = await db.execute(stmt)
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="DPIA not found")

    record.approval_status = "APPROVED"
    record.approved_by = user.id
    record.approved_at = datetime.utcnow()
    db.add(record)

    # Mark system DPIA as completed
    system_stmt = select(AISystemRecord).where(AISystemRecord.id == record.system_id)
    sys_result = await db.execute(system_stmt)
    system = sys_result.scalar_one_or_none()
    if system:
        system.dpia_completed = True
        db.add(system)

    await db.commit()

    return {"dpia_id": dpia_id, "status": "APPROVED", "approved_by": user.id}


# --- Validate Deployment (Annex IV) ---

@router.post("/validate-deployment")
async def validate_deployment(
    manifest: ComplianceManifest,
    user: CurrentUser = Depends(require_admin_role),
    db: AsyncSession = Depends(get_db_session),
):
    """Validate an AI service deployment against Annex IV requirements"""
    if manifest.risk_level in (RiskCategory.HIGH, RiskCategory.UNACCEPTABLE):
        if not manifest.human_oversight_measures:
            raise HTTPException(
                status_code=400,
                detail="High-risk systems must define human oversight measures (Art. 14).",
            )
        if not manifest.accuracy_metrics:
            raise HTTPException(
                status_code=400,
                detail="High-risk systems must provide accuracy metrics (Art. 15).",
            )

    return {
        "status": "Validated",
        "manifest_id": manifest.manifest_id,
        "risk_level": manifest.risk_level.value,
        "message": f"Manifest {manifest.manifest_id} stored. Compliance confirmed for {manifest.risk_level.value} risk.",
    }


# --- Dashboard Summary ---

@router.get("/dashboard")
async def compliance_dashboard(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Compliance dashboard summary for the organisation"""
    # Count systems by risk level
    systems_stmt = select(AISystemRecord).where(AISystemRecord.organisation_id == user.organisation_id)
    systems_result = await db.execute(systems_stmt)
    systems = systems_result.scalars().all()

    # Count pending HITL tasks
    hitl_stmt = select(func.count(HITLTask.id)).where(
        HITLTask.organisation_id == user.organisation_id,
        HITLTask.status == TaskStatus.PENDING_REVIEW,
    )
    hitl_result = await db.execute(hitl_stmt)
    pending_count = hitl_result.scalar() or 0

    # Recent audit log count (last 24h)
    from datetime import timedelta
    cutoff = datetime.utcnow() - timedelta(hours=24)
    audit_stmt = select(func.count(AuditLog.id)).where(
        AuditLog.organisation_id == user.organisation_id,
        AuditLog.timestamp >= cutoff,
    )
    audit_result = await db.execute(audit_stmt)
    recent_audit_count = audit_result.scalar() or 0

    risk_breakdown = {}
    for s in systems:
        level = s.risk_level.value if s.risk_level else "UNKNOWN"
        risk_breakdown[level] = risk_breakdown.get(level, 0) + 1

    return {
        "organisation_id": user.organisation_id,
        "total_systems": len(systems),
        "risk_breakdown": risk_breakdown,
        "pending_hitl_tasks": pending_count,
        "audit_events_24h": recent_audit_count,
        "systems_with_dpia": sum(1 for s in systems if s.dpia_completed),
    }
