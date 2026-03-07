# routers/citadel.py — The Citadel / Trancendos — Strategic Ops Fortress
# The main fortress housing the Think Tank and ChronosSphere.
# Strategic operations, R&D oversight, and ecosystem-wide directives.
#
# Lane 1 (AI/Nexus) — Strategic command layer
# Kernel Event Bus integration for directive propagation
#
# ISO 27001: A.5.1 — Information security policies

import uuid
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List

from fastapi import APIRouter, HTTPException, Depends, Query, Path
from pydantic import BaseModel, Field

from auth import get_current_user, CurrentUser

router = APIRouter(prefix="/api/v1/citadel", tags=["The Citadel — Strategic Ops"])
logger = logging.getLogger("citadel")


# ── Models ────────────────────────────────────────────────────

class Directive(BaseModel):
    title: str = Field(..., min_length=1, max_length=256)
    description: str = Field(default="", max_length=5000)
    priority: str = Field(default="normal", pattern="^(low|normal|high|critical|sovereign)$")
    scope: str = Field(default="ecosystem", pattern="^(ecosystem|group|application|agent)$")
    target: Optional[str] = Field(default=None, max_length=256, description="Target group/app/agent")
    issued_by: str = Field(default="trancendos", max_length=128)
    expires_at: Optional[str] = Field(default=None, description="ISO datetime expiry")
    metadata: Dict[str, Any] = Field(default_factory=dict)


class StrategicInitiative(BaseModel):
    name: str = Field(..., min_length=1, max_length=256)
    description: str = Field(default="", max_length=5000)
    status: str = Field(default="proposed", pattern="^(proposed|approved|active|paused|completed|archived)$")
    owner: str = Field(default="trancendos", max_length=128)
    pillars_involved: List[str] = Field(default_factory=list)
    timeline_weeks: int = Field(default=4, ge=1, le=520)
    budget_allocation: float = Field(default=0.0, ge=0.0)
    success_criteria: List[str] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class FortressStatus(BaseModel):
    security_level: str = Field(default="green", pattern="^(green|amber|red|black)$")
    reason: str = Field(default="", max_length=1000)


# ── In-Memory State ──────────────────────────────────────────

_directives: Dict[str, Dict[str, Any]] = {}
_initiatives: Dict[str, Dict[str, Any]] = {}
_fortress_status = {"security_level": "green", "reason": "All systems nominal", "updated_at": datetime.now(timezone.utc).isoformat()}
_audit_log: List[Dict[str, Any]] = []


def _emit_citadel_event(action: str, detail: Dict[str, Any], user_id: str = "system"):
    logger.info(f"[CITADEL-EVENT] user={user_id} action={action} detail={detail}")


# ── Directives ───────────────────────────────────────────────

@router.get("/directives", summary="List all directives")
async def list_directives(
    priority: Optional[str] = Query(None),
    scope: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_user),
):
    user_id = getattr(current_user, "id", "anonymous")
    items = list(_directives.values())
    if priority:
        items = [d for d in items if d.get("priority") == priority]
    if scope:
        items = [d for d in items if d.get("scope") == scope]
    total = len(items)
    items = items[skip: skip + limit]
    _emit_citadel_event("list_directives", {"total": total}, user_id)
    return {"items": items, "total": total, "skip": skip, "limit": limit}


@router.post("/directives", summary="Issue a directive", status_code=201)
async def issue_directive(
    body: Directive,
    current_user: CurrentUser = Depends(get_current_user),
):
    user_id = getattr(current_user, "id", "anonymous")
    did = f"dir-{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()
    record = {
        "id": did,
        **body.model_dump(),
        "status": "active",
        "created_at": now,
        "updated_at": now,
        "created_by": user_id,
    }
    _directives[did] = record
    _audit_log.append({"action": "issue_directive", "id": did, "user": user_id, "timestamp": now})
    _emit_citadel_event("issue_directive", {"id": did, "title": body.title, "priority": body.priority}, user_id)
    return record


@router.get("/directives/{directive_id}", summary="Get directive details")
async def get_directive(directive_id: str, current_user: CurrentUser = Depends(get_current_user)):
    d = _directives.get(directive_id)
    if not d:
        raise HTTPException(status_code=404, detail=f"Directive '{directive_id}' not found")
    return d


@router.delete("/directives/{directive_id}", summary="Revoke a directive")
async def revoke_directive(directive_id: str, current_user: CurrentUser = Depends(get_current_user)):
    user_id = getattr(current_user, "id", "anonymous")
    d = _directives.get(directive_id)
    if not d:
        raise HTTPException(status_code=404, detail=f"Directive '{directive_id}' not found")
    d["status"] = "revoked"
    d["updated_at"] = datetime.now(timezone.utc).isoformat()
    _emit_citadel_event("revoke_directive", {"id": directive_id}, user_id)
    return {"status": "revoked", "id": directive_id}


# ── Strategic Initiatives ────────────────────────────────────

@router.get("/initiatives", summary="List strategic initiatives")
async def list_initiatives(
    status: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_user),
):
    items = list(_initiatives.values())
    if status:
        items = [i for i in items if i.get("status") == status]
    total = len(items)
    return {"items": items[skip: skip + limit], "total": total, "skip": skip, "limit": limit}


@router.post("/initiatives", summary="Create a strategic initiative", status_code=201)
async def create_initiative(
    body: StrategicInitiative,
    current_user: CurrentUser = Depends(get_current_user),
):
    user_id = getattr(current_user, "id", "anonymous")
    iid = f"init-{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()
    record = {"id": iid, **body.model_dump(), "created_at": now, "updated_at": now, "created_by": user_id}
    _initiatives[iid] = record
    _emit_citadel_event("create_initiative", {"id": iid, "name": body.name}, user_id)
    return record


@router.get("/initiatives/{initiative_id}", summary="Get initiative details")
async def get_initiative(initiative_id: str, current_user: CurrentUser = Depends(get_current_user)):
    i = _initiatives.get(initiative_id)
    if not i:
        raise HTTPException(status_code=404, detail=f"Initiative '{initiative_id}' not found")
    return i


# ── Fortress Status ──────────────────────────────────────────

@router.get("/fortress-status", summary="Get fortress security status")
async def get_fortress_status(current_user: CurrentUser = Depends(get_current_user)):
    return _fortress_status


@router.put("/fortress-status", summary="Update fortress security level")
async def update_fortress_status(
    body: FortressStatus,
    current_user: CurrentUser = Depends(get_current_user),
):
    user_id = getattr(current_user, "id", "anonymous")
    _fortress_status["security_level"] = body.security_level
    _fortress_status["reason"] = body.reason
    _fortress_status["updated_at"] = datetime.now(timezone.utc).isoformat()
    _emit_citadel_event("update_fortress_status", {"level": body.security_level}, user_id)
    return _fortress_status


# ── Audit Log ────────────────────────────────────────────────

@router.get("/audit-log", summary="Get Citadel audit log")
async def get_audit_log(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_user),
):
    total = len(_audit_log)
    return {"items": _audit_log[skip: skip + limit], "total": total, "skip": skip, "limit": limit}