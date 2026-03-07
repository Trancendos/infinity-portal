# routers/section7.py — Section7 / Bert-Joen Kater — Intelligence & Analytics
# Creative intelligence module within The Studio.
# Manages intelligence reports, surveillance feeds, data analysis tasks,
# and strategic insight generation for creative operations.
#
# Lane 1 (AI/Nexus) — Intelligence layer
# Kernel Event Bus integration for intel events

import uuid
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List

from fastapi import APIRouter, HTTPException, Depends, Query, Path
from pydantic import BaseModel, Field

from auth import get_current_user, CurrentUser

router = APIRouter(prefix="/api/v1/section7", tags=["Section7 — Intelligence"])
logger = logging.getLogger("section7")


# ── Models ────────────────────────────────────────────────────────

class IntelReportCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=256)
    classification: str = Field(default="internal", pattern="^(public|internal|confidential|top_secret)$")
    domain: str = Field(default="general", max_length=128)
    summary: str = Field(default="", max_length=5000)
    sources: List[str] = Field(default_factory=list)
    tags: List[str] = Field(default_factory=list)

class AnalysisTaskCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=256)
    dataset: str = Field(default="", max_length=512)
    analysis_type: str = Field(default="trend", pattern="^(trend|sentiment|anomaly|predictive|comparative)$")
    parameters: Dict[str, Any] = Field(default_factory=dict)

class SurveillanceFeedCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=256)
    source_type: str = Field(default="api", pattern="^(api|stream|webhook|scrape|manual)$")
    target: str = Field(default="", max_length=512)
    interval_seconds: int = Field(default=300, ge=10, le=86400)
    active: bool = Field(default=True)


# ── State ────────────────────────────────────────────────────────

_reports: Dict[str, Dict[str, Any]] = {}
_tasks: Dict[str, Dict[str, Any]] = {}
_feeds: Dict[str, Dict[str, Any]] = {}
_audit: List[Dict[str, Any]] = []


def _emit(action: str, detail: str, user_id: str):
    _audit.append({"id": str(uuid.uuid4()), "ts": datetime.now(timezone.utc).isoformat(),
                    "action": action, "detail": detail, "user_id": user_id})
    logger.info("section7.%s | user=%s | %s", action, user_id, detail)


# ── Intel Reports ────────────────────────────────────────────────

@router.get("/reports")
async def list_reports(
    classification: Optional[str] = Query(None), skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_user),
):
    items = list(_reports.values())
    if classification:
        items = [r for r in items if r["classification"] == classification]
    total = len(items)
    return {"items": items[skip:skip+limit], "total": total, "skip": skip, "limit": limit}

@router.post("/reports", status_code=201)
async def create_report(body: IntelReportCreate, current_user: CurrentUser = Depends(get_current_user)):
    uid = getattr(current_user, "id", "anonymous")
    rid = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    rec = {"id": rid, **body.model_dump(), "status": "draft", "created_by": uid, "created_at": now}
    _reports[rid] = rec
    _emit("report_created", f"report={rid}", uid)
    return rec

@router.get("/reports/{report_id}")
async def get_report(report_id: str = Path(...), current_user: CurrentUser = Depends(get_current_user)):
    rec = _reports.get(report_id)
    if not rec:
        raise HTTPException(404, "Report not found")
    return rec


# ── Analysis Tasks ───────────────────────────────────────────────

@router.get("/tasks")
async def list_tasks(
    analysis_type: Optional[str] = Query(None), skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_user),
):
    items = list(_tasks.values())
    if analysis_type:
        items = [t for t in items if t["analysis_type"] == analysis_type]
    total = len(items)
    return {"items": items[skip:skip+limit], "total": total, "skip": skip, "limit": limit}

@router.post("/tasks", status_code=201)
async def create_task(body: AnalysisTaskCreate, current_user: CurrentUser = Depends(get_current_user)):
    uid = getattr(current_user, "id", "anonymous")
    tid = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    rec = {"id": tid, **body.model_dump(), "status": "queued", "created_by": uid, "created_at": now}
    _tasks[tid] = rec
    _emit("task_created", f"task={tid} type={body.analysis_type}", uid)
    return rec

@router.get("/tasks/{task_id}")
async def get_task(task_id: str = Path(...), current_user: CurrentUser = Depends(get_current_user)):
    rec = _tasks.get(task_id)
    if not rec:
        raise HTTPException(404, "Task not found")
    return rec


# ── Surveillance Feeds ───────────────────────────────────────────

@router.get("/feeds")
async def list_feeds(
    active: Optional[bool] = Query(None), skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_user),
):
    items = list(_feeds.values())
    if active is not None:
        items = [f for f in items if f["active"] == active]
    total = len(items)
    return {"items": items[skip:skip+limit], "total": total, "skip": skip, "limit": limit}

@router.post("/feeds", status_code=201)
async def create_feed(body: SurveillanceFeedCreate, current_user: CurrentUser = Depends(get_current_user)):
    uid = getattr(current_user, "id", "anonymous")
    fid = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    rec = {"id": fid, **body.model_dump(), "created_by": uid, "created_at": now}
    _feeds[fid] = rec
    _emit("feed_created", f"feed={fid} source={body.source_type}", uid)
    return rec

@router.get("/feeds/{feed_id}")
async def get_feed(feed_id: str = Path(...), current_user: CurrentUser = Depends(get_current_user)):
    rec = _feeds.get(feed_id)
    if not rec:
        raise HTTPException(404, "Feed not found")
    return rec


# ── Overview ─────────────────────────────────────────────────────

@router.get("/overview")
async def section7_overview(current_user: CurrentUser = Depends(get_current_user)):
    return {
        "total_reports": len(_reports),
        "total_tasks": len(_tasks),
        "total_feeds": len(_feeds),
        "active_feeds": sum(1 for f in _feeds.values() if f.get("active")),
    }