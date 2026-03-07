# routers/tateking.py — TateKing / Benji & Sam — Cinematic Production
# Cinematic and video production module within The Studio.
# Manages productions, storyboards, shots, and post-production workflows.
#
# Lane 2 (User/Infinity) — Cinematic layer
# Kernel Event Bus integration for production events

import uuid
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List

from fastapi import APIRouter, HTTPException, Depends, Query, Path
from pydantic import BaseModel, Field

from auth import get_current_user, CurrentUser

router = APIRouter(prefix="/api/v1/tateking", tags=["TateKing — Cinematic"])
logger = logging.getLogger("tateking")


# ── Models ────────────────────────────────────────────────────────

class ProductionCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=256)
    description: str = Field(default="", max_length=5000)
    genre: str = Field(default="narrative", pattern="^(narrative|documentary|commercial|music_video|animation|experimental)$")
    format: str = Field(default="4k", pattern="^(hd|4k|8k|imax|vr360)$")
    duration_seconds: int = Field(default=0, ge=0)

class StoryboardCreate(BaseModel):
    production_id: str = Field(..., min_length=1)
    title: str = Field(..., min_length=1, max_length=256)
    panels: int = Field(default=1, ge=1, le=500)
    notes: str = Field(default="", max_length=3000)

class ShotCreate(BaseModel):
    production_id: str = Field(..., min_length=1)
    shot_number: int = Field(..., ge=1)
    shot_type: str = Field(default="wide", pattern="^(wide|medium|close_up|extreme_close|aerial|tracking|pov)$")
    description: str = Field(default="", max_length=2000)
    duration_seconds: float = Field(default=5.0, ge=0.1, le=3600)
    camera_settings: Dict[str, Any] = Field(default_factory=dict)


# ── State ────────────────────────────────────────────────────────

_productions: Dict[str, Dict[str, Any]] = {}
_storyboards: Dict[str, Dict[str, Any]] = {}
_shots: Dict[str, Dict[str, Any]] = {}
_audit: List[Dict[str, Any]] = []


def _emit(action: str, detail: str, user_id: str):
    _audit.append({"id": str(uuid.uuid4()), "ts": datetime.now(timezone.utc).isoformat(),
                    "action": action, "detail": detail, "user_id": user_id})
    logger.info("tateking.%s | user=%s | %s", action, user_id, detail)


# ── Productions ──────────────────────────────────────────────────

@router.get("/productions")
async def list_productions(
    genre: Optional[str] = Query(None), skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_user),
):
    items = list(_productions.values())
    if genre:
        items = [p for p in items if p["genre"] == genre]
    total = len(items)
    return {"items": items[skip:skip+limit], "total": total, "skip": skip, "limit": limit}

@router.post("/productions", status_code=201)
async def create_production(body: ProductionCreate, current_user: CurrentUser = Depends(get_current_user)):
    uid = getattr(current_user, "id", "anonymous")
    pid = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    rec = {"id": pid, **body.model_dump(), "status": "pre_production",
           "created_by": uid, "created_at": now}
    _productions[pid] = rec
    _emit("production_created", f"production={pid} genre={body.genre}", uid)
    return rec

@router.get("/productions/{production_id}")
async def get_production(production_id: str = Path(...), current_user: CurrentUser = Depends(get_current_user)):
    rec = _productions.get(production_id)
    if not rec:
        raise HTTPException(404, "Production not found")
    return rec


# ── Storyboards ──────────────────────────────────────────────────

@router.get("/storyboards")
async def list_storyboards(
    production_id: Optional[str] = Query(None), skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_user),
):
    items = list(_storyboards.values())
    if production_id:
        items = [s for s in items if s["production_id"] == production_id]
    total = len(items)
    return {"items": items[skip:skip+limit], "total": total, "skip": skip, "limit": limit}

@router.post("/storyboards", status_code=201)
async def create_storyboard(body: StoryboardCreate, current_user: CurrentUser = Depends(get_current_user)):
    uid = getattr(current_user, "id", "anonymous")
    if body.production_id not in _productions:
        raise HTTPException(404, "Production not found")
    sid = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    rec = {"id": sid, **body.model_dump(), "status": "draft", "created_by": uid, "created_at": now}
    _storyboards[sid] = rec
    _emit("storyboard_created", f"storyboard={sid} production={body.production_id}", uid)
    return rec

@router.get("/storyboards/{storyboard_id}")
async def get_storyboard(storyboard_id: str = Path(...), current_user: CurrentUser = Depends(get_current_user)):
    rec = _storyboards.get(storyboard_id)
    if not rec:
        raise HTTPException(404, "Storyboard not found")
    return rec


# ── Shots ────────────────────────────────────────────────────────

@router.get("/shots")
async def list_shots(
    production_id: Optional[str] = Query(None), skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_user),
):
    items = list(_shots.values())
    if production_id:
        items = [s for s in items if s["production_id"] == production_id]
    total = len(items)
    return {"items": items[skip:skip+limit], "total": total, "skip": skip, "limit": limit}

@router.post("/shots", status_code=201)
async def create_shot(body: ShotCreate, current_user: CurrentUser = Depends(get_current_user)):
    uid = getattr(current_user, "id", "anonymous")
    if body.production_id not in _productions:
        raise HTTPException(404, "Production not found")
    shid = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    rec = {"id": shid, **body.model_dump(), "status": "planned", "created_by": uid, "created_at": now}
    _shots[shid] = rec
    _emit("shot_created", f"shot={shid} production={body.production_id}", uid)
    return rec

@router.get("/shots/{shot_id}")
async def get_shot(shot_id: str = Path(...), current_user: CurrentUser = Depends(get_current_user)):
    rec = _shots.get(shot_id)
    if not rec:
        raise HTTPException(404, "Shot not found")
    return rec


# ── Overview ─────────────────────────────────────────────────────

@router.get("/overview")
async def tateking_overview(current_user: CurrentUser = Depends(get_current_user)):
    return {
        "total_productions": len(_productions),
        "total_storyboards": len(_storyboards),
        "total_shots": len(_shots),
        "productions_by_genre": _count_by(_productions, "genre"),
    }

def _count_by(store: Dict, field: str) -> Dict[str, int]:
    counts: Dict[str, int] = {}
    for item in store.values():
        val = item.get(field, "unknown")
        counts[val] = counts.get(val, 0) + 1
    return counts