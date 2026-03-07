# routers/studio.py — The Studio / Voxx — Creative Hub Orchestrator
# Pillar HQ for all creative operations across the Trancendos Ecosystem.
# Manages creative projects, briefs, asset pipelines, and cross-studio coordination.
#
# Lane 2 (User/Infinity) — Creative workspace layer
# Kernel Event Bus integration for creative workflow events
#
# ISO 27001: A.8.1 — Asset management

import uuid
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from enum import Enum

from fastapi import APIRouter, HTTPException, Depends, Query, Path
from pydantic import BaseModel, Field

from auth import get_current_user, CurrentUser

router = APIRouter(prefix="/api/v1/studio", tags=["The Studio — Creative Hub"])
logger = logging.getLogger("studio")


# ── Enums ────────────────────────────────────────────────────────

class ProjectStatus(str, Enum):
    briefing = "briefing"
    in_progress = "in_progress"
    review = "review"
    approved = "approved"
    published = "published"
    archived = "archived"

class BriefPriority(str, Enum):
    low = "low"
    normal = "normal"
    high = "high"
    urgent = "urgent"


# ── Models ────────────────────────────────────────────────────────

class CreativeProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=256)
    description: str = Field(default="", max_length=5000)
    studio_modules: List[str] = Field(default_factory=list, description="e.g. section7, style_and_shoot, tranceflow")
    lead_ai: str = Field(default="voxx", max_length=128)
    tags: List[str] = Field(default_factory=list)

class CreativeBriefCreate(BaseModel):
    project_id: str = Field(..., min_length=1)
    title: str = Field(..., min_length=1, max_length=256)
    requirements: str = Field(default="", max_length=5000)
    priority: BriefPriority = BriefPriority.normal
    deliverables: List[str] = Field(default_factory=list)
    deadline: Optional[str] = Field(default=None)

class AssetCreate(BaseModel):
    project_id: str = Field(..., min_length=1)
    name: str = Field(..., min_length=1, max_length=256)
    asset_type: str = Field(default="image", max_length=64)
    source_module: str = Field(default="studio", max_length=64)
    url: str = Field(default="", max_length=1024)
    metadata: Dict[str, Any] = Field(default_factory=dict)


# ── In-Memory State ──────────────────────────────────────────────

_projects: Dict[str, Dict[str, Any]] = {}
_briefs: Dict[str, Dict[str, Any]] = {}
_assets: Dict[str, Dict[str, Any]] = {}
_audit: List[Dict[str, Any]] = []


def _emit(action: str, detail: str, user_id: str):
    _audit.append({"id": str(uuid.uuid4()), "ts": datetime.now(timezone.utc).isoformat(),
                    "action": action, "detail": detail, "user_id": user_id})
    logger.info("studio.%s | user=%s | %s", action, user_id, detail)


# ── Projects ─────────────────────────────────────────────────────

@router.get("/projects")
async def list_projects(
    status: Optional[str] = Query(None), skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_user),
):
    items = list(_projects.values())
    if status:
        items = [p for p in items if p["status"] == status]
    total = len(items)
    return {"items": items[skip:skip+limit], "total": total, "skip": skip, "limit": limit}

@router.post("/projects", status_code=201)
async def create_project(body: CreativeProjectCreate, current_user: CurrentUser = Depends(get_current_user)):
    uid = getattr(current_user, "id", "anonymous")
    pid = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    rec = {"id": pid, **body.model_dump(), "status": ProjectStatus.briefing.value,
           "created_by": uid, "created_at": now, "updated_at": now}
    _projects[pid] = rec
    _emit("project_created", f"project={pid}", uid)
    return rec

@router.get("/projects/{project_id}")
async def get_project(project_id: str = Path(...), current_user: CurrentUser = Depends(get_current_user)):
    rec = _projects.get(project_id)
    if not rec:
        raise HTTPException(404, "Project not found")
    return rec


# ── Briefs ───────────────────────────────────────────────────────

@router.get("/briefs")
async def list_briefs(
    project_id: Optional[str] = Query(None), skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_user),
):
    items = list(_briefs.values())
    if project_id:
        items = [b for b in items if b["project_id"] == project_id]
    total = len(items)
    return {"items": items[skip:skip+limit], "total": total, "skip": skip, "limit": limit}

@router.post("/briefs", status_code=201)
async def create_brief(body: CreativeBriefCreate, current_user: CurrentUser = Depends(get_current_user)):
    uid = getattr(current_user, "id", "anonymous")
    if body.project_id not in _projects:
        raise HTTPException(404, "Project not found")
    bid = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    rec = {"id": bid, **body.model_dump(), "status": "open", "created_by": uid, "created_at": now}
    _briefs[bid] = rec
    _emit("brief_created", f"brief={bid} project={body.project_id}", uid)
    return rec

@router.get("/briefs/{brief_id}")
async def get_brief(brief_id: str = Path(...), current_user: CurrentUser = Depends(get_current_user)):
    rec = _briefs.get(brief_id)
    if not rec:
        raise HTTPException(404, "Brief not found")
    return rec


# ── Assets ───────────────────────────────────────────────────────

@router.get("/assets")
async def list_assets(
    project_id: Optional[str] = Query(None), skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_user),
):
    items = list(_assets.values())
    if project_id:
        items = [a for a in items if a["project_id"] == project_id]
    total = len(items)
    return {"items": items[skip:skip+limit], "total": total, "skip": skip, "limit": limit}

@router.post("/assets", status_code=201)
async def upload_asset(body: AssetCreate, current_user: CurrentUser = Depends(get_current_user)):
    uid = getattr(current_user, "id", "anonymous")
    if body.project_id not in _projects:
        raise HTTPException(404, "Project not found")
    aid = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    rec = {"id": aid, **body.model_dump(), "uploaded_by": uid, "uploaded_at": now}
    _assets[aid] = rec
    _emit("asset_uploaded", f"asset={aid} project={body.project_id}", uid)
    return rec

@router.get("/assets/{asset_id}")
async def get_asset(asset_id: str = Path(...), current_user: CurrentUser = Depends(get_current_user)):
    rec = _assets.get(asset_id)
    if not rec:
        raise HTTPException(404, "Asset not found")
    return rec


# ── Overview ─────────────────────────────────────────────────────

@router.get("/overview")
async def studio_overview(current_user: CurrentUser = Depends(get_current_user)):
    return {
        "total_projects": len(_projects),
        "total_briefs": len(_briefs),
        "total_assets": len(_assets),
        "projects_by_status": _count_by(_projects, "status"),
        "audit_entries": len(_audit),
    }

def _count_by(store: Dict, field: str) -> Dict[str, int]:
    counts: Dict[str, int] = {}
    for item in store.values():
        val = item.get(field, "unknown")
        counts[val] = counts.get(val, 0) + 1
    return counts