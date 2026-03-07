# routers/devocity.py — DevOcity / Orb of Orisis — DevOps Operations
# Dedicated development-operations node for the Trancendos Ecosystem.
# Pipeline management, deployment tracking, environment provisioning,
# and infrastructure health monitoring.
#
# Lane 1 (AI/Nexus) — DevOps automation layer
# Kernel Event Bus integration for deployment events
#
# ISO 27001: A.14.2 — Security in development and support processes

import uuid
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from enum import Enum

from fastapi import APIRouter, HTTPException, Depends, Query, Path
from pydantic import BaseModel, Field

from auth import get_current_user, CurrentUser

router = APIRouter(prefix="/api/v1/devocity", tags=["DevOcity — DevOps Operations"])
logger = logging.getLogger("devocity")


# ── Enums ────────────────────────────────────────────────────────

class PipelineStatus(str, Enum):
    pending = "pending"
    running = "running"
    success = "success"
    failed = "failed"
    cancelled = "cancelled"

class DeploymentEnv(str, Enum):
    dev = "dev"
    staging = "staging"
    production = "production"
    edge = "edge"

class EnvironmentStatus(str, Enum):
    healthy = "healthy"
    degraded = "degraded"
    down = "down"
    provisioning = "provisioning"


# ── Models ────────────────────────────────────────────────────────

class PipelineCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=256)
    repository: str = Field(..., min_length=1, max_length=512)
    branch: str = Field(default="main", max_length=128)
    stages: List[str] = Field(default_factory=lambda: ["build", "test", "deploy"])
    config: Dict[str, Any] = Field(default_factory=dict)

class DeploymentCreate(BaseModel):
    pipeline_id: str = Field(..., min_length=1)
    environment: DeploymentEnv = DeploymentEnv.dev
    version: str = Field(..., min_length=1, max_length=64)
    notes: str = Field(default="", max_length=2000)
    rollback_version: Optional[str] = Field(default=None, max_length=64)

class EnvironmentCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)
    env_type: DeploymentEnv = DeploymentEnv.dev
    region: str = Field(default="eu-west-1", max_length=64)
    resources: Dict[str, Any] = Field(default_factory=dict)

class HealthCheckResult(BaseModel):
    service: str
    status: EnvironmentStatus
    latency_ms: Optional[float] = None
    message: str = ""


# ── In-Memory State ──────────────────────────────────────────────

_pipelines: Dict[str, Dict[str, Any]] = {}
_deployments: Dict[str, Dict[str, Any]] = {}
_environments: Dict[str, Dict[str, Any]] = {}
_audit_log: List[Dict[str, Any]] = []


# ── Event Helpers ────────────────────────────────────────────────

def _emit_devocity_event(action: str, detail: str, user_id: str):
    entry = {
        "id": str(uuid.uuid4()),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "action": action,
        "detail": detail,
        "user_id": user_id,
    }
    _audit_log.append(entry)
    logger.info("devocity.%s | user=%s | %s", action, user_id, detail)


# ── Pipelines ────────────────────────────────────────────────────

@router.get("/pipelines")
async def list_pipelines(
    status: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_user),
):
    """List CI/CD pipelines with optional status filter."""
    items = list(_pipelines.values())
    if status:
        items = [p for p in items if p["status"] == status]
    total = len(items)
    return {"items": items[skip : skip + limit], "total": total, "skip": skip, "limit": limit}


@router.post("/pipelines", status_code=201)
async def create_pipeline(
    body: PipelineCreate,
    current_user: CurrentUser = Depends(get_current_user),
):
    """Register a new CI/CD pipeline."""
    uid = getattr(current_user, "id", "anonymous")
    pid = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    record = {
        "id": pid,
        "name": body.name,
        "repository": body.repository,
        "branch": body.branch,
        "stages": body.stages,
        "config": body.config,
        "status": PipelineStatus.pending.value,
        "created_by": uid,
        "created_at": now,
        "updated_at": now,
        "runs": 0,
        "last_run_at": None,
    }
    _pipelines[pid] = record
    _emit_devocity_event("pipeline_created", f"pipeline={pid} name={body.name}", uid)
    return record


