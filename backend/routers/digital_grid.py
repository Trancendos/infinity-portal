# routers/digital_grid.py — DigitalGrid / Tyler Towncroft — Spatial CI/CD
# Spatial deployment and continuous integration module within The Studio.
# Manages spatial builds, deployment grids, node topology, and CI/CD pipelines
# for 3D/AR/VR content delivery.
#
# Lane 3 (Data/Hive) — Spatial infrastructure layer
# Kernel Event Bus integration for grid events

import uuid
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List

from fastapi import APIRouter, HTTPException, Depends, Query, Path
from pydantic import BaseModel, Field

from auth import get_current_user, CurrentUser

router = APIRouter(prefix="/api/v1/digital-grid", tags=["DigitalGrid — Spatial CI/CD"])
logger = logging.getLogger("digital_grid")


# ── Models ────────────────────────────────────────────────────────

class GridNodeCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=256)
    region: str = Field(default="eu-west-1", max_length=64)
    node_type: str = Field(default="compute", pattern="^(compute|render|storage|edge|gateway)$")
    capacity: Dict[str, Any] = Field(default_factory=dict)

class SpatialBuildCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=256)
    source_repo: str = Field(default="", max_length=512)
    target_nodes: List[str] = Field(default_factory=list)
    build_config: Dict[str, Any] = Field(default_factory=dict)
    spatial_format: str = Field(default="glb", pattern="^(glb|gltf|usdz|fbx|obj|vrm)$")

class DeploymentGridCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=256)
    build_id: str = Field(..., min_length=1)
    target_environment: str = Field(default="staging", pattern="^(dev|staging|production|edge)$")
    distribution_strategy: str = Field(default="round_robin", pattern="^(round_robin|geo_nearest|weighted|broadcast)$")


# ── State ────────────────────────────────────────────────────────

_nodes: Dict[str, Dict[str, Any]] = {}
_builds: Dict[str, Dict[str, Any]] = {}
_deployments: Dict[str, Dict[str, Any]] = {}
_audit: List[Dict[str, Any]] = []


def _emit(action: str, detail: str, user_id: str):
    _audit.append({"id": str(uuid.uuid4()), "ts": datetime.now(timezone.utc).isoformat(),
                    "action": action, "detail": detail, "user_id": user_id})
    logger.info("digital_grid.%s | user=%s | %s", action, user_id, detail)


# ── Grid Nodes ───────────────────────────────────────────────────

@router.get("/nodes")
async def list_nodes(
    node_type: Optional[str] = Query(None), skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_user),
):
    items = list(_nodes.values())
    if node_type:
        items = [n for n in items if n["node_type"] == node_type]
    total = len(items)
    return {"items": items[skip:skip+limit], "total": total, "skip": skip, "limit": limit}

@router.post("/nodes", status_code=201)
async def register_node(body: GridNodeCreate, current_user: CurrentUser = Depends(get_current_user)):
    uid = getattr(current_user, "id", "anonymous")
    nid = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    rec = {"id": nid, **body.model_dump(), "status": "online", "registered_by": uid, "registered_at": now}
    _nodes[nid] = rec
    _emit("node_registered", f"node={nid} type={body.node_type}", uid)
    return rec

@router.get("/nodes/{node_id}")
async def get_node(node_id: str = Path(...), current_user: CurrentUser = Depends(get_current_user)):
    rec = _nodes.get(node_id)
    if not rec:
        raise HTTPException(404, "Node not found")
    return rec


# ── Spatial Builds ───────────────────────────────────────────────

@router.get("/builds")
async def list_builds(
    skip: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_user),
):
    items = list(_builds.values())
    total = len(items)
    return {"items": items[skip:skip+limit], "total": total, "skip": skip, "limit": limit}

@router.post("/builds", status_code=201)
async def create_build(body: SpatialBuildCreate, current_user: CurrentUser = Depends(get_current_user)):
    uid = getattr(current_user, "id", "anonymous")
    bid = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    rec = {"id": bid, **body.model_dump(), "status": "queued", "created_by": uid, "created_at": now}
    _builds[bid] = rec
    _emit("build_created", f"build={bid} format={body.spatial_format}", uid)
    return rec

@router.get("/builds/{build_id}")
async def get_build(build_id: str = Path(...), current_user: CurrentUser = Depends(get_current_user)):
    rec = _builds.get(build_id)
    if not rec:
        raise HTTPException(404, "Build not found")
    return rec


# ── Deployment Grids ─────────────────────────────────────────────

@router.get("/deployments")
async def list_deployments(
    target_environment: Optional[str] = Query(None), skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_user),
):
    items = list(_deployments.values())
    if target_environment:
        items = [d for d in items if d["target_environment"] == target_environment]
    total = len(items)
    return {"items": items[skip:skip+limit], "total": total, "skip": skip, "limit": limit}

@router.post("/deployments", status_code=201)
async def create_deployment(body: DeploymentGridCreate, current_user: CurrentUser = Depends(get_current_user)):
    uid = getattr(current_user, "id", "anonymous")
    if body.build_id not in _builds:
        raise HTTPException(404, "Build not found")
    did = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    rec = {"id": did, **body.model_dump(), "status": "deploying", "deployed_by": uid, "deployed_at": now}
    _deployments[did] = rec
    _emit("deployment_created", f"deploy={did} env={body.target_environment}", uid)
    return rec

@router.get("/deployments/{deployment_id}")
async def get_deployment(deployment_id: str = Path(...), current_user: CurrentUser = Depends(get_current_user)):
    rec = _deployments.get(deployment_id)
    if not rec:
        raise HTTPException(404, "Deployment not found")
    return rec


# ── Overview ─────────────────────────────────────────────────────

@router.get("/overview")
async def digital_grid_overview(current_user: CurrentUser = Depends(get_current_user)):
    return {
        "total_nodes": len(_nodes),
        "total_builds": len(_builds),
        "total_deployments": len(_deployments),
        "nodes_online": sum(1 for n in _nodes.values() if n.get("status") == "online"),
    }