# routers/style_and_shoot.py — Style&Shoot / Madam Krystal — 2D UI/UX Design
# Visual design module within The Studio.
# Manages design systems, UI components, style guides, and visual assets.
#
# Lane 2 (User/Infinity) — Design layer
# Kernel Event Bus integration for design events

import uuid
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List

from fastapi import APIRouter, HTTPException, Depends, Query, Path
from pydantic import BaseModel, Field

from auth import get_current_user, CurrentUser

router = APIRouter(prefix="/api/v1/style-and-shoot", tags=["Style&Shoot — 2D UI/UX"])
logger = logging.getLogger("style_and_shoot")


# ── Models ────────────────────────────────────────────────────────

class DesignSystemCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=256)
    description: str = Field(default="", max_length=3000)
    brand: str = Field(default="trancendos", max_length=128)
    tokens: Dict[str, Any] = Field(default_factory=dict, description="Design tokens: colors, spacing, typography")

class ComponentCreate(BaseModel):
    design_system_id: str = Field(..., min_length=1)
    name: str = Field(..., min_length=1, max_length=256)
    component_type: str = Field(default="atom", pattern="^(atom|molecule|organism|template|page)$")
    variant: str = Field(default="default", max_length=64)
    props: Dict[str, Any] = Field(default_factory=dict)

class StyleGuideCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=256)
    target_app: str = Field(default="", max_length=128)
    palette: List[str] = Field(default_factory=list)
    typography: Dict[str, Any] = Field(default_factory=dict)
    guidelines: str = Field(default="", max_length=5000)


# ── State ────────────────────────────────────────────────────────

_design_systems: Dict[str, Dict[str, Any]] = {}
_components: Dict[str, Dict[str, Any]] = {}
_style_guides: Dict[str, Dict[str, Any]] = {}
_audit: List[Dict[str, Any]] = []


def _emit(action: str, detail: str, user_id: str):
    _audit.append({"id": str(uuid.uuid4()), "ts": datetime.now(timezone.utc).isoformat(),
                    "action": action, "detail": detail, "user_id": user_id})
    logger.info("style_and_shoot.%s | user=%s | %s", action, user_id, detail)


# ── Design Systems ───────────────────────────────────────────────

@router.get("/design-systems")
async def list_design_systems(
    skip: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_user),
):
    items = list(_design_systems.values())
    total = len(items)
    return {"items": items[skip:skip+limit], "total": total, "skip": skip, "limit": limit}

@router.post("/design-systems", status_code=201)
async def create_design_system(body: DesignSystemCreate, current_user: CurrentUser = Depends(get_current_user)):
    uid = getattr(current_user, "id", "anonymous")
    dsid = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    rec = {"id": dsid, **body.model_dump(), "version": "1.0.0", "created_by": uid, "created_at": now}
    _design_systems[dsid] = rec
    _emit("design_system_created", f"ds={dsid}", uid)
    return rec

@router.get("/design-systems/{ds_id}")
async def get_design_system(ds_id: str = Path(...), current_user: CurrentUser = Depends(get_current_user)):
    rec = _design_systems.get(ds_id)
    if not rec:
        raise HTTPException(404, "Design system not found")
    return rec


# ── Components ───────────────────────────────────────────────────

@router.get("/components")
async def list_components(
    design_system_id: Optional[str] = Query(None), skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_user),
):
    items = list(_components.values())
    if design_system_id:
        items = [c for c in items if c["design_system_id"] == design_system_id]
    total = len(items)
    return {"items": items[skip:skip+limit], "total": total, "skip": skip, "limit": limit}

@router.post("/components", status_code=201)
async def create_component(body: ComponentCreate, current_user: CurrentUser = Depends(get_current_user)):
    uid = getattr(current_user, "id", "anonymous")
    if body.design_system_id not in _design_systems:
        raise HTTPException(404, "Design system not found")
    cid = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    rec = {"id": cid, **body.model_dump(), "created_by": uid, "created_at": now}
    _components[cid] = rec
    _emit("component_created", f"component={cid} ds={body.design_system_id}", uid)
    return rec

@router.get("/components/{component_id}")
async def get_component(component_id: str = Path(...), current_user: CurrentUser = Depends(get_current_user)):
    rec = _components.get(component_id)
    if not rec:
        raise HTTPException(404, "Component not found")
    return rec


# ── Style Guides ─────────────────────────────────────────────────

@router.get("/style-guides")
async def list_style_guides(
    skip: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_user),
):
    items = list(_style_guides.values())
    total = len(items)
    return {"items": items[skip:skip+limit], "total": total, "skip": skip, "limit": limit}

@router.post("/style-guides", status_code=201)
async def create_style_guide(body: StyleGuideCreate, current_user: CurrentUser = Depends(get_current_user)):
    uid = getattr(current_user, "id", "anonymous")
    sgid = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    rec = {"id": sgid, **body.model_dump(), "created_by": uid, "created_at": now}
    _style_guides[sgid] = rec
    _emit("style_guide_created", f"guide={sgid}", uid)
    return rec

@router.get("/style-guides/{guide_id}")
async def get_style_guide(guide_id: str = Path(...), current_user: CurrentUser = Depends(get_current_user)):
    rec = _style_guides.get(guide_id)
    if not rec:
        raise HTTPException(404, "Style guide not found")
    return rec


# ── Overview ─────────────────────────────────────────────────────

@router.get("/overview")
async def style_and_shoot_overview(current_user: CurrentUser = Depends(get_current_user)):
    return {
        "total_design_systems": len(_design_systems),
        "total_components": len(_components),
        "total_style_guides": len(_style_guides),
    }