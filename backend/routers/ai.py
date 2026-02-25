# routers/ai.py — AI generation with HITL governance (v3.0)
import uuid
import hashlib
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user, require_min_role, require_permission, CurrentUser
from database import get_db_session
from models import (
    AuditLog, AuditEventType, RiskLevel, TaskStatus, UserRole,
    HITLTask, AISystemRecord, ProvenanceManifest, utcnow,
)

router = APIRouter(prefix="/api/v1/ai", tags=["AI Generation"])

# High-risk task type keywords that trigger HITL
HIGH_RISK_KEYWORDS = frozenset({
    "biometric", "recruitment", "hr_screening", "credit_scoring",
    "law_enforcement", "critical_infrastructure", "medical_diagnosis",
    "immigration", "social_scoring",
})


# --- Request / Response Schemas ---

class GenerateRequest(BaseModel):
    system_id: str = Field(..., description="AI system ID")
    prompt: str = Field(..., min_length=1, max_length=100000)
    model: Optional[str] = None
    task_type: str = Field(default="general", description="Task classification")
    parameters: Optional[Dict[str, Any]] = Field(default_factory=dict)
    require_provenance: bool = True


class GenerateResponse(BaseModel):
    request_id: str
    content: Optional[str] = None
    model_used: str
    status: str
    governance_decision: Dict[str, Any]
    provenance_manifest_url: Optional[str] = None
    message: Optional[str] = None
    timestamp: datetime


class ReviewRequest(BaseModel):
    approved: bool
    comments: str = Field(default="", max_length=5000)


class HITLTaskOut(BaseModel):
    id: str
    system_name: str
    task_type: str
    prompt: str
    proposed_output: Optional[str]
    risk_level: str
    status: str
    created_at: datetime


# --- Helpers ---

def _detect_risk(task_type: str, system_record: Optional[AISystemRecord] = None) -> bool:
    """Determine if a task requires HITL based on type keywords or system risk level"""
    if any(kw in task_type.lower() for kw in HIGH_RISK_KEYWORDS):
        return True
    if system_record and system_record.risk_level in (RiskLevel.HIGH_RISK, RiskLevel.PROHIBITED):
        return True
    return False


async def _simulate_llm_call(prompt: str, model: Optional[str] = None) -> Dict[str, str]:
    """Placeholder for actual LLM orchestration layer.
    Replace with real provider calls (OpenAI, Anthropic, Groq, local Llama, etc.)
    TODO: Wire to real LLM providers via environment config
    """
    return {
        "content": f"Generated response for: {prompt[:200]}...",
        "model_used": model or "qwen-2.5-coder-32b",
    }


# --- Endpoints ---

