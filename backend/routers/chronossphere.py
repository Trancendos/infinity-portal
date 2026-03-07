# routers/chronossphere.py — ChronosSphere / Chronos — Time Management
# Standalone scheduling and temporal logic for the Trancendos Ecosystem.
# Manages schedules, temporal events, deadlines, and time-based automation.
#
# Lane 1 (AI/Nexus) — Temporal coordination layer
# ISO 27001: A.8.16 — Monitoring activities

import uuid
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from auth import get_current_user, CurrentUser

router = APIRouter(prefix="/api/v1/chronossphere", tags=["ChronosSphere — Time Management"])
logger = logging.getLogger("chronossphere")


# ── Models ────────────────────────────────────────────────────

class ScheduleEntry(BaseModel):
    title: str = Field(..., min_length=1, max_length=256)
    description: str = Field(default="", max_length=2000)
    scheduled_at: str = Field(..., description="ISO datetime for the scheduled event")
    duration_minutes: int = Field(default=30, ge=1, le=10080)
    recurrence: str = Field(default="none", pattern="^(none|daily|weekly|monthly|quarterly|yearly)$")
    owner: str = Field(default="", max_length=128)
    participants: List[str] = Field(default_factory=list)
    priority: str = Field(default="normal", pattern="^(low|normal|high|critical)$")
    metadata: Dict[str, Any] = Field(default_factory=dict)


class Deadline(BaseModel):
    title: str = Field(..., min_length=1, max_length=256)
    due_at: str = Field(..., description="ISO datetime deadline")
    owner: str = Field(default="", max_length=128)
    linked_entity: Optional[str] = Field(default=None, max_length=256)
    severity: str = Field(default="normal", pattern="^(low|normal|high|critical)$")


class TemporalRule(BaseModel):
    name: str = Field(..., min_length=1, max_length=256)
    trigger_type: str = Field(default="cron", pattern="^(cron|interval|event|deadline)$")
    trigger_value: str = Field(..., min_length=1, max_length=256)
    action: str = Field(..., min_length=1, max_length=256)
    target: Optional[str] = Field(default=None, max_length=256)
    enabled: bool = Field(default=True)


# ── In-Memory State ──────────────────────────────────────────

_schedules: Dict[str, Dict[str, Any]] = {}
_deadlines: Dict[str, Dict[str, Any]] = {}
_temporal_rules: Dict[str, Dict[str, Any]] = {}
_timeline: List[Dict[str, Any]] = []


def _emit_chrono_event(action: str, detail: Dict[str, Any], user_id: str = "system"):
    logger.info(f"[CHRONOSSPHERE-EVENT] user={user_id} action={action} detail={detail}")


# ── Schedules ────────────────────────────────────────────────

@router.get("/schedules", summary="List schedules")
async def list_schedules(
    owner: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_user),
):
    items = list(_schedules.values())
    if owner:
        items = [s for s in items if s.get("owner") == owner]
    if priority:
        items = [s for s in items if s.get("priority") == priority]
    total = len(items)
    return {"items": items[skip: skip + limit], "total": total, "skip": skip, "limit": limit}


@router.post("/schedules", summary="Create a schedule entry", status_code=201)
async def create_schedule(body: ScheduleEntry, current_user: CurrentUser = Depends(get_current_user)):
    user_id = getattr(current_user, "id", "anonymous")
    sid = f"sched-{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()
    record = {"id": sid, **body.model_dump(), "status": "scheduled", "created_at": now, "created_by": user_id}
    _schedules[sid] = record
    _timeline.append({"type": "schedule", "id": sid, "at": body.scheduled_at, "title": body.title})
    _emit_chrono_event("create_schedule", {"id": sid, "title": body.title}, user_id)
    return record


@router.get("/schedules/{schedule_id}", summary="Get schedule details")
async def get_schedule(schedule_id: str, current_user: CurrentUser = Depends(get_current_user)):
    s = _schedules.get(schedule_id)
    if not s:
        raise HTTPException(status_code=404, detail=f"Schedule '{schedule_id}' not found")
    return s


