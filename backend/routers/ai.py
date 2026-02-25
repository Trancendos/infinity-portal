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


import os as _os
import logging as _logging
import httpx as _httpx

_logger = _logging.getLogger("infinity-os.ai")

LLM_PROVIDERS = {
    "openai": {"base_url": "https://api.openai.com/v1", "env_key": "OPENAI_API_KEY", "default_model": "gpt-4o-mini", "models": ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"]},
    "groq": {"base_url": "https://api.groq.com/openai/v1", "env_key": "GROQ_API_KEY", "default_model": "llama-3.3-70b-versatile", "models": ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768"]},
    "anthropic": {"base_url": "https://api.anthropic.com/v1", "env_key": "ANTHROPIC_API_KEY", "default_model": "claude-3-5-sonnet-20241022", "models": ["claude-3-5-sonnet-20241022", "claude-3-haiku-20240307"]},
    "huggingface": {"base_url": "https://api-inference.huggingface.co/models", "env_key": "HF_API_KEY", "default_model": "mistralai/Mistral-7B-Instruct-v0.3", "models": ["mistralai/Mistral-7B-Instruct-v0.3"]},
    "local": {"base_url": _os.getenv("LOCAL_LLM_URL", "http://localhost:11434/v1"), "env_key": None, "default_model": "qwen2.5-coder:32b", "models": ["qwen2.5-coder:32b", "llama3.1:8b"]},
}
PREFERRED_PROVIDER = _os.getenv("LLM_PROVIDER", "").lower()

def _resolve_provider(model=None):
    if model:
        for pk, pc in LLM_PROVIDERS.items():
            if model in pc["models"]:
                ak = _os.getenv(pc["env_key"]) if pc["env_key"] else "local"
                if ak: return pk, pc, model, ak
    if PREFERRED_PROVIDER and PREFERRED_PROVIDER in LLM_PROVIDERS:
        pc = LLM_PROVIDERS[PREFERRED_PROVIDER]
        ak = _os.getenv(pc["env_key"]) if pc["env_key"] else "local"
        if ak: return PREFERRED_PROVIDER, pc, model or pc["default_model"], ak
    for pk in ["groq", "openai", "anthropic", "huggingface", "local"]:
        pc = LLM_PROVIDERS[pk]
        ak = _os.getenv(pc["env_key"]) if pc["env_key"] else ("local" if pk == "local" else None)
        if ak: return pk, pc, model or pc["default_model"], ak
    return "stub", {}, model or "stub-model", None

async def _call_llm(prompt: str, model: Optional[str] = None, parameters: Optional[Dict] = None) -> Dict[str, str]:
    """Multi-provider LLM call with automatic fallback."""
    pkey, pcfg, model_name, api_key = _resolve_provider(model)
    if pkey == "stub" or not api_key:
        return {"content": f"[Stub] Generated response for: {prompt[:200]}...", "model_used": model_name}
    try:
        if pkey == "anthropic":
            async with _httpx.AsyncClient(timeout=60) as client:
                resp = await client.post(f"{pcfg['base_url']}/messages", headers={"x-api-key": api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
                    json={"model": model_name, "max_tokens": (parameters or {}).get("max_tokens", 4096), "messages": [{"role": "user", "content": prompt}]})
                data = resp.json()
                return {"content": data.get("content", [{}])[0].get("text", ""), "model_used": model_name}
        elif pkey == "huggingface":
            async with _httpx.AsyncClient(timeout=60) as client:
                resp = await client.post(f"{pcfg['base_url']}/{model_name}", headers={"Authorization": f"Bearer {api_key}"},
                    json={"inputs": prompt, "parameters": {"max_new_tokens": (parameters or {}).get("max_tokens", 1024)}})
                data = resp.json()
                text = data[0].get("generated_text", "") if isinstance(data, list) else str(data)
                return {"content": text, "model_used": model_name}
        else:
            async with _httpx.AsyncClient(timeout=60) as client:
                resp = await client.post(f"{pcfg['base_url']}/chat/completions", headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                    json={"model": model_name, "messages": [{"role": "user", "content": prompt}], "max_tokens": (parameters or {}).get("max_tokens", 4096), "temperature": (parameters or {}).get("temperature", 0.7)})
                data = resp.json()
                return {"content": data.get("choices", [{}])[0].get("message", {}).get("content", ""), "model_used": model_name}
    except Exception as e:
        _logger.warning(f"LLM call failed ({pkey}/{model_name}): {e}")
        return {"content": f"[Fallback] Generated response for: {prompt[:200]}...", "model_used": f"{model_name} (fallback)"}


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
            llm_result = await _call_llm(request.prompt, request.model, request.parameters if hasattr(request, 'parameters') else None)

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
        llm_result = await _call_llm(request.prompt, request.model, request.parameters if hasattr(request, 'parameters') else None)

        governance_decision = {
            "allowed": True,
            "risk_level": "MINIMAL_RISK",
            "article_50_required": True,
            "reason": "Approved – minimal risk",
        }

        # Create provenance manifest with C2PA signing
        from c2pa_signing import sign_content, is_available as c2pa_available

        c2pa_result = sign_content(
            content=llm_result["content"],
            request_id=request_id,
            model_used=llm_result["model_used"],
            prompt=request.prompt,
            system_id=request.system_id,
            organisation_id=user.organisation_id,
            user_id=user.id,
            task_type=request.task_type,
            risk_level=system_record.risk_level.value if system_record else "MINIMAL_RISK",
        )

        provenance = ProvenanceManifest(
            request_id=request_id,
            system_id=request.system_id,
            user_id=user.id,
            organisation_id=user.organisation_id,
            content_hash=c2pa_result["content_hash"],
            manifest_data={
                "model": llm_result["model_used"],
                "timestamp": now.isoformat(),
                "prompt_hash": c2pa_result["prompt_hash"],
                "c2pa_assertions": c2pa_result["manifest_data"].get("assertions", []),
                "c2pa_available": c2pa_available(),
            },
            signing_status=c2pa_result["signing_status"],
            signed_at=now if c2pa_result["signing_status"] == "SIGNED" else None,
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


@router.get("/providers")
async def list_providers(user: CurrentUser = Depends(get_current_user)):
    """List available LLM providers and their status."""
    providers = []
    for pkey, pcfg in LLM_PROVIDERS.items():
        api_key = _os.getenv(pcfg.get("env_key", "")) if pcfg.get("env_key") else ("local" if pkey == "local" else None)
        providers.append({"id": pkey, "name": pkey.title(), "available": bool(api_key), "models": pcfg.get("models", []), "default_model": pcfg.get("default_model")})
    active_key, _, active_model, _ = _resolve_provider()
    return {"providers": providers, "active_provider": active_key, "active_model": active_model}
