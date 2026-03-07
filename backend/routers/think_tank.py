# routers/think_tank.py — Think Tank / Trancendos — R&D Centre
# Core research and development hub for the Trancendos Ecosystem.
# Manages research projects, experiments, innovation proposals, and R&D metrics.
#
# Lane 1 (AI/Nexus) — R&D intelligence layer
# ISO 27001: A.8.25 — Secure development lifecycle

import uuid
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from auth import get_current_user, CurrentUser

router = APIRouter(prefix="/api/v1/think-tank", tags=["Think Tank — R&D Centre"])
logger = logging.getLogger("think-tank")


# ── Models ────────────────────────────────────────────────────

class ResearchProject(BaseModel):
    name: str = Field(..., min_length=1, max_length=256)
    description: str = Field(default="", max_length=5000)
    domain: str = Field(default="general", max_length=128)
    status: str = Field(default="proposed", pattern="^(proposed|exploring|prototyping|validating|completed|shelved)$")
    lead_ai: str = Field(default="trancendos", max_length=128)
    collaborators: List[str] = Field(default_factory=list)
    hypothesis: str = Field(default="", max_length=2000)
    findings: str = Field(default="", max_length=5000)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class Experiment(BaseModel):
    project_id: str = Field(..., min_length=1, max_length=128)
    name: str = Field(..., min_length=1, max_length=256)
    description: str = Field(default="", max_length=2000)
    parameters: Dict[str, Any] = Field(default_factory=dict)
    expected_outcome: str = Field(default="", max_length=1000)


class InnovationProposal(BaseModel):
    title: str = Field(..., min_length=1, max_length=256)
    abstract: str = Field(default="", max_length=3000)
    proposed_by: str = Field(default="", max_length=128)
    impact_assessment: str = Field(default="medium", pattern="^(low|medium|high|transformative)$")
    resources_needed: List[str] = Field(default_factory=list)


# ── In-Memory State ──────────────────────────────────────────

_projects: Dict[str, Dict[str, Any]] = {}
_experiments: Dict[str, Dict[str, Any]] = {}
_proposals: Dict[str, Dict[str, Any]] = {}


def _emit_tank_event(action: str, detail: Dict[str, Any], user_id: str = "system"):
    logger.info(f"[THINK-TANK-EVENT] user={user_id} action={action} detail={detail}")


# ── Research Projects ────────────────────────────────────────

@router.get("/projects", summary="List research projects")
async def list_projects(
    status: Optional[str] = Query(None),
    domain: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_user),
):
    items = list(_projects.values())
    if status:
        items = [p for p in items if p.get("status") == status]
    if domain:
        items = [p for p in items if p.get("domain") == domain]
    total = len(items)
    return {"items": items[skip: skip + limit], "total": total, "skip": skip, "limit": limit}


@router.post("/projects", summary="Create a research project", status_code=201)
async def create_project(body: ResearchProject, current_user: CurrentUser = Depends(get_current_user)):
    user_id = getattr(current_user, "id", "anonymous")
    pid = f"rp-{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()
    record = {"id": pid, **body.model_dump(), "created_at": now, "updated_at": now, "created_by": user_id}
    _projects[pid] = record
    _emit_tank_event("create_project", {"id": pid, "name": body.name}, user_id)
    return record


@router.get("/projects/{project_id}", summary="Get project details")
async def get_project(project_id: str, current_user: CurrentUser = Depends(get_current_user)):
    p = _projects.get(project_id)
    if not p:
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found")
    return p


# ── Experiments ──────────────────────────────────────────────

@router.get("/experiments", summary="List experiments")
async def list_experiments(
    project_id: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_user),
):
    items = list(_experiments.values())
    if project_id:
        items = [e for e in items if e.get("project_id") == project_id]
    total = len(items)
    return {"items": items[skip: skip + limit], "total": total, "skip": skip, "limit": limit}


@router.post("/experiments", summary="Run an experiment", status_code=201)
async def run_experiment(body: Experiment, current_user: CurrentUser = Depends(get_current_user)):
    user_id = getattr(current_user, "id", "anonymous")
    eid = f"exp-{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()
    record = {
        "id": eid, **body.model_dump(),
        "status": "running", "result": None,
        "created_at": now, "completed_at": None, "created_by": user_id,
    }
    _experiments[eid] = record
    _emit_tank_event("run_experiment", {"id": eid, "project": body.project_id}, user_id)
    return record


@router.get("/experiments/{experiment_id}", summary="Get experiment details")
async def get_experiment(experiment_id: str, current_user: CurrentUser = Depends(get_current_user)):
    e = _experiments.get(experiment_id)
    if not e:
        raise HTTPException(status_code=404, detail=f"Experiment '{experiment_id}' not found")
    return e


# ── Innovation Proposals ─────────────────────────────────────

@router.get("/proposals", summary="List innovation proposals")
async def list_proposals(
    impact: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_user),
):
    items = list(_proposals.values())
    if impact:
        items = [p for p in items if p.get("impact_assessment") == impact]
    total = len(items)
    return {"items": items[skip: skip + limit], "total": total, "skip": skip, "limit": limit}


@router.post("/proposals", summary="Submit an innovation proposal", status_code=201)
async def submit_proposal(body: InnovationProposal, current_user: CurrentUser = Depends(get_current_user)):
    user_id = getattr(current_user, "id", "anonymous")
    pid = f"prop-{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()
    record = {"id": pid, **body.model_dump(), "status": "submitted", "created_at": now, "created_by": user_id}
    _proposals[pid] = record
    _emit_tank_event("submit_proposal", {"id": pid, "title": body.title}, user_id)
    return record


@router.get("/proposals/{proposal_id}", summary="Get proposal details")
async def get_proposal(proposal_id: str, current_user: CurrentUser = Depends(get_current_user)):
    p = _proposals.get(proposal_id)
    if not p:
        raise HTTPException(status_code=404, detail=f"Proposal '{proposal_id}' not found")
    return p


# ── Overview ─────────────────────────────────────────────────

@router.get("/overview", summary="Think Tank overview")
async def think_tank_overview(current_user: CurrentUser = Depends(get_current_user)):
    return {
        "total_projects": len(_projects),
        "total_experiments": len(_experiments),
        "total_proposals": len(_proposals),
        "projects_by_status": _count_by(_projects, "status"),
        "proposals_by_impact": _count_by(_proposals, "impact_assessment"),
    }


def _count_by(store: Dict, field: str) -> Dict[str, int]:
    counts: Dict[str, int] = {}
    for item in store.values():
        val = item.get(field, "unknown")
        counts[val] = counts.get(val, 0) + 1
    return counts