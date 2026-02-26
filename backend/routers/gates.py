"""
PRINCE2 Gate Process Router — Project Lifecycle Management
Projects, Gates (G0-G6), Reviews, Criteria, Deliverables
Formal approval workflow with checklist verification
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from pydantic import BaseModel, Field
from typing import Optional, List

import uuid
from database import get_db_session
from auth import get_current_user, require_min_role
from models import (
    User, UserRole, utcnow,
    PLMProject, PLMGate, PLMGateReview, PLMGateCriteria, PLMDeliverable,
    GateStatus, ProjectStatus, AuditLog,
)

router = APIRouter(prefix="/api/v1/gates", tags=["gates"])

# ── PRINCE2 Gate Definitions ─────────────────────────────────

GATE_DEFINITIONS = [
    {"number": 0, "name": "Mandate", "description": "Initial idea/request validation", "criteria": [
        "Business need clearly articulated",
        "Stakeholders identified",
        "Initial scope defined",
    ]},
    {"number": 1, "name": "Business Case", "description": "Viability, cost-benefit, risk assessment", "criteria": [
        "Cost-benefit analysis completed",
        "Risk assessment documented",
        "Resource requirements identified",
        "Success criteria defined",
    ]},
    {"number": 2, "name": "Design", "description": "Technical design review, architecture approval", "criteria": [
        "Technical architecture documented",
        "Security review completed",
        "Integration points identified",
        "Performance requirements defined",
    ]},
    {"number": 3, "name": "Build", "description": "Implementation complete, code review passed", "criteria": [
        "Code implementation complete",
        "Code review passed",
        "Unit tests written and passing",
        "Documentation updated",
    ]},
    {"number": 4, "name": "Test", "description": "QA complete, compliance verified, security scanned", "criteria": [
        "Integration tests passing",
        "Security scan completed — no critical findings",
        "Compliance requirements verified",
        "User acceptance testing signed off",
    ]},
    {"number": 5, "name": "Deploy", "description": "Production readiness, rollback plan, monitoring", "criteria": [
        "Deployment plan documented",
        "Rollback procedure tested",
        "Monitoring and alerting configured",
        "Runbook updated",
    ]},
    {"number": 6, "name": "Close", "description": "Post-implementation review, lessons learned", "criteria": [
        "Post-implementation review completed",
        "Lessons learned documented",
        "Knowledge base updated",
        "Stakeholder sign-off obtained",
    ]},
]


# ── Schemas ──────────────────────────────────────────────────

class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=300)
    description: Optional[str] = None
    target_date: Optional[str] = None
    budget: Optional[str] = None
    tags: List[str] = []

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    target_date: Optional[str] = None
    budget: Optional[str] = None
    tags: Optional[List[str]] = None

class ReviewSubmit(BaseModel):
    decision: str = Field(..., pattern="^(approve|reject|defer)$")
    comments: Optional[str] = None
    evidence_urls: List[str] = []


# ── Key Generation ───────────────────────────────────────────

async def _next_project_key(db: AsyncSession) -> str:
    result = await db.execute(select(func.count(PLMProject.id)))
    count = result.scalar() or 0
    return f"PRJ-{count + 1:04d}"


# ── Projects ─────────────────────────────────────────────────

@router.post("/projects", status_code=201)
async def create_project(
    body: ProjectCreate,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    key = await _next_project_key(db)
    project = PLMProject(
        key=key,
        name=body.name,
        description=body.description,
        owner_id=user.id,
        organisation_id=user.organisation_id,
        budget=body.budget,
        tags=body.tags,
    )
    db.add(project)
    await db.flush()

    # Auto-create all 7 gates with default criteria
    for gate_def in GATE_DEFINITIONS:
        gate = PLMGate(
            project_id=project.id,
            gate_number=gate_def["number"],
            gate_name=gate_def["name"],
            description=gate_def["description"],
        )
        db.add(gate)
        await db.flush()

        # Add default criteria
        for criteria_text in gate_def["criteria"]:
            criteria = PLMGateCriteria(
                gate_id=gate.id,
                description=criteria_text,
                is_mandatory=True,
            )
            db.add(criteria)

    db.add(AuditLog(
            request_id=str(uuid.uuid4()),
        user_id=user.id,
        organisation_id=user.organisation_id,
        event_type="plm.project.created",
        resource_type="plm_project",
        resource_id=project.id,
        governance_metadata={"key": key, "name": body.name},
    ))

    await db.commit()
    await db.refresh(project)
    return {
        "id": project.id, "key": project.key, "name": project.name,
        "status": project.status, "current_gate": project.current_gate,
        "created_at": str(project.created_at),
    }


@router.get("/projects")
async def list_projects(
    status: Optional[str] = None,
    search: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    query = select(PLMProject).where(
        and_(PLMProject.organisation_id == user.organisation_id, PLMProject.deleted_at.is_(None))
    )
    if status:
        query = query.where(PLMProject.status == status)
    if search:
        query = query.where(PLMProject.name.ilike(f"%{search}%"))

    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    query = query.order_by(PLMProject.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    projects = result.scalars().all()

    items = []
    for p in projects:
        # Get gate summary
        gates_q = await db.execute(
            select(PLMGate.gate_number, PLMGate.status).where(PLMGate.project_id == p.id).order_by(PLMGate.gate_number)
        )
        gates = [{"number": g[0], "status": g[1]} for g in gates_q.all()]
        items.append({
            "id": p.id, "key": p.key, "name": p.name, "status": p.status,
            "current_gate": p.current_gate, "owner_id": p.owner_id,
            "target_date": str(p.target_date) if p.target_date else None,
            "gates": gates, "tags": p.tags, "created_at": str(p.created_at),
        })

    return {"total": total, "items": items}


@router.get("/projects/{project_id}")
async def get_project(
    project_id: str,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(PLMProject).where(
            and_(PLMProject.id == project_id, PLMProject.organisation_id == user.organisation_id,
                 PLMProject.deleted_at.is_(None))
        )
    )
    project = result.scalars().first()
    if not project:
        raise HTTPException(404, "Project not found")

    # Get all gates with criteria
    gates_result = await db.execute(
        select(PLMGate).where(PLMGate.project_id == project.id).order_by(PLMGate.gate_number)
    )
    gates = gates_result.scalars().all()

    gate_data = []
    for gate in gates:
        # Get criteria
        criteria_result = await db.execute(
            select(PLMGateCriteria).where(PLMGateCriteria.gate_id == gate.id)
        )
        criteria = criteria_result.scalars().all()

        # Get reviews
        reviews_result = await db.execute(
            select(PLMGateReview).where(PLMGateReview.gate_id == gate.id)
        )
        reviews = reviews_result.scalars().all()

        # Get deliverables
        deliverables_result = await db.execute(
            select(PLMDeliverable).where(PLMDeliverable.gate_id == gate.id)
        )
        deliverables = deliverables_result.scalars().all()

        gate_data.append({
            "id": gate.id, "gate_number": gate.gate_number, "gate_name": gate.gate_name,
            "description": gate.description, "status": gate.status,
            "required_approvers": gate.required_approvers,
            "deadline": str(gate.deadline) if gate.deadline else None,
            "submitted_at": str(gate.submitted_at) if gate.submitted_at else None,
            "approved_at": str(gate.approved_at) if gate.approved_at else None,
            "criteria": [
                {"id": c.id, "description": c.description, "is_mandatory": c.is_mandatory,
                 "is_met": c.is_met, "verified_by": c.verified_by,
                 "verified_at": str(c.verified_at) if c.verified_at else None}
                for c in criteria
            ],
            "reviews": [
                {"id": r.id, "reviewer_id": r.reviewer_id, "decision": r.decision,
                 "comments": r.comments, "reviewed_at": str(r.reviewed_at)}
                for r in reviews
            ],
            "deliverables": [
                {"id": d.id, "name": d.name, "type": d.deliverable_type,
                 "status": d.status, "external_url": d.external_url}
                for d in deliverables
            ],
        })

    return {
        "id": project.id, "key": project.key, "name": project.name,
        "description": project.description, "status": project.status,
        "current_gate": project.current_gate, "owner_id": project.owner_id,
        "target_date": str(project.target_date) if project.target_date else None,
        "budget": project.budget, "tags": project.tags,
        "gates": gate_data,
        "started_at": str(project.started_at) if project.started_at else None,
        "created_at": str(project.created_at),
    }


@router.patch("/projects/{project_id}")
async def update_project(
    project_id: str,
    body: ProjectUpdate,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(PLMProject).where(
            and_(PLMProject.id == project_id, PLMProject.organisation_id == user.organisation_id)
        )
    )
    project = result.scalars().first()
    if not project:
        raise HTTPException(404, "Project not found")

    for field, value in body.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(project, field, value)

    if body.status == "active" and not project.started_at:
        project.started_at = utcnow()

    await db.commit()
    return {"status": "updated", "id": project.id}


@router.get("/projects/dashboard")
async def project_dashboard(
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    org_filter = and_(
        PLMProject.organisation_id == user.organisation_id,
        PLMProject.deleted_at.is_(None),
    )

    # By status
    status_q = await db.execute(
        select(PLMProject.status, func.count(PLMProject.id)).where(org_filter).group_by(PLMProject.status)
    )
    by_status = {row[0]: row[1] for row in status_q.all()}

    # By current gate
    gate_q = await db.execute(
        select(PLMProject.current_gate, func.count(PLMProject.id)).where(
            and_(org_filter, PLMProject.status == "active")
        ).group_by(PLMProject.current_gate)
    )
    by_gate = {f"G{row[0]}": row[1] for row in gate_q.all()}

    # Gates awaiting review
    pending_q = await db.execute(
        select(func.count(PLMGate.id)).where(PLMGate.status == GateStatus.IN_REVIEW.value)
    )
    pending_reviews = pending_q.scalar() or 0

    return {
        "by_status": by_status,
        "by_gate": by_gate,
        "pending_reviews": pending_reviews,
        "total_active": by_status.get("active", 0),
    }


# ── Gates ────────────────────────────────────────────────────

@router.get("/projects/{project_id}/gates")
async def list_gates(
    project_id: str,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(PLMGate).where(PLMGate.project_id == project_id).order_by(PLMGate.gate_number)
    )
    gates = result.scalars().all()
    return [
        {"id": g.id, "gate_number": g.gate_number, "gate_name": g.gate_name,
         "status": g.status, "required_approvers": g.required_approvers,
         "deadline": str(g.deadline) if g.deadline else None}
        for g in gates
    ]


@router.get("/projects/{project_id}/gates/{gate_num}")
async def get_gate(
    project_id: str,
    gate_num: int,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(PLMGate).where(
            and_(PLMGate.project_id == project_id, PLMGate.gate_number == gate_num)
        )
    )
    gate = result.scalars().first()
    if not gate:
        raise HTTPException(404, "Gate not found")

    criteria_result = await db.execute(
        select(PLMGateCriteria).where(PLMGateCriteria.gate_id == gate.id)
    )
    criteria = criteria_result.scalars().all()

    reviews_result = await db.execute(
        select(PLMGateReview).where(PLMGateReview.gate_id == gate.id)
    )
    reviews = reviews_result.scalars().all()

    return {
        "id": gate.id, "gate_number": gate.gate_number, "gate_name": gate.gate_name,
        "description": gate.description, "status": gate.status,
        "criteria": [
            {"id": c.id, "description": c.description, "is_mandatory": c.is_mandatory,
             "is_met": c.is_met, "verified_by": c.verified_by}
            for c in criteria
        ],
        "reviews": [
            {"id": r.id, "reviewer_id": r.reviewer_id, "decision": r.decision,
             "comments": r.comments, "reviewed_at": str(r.reviewed_at)}
            for r in reviews
        ],
    }


@router.post("/projects/{project_id}/gates/{gate_num}/submit")
async def submit_gate(
    project_id: str,
    gate_num: int,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(PLMGate).where(
            and_(PLMGate.project_id == project_id, PLMGate.gate_number == gate_num)
        )
    )
    gate = result.scalars().first()
    if not gate:
        raise HTTPException(404, "Gate not found")
    if gate.status != GateStatus.PENDING.value:
        raise HTTPException(400, f"Gate is already {gate.status}")

    # Check mandatory criteria
    criteria_result = await db.execute(
        select(PLMGateCriteria).where(
            and_(PLMGateCriteria.gate_id == gate.id, PLMGateCriteria.is_mandatory == True)
        )
    )
    mandatory = criteria_result.scalars().all()
    unmet = [c for c in mandatory if not c.is_met]
    if unmet:
        raise HTTPException(400, f"{len(unmet)} mandatory criteria not yet met")

    gate.status = GateStatus.IN_REVIEW.value
    gate.submitted_at = utcnow()

    db.add(AuditLog(
            request_id=str(uuid.uuid4()),
        user_id=user.id,
        organisation_id=user.organisation_id,
        event_type="plm.gate.submitted",
        resource_type="plm_gate",
        resource_id=gate.id,
        governance_metadata={"project_id": project_id, "gate_number": gate_num},
    ))

    await db.commit()
    return {"status": "submitted", "gate": gate.gate_name}


@router.post("/projects/{project_id}/gates/{gate_num}/review")
async def review_gate(
    project_id: str,
    gate_num: int,
    body: ReviewSubmit,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(require_min_role(UserRole.POWER_USER)),
):
    result = await db.execute(
        select(PLMGate).where(
            and_(PLMGate.project_id == project_id, PLMGate.gate_number == gate_num)
        )
    )
    gate = result.scalars().first()
    if not gate:
        raise HTTPException(404, "Gate not found")
    if gate.status != GateStatus.IN_REVIEW.value:
        raise HTTPException(400, "Gate is not in review")

    review = PLMGateReview(
        gate_id=gate.id,
        reviewer_id=user.id,
        decision=body.decision,
        comments=body.comments,
        evidence_urls=body.evidence_urls,
    )
    db.add(review)

    # Check if enough approvals
    if body.decision == "approve":
        approvals_q = await db.execute(
            select(func.count(PLMGateReview.id)).where(
                and_(PLMGateReview.gate_id == gate.id, PLMGateReview.decision == "approve")
            )
        )
        approval_count = (approvals_q.scalar() or 0) + 1  # +1 for current
        if approval_count >= gate.required_approvers:
            gate.status = GateStatus.APPROVED.value
            gate.approved_at = utcnow()
            # Advance project
            project_result = await db.execute(
                select(PLMProject).where(PLMProject.id == project_id)
            )
            project = project_result.scalars().first()
            if project and project.current_gate == gate_num:
                project.current_gate = gate_num + 1
                if gate_num == 6:
                    project.status = ProjectStatus.COMPLETED.value

    elif body.decision == "reject":
        gate.status = GateStatus.REJECTED.value
        gate.rejected_at = utcnow()

    await db.commit()
    return {"status": "reviewed", "decision": body.decision, "gate_status": gate.status}


@router.post("/projects/{project_id}/gates/{gate_num}/criteria/{criteria_id}/verify")
async def verify_criteria(
    project_id: str,
    gate_num: int,
    criteria_id: str,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(PLMGateCriteria).where(PLMGateCriteria.id == criteria_id)
    )
    criteria = result.scalars().first()
    if not criteria:
        raise HTTPException(404, "Criteria not found")

    criteria.is_met = True
    criteria.verified_by = user.id
    criteria.verified_at = utcnow()
    await db.commit()
    return {"status": "verified", "criteria_id": criteria_id}


# ── Deliverables ─────────────────────────────────────────────

@router.post("/projects/{project_id}/gates/{gate_num}/deliverables", status_code=201)
async def add_deliverable(
    project_id: str,
    gate_num: int,
    body: dict,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    gate_result = await db.execute(
        select(PLMGate).where(
            and_(PLMGate.project_id == project_id, PLMGate.gate_number == gate_num)
        )
    )
    gate = gate_result.scalars().first()
    if not gate:
        raise HTTPException(404, "Gate not found")

    deliverable = PLMDeliverable(
        gate_id=gate.id,
        name=body.get("name", "Untitled"),
        deliverable_type=body.get("type"),
        file_node_id=body.get("file_node_id"),
        document_id=body.get("document_id"),
        external_url=body.get("external_url"),
    )
    db.add(deliverable)
    await db.commit()
    await db.refresh(deliverable)
    return {"id": deliverable.id, "name": deliverable.name, "status": deliverable.status}


@router.get("/projects/{project_id}/gates/{gate_num}/deliverables")
async def list_deliverables(
    project_id: str,
    gate_num: int,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    gate_result = await db.execute(
        select(PLMGate).where(
            and_(PLMGate.project_id == project_id, PLMGate.gate_number == gate_num)
        )
    )
    gate = gate_result.scalars().first()
    if not gate:
        raise HTTPException(404, "Gate not found")

    result = await db.execute(
        select(PLMDeliverable).where(PLMDeliverable.gate_id == gate.id)
    )
    deliverables = result.scalars().all()
    return [
        {"id": d.id, "name": d.name, "type": d.deliverable_type,
         "status": d.status, "external_url": d.external_url,
         "created_at": str(d.created_at)}
        for d in deliverables
    ]


@router.delete("/projects/{project_id}/gates/{gate_num}/deliverables/{del_id}")
async def delete_deliverable(
    project_id: str,
    gate_num: int,
    del_id: str,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(PLMDeliverable).where(PLMDeliverable.id == del_id)
    )
    deliverable = result.scalars().first()
    if not deliverable:
        raise HTTPException(404, "Deliverable not found")
    await db.delete(deliverable)
    await db.commit()
    return {"status": "deleted"}


# ── Reports ──────────────────────────────────────────────────

@router.get("/reports/gate-velocity")
async def gate_velocity(
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    """Average time per gate across all projects"""
    result = await db.execute(
        select(PLMGate.gate_name, PLMGate.gate_number,
               func.count(PLMGate.id).label("total"),
               func.count(PLMGate.approved_at).label("approved"))
        .where(PLMGate.project_id.in_(
            select(PLMProject.id).where(PLMProject.organisation_id == user.organisation_id)
        ))
        .group_by(PLMGate.gate_name, PLMGate.gate_number)
        .order_by(PLMGate.gate_number)
    )
    return [
        {"gate": row[0], "number": row[1], "total": row[2], "approved": row[3]}
        for row in result.all()
    ]


@router.get("/reports/rejection-rate")
async def rejection_rate(
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    """Gate rejection analysis"""
    result = await db.execute(
        select(PLMGate.gate_name,
               func.count(PLMGate.id).label("total"),
               func.count(PLMGate.rejected_at).label("rejected"))
        .where(PLMGate.project_id.in_(
            select(PLMProject.id).where(PLMProject.organisation_id == user.organisation_id)
        ))
        .group_by(PLMGate.gate_name)
    )
    return [
        {"gate": row[0], "total": row[1], "rejected": row[2],
         "rate": round(row[2] / max(row[1], 1) * 100, 1)}
        for row in result.all()
    ]