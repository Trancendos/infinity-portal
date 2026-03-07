# routers/luminous.py — Luminous / Cornelius MacIntyre — Cognitive Core Application
# The primary cognitive intelligence platform of the Trancendos Ecosystem.
# Manages knowledge graphs, cognitive sessions, insight generation,
# and the neural mesh that connects all AI characters.
#
# Note: Cornelius MacIntyre is the resident AI within Luminous.
# The cornelius.py router handles AI orchestration; this router
# covers the Luminous application platform itself.
#
# Lane 1 (AI/Nexus) — Cognitive intelligence layer
# Kernel Event Bus integration for cognitive events
#
# ISO 27001: A.8.2 — Information classification

import uuid
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List

from fastapi import APIRouter, HTTPException, Depends, Query, Path
from pydantic import BaseModel, Field

from auth import get_current_user, CurrentUser

router = APIRouter(prefix="/api/v1/luminous", tags=["Luminous — Cognitive Core"])
logger = logging.getLogger("luminous")


# ── Models ────────────────────────────────────────────────────────

class KnowledgeNodeCreate(BaseModel):
    label: str = Field(..., min_length=1, max_length=256)
    node_type: str = Field(default="concept", pattern="^(concept|entity|event|relation|axiom|inference)$")
    domain: str = Field(default="general", max_length=128)
    properties: Dict[str, Any] = Field(default_factory=dict)
    connections: List[str] = Field(default_factory=list, description="IDs of connected nodes")
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)

class KnowledgeEdgeCreate(BaseModel):
    source_id: str = Field(..., min_length=1)
    target_id: str = Field(..., min_length=1)
    relation: str = Field(..., min_length=1, max_length=128)
    weight: float = Field(default=1.0, ge=0.0, le=10.0)
    metadata: Dict[str, Any] = Field(default_factory=dict)

class CognitiveSessionCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=256)
    session_type: str = Field(default="exploration", pattern="^(exploration|analysis|synthesis|debate|meditation)$")
    participants: List[str] = Field(default_factory=list, description="AI character IDs")
    focus_domain: str = Field(default="general", max_length=128)
    context: Dict[str, Any] = Field(default_factory=dict)

class InsightCreate(BaseModel):
    session_id: Optional[str] = Field(default=None)
    title: str = Field(..., min_length=1, max_length=256)
    insight_type: str = Field(default="observation", pattern="^(observation|pattern|prediction|recommendation|warning)$")
    content: str = Field(default="", max_length=10000)
    confidence: float = Field(default=0.8, ge=0.0, le=1.0)
    source_nodes: List[str] = Field(default_factory=list)
    tags: List[str] = Field(default_factory=list)


# ── State ────────────────────────────────────────────────────────

_nodes: Dict[str, Dict[str, Any]] = {}
_edges: Dict[str, Dict[str, Any]] = {}
_sessions: Dict[str, Dict[str, Any]] = {}
_insights: Dict[str, Dict[str, Any]] = {}
_audit: List[Dict[str, Any]] = []


def _emit(action: str, detail: str, user_id: str):
    _audit.append({"id": str(uuid.uuid4()), "ts": datetime.now(timezone.utc).isoformat(),
                    "action": action, "detail": detail, "user_id": user_id})
    logger.info("luminous.%s | user=%s | %s", action, user_id, detail)


# ── Knowledge Graph — Nodes ──────────────────────────────────────

@router.get("/knowledge/nodes")
async def list_nodes(
    node_type: Optional[str] = Query(None), domain: Optional[str] = Query(None),
    skip: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_user),
):
    items = list(_nodes.values())
    if node_type:
        items = [n for n in items if n["node_type"] == node_type]
    if domain:
        items = [n for n in items if n["domain"] == domain]
    total = len(items)
    return {"items": items[skip:skip+limit], "total": total, "skip": skip, "limit": limit}

@router.post("/knowledge/nodes", status_code=201)
async def create_node(body: KnowledgeNodeCreate, current_user: CurrentUser = Depends(get_current_user)):
    uid = getattr(current_user, "id", "anonymous")
    nid = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    rec = {"id": nid, **body.model_dump(), "created_by": uid, "created_at": now}
    _nodes[nid] = rec
    _emit("node_created", f"node={nid} type={body.node_type} domain={body.domain}", uid)
    return rec

@router.get("/knowledge/nodes/{node_id}")
async def get_node(node_id: str = Path(...), current_user: CurrentUser = Depends(get_current_user)):
    rec = _nodes.get(node_id)
    if not rec:
        raise HTTPException(404, "Knowledge node not found")
    return rec


# ── Knowledge Graph — Edges ──────────────────────────────────────

@router.get("/knowledge/edges")
async def list_edges(
    source_id: Optional[str] = Query(None), skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_user),
):
    items = list(_edges.values())
    if source_id:
        items = [e for e in items if e["source_id"] == source_id]
    total = len(items)
    return {"items": items[skip:skip+limit], "total": total, "skip": skip, "limit": limit}

