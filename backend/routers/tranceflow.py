# routers/tranceflow.py — TranceFlow / Junior Cesar — 3D Spatial Design
# 3D spatial design and immersive content creation module within The Studio.
# Manages 3D scenes, spatial layouts, material libraries, and render jobs.
#
# Lane 2 (User/Infinity) — Spatial design layer
# Kernel Event Bus integration for 3D workflow events

import uuid
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List

from fastapi import APIRouter, HTTPException, Depends, Query, Path
from pydantic import BaseModel, Field

from auth import get_current_user, CurrentUser

router = APIRouter(prefix="/api/v1/tranceflow", tags=["TranceFlow — 3D Spatial"])
logger = logging.getLogger("tranceflow")


# ── Models ────────────────────────────────────────────────────────

class SceneCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=256)
    description: str = Field(default="", max_length=3000)
    scene_type: str = Field(default="environment", pattern="^(environment|character|prop|ui_overlay|full_experience)$")
    dimensions: Dict[str, Any] = Field(default_factory=lambda: {"width": 100, "height": 100, "depth": 100})
    lighting: str = Field(default="natural", pattern="^(natural|studio|dramatic|neon|custom)$")

class MaterialCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=256)
    material_type: str = Field(default="pbr", pattern="^(pbr|unlit|toon|glass|metal|fabric|custom)$")
    properties: Dict[str, Any] = Field(default_factory=dict)
    texture_urls: List[str] = Field(default_factory=list)

class RenderJobCreate(BaseModel):
    scene_id: str = Field(..., min_length=1)
    output_format: str = Field(default="png", pattern="^(png|jpg|exr|mp4|webm|glb)$")
    resolution: str = Field(default="1920x1080", max_length=32)
    quality: str = Field(default="high", pattern="^(draft|medium|high|ultra|cinematic)$")
    frames: int = Field(default=1, ge=1, le=10000)


# ── State ────────────────────────────────────────────────────────

_scenes: Dict[str, Dict[str, Any]] = {}
_materials: Dict[str, Dict[str, Any]] = {}
_render_jobs: Dict[str, Dict[str, Any]] = {}
_audit: List[Dict[str, Any]] = []


def _emit(action: str, detail: str, user_id: str):
    _audit.append({"id": str(uuid.uuid4()), "ts": datetime.now(timezone.utc).isoformat(),
                    "action": action, "detail": detail, "user_id": user_id})
    logger.info("tranceflow.%s | user=%s | %s", action, user_id, detail)


# ── Scenes ───────────────────────────────────────────────────────

@router.get("/scenes")
async def list_scenes(
    scene_type: Optional[str] = Query(None), skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_user),
):
    items = list(_scenes.values())
    if scene_type:
        items = [s for s in items if s["scene_type"] == scene_type]
    total = len(items)
    return {"items": items[skip:skip+limit], "total": total, "skip": skip, "limit": limit}

@router.post("/scenes", status_code=201)
async def create_scene(body: SceneCreate, current_user: CurrentUser = Depends(get_current_user)):
    uid = getattr(current_user, "id", "anonymous")
    sid = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    rec = {"id": sid, **body.model_dump(), "status": "draft", "created_by": uid, "created_at": now}
    _scenes[sid] = rec
    _emit("scene_created", f"scene={sid} type={body.scene_type}", uid)
    return rec

@router.get("/scenes/{scene_id}")
async def get_scene(scene_id: str = Path(...), current_user: CurrentUser = Depends(get_current_user)):
    rec = _scenes.get(scene_id)
    if not rec:
        raise HTTPException(404, "Scene not found")
    return rec


# ── Materials ────────────────────────────────────────────────────

@router.get("/materials")
async def list_materials(
    material_type: Optional[str] = Query(None), skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_user),
):
    items = list(_materials.values())
    if material_type:
        items = [m for m in items if m["material_type"] == material_type]
    total = len(items)
    return {"items": items[skip:skip+limit], "total": total, "skip": skip, "limit": limit}

@router.post("/materials", status_code=201)
async def create_material(body: MaterialCreate, current_user: CurrentUser = Depends(get_current_user)):
    uid = getattr(current_user, "id", "anonymous")
    mid = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    rec = {"id": mid, **body.model_dump(), "created_by": uid, "created_at": now}
    _materials[mid] = rec
    _emit("material_created", f"material={mid} type={body.material_type}", uid)
    return rec

@router.get("/materials/{material_id}")
async def get_material(material_id: str = Path(...), current_user: CurrentUser = Depends(get_current_user)):
    rec = _materials.get(material_id)
    if not rec:
        raise HTTPException(404, "Material not found")
    return rec


# ── Render Jobs ──────────────────────────────────────────────────

@router.get("/renders")
async def list_render_jobs(
    skip: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_user),
):
    items = list(_render_jobs.values())
    total = len(items)
    return {"items": items[skip:skip+limit], "total": total, "skip": skip, "limit": limit}

@router.post("/renders", status_code=201)
async def submit_render(body: RenderJobCreate, current_user: CurrentUser = Depends(get_current_user)):
    uid = getattr(current_user, "id", "anonymous")
    if body.scene_id not in _scenes:
        raise HTTPException(404, "Scene not found")
    rid = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    rec = {"id": rid, **body.model_dump(), "status": "queued", "submitted_by": uid, "submitted_at": now}
    _render_jobs[rid] = rec
    _emit("render_submitted", f"render={rid} scene={body.scene_id}", uid)
    return rec

@router.get("/renders/{render_id}")
async def get_render(render_id: str = Path(...), current_user: CurrentUser = Depends(get_current_user)):
    rec = _render_jobs.get(render_id)
    if not rec:
        raise HTTPException(404, "Render job not found")
    return rec


# ── Overview ─────────────────────────────────────────────────────

@router.get("/overview")
async def tranceflow_overview(current_user: CurrentUser = Depends(get_current_user)):
    return {
        "total_scenes": len(_scenes),
        "total_materials": len(_materials),
        "total_renders": len(_render_jobs),
        "renders_queued": sum(1 for r in _render_jobs.values() if r.get("status") == "queued"),
    }