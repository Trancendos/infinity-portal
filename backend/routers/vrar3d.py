# routers/vrar3d.py — VRAR3D / Savania — VR/AR Immersion Platform
# Virtual Reality, Augmented Reality, and 3D immersive experience platform.
# Manages VR/AR experiences, spatial anchors, immersive sessions, and device registry.
#
# Lane 2 (User/Infinity) — Immersive experience layer
# Kernel Event Bus integration for immersive events
#
# Note: Savania AI also serves as healer/defender in Wellbeing;
# this router covers the VR/AR infrastructure side.

import uuid
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List

from fastapi import APIRouter, HTTPException, Depends, Query, Path
from pydantic import BaseModel, Field

from auth import get_current_user, CurrentUser

router = APIRouter(prefix="/api/v1/vrar3d", tags=["VRAR3D — VR/AR Immersion"])
logger = logging.getLogger("vrar3d")


# ── Models ────────────────────────────────────────────────────────

class ExperienceCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=256)
    description: str = Field(default="", max_length=5000)
    experience_type: str = Field(default="vr", pattern="^(vr|ar|mr|xr|spatial_web)$")
    platform: str = Field(default="universal", pattern="^(universal|quest|vision_pro|hololens|webxr|custom)$")
    max_participants: int = Field(default=1, ge=1, le=10000)
    scene_url: str = Field(default="", max_length=1024)

class SpatialAnchorCreate(BaseModel):
    experience_id: str = Field(..., min_length=1)
    name: str = Field(..., min_length=1, max_length=256)
    anchor_type: str = Field(default="world", pattern="^(world|plane|image|face|body|geo)$")
    position: Dict[str, float] = Field(default_factory=lambda: {"x": 0.0, "y": 0.0, "z": 0.0})
    rotation: Dict[str, float] = Field(default_factory=lambda: {"x": 0.0, "y": 0.0, "z": 0.0})
    metadata: Dict[str, Any] = Field(default_factory=dict)

class SessionCreate(BaseModel):
    experience_id: str = Field(..., min_length=1)
    participant_count: int = Field(default=1, ge=1)
    device_type: str = Field(default="headset", pattern="^(headset|phone|tablet|glasses|desktop)$")


# ── State ────────────────────────────────────────────────────────

_experiences: Dict[str, Dict[str, Any]] = {}
_anchors: Dict[str, Dict[str, Any]] = {}
_sessions: Dict[str, Dict[str, Any]] = {}
_audit: List[Dict[str, Any]] = []


def _emit(action: str, detail: str, user_id: str):
    _audit.append({"id": str(uuid.uuid4()), "ts": datetime.now(timezone.utc).isoformat(),
                    "action": action, "detail": detail, "user_id": user_id})
    logger.info("vrar3d.%s | user=%s | %s", action, user_id, detail)


# ── Experiences ──────────────────────────────────────────────────

@router.get("/experiences")
async def list_experiences(
    experience_type: Optional[str] = Query(None), skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_user),
):
    items = list(_experiences.values())
    if experience_type:
        items = [e for e in items if e["experience_type"] == experience_type]
    total = len(items)
    return {"items": items[skip:skip+limit], "total": total, "skip": skip, "limit": limit}

@router.post("/experiences", status_code=201)
async def create_experience(body: ExperienceCreate, current_user: CurrentUser = Depends(get_current_user)):
    uid = getattr(current_user, "id", "anonymous")
    eid = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    rec = {"id": eid, **body.model_dump(), "status": "draft",
           "created_by": uid, "created_at": now}
    _experiences[eid] = rec
    _emit("experience_created", f"exp={eid} type={body.experience_type}", uid)
    return rec

@router.get("/experiences/{experience_id}")
async def get_experience(experience_id: str = Path(...), current_user: CurrentUser = Depends(get_current_user)):
    rec = _experiences.get(experience_id)
    if not rec:
        raise HTTPException(404, "Experience not found")
    return rec


# ── Spatial Anchors ──────────────────────────────────────────────

@router.get("/anchors")
async def list_anchors(
    experience_id: Optional[str] = Query(None), skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_user),
):
    items = list(_anchors.values())
    if experience_id:
        items = [a for a in items if a["experience_id"] == experience_id]
    total = len(items)
    return {"items": items[skip:skip+limit], "total": total, "skip": skip, "limit": limit}

@router.post("/anchors", status_code=201)
async def create_anchor(body: SpatialAnchorCreate, current_user: CurrentUser = Depends(get_current_user)):
    uid = getattr(current_user, "id", "anonymous")
    if body.experience_id not in _experiences:
        raise HTTPException(404, "Experience not found")
    aid = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    rec = {"id": aid, **body.model_dump(), "created_by": uid, "created_at": now}
    _anchors[aid] = rec
    _emit("anchor_created", f"anchor={aid} exp={body.experience_id}", uid)
    return rec

@router.get("/anchors/{anchor_id}")
async def get_anchor(anchor_id: str = Path(...), current_user: CurrentUser = Depends(get_current_user)):
    rec = _anchors.get(anchor_id)
    if not rec:
        raise HTTPException(404, "Anchor not found")
    return rec


# ── Sessions ─────────────────────────────────────────────────────

@router.get("/sessions")
async def list_sessions(
    experience_id: Optional[str] = Query(None), skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_user),
):
    items = list(_sessions.values())
    if experience_id:
        items = [s for s in items if s["experience_id"] == experience_id]
    total = len(items)
    return {"items": items[skip:skip+limit], "total": total, "skip": skip, "limit": limit}

@router.post("/sessions", status_code=201)
async def start_session(body: SessionCreate, current_user: CurrentUser = Depends(get_current_user)):
    uid = getattr(current_user, "id", "anonymous")
    if body.experience_id not in _experiences:
        raise HTTPException(404, "Experience not found")
    sid = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    rec = {"id": sid, **body.model_dump(), "status": "active",
           "started_by": uid, "started_at": now}
    _sessions[sid] = rec
    _emit("session_started", f"session={sid} exp={body.experience_id}", uid)
    return rec

@router.get("/sessions/{session_id}")
async def get_session(session_id: str = Path(...), current_user: CurrentUser = Depends(get_current_user)):
    rec = _sessions.get(session_id)
    if not rec:
        raise HTTPException(404, "Session not found")
    return rec


# ── Overview ─────────────────────────────────────────────────────

@router.get("/overview")
async def vrar3d_overview(current_user: CurrentUser = Depends(get_current_user)):
    return {
        "total_experiences": len(_experiences),
        "total_anchors": len(_anchors),
        "total_sessions": len(_sessions),
        "active_sessions": sum(1 for s in _sessions.values() if s.get("status") == "active"),
        "experiences_by_type": _count_by(_experiences, "experience_type"),
    }

def _count_by(store: Dict, field: str) -> Dict[str, int]:
    counts: Dict[str, int] = {}
    for item in store.values():
        val = item.get(field, "unknown")
        counts[val] = counts.get(val, 0) + 1
    return counts