@router.get("/pipelines/{pipeline_id}")
async def get_pipeline(
    pipeline_id: str = Path(...),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Get a specific pipeline by ID."""
    rec = _pipelines.get(pipeline_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    return rec


@router.post("/pipelines/{pipeline_id}/trigger", status_code=200)
async def trigger_pipeline(
    pipeline_id: str = Path(...),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Trigger a pipeline run."""
    uid = getattr(current_user, "id", "anonymous")
    rec = _pipelines.get(pipeline_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    now = datetime.now(timezone.utc).isoformat()
    rec["status"] = PipelineStatus.running.value
    rec["runs"] += 1
    rec["last_run_at"] = now
    rec["updated_at"] = now
    _emit_devocity_event("pipeline_triggered", f"pipeline={pipeline_id} run={rec['runs']}", uid)
    return {"message": "Pipeline triggered", "pipeline_id": pipeline_id, "run_number": rec["runs"]}


@router.delete("/pipelines/{pipeline_id}", status_code=200)
async def delete_pipeline(
    pipeline_id: str = Path(...),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Delete a pipeline."""
    uid = getattr(current_user, "id", "anonymous")
    rec = _pipelines.pop(pipeline_id, None)
    if not rec:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    _emit_devocity_event("pipeline_deleted", f"pipeline={pipeline_id}", uid)
    return {"message": "Pipeline deleted", "id": pipeline_id}


# ── Deployments ──────────────────────────────────────────────────

@router.get("/deployments")
async def list_deployments(
    environment: Optional[str] = Query(None),
    pipeline_id: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_user),
):
    """List deployments with optional filters."""
    items = list(_deployments.values())
    if environment:
        items = [d for d in items if d["environment"] == environment]
    if pipeline_id:
        items = [d for d in items if d["pipeline_id"] == pipeline_id]
    total = len(items)
    return {"items": items[skip : skip + limit], "total": total, "skip": skip, "limit": limit}


@router.post("/deployments", status_code=201)
async def create_deployment(
    body: DeploymentCreate,
    current_user: CurrentUser = Depends(get_current_user),
):
    """Record a new deployment."""
    uid = getattr(current_user, "id", "anonymous")
    if body.pipeline_id not in _pipelines:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    did = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    record = {
        "id": did,
        "pipeline_id": body.pipeline_id,
        "environment": body.environment.value,
        "version": body.version,
        "notes": body.notes,
        "rollback_version": body.rollback_version,
        "status": "deployed",
        "deployed_by": uid,
        "deployed_at": now,
    }
    _deployments[did] = record
    _emit_devocity_event(
        "deployment_created",
        f"deployment={did} env={body.environment.value} version={body.version}",
        uid,
    )
    return record


@router.get("/deployments/{deployment_id}")
async def get_deployment(
    deployment_id: str = Path(...),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Get a specific deployment by ID."""
    rec = _deployments.get(deployment_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Deployment not found")
    return rec


@router.post("/deployments/{deployment_id}/rollback", status_code=200)
async def rollback_deployment(
    deployment_id: str = Path(...),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Rollback a deployment to its rollback_version."""
    uid = getattr(current_user, "id", "anonymous")
    rec = _deployments.get(deployment_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Deployment not found")
    if not rec.get("rollback_version"):
        raise HTTPException(status_code=400, detail="No rollback version specified")
    rec["status"] = "rolled_back"
    rec["version"] = rec["rollback_version"]
    _emit_devocity_event(
        "deployment_rollback",
        f"deployment={deployment_id} rolled_back_to={rec['rollback_version']}",
        uid,
    )
    return {"message": "Deployment rolled back", "deployment_id": deployment_id, "version": rec["version"]}


# ── Environments ─────────────────────────────────────────────────

@router.get("/environments")
async def list_environments(
    env_type: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_user),
):
    """List provisioned environments."""
    items = list(_environments.values())
    if env_type:
        items = [e for e in items if e["env_type"] == env_type]
    total = len(items)
    return {"items": items[skip : skip + limit], "total": total, "skip": skip, "limit": limit}


@router.post("/environments", status_code=201)
async def provision_environment(
    body: EnvironmentCreate,
    current_user: CurrentUser = Depends(get_current_user),
):
    """Provision a new environment."""
    uid = getattr(current_user, "id", "anonymous")
    eid = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    record = {
        "id": eid,
        "name": body.name,
        "env_type": body.env_type.value,
        "region": body.region,
        "resources": body.resources,
        "status": EnvironmentStatus.provisioning.value,
        "provisioned_by": uid,
        "provisioned_at": now,
    }
    _environments[eid] = record
    _emit_devocity_event("environment_provisioned", f"env={eid} name={body.name} type={body.env_type.value}", uid)
    return record


@router.get("/environments/{env_id}")
async def get_environment(
    env_id: str = Path(...),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Get a specific environment by ID."""
    rec = _environments.get(env_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Environment not found")
    return rec


@router.put("/environments/{env_id}/status")
async def update_environment_status(
    env_id: str = Path(...),
    status: EnvironmentStatus = Query(...),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Update environment health status."""
    uid = getattr(current_user, "id", "anonymous")
    rec = _environments.get(env_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Environment not found")
    rec["status"] = status.value
    _emit_devocity_event("environment_status_updated", f"env={env_id} status={status.value}", uid)
    return rec


# ── Health & Overview ────────────────────────────────────────────

@router.get("/health")
async def devocity_health(
    current_user: CurrentUser = Depends(get_current_user),
):
    """Aggregate health check across all environments."""
    checks = []
    for env in _environments.values():
        checks.append({
            "service": env["name"],
            "status": env["status"],
            "latency_ms": None,
            "message": f"{env['env_type']} in {env['region']}",
        })
    healthy = sum(1 for c in checks if c["status"] == "healthy")
    total = len(checks)
    return {
        "overall": "healthy" if healthy == total and total > 0 else ("degraded" if total > 0 else "no_environments"),
        "environments_total": total,
        "environments_healthy": healthy,
        "checks": checks,
    }


@router.get("/overview")
async def devocity_overview(
    current_user: CurrentUser = Depends(get_current_user),
):
    """DevOcity operations overview — pipelines, deployments, environments."""
    return {
        "pipelines_total": len(_pipelines),
        "pipelines_running": sum(1 for p in _pipelines.values() if p["status"] == "running"),
        "deployments_total": len(_deployments),
        "environments_total": len(_environments),
        "environments_healthy": sum(1 for e in _environments.values() if e["status"] == "healthy"),
        "audit_entries": len(_audit_log),
    }


@router.get("/audit")
async def devocity_audit_log(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_user),
):
    """DevOcity audit trail."""
    items = list(reversed(_audit_log))
    total = len(items)
    return {"items": items[skip : skip + limit], "total": total, "skip": skip, "limit": limit}