@router.post("/generate", response_model=GenerateResponse)
async def generate_ai_content(
    request: GenerateRequest,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Generate AI content with governance and provenance.
    High-risk tasks are queued for human oversight instead of instant execution.
    """
    request_id = str(uuid.uuid4())
    now = utcnow()

    try:
        # Look up system record (optional enrichment)
        system_record = None
        stmt = select(AISystemRecord).where(AISystemRecord.id == request.system_id)
        result = await db.execute(stmt)
        system_record = result.scalar_one_or_none()

        is_high_risk = _detect_risk(request.task_type, system_record)

        # --- HITL Gate ---
        if is_high_risk:
            # Generate proposed output but do NOT return it to the caller
            llm_result = await _simulate_llm_call(request.prompt, request.model)

            task = HITLTask(
                system_id=request.system_id,
                system_name=system_record.name if system_record else request.system_id,
                task_type=request.task_type,
                prompt=request.prompt,
                proposed_output=llm_result["content"],
                risk_level=RiskLevel.HIGH_RISK,
                status=TaskStatus.PENDING_REVIEW,
                submitted_by=user.id,
                organisation_id=user.organisation_id,
            )
            db.add(task)

            audit_log = AuditLog(
                request_id=request_id,
                event_type=AuditEventType.HITL_QUEUED,
                system_id=request.system_id,
                user_id=user.id,
                organisation_id=user.organisation_id,
                risk_level=RiskLevel.HIGH_RISK,
                model_used=llm_result["model_used"],
                governance_metadata={"hitl_task_id": task.id, "reason": "high_risk_detected"},
            )
            db.add(audit_log)
            await db.commit()

            return GenerateResponse(
                request_id=request_id,
                content=None,
                model_used=llm_result["model_used"],
                status=TaskStatus.PENDING_REVIEW.value,
                governance_decision={
                    "allowed": False,
                    "risk_level": "HIGH_RISK",
                    "reason": "High-risk task detected. Awaiting human oversight per EU AI Act Art. 14.",
                    "hitl_task_id": task.id,
                },
                message="High-risk task queued for human oversight.",
                timestamp=now,
            )

        # --- Standard Path (Minimal / Limited Risk) ---
        llm_result = await _simulate_llm_call(request.prompt, request.model)

        governance_decision = {
            "allowed": True,
            "risk_level": "MINIMAL_RISK",
            "article_50_required": True,
            "reason": "Approved – minimal risk",
        }

        # Create provenance manifest
        content_hash = hashlib.sha256(llm_result["content"].encode()).hexdigest()
        provenance = ProvenanceManifest(
            request_id=request_id,
            system_id=request.system_id,
            user_id=user.id,
            organisation_id=user.organisation_id,
            content_hash=content_hash,
            manifest_data={
                "model": llm_result["model_used"],
                "timestamp": now.isoformat(),
                "prompt_hash": hashlib.sha256(request.prompt.encode()).hexdigest(),
            },
            signing_status="SIGNED",
            signed_at=now,
        )
        db.add(provenance)

        # Audit log
        audit_log = AuditLog(
            request_id=request_id,
            event_type=AuditEventType.GENERATION_SUCCESS,
            system_id=request.system_id,
            user_id=user.id,
            organisation_id=user.organisation_id,
            risk_level=RiskLevel.MINIMAL_RISK,
            model_used=llm_result["model_used"],
            governance_metadata=governance_decision,
        )
        db.add(audit_log)
        await db.commit()

        return GenerateResponse(
            request_id=request_id,
            content=llm_result["content"],
            model_used=llm_result["model_used"],
            status=TaskStatus.PROCESSED.value,
            governance_decision=governance_decision,
            provenance_manifest_url=f"/api/v1/ai/provenance/{request_id}",
            timestamp=now,
        )

    except HTTPException:
        raise
    except Exception as e:
        audit_log = AuditLog(
            request_id=request_id,
            event_type=AuditEventType.GENERATION_FAILED,
            system_id=request.system_id,
            user_id=user.id,
            organisation_id=user.organisation_id,
            error_message=str(e),
        )
        db.add(audit_log)
        await db.commit()
        raise HTTPException(status_code=500, detail=str(e))


# --- HITL Review Endpoints ---

@router.get("/pending-reviews", response_model=List[HITLTaskOut])
async def list_pending_reviews(
    user: CurrentUser = Depends(require_min_role(UserRole.AUDITOR)),
    db: AsyncSession = Depends(get_db_session),
    limit: int = Query(default=50, le=200),
):
    """List tasks awaiting human oversight (auditor+ role required)"""
    stmt = (
        select(HITLTask)
        .where(
            HITLTask.organisation_id == user.organisation_id,
            HITLTask.status == TaskStatus.PENDING_REVIEW,
        )
        .order_by(HITLTask.created_at.asc())
        .limit(limit)
    )
    result = await db.execute(stmt)
    tasks = result.scalars().all()

    return [
        HITLTaskOut(
            id=t.id,
            system_name=t.system_name,
            task_type=t.task_type,
            prompt=t.prompt,
            proposed_output=t.proposed_output,
            risk_level=t.risk_level.value if t.risk_level else "UNKNOWN",
            status=t.status.value if t.status else "UNKNOWN",
            created_at=t.created_at,
        )
        for t in tasks
    ]


@router.patch("/review/{task_id}")
async def review_task(
    task_id: str,
    review: ReviewRequest,
    user: CurrentUser = Depends(require_min_role(UserRole.AUDITOR)),
    db: AsyncSession = Depends(get_db_session),
):
    """Approve or reject a high-risk AI task (auditor+ role required).
    Rejection requires a justification comment for Annex IV audit trail.
    """
    stmt = select(HITLTask).where(
        HITLTask.id == task_id,
        HITLTask.organisation_id == user.organisation_id,
    )
    result = await db.execute(stmt)
    task = result.scalar_one_or_none()

    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    if task.status != TaskStatus.PENDING_REVIEW:
        raise HTTPException(status_code=400, detail="Task has already been reviewed")

    if not review.approved and not review.comments.strip():
        raise HTTPException(
            status_code=400,
            detail="Compliance Requirement: Rejections require a justification comment.",
        )

    now = utcnow()
    new_status = TaskStatus.PROCESSED if review.approved else TaskStatus.REJECTED
    task.status = new_status
    task.reviewed_by = user.id
    task.review_comments = review.comments
    task.reviewed_at = now

    # Audit log
    event_type = AuditEventType.HITL_APPROVED if review.approved else AuditEventType.HITL_REJECTED
    audit_log = AuditLog(
        request_id=str(uuid.uuid4()),
        event_type=event_type,
        system_id=task.system_id,
        user_id=user.id,
        organisation_id=user.organisation_id,
        risk_level=task.risk_level,
        governance_metadata={
            "hitl_task_id": task.id,
            "decision": "approved" if review.approved else "rejected",
            "reviewer_comments": review.comments,
        },
    )
    db.add(audit_log)
    await db.commit()

    response_data: Dict[str, Any] = {
        "task_id": task.id,
        "status": new_status.value,
        "message": f"Task {task.id} has been {'approved' if review.approved else 'rejected'}.",
    }

    # If approved, include the output that was withheld
    if review.approved:
        response_data["output"] = task.proposed_output

    return response_data


# --- Provenance Endpoint ---

@router.get("/provenance/{request_id}")
async def get_provenance_manifest(
    request_id: str,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Retrieve C2PA provenance manifest for a generation request"""
    stmt = select(ProvenanceManifest).where(
        ProvenanceManifest.request_id == request_id,
        ProvenanceManifest.organisation_id == user.organisation_id,
    )
    result = await db.execute(stmt)
    manifest = result.scalar_one_or_none()

    if not manifest:
        raise HTTPException(status_code=404, detail="Provenance manifest not found")

    return {
        "request_id": manifest.request_id,
        "content_hash": manifest.content_hash,
        "signing_status": manifest.signing_status,
        "signed_at": manifest.signed_at,
        "manifest_data": manifest.manifest_data,
        "created_at": manifest.created_at,
    }