@router.delete("/schedules/{schedule_id}", summary="Cancel a schedule")
async def cancel_schedule(schedule_id: str, current_user: CurrentUser = Depends(get_current_user)):
    user_id = getattr(current_user, "id", "anonymous")
    s = _schedules.get(schedule_id)
    if not s:
        raise HTTPException(status_code=404, detail=f"Schedule '{schedule_id}' not found")
    s["status"] = "cancelled"
    _emit_chrono_event("cancel_schedule", {"id": schedule_id}, user_id)
    return {"status": "cancelled", "id": schedule_id}


# ── Deadlines ────────────────────────────────────────────────

@router.get("/deadlines", summary="List deadlines")
async def list_deadlines(
    severity: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_user),
):
    items = list(_deadlines.values())
    if severity:
        items = [d for d in items if d.get("severity") == severity]
    total = len(items)
    return {"items": items[skip: skip + limit], "total": total, "skip": skip, "limit": limit}


@router.post("/deadlines", summary="Set a deadline", status_code=201)
async def set_deadline(body: Deadline, current_user: CurrentUser = Depends(get_current_user)):
    user_id = getattr(current_user, "id", "anonymous")
    did = f"dl-{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()
    record = {"id": did, **body.model_dump(), "status": "active", "created_at": now, "created_by": user_id}
    _deadlines[did] = record
    _timeline.append({"type": "deadline", "id": did, "at": body.due_at, "title": body.title})
    _emit_chrono_event("set_deadline", {"id": did, "title": body.title, "due": body.due_at}, user_id)
    return record


@router.get("/deadlines/{deadline_id}", summary="Get deadline details")
async def get_deadline(deadline_id: str, current_user: CurrentUser = Depends(get_current_user)):
    d = _deadlines.get(deadline_id)
    if not d:
        raise HTTPException(status_code=404, detail=f"Deadline '{deadline_id}' not found")
    return d


# ── Temporal Rules ───────────────────────────────────────────

@router.get("/rules", summary="List temporal rules")
async def list_rules(
    enabled: Optional[bool] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_user),
):
    items = list(_temporal_rules.values())
    if enabled is not None:
        items = [r for r in items if r.get("enabled") == enabled]
    total = len(items)
    return {"items": items[skip: skip + limit], "total": total, "skip": skip, "limit": limit}


@router.post("/rules", summary="Create a temporal rule", status_code=201)
async def create_rule(body: TemporalRule, current_user: CurrentUser = Depends(get_current_user)):
    user_id = getattr(current_user, "id", "anonymous")
    rid = f"rule-{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()
    record = {"id": rid, **body.model_dump(), "created_at": now, "created_by": user_id}
    _temporal_rules[rid] = record
    _emit_chrono_event("create_rule", {"id": rid, "name": body.name}, user_id)
    return record


@router.get("/rules/{rule_id}", summary="Get rule details")
async def get_rule(rule_id: str, current_user: CurrentUser = Depends(get_current_user)):
    r = _temporal_rules.get(rule_id)
    if not r:
        raise HTTPException(status_code=404, detail=f"Rule '{rule_id}' not found")
    return r


# ── Timeline ─────────────────────────────────────────────────

@router.get("/timeline", summary="Get unified timeline")
async def get_timeline(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    current_user: CurrentUser = Depends(get_current_user),
):
    total = len(_timeline)
    return {"items": _timeline[skip: skip + limit], "total": total, "skip": skip, "limit": limit}


# ── Overview ─────────────────────────────────────────────────

@router.get("/overview", summary="ChronosSphere overview")
async def chronos_overview(current_user: CurrentUser = Depends(get_current_user)):
    return {
        "total_schedules": len(_schedules),
        "total_deadlines": len(_deadlines),
        "total_rules": len(_temporal_rules),
        "timeline_entries": len(_timeline),
        "active_schedules": sum(1 for s in _schedules.values() if s.get("status") == "scheduled"),
        "active_deadlines": sum(1 for d in _deadlines.values() if d.get("status") == "active"),
        "enabled_rules": sum(1 for r in _temporal_rules.values() if r.get("enabled")),
    }