@router.post("/knowledge/edges", status_code=201)
async def create_edge(body: KnowledgeEdgeCreate, current_user: CurrentUser = Depends(get_current_user)):
    uid = getattr(current_user, "id", "anonymous")
    if body.source_id not in _nodes:
        raise HTTPException(404, "Source node not found")
    if body.target_id not in _nodes:
        raise HTTPException(404, "Target node not found")
    eid = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    rec = {"id": eid, **body.model_dump(), "created_by": uid, "created_at": now}
    _edges[eid] = rec
    _emit("edge_created", f"edge={eid} {body.source_id}-[{body.relation}]->{body.target_id}", uid)
    return rec

@router.get("/knowledge/edges/{edge_id}")
async def get_edge(edge_id: str = Path(...), current_user: CurrentUser = Depends(get_current_user)):
    rec = _edges.get(edge_id)
    if not rec:
        raise HTTPException(404, "Knowledge edge not found")
    return rec


# ── Cognitive Sessions ───────────────────────────────────────────

@router.get("/sessions")
async def list_sessions(
    session_type: Optional[str] = Query(None), skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_user),
):
    items = list(_sessions.values())
    if session_type:
        items = [s for s in items if s["session_type"] == session_type]
    total = len(items)
    return {"items": items[skip:skip+limit], "total": total, "skip": skip, "limit": limit}

@router.post("/sessions", status_code=201)
async def create_session(body: CognitiveSessionCreate, current_user: CurrentUser = Depends(get_current_user)):
    uid = getattr(current_user, "id", "anonymous")
    sid = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    rec = {"id": sid, **body.model_dump(), "status": "active",
           "created_by": uid, "created_at": now, "ended_at": None}
    _sessions[sid] = rec
    _emit("session_created", f"session={sid} type={body.session_type}", uid)
    return rec

@router.get("/sessions/{session_id}")
async def get_session(session_id: str = Path(...), current_user: CurrentUser = Depends(get_current_user)):
    rec = _sessions.get(session_id)
    if not rec:
        raise HTTPException(404, "Cognitive session not found")
    return rec

@router.post("/sessions/{session_id}/end")
async def end_session(session_id: str = Path(...), current_user: CurrentUser = Depends(get_current_user)):
    uid = getattr(current_user, "id", "anonymous")
    rec = _sessions.get(session_id)
    if not rec:
        raise HTTPException(404, "Cognitive session not found")
    rec["status"] = "completed"
    rec["ended_at"] = datetime.now(timezone.utc).isoformat()
    _emit("session_ended", f"session={session_id}", uid)
    return rec


# ── Insights ─────────────────────────────────────────────────────

@router.get("/insights")
async def list_insights(
    insight_type: Optional[str] = Query(None), skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_user),
):
    items = list(_insights.values())
    if insight_type:
        items = [i for i in items if i["insight_type"] == insight_type]
    total = len(items)
    return {"items": items[skip:skip+limit], "total": total, "skip": skip, "limit": limit}

@router.post("/insights", status_code=201)
async def create_insight(body: InsightCreate, current_user: CurrentUser = Depends(get_current_user)):
    uid = getattr(current_user, "id", "anonymous")
    iid = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    rec = {"id": iid, **body.model_dump(), "generated_by": uid, "generated_at": now}
    _insights[iid] = rec
    _emit("insight_created", f"insight={iid} type={body.insight_type}", uid)
    return rec

@router.get("/insights/{insight_id}")
async def get_insight(insight_id: str = Path(...), current_user: CurrentUser = Depends(get_current_user)):
    rec = _insights.get(insight_id)
    if not rec:
        raise HTTPException(404, "Insight not found")
    return rec


# ── Neural Mesh Status ───────────────────────────────────────────

@router.get("/neural-mesh")
async def neural_mesh_status(current_user: CurrentUser = Depends(get_current_user)):
    """Status of the neural mesh connecting all AI characters through Luminous."""
    return {
        "status": "active",
        "knowledge_nodes": len(_nodes),
        "knowledge_edges": len(_edges),
        "active_sessions": sum(1 for s in _sessions.values() if s.get("status") == "active"),
        "total_insights": len(_insights),
        "mesh_health": "optimal" if len(_nodes) > 0 else "initializing",
    }


# ── Overview ─────────────────────────────────────────────────────

@router.get("/overview")
async def luminous_overview(current_user: CurrentUser = Depends(get_current_user)):
    return {
        "total_knowledge_nodes": len(_nodes),
        "total_knowledge_edges": len(_edges),
        "total_sessions": len(_sessions),
        "active_sessions": sum(1 for s in _sessions.values() if s.get("status") == "active"),
        "total_insights": len(_insights),
        "insights_by_type": _count_by(_insights, "insight_type"),
        "nodes_by_type": _count_by(_nodes, "node_type"),
        "audit_entries": len(_audit),
    }

def _count_by(store: Dict, field: str) -> Dict[str, int]:
    counts: Dict[str, int] = {}
    for item in store.values():
        val = item.get(field, "unknown")
        counts[val] = counts.get(val, 0) + 1
    return counts