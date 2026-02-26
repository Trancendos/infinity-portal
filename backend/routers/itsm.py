"""
ITSM Router — IT Service Management Framework
Incidents, Problems, Changes, Service Requests, SLAs, CMDB
Mobile-first design with SLA tracking and auto-escalation
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_, case
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import timedelta

import uuid
from database import get_db_session
from auth import get_current_user, require_min_role
from models import (
    User, UserRole, utcnow,
    ITSMIncident, ITSMProblem, ITSMChange, ITSMServiceRequest,
    ITSMSLADefinition, ITSMSLATracking, ITSMCMDBItem,
    IncidentSeverity, IncidentStatus, ChangeType, ChangeStatus,
    AuditLog,
)

router = APIRouter(prefix="/api/v1/itsm", tags=["itsm"])


# ── Schemas ──────────────────────────────────────────────────

class IncidentCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    description: Optional[str] = None
    severity: str = "P3"
    category: Optional[str] = None
    subcategory: Optional[str] = None
    assignee_id: Optional[str] = None
    impact: Optional[str] = None
    urgency: Optional[str] = None
    affected_services: List[str] = []
    tags: List[str] = []

class IncidentUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    severity: Optional[str] = None
    status: Optional[str] = None
    category: Optional[str] = None
    assignee_id: Optional[str] = None
    resolution: Optional[str] = None
    impact: Optional[str] = None
    urgency: Optional[str] = None
    tags: Optional[List[str]] = None

class ProblemCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    description: Optional[str] = None

class ProblemUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    root_cause: Optional[str] = None
    workaround: Optional[str] = None
    status: Optional[str] = None

class ChangeCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    description: Optional[str] = None
    change_type: str = "normal"
    risk_level: Optional[str] = None
    impact: Optional[str] = None
    rollback_plan: Optional[str] = None
    implementation_plan: Optional[str] = None
    scheduled_start: Optional[str] = None
    scheduled_end: Optional[str] = None
    affected_cis: List[str] = []
    tags: List[str] = []

class ChangeUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    risk_level: Optional[str] = None
    impact: Optional[str] = None
    rollback_plan: Optional[str] = None
    implementation_plan: Optional[str] = None
    assignee_id: Optional[str] = None
    tags: Optional[List[str]] = None

class ServiceRequestCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    description: Optional[str] = None
    catalog_item: Optional[str] = None

class SLADefinitionCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    priority: str
    response_time_mins: int = Field(..., gt=0)
    resolution_time_mins: int = Field(..., gt=0)
    business_hours_only: bool = True
    escalation_rules: List[dict] = []

class CMDBItemCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=300)
    ci_type: str
    status: str = "active"
    environment: Optional[str] = None
    description: Optional[str] = None
    dependencies: List[str] = []
    attributes: dict = {}


# ── Key Generation ───────────────────────────────────────────

async def _next_key(db: AsyncSession, prefix: str, table_class) -> str:
    result = await db.execute(
        select(func.count(table_class.id)).where(table_class.deleted_at.is_(None))
    )
    count = result.scalar() or 0
    return f"{prefix}-{count + 1:04d}"


async def _next_key_no_soft_delete(db: AsyncSession, prefix: str, table_class) -> str:
    result = await db.execute(select(func.count(table_class.id)))
    count = result.scalar() or 0
    return f"{prefix}-{count + 1:04d}"


# ── Incidents ────────────────────────────────────────────────

@router.post("/incidents", status_code=201)
async def create_incident(
    body: IncidentCreate,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    key = await _next_key(db, "INC", ITSMIncident)
    incident = ITSMIncident(
        key=key,
        title=body.title,
        description=body.description,
        severity=body.severity,
        category=body.category,
        subcategory=body.subcategory,
        assignee_id=body.assignee_id,
        reporter_id=user.id,
        organisation_id=user.organisation_id,
        impact=body.impact,
        urgency=body.urgency,
        affected_services=body.affected_services,
        tags=body.tags,
    )
    db.add(incident)

    # Auto-assign SLA based on severity
    sla_result = await db.execute(
        select(ITSMSLADefinition).where(
            and_(
                ITSMSLADefinition.organisation_id == user.organisation_id,
                ITSMSLADefinition.priority == body.severity,
                ITSMSLADefinition.is_active == True,
            )
        )
    )
    sla = sla_result.scalars().first()
    if sla:
        incident.sla_id = sla.id
        now = utcnow()
        tracking = ITSMSLATracking(
            incident_id=incident.id,
            sla_id=sla.id,
            response_deadline=now + timedelta(minutes=sla.response_time_mins),
            resolution_deadline=now + timedelta(minutes=sla.resolution_time_mins),
        )
        db.add(tracking)

    # Audit log
    db.add(AuditLog(
            request_id=str(uuid.uuid4()),
        user_id=user.id,
        organisation_id=user.organisation_id,
        event_type="itsm.incident.created",
        resource_type="itsm_incident",
        resource_id=incident.id,
        governance_metadata={"key": key, "severity": body.severity},
    ))

    await db.commit()
    await db.refresh(incident)
    return {
        "id": incident.id,
        "key": incident.key,
        "title": incident.title,
        "severity": incident.severity,
        "status": incident.status,
        "assignee_id": incident.assignee_id,
        "reporter_id": incident.reporter_id,
        "sla_id": incident.sla_id,
        "created_at": str(incident.created_at),
    }


@router.get("/incidents")
async def list_incidents(
    status: Optional[str] = None,
    severity: Optional[str] = None,
    assignee_id: Optional[str] = None,
    category: Optional[str] = None,
    search: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    query = select(ITSMIncident).where(
        and_(
            ITSMIncident.organisation_id == user.organisation_id,
            ITSMIncident.deleted_at.is_(None),
        )
    )
    if status:
        query = query.where(ITSMIncident.status == status)
    if severity:
        query = query.where(ITSMIncident.severity == severity)
    if assignee_id:
        query = query.where(ITSMIncident.assignee_id == assignee_id)
    if category:
        query = query.where(ITSMIncident.category == category)
    if search:
        query = query.where(
            or_(
                ITSMIncident.title.ilike(f"%{search}%"),
                ITSMIncident.key.ilike(f"%{search}%"),
            )
        )

    # Count
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    # Fetch
    query = query.order_by(ITSMIncident.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    incidents = result.scalars().all()

    return {
        "total": total,
        "items": [
            {
                "id": i.id, "key": i.key, "title": i.title,
                "severity": i.severity, "status": i.status,
                "category": i.category, "assignee_id": i.assignee_id,
                "reporter_id": i.reporter_id, "escalation_level": i.escalation_level,
                "tags": i.tags, "created_at": str(i.created_at),
                "resolved_at": str(i.resolved_at) if i.resolved_at else None,
            }
            for i in incidents
        ],
    }


@router.get("/incidents/{incident_id}")
async def get_incident(
    incident_id: str,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ITSMIncident).where(
            and_(
                ITSMIncident.id == incident_id,
                ITSMIncident.organisation_id == user.organisation_id,
                ITSMIncident.deleted_at.is_(None),
            )
        )
    )
    incident = result.scalars().first()
    if not incident:
        raise HTTPException(404, "Incident not found")

    # Get SLA tracking
    sla_data = None
    if incident.sla_id:
        sla_result = await db.execute(
            select(ITSMSLATracking).where(ITSMSLATracking.incident_id == incident.id)
        )
        sla_track = sla_result.scalars().first()
        if sla_track:
            sla_data = {
                "response_deadline": str(sla_track.response_deadline),
                "resolution_deadline": str(sla_track.resolution_deadline),
                "response_met": sla_track.response_met,
                "resolution_met": sla_track.resolution_met,
                "breach_notified": sla_track.breach_notified,
            }

    return {
        "id": incident.id, "key": incident.key, "title": incident.title,
        "description": incident.description, "severity": incident.severity,
        "status": incident.status, "category": incident.category,
        "subcategory": incident.subcategory, "assignee_id": incident.assignee_id,
        "reporter_id": incident.reporter_id, "resolution": incident.resolution,
        "escalation_level": incident.escalation_level, "impact": incident.impact,
        "urgency": incident.urgency, "affected_services": incident.affected_services,
        "tags": incident.tags, "problem_id": incident.problem_id,
        "sla": sla_data,
        "acknowledged_at": str(incident.acknowledged_at) if incident.acknowledged_at else None,
        "resolved_at": str(incident.resolved_at) if incident.resolved_at else None,
        "closed_at": str(incident.closed_at) if incident.closed_at else None,
        "created_at": str(incident.created_at),
        "updated_at": str(incident.updated_at),
    }


@router.patch("/incidents/{incident_id}")
async def update_incident(
    incident_id: str,
    body: IncidentUpdate,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ITSMIncident).where(
            and_(
                ITSMIncident.id == incident_id,
                ITSMIncident.organisation_id == user.organisation_id,
                ITSMIncident.deleted_at.is_(None),
            )
        )
    )
    incident = result.scalars().first()
    if not incident:
        raise HTTPException(404, "Incident not found")

    changes = {}
    for field, value in body.dict(exclude_unset=True).items():
        if value is not None:
            old_val = getattr(incident, field)
            setattr(incident, field, value)
            changes[field] = {"old": old_val, "new": value}

    # Handle status transitions
    if body.status == "acknowledged" and not incident.acknowledged_at:
        incident.acknowledged_at = utcnow()
        # Check SLA response
        sla_result = await db.execute(
            select(ITSMSLATracking).where(ITSMSLATracking.incident_id == incident.id)
        )
        sla_track = sla_result.scalars().first()
        if sla_track:
            sla_track.response_met = incident.acknowledged_at <= sla_track.response_deadline

    if body.status == "resolved" and not incident.resolved_at:
        incident.resolved_at = utcnow()
        sla_result = await db.execute(
            select(ITSMSLATracking).where(ITSMSLATracking.incident_id == incident.id)
        )
        sla_track = sla_result.scalars().first()
        if sla_track:
            sla_track.resolution_met = incident.resolved_at <= sla_track.resolution_deadline

    if body.status == "closed":
        incident.closed_at = utcnow()

    db.add(AuditLog(
            request_id=str(uuid.uuid4()),
        user_id=user.id,
        organisation_id=user.organisation_id,
        event_type="itsm.incident.updated",
        resource_type="itsm_incident",
        resource_id=incident.id,
        governance_metadata=changes,
    ))

    await db.commit()
    return {"status": "updated", "id": incident.id, "key": incident.key}


@router.post("/incidents/{incident_id}/escalate")
async def escalate_incident(
    incident_id: str,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ITSMIncident).where(
            and_(
                ITSMIncident.id == incident_id,
                ITSMIncident.organisation_id == user.organisation_id,
                ITSMIncident.deleted_at.is_(None),
            )
        )
    )
    incident = result.scalars().first()
    if not incident:
        raise HTTPException(404, "Incident not found")

    incident.escalation_level = (incident.escalation_level or 0) + 1

    db.add(AuditLog(
            request_id=str(uuid.uuid4()),
        user_id=user.id,
        organisation_id=user.organisation_id,
        event_type="itsm.incident.escalated",
        resource_type="itsm_incident",
        resource_id=incident.id,
        governance_metadata={"new_level": incident.escalation_level},
    ))

    await db.commit()
    return {"status": "escalated", "escalation_level": incident.escalation_level}


@router.post("/incidents/{incident_id}/resolve")
async def resolve_incident(
    incident_id: str,
    body: dict,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ITSMIncident).where(
            and_(
                ITSMIncident.id == incident_id,
                ITSMIncident.organisation_id == user.organisation_id,
                ITSMIncident.deleted_at.is_(None),
            )
        )
    )
    incident = result.scalars().first()
    if not incident:
        raise HTTPException(404, "Incident not found")

    incident.status = IncidentStatus.RESOLVED.value
    incident.resolution = body.get("resolution", "")
    incident.resolved_at = utcnow()

    # Check SLA
    sla_result = await db.execute(
        select(ITSMSLATracking).where(ITSMSLATracking.incident_id == incident.id)
    )
    sla_track = sla_result.scalars().first()
    if sla_track:
        sla_track.resolution_met = incident.resolved_at <= sla_track.resolution_deadline

    db.add(AuditLog(
            request_id=str(uuid.uuid4()),
        user_id=user.id,
        organisation_id=user.organisation_id,
        event_type="itsm.incident.resolved",
        resource_type="itsm_incident",
        resource_id=incident.id,
        governance_metadata={"resolution": incident.resolution},
    ))

    await db.commit()
    return {"status": "resolved", "id": incident.id, "key": incident.key}


@router.get("/incidents/dashboard")
async def incident_dashboard(
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    org_filter = ITSMIncident.organisation_id == user.organisation_id
    not_deleted = ITSMIncident.deleted_at.is_(None)

    # Open incidents
    open_q = await db.execute(
        select(func.count(ITSMIncident.id)).where(
            and_(org_filter, not_deleted,
                 ITSMIncident.status.in_(["open", "acknowledged", "in_progress", "on_hold"]))
        )
    )
    open_count = open_q.scalar() or 0

    # By severity
    sev_q = await db.execute(
        select(ITSMIncident.severity, func.count(ITSMIncident.id)).where(
            and_(org_filter, not_deleted,
                 ITSMIncident.status.in_(["open", "acknowledged", "in_progress"]))
        ).group_by(ITSMIncident.severity)
    )
    by_severity = {row[0]: row[1] for row in sev_q.all()}

    # SLA breaches
    now = utcnow()
    breach_q = await db.execute(
        select(func.count(ITSMSLATracking.id)).where(
            and_(
                ITSMSLATracking.resolution_met.is_(None),
                ITSMSLATracking.resolution_deadline < now,
            )
        )
    )
    breaches = breach_q.scalar() or 0

    # Resolved today
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    resolved_q = await db.execute(
        select(func.count(ITSMIncident.id)).where(
            and_(org_filter, not_deleted,
                 ITSMIncident.resolved_at >= today_start)
        )
    )
    resolved_today = resolved_q.scalar() or 0

    # Total changes pending
    changes_q = await db.execute(
        select(func.count(ITSMChange.id)).where(
            and_(
                ITSMChange.organisation_id == user.organisation_id,
                ITSMChange.status.in_(["draft", "submitted"]),
                ITSMChange.deleted_at.is_(None),
            )
        )
    )
    pending_changes = changes_q.scalar() or 0

    return {
        "open_incidents": open_count,
        "by_severity": by_severity,
        "sla_breaches": breaches,
        "resolved_today": resolved_today,
        "pending_changes": pending_changes,
    }


# ── Problems ─────────────────────────────────────────────────

@router.post("/problems", status_code=201)
async def create_problem(
    body: ProblemCreate,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    key = await _next_key(db, "PRB", ITSMProblem)
    problem = ITSMProblem(
        key=key,
        title=body.title,
        description=body.description,
        owner_id=user.id,
        organisation_id=user.organisation_id,
    )
    db.add(problem)
    await db.commit()
    await db.refresh(problem)
    return {"id": problem.id, "key": problem.key, "title": problem.title, "status": problem.status}


@router.get("/problems")
async def list_problems(
    status: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    query = select(ITSMProblem).where(
        and_(ITSMProblem.organisation_id == user.organisation_id, ITSMProblem.deleted_at.is_(None))
    )
    if status:
        query = query.where(ITSMProblem.status == status)
    query = query.order_by(ITSMProblem.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    problems = result.scalars().all()
    return [
        {"id": p.id, "key": p.key, "title": p.title, "status": p.status,
         "root_cause": p.root_cause, "workaround": p.workaround, "created_at": str(p.created_at)}
        for p in problems
    ]


@router.patch("/problems/{problem_id}")
async def update_problem(
    problem_id: str,
    body: ProblemUpdate,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ITSMProblem).where(
            and_(ITSMProblem.id == problem_id, ITSMProblem.organisation_id == user.organisation_id)
        )
    )
    problem = result.scalars().first()
    if not problem:
        raise HTTPException(404, "Problem not found")
    for field, value in body.dict(exclude_unset=True).items():
        if value is not None:
            setattr(problem, field, value)
    await db.commit()
    return {"status": "updated", "id": problem.id}


@router.post("/problems/{problem_id}/link-incident")
async def link_incident_to_problem(
    problem_id: str,
    body: dict,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    incident_id = body.get("incident_id")
    if not incident_id:
        raise HTTPException(400, "incident_id required")
    result = await db.execute(
        select(ITSMIncident).where(
            and_(ITSMIncident.id == incident_id, ITSMIncident.organisation_id == user.organisation_id)
        )
    )
    incident = result.scalars().first()
    if not incident:
        raise HTTPException(404, "Incident not found")
    incident.problem_id = problem_id
    await db.commit()
    return {"status": "linked", "incident_id": incident_id, "problem_id": problem_id}


# ── Changes ──────────────────────────────────────────────────

@router.post("/changes", status_code=201)
async def create_change(
    body: ChangeCreate,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    key = await _next_key(db, "CHG", ITSMChange)
    change = ITSMChange(
        key=key,
        title=body.title,
        description=body.description,
        change_type=body.change_type,
        risk_level=body.risk_level,
        impact=body.impact,
        rollback_plan=body.rollback_plan,
        implementation_plan=body.implementation_plan,
        requester_id=user.id,
        organisation_id=user.organisation_id,
        affected_cis=body.affected_cis,
        tags=body.tags,
    )
    db.add(change)
    await db.commit()
    await db.refresh(change)
    return {"id": change.id, "key": change.key, "title": change.title, "status": change.status}


@router.get("/changes")
async def list_changes(
    status: Optional[str] = None,
    change_type: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    query = select(ITSMChange).where(
        and_(ITSMChange.organisation_id == user.organisation_id, ITSMChange.deleted_at.is_(None))
    )
    if status:
        query = query.where(ITSMChange.status == status)
    if change_type:
        query = query.where(ITSMChange.change_type == change_type)
    query = query.order_by(ITSMChange.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    changes = result.scalars().all()
    return [
        {"id": c.id, "key": c.key, "title": c.title, "change_type": c.change_type,
         "status": c.status, "risk_level": c.risk_level, "created_at": str(c.created_at)}
        for c in changes
    ]


@router.patch("/changes/{change_id}")
async def update_change(
    change_id: str,
    body: ChangeUpdate,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ITSMChange).where(
            and_(ITSMChange.id == change_id, ITSMChange.organisation_id == user.organisation_id)
        )
    )
    change = result.scalars().first()
    if not change:
        raise HTTPException(404, "Change not found")
    for field, value in body.dict(exclude_unset=True).items():
        if value is not None:
            setattr(change, field, value)
    await db.commit()
    return {"status": "updated", "id": change.id}


@router.post("/changes/{change_id}/approve")
async def approve_change(
    change_id: str,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(require_min_role(UserRole.ORG_ADMIN)),
):
    result = await db.execute(
        select(ITSMChange).where(
            and_(ITSMChange.id == change_id, ITSMChange.organisation_id == user.organisation_id)
        )
    )
    change = result.scalars().first()
    if not change:
        raise HTTPException(404, "Change not found")
    change.status = ChangeStatus.APPROVED.value
    change.cab_approver_id = user.id
    change.cab_approved_at = utcnow()
    await db.commit()
    return {"status": "approved", "id": change.id, "key": change.key}


@router.post("/changes/{change_id}/implement")
async def implement_change(
    change_id: str,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ITSMChange).where(
            and_(ITSMChange.id == change_id, ITSMChange.organisation_id == user.organisation_id)
        )
    )
    change = result.scalars().first()
    if not change:
        raise HTTPException(404, "Change not found")
    if change.status != ChangeStatus.APPROVED.value:
        raise HTTPException(400, "Change must be approved before implementation")
    change.status = ChangeStatus.IMPLEMENTING.value
    change.actual_start = utcnow()
    await db.commit()
    return {"status": "implementing", "id": change.id}


@router.post("/changes/{change_id}/rollback")
async def rollback_change(
    change_id: str,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ITSMChange).where(
            and_(ITSMChange.id == change_id, ITSMChange.organisation_id == user.organisation_id)
        )
    )
    change = result.scalars().first()
    if not change:
        raise HTTPException(404, "Change not found")
    change.status = ChangeStatus.ROLLED_BACK.value
    change.actual_end = utcnow()
    await db.commit()
    return {"status": "rolled_back", "id": change.id}


# ── Service Requests ─────────────────────────────────────────

@router.post("/service-requests", status_code=201)
async def create_service_request(
    body: ServiceRequestCreate,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    key = await _next_key(db, "SR", ITSMServiceRequest)
    sr = ITSMServiceRequest(
        key=key,
        title=body.title,
        description=body.description,
        catalog_item=body.catalog_item,
        requester_id=user.id,
        organisation_id=user.organisation_id,
    )
    db.add(sr)
    await db.commit()
    await db.refresh(sr)
    return {"id": sr.id, "key": sr.key, "title": sr.title, "fulfillment_status": sr.fulfillment_status}


@router.get("/service-requests")
async def list_service_requests(
    status: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    query = select(ITSMServiceRequest).where(
        and_(ITSMServiceRequest.organisation_id == user.organisation_id,
             ITSMServiceRequest.deleted_at.is_(None))
    )
    if status:
        query = query.where(ITSMServiceRequest.fulfillment_status == status)
    query = query.order_by(ITSMServiceRequest.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    srs = result.scalars().all()
    return [
        {"id": s.id, "key": s.key, "title": s.title, "catalog_item": s.catalog_item,
         "fulfillment_status": s.fulfillment_status, "created_at": str(s.created_at)}
        for s in srs
    ]


@router.patch("/service-requests/{sr_id}")
async def update_service_request(
    sr_id: str,
    body: dict,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ITSMServiceRequest).where(
            and_(ITSMServiceRequest.id == sr_id, ITSMServiceRequest.organisation_id == user.organisation_id)
        )
    )
    sr = result.scalars().first()
    if not sr:
        raise HTTPException(404, "Service request not found")
    if "fulfillment_status" in body:
        sr.fulfillment_status = body["fulfillment_status"]
        if body["fulfillment_status"] == "fulfilled":
            sr.fulfilled_at = utcnow()
    if "assignee_id" in body:
        sr.assignee_id = body["assignee_id"]
    if "approver_id" in body:
        sr.approver_id = body["approver_id"]
    await db.commit()
    return {"status": "updated", "id": sr.id}


# ── SLA Definitions ──────────────────────────────────────────

@router.post("/sla-definitions", status_code=201)
async def create_sla_definition(
    body: SLADefinitionCreate,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(require_min_role(UserRole.ORG_ADMIN)),
):
    sla = ITSMSLADefinition(
        name=body.name,
        description=body.description,
        priority=body.priority,
        response_time_mins=body.response_time_mins,
        resolution_time_mins=body.resolution_time_mins,
        business_hours_only=body.business_hours_only,
        escalation_rules=body.escalation_rules,
        organisation_id=user.organisation_id,
    )
    db.add(sla)
    await db.commit()
    await db.refresh(sla)
    return {"id": sla.id, "name": sla.name, "priority": sla.priority}


@router.get("/sla-definitions")
async def list_sla_definitions(
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ITSMSLADefinition).where(ITSMSLADefinition.organisation_id == user.organisation_id)
    )
    slas = result.scalars().all()
    return [
        {"id": s.id, "name": s.name, "priority": s.priority,
         "response_time_mins": s.response_time_mins, "resolution_time_mins": s.resolution_time_mins,
         "business_hours_only": s.business_hours_only, "is_active": s.is_active}
        for s in slas
    ]


@router.get("/sla-breaches")
async def get_sla_breaches(
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    now = utcnow()
    result = await db.execute(
        select(ITSMSLATracking, ITSMIncident).join(
            ITSMIncident, ITSMSLATracking.incident_id == ITSMIncident.id
        ).where(
            and_(
                ITSMIncident.organisation_id == user.organisation_id,
                or_(
                    and_(ITSMSLATracking.response_met.is_(None), ITSMSLATracking.response_deadline < now),
                    and_(ITSMSLATracking.resolution_met.is_(None), ITSMSLATracking.resolution_deadline < now),
                ),
            )
        )
    )
    breaches = result.all()
    return [
        {
            "incident_id": inc.id, "incident_key": inc.key, "incident_title": inc.title,
            "severity": inc.severity,
            "response_breached": sla.response_met is None and sla.response_deadline < now,
            "resolution_breached": sla.resolution_met is None and sla.resolution_deadline < now,
            "response_deadline": str(sla.response_deadline),
            "resolution_deadline": str(sla.resolution_deadline),
        }
        for sla, inc in breaches
    ]


# ── CMDB ─────────────────────────────────────────────────────

@router.post("/cmdb", status_code=201)
async def create_cmdb_item(
    body: CMDBItemCreate,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    item = ITSMCMDBItem(
        name=body.name,
        ci_type=body.ci_type,
        status=body.status,
        environment=body.environment,
        description=body.description,
        dependencies=body.dependencies,
        attributes=body.attributes,
        owner_id=user.id,
        organisation_id=user.organisation_id,
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return {"id": item.id, "name": item.name, "ci_type": item.ci_type, "status": item.status}


@router.get("/cmdb")
async def list_cmdb_items(
    ci_type: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    query = select(ITSMCMDBItem).where(
        and_(ITSMCMDBItem.organisation_id == user.organisation_id, ITSMCMDBItem.deleted_at.is_(None))
    )
    if ci_type:
        query = query.where(ITSMCMDBItem.ci_type == ci_type)
    if status:
        query = query.where(ITSMCMDBItem.status == status)
    if search:
        query = query.where(ITSMCMDBItem.name.ilike(f"%{search}%"))
    query = query.order_by(ITSMCMDBItem.name).offset(skip).limit(limit)
    result = await db.execute(query)
    items = result.scalars().all()
    return [
        {"id": i.id, "name": i.name, "ci_type": i.ci_type, "status": i.status,
         "environment": i.environment, "description": i.description}
        for i in items
    ]


@router.get("/cmdb/{item_id}/dependencies")
async def get_cmdb_dependencies(
    item_id: str,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ITSMCMDBItem).where(
            and_(ITSMCMDBItem.id == item_id, ITSMCMDBItem.organisation_id == user.organisation_id)
        )
    )
    item = result.scalars().first()
    if not item:
        raise HTTPException(404, "CMDB item not found")

    dep_ids = item.dependencies or []
    deps = []
    if dep_ids:
        dep_result = await db.execute(
            select(ITSMCMDBItem).where(ITSMCMDBItem.id.in_(dep_ids))
        )
        deps = [
            {"id": d.id, "name": d.name, "ci_type": d.ci_type, "status": d.status}
            for d in dep_result.scalars().all()
        ]

    return {"item": {"id": item.id, "name": item.name}, "dependencies": deps}