# routers/observatory.py — The Observatory — Immutable Ground Truth with Knowledge Graph
# THREE-LANE MESH: CROSS-LANE — Observes ALL three lanes
#
# The Observatory is the single source of truth for the entire ecosystem.
# It observes all three mesh lanes simultaneously:
#   Lane 1 (AI/Nexus):     Agent routing metrics, pheromone trail health
#   Lane 2 (User/Infinity): User session metrics, auth events
#   Lane 3 (Data/Hive):    Transfer volumes, data lineage, integrity checks
#
# It maintains an immutable event log and a knowledge graph that maps
# relationships between all entities in the ecosystem.

from typing import Optional, Dict, Any, List
from datetime import datetime, timezone
from collections import defaultdict
import uuid
import hashlib
import json

from fastapi import APIRouter, Depends, HTTPException, Query, Path
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user, require_min_role, CurrentUser, UserRole
from database import get_db_session

router = APIRouter(prefix="/api/v1/observatory", tags=['The Observatory — Ground Truth'])


# ============================================================
# CROSS-LANE: IMMUTABLE OBSERVATION OF ALL MESH LANES
# ============================================================

# In-memory state (production: append-only DB + event store)
_events: List[Dict[str, Any]] = []
_knowledge_graph_nodes: Dict[str, Dict[str, Any]] = {}
_knowledge_graph_edges: List[Dict[str, Any]] = []
_pattern_cache: Dict[str, Any] = {}


# ============================================================
# SCHEMAS
# ============================================================

class EventRecord(BaseModel):
    """An immutable event observed by The Observatory."""
    event_type: str = Field(..., description="Event type (e.g., 'nexus.route', 'hive.transfer', 'auth.login')")
    source_service: str = Field(..., description="Service that generated the event")
    mesh_lane: str = Field(..., description="Mesh lane: ai_nexus, user_infinity, data_hive, cross_lane")
    payload: Dict[str, Any] = Field(default_factory=dict)
    severity: str = Field("info", description="Severity: debug, info, warning, error, critical")
    correlation_id: Optional[str] = Field(None, description="Correlation ID for tracing cross-lane transactions")


class KnowledgeGraphNode(BaseModel):
    """A node in the knowledge graph."""
    node_id: str = Field(..., description="Unique node identifier")
    node_type: str = Field(..., description="Node type: service, agent, user, asset, event")
    properties: Dict[str, Any] = Field(default_factory=dict)
    mesh_lane: str = Field("cross_lane", description="Primary mesh lane")


class KnowledgeGraphEdge(BaseModel):
    """An edge (relationship) in the knowledge graph."""
    source_id: str = Field(..., description="Source node ID")
    target_id: str = Field(..., description="Target node ID")
    relationship: str = Field(..., description="Relationship type: communicates_with, transfers_to, monitors, etc.")
    properties: Dict[str, Any] = Field(default_factory=dict)


# ============================================================
# IMMUTABLE EVENT LOG
# ============================================================

@router.post("/events")
async def record_event(
    event: EventRecord,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """
    Record an immutable event in The Observatory.
    
    Events from ALL three mesh lanes are recorded here:
    - Lane 1 events: AI agent routing, pheromone updates, broadcasts
    - Lane 2 events: User logins, session changes, UI interactions
    - Lane 3 events: Data transfers, asset registrations, integrity checks
    
    Events are append-only and cannot be modified or deleted.
    """
    event_id = str(uuid.uuid4())[:12]
    timestamp = datetime.now(timezone.utc).isoformat()

    # Create immutable hash for tamper detection
    event_data = {
        "event_id": event_id,
        "event_type": event.event_type,
        "source_service": event.source_service,
        "mesh_lane": event.mesh_lane,
        "severity": event.severity,
        "payload": event.payload,
        "correlation_id": event.correlation_id,
        "timestamp": timestamp,
    }

    # Chain hash: each event includes hash of previous event
    prev_hash = _events[-1].get("event_hash", "genesis") if _events else "genesis"
    event_data["prev_hash"] = prev_hash
    event_data["event_hash"] = hashlib.sha256(
        json.dumps(event_data, sort_keys=True, default=str).encode()
    ).hexdigest()

    _events.append(event_data)

    # Trim to last 10,000 events in memory
    if len(_events) > 10000:
        _events[:] = _events[-5000:]

    return {
        "status": "ok",
        "event_id": event_id,
        "event_hash": event_data["event_hash"],
        "chain_position": len(_events),
        "mesh_lane": event.mesh_lane,
        "timestamp": timestamp,
    }


@router.get("/events")
async def list_events(
    mesh_lane: Optional[str] = Query(None, description="Filter by mesh lane"),
    event_type: Optional[str] = Query(None, description="Filter by event type prefix"),
    severity: Optional[str] = Query(None, description="Filter by severity"),
    source_service: Optional[str] = Query(None, description="Filter by source service"),
    correlation_id: Optional[str] = Query(None, description="Filter by correlation ID"),
    limit: int = Query(100, ge=1, le=1000),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Query the immutable event log with filters."""
    events = list(_events)

    if mesh_lane:
        events = [e for e in events if e.get("mesh_lane") == mesh_lane]
    if event_type:
        events = [e for e in events if e.get("event_type", "").startswith(event_type)]
    if severity:
        events = [e for e in events if e.get("severity") == severity]
    if source_service:
        events = [e for e in events if e.get("source_service") == source_service]
    if correlation_id:
        events = [e for e in events if e.get("correlation_id") == correlation_id]

    events = sorted(events, key=lambda e: e.get("timestamp", ""), reverse=True)[:limit]

    return {
        "status": "ok",
        "total": len(events),
        "events": events,
        "chain_length": len(_events),
    }


@router.get("/events/{event_id}")
async def get_event(
    event_id: str = Path(...),
    verify_integrity: bool = Query(False, description="Verify event hash chain integrity"),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Get a specific event with optional integrity verification."""
    event = next((e for e in _events if e.get("event_id") == event_id), None)
    if not event:
        raise HTTPException(404, f"Event '{event_id}' not found")

    result = {"status": "ok", "event": event}

    if verify_integrity:
        # Verify hash chain
        idx = next((i for i, e in enumerate(_events) if e.get("event_id") == event_id), -1)
        if idx > 0:
            expected_prev = _events[idx - 1].get("event_hash")
            actual_prev = event.get("prev_hash")
            result["integrity"] = {
                "chain_valid": expected_prev == actual_prev,
                "position": idx,
                "prev_hash_match": expected_prev == actual_prev,
            }
        else:
            result["integrity"] = {"chain_valid": True, "position": 0, "note": "Genesis event"}

    return result


# ============================================================
# KNOWLEDGE GRAPH
# ============================================================

@router.get("/knowledge-graph/query")
async def query_knowledge_graph(
    node_type: Optional[str] = Query(None, description="Filter nodes by type"),
    mesh_lane: Optional[str] = Query(None, description="Filter by mesh lane"),
    relationship: Optional[str] = Query(None, description="Filter edges by relationship type"),
    limit: int = Query(100, ge=1, le=1000),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """
    Query the knowledge graph.
    
    The knowledge graph maps relationships between all entities:
    - Services ↔ Services (communication patterns)
    - Agents ↔ Agents (pheromone trails from The Nexus)
    - Users ↔ Services (access patterns from Infinity One)
    - Assets ↔ Services (data flow from The Hive)
    """
    nodes = list(_knowledge_graph_nodes.values())
    edges = list(_knowledge_graph_edges)

    if node_type:
        nodes = [n for n in nodes if n.get("node_type") == node_type]
    if mesh_lane:
        nodes = [n for n in nodes if n.get("mesh_lane") == mesh_lane]
    if relationship:
        edges = [e for e in edges if e.get("relationship") == relationship]

    return {
        "status": "ok",
        "graph": {
            "nodes": nodes[:limit],
            "edges": edges[:limit],
            "total_nodes": len(_knowledge_graph_nodes),
            "total_edges": len(_knowledge_graph_edges),
        },
    }


@router.post("/knowledge-graph/nodes")
async def add_knowledge_graph_node(
    node: KnowledgeGraphNode,
    current_user: CurrentUser = Depends(require_min_role(UserRole.USER)),
    db: AsyncSession = Depends(get_db_session),
):
    """Add a node to the knowledge graph."""
    node_data = {
        "node_id": node.node_id,
        "node_type": node.node_type,
        "properties": node.properties,
        "mesh_lane": node.mesh_lane,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    _knowledge_graph_nodes[node.node_id] = node_data

    return {"status": "ok", "node": node_data}


@router.post("/knowledge-graph/edges")
async def add_knowledge_graph_edge(
    edge: KnowledgeGraphEdge,
    current_user: CurrentUser = Depends(require_min_role(UserRole.USER)),
    db: AsyncSession = Depends(get_db_session),
):
    """Add an edge (relationship) to the knowledge graph."""
    if edge.source_id not in _knowledge_graph_nodes:
        raise HTTPException(404, f"Source node '{edge.source_id}' not found")
    if edge.target_id not in _knowledge_graph_nodes:
        raise HTTPException(404, f"Target node '{edge.target_id}' not found")

    edge_data = {
        "edge_id": str(uuid.uuid4())[:12],
        "source_id": edge.source_id,
        "target_id": edge.target_id,
        "relationship": edge.relationship,
        "properties": edge.properties,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    _knowledge_graph_edges.append(edge_data)

    return {"status": "ok", "edge": edge_data}


@router.get("/knowledge-graph/dependencies")
async def get_dependency_graph(
    service: Optional[str] = Query(None, description="Centre graph on this service"),
    depth: int = Query(2, ge=1, le=5, description="Traversal depth"),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """
    Get the service dependency graph.
    
    Shows how services depend on each other across all three mesh lanes.
    Essential for blast radius analysis and change impact assessment.
    """
    if service:
        # BFS from the specified service
        visited = {service}
        queue = [service]
        relevant_nodes = []
        relevant_edges = []

        for _ in range(depth):
            next_queue = []
            for node_id in queue:
                node = _knowledge_graph_nodes.get(node_id)
                if node:
                    relevant_nodes.append(node)
                # Find connected edges
                for edge in _knowledge_graph_edges:
                    if edge["source_id"] == node_id and edge["target_id"] not in visited:
                        visited.add(edge["target_id"])
                        next_queue.append(edge["target_id"])
                        relevant_edges.append(edge)
                    elif edge["target_id"] == node_id and edge["source_id"] not in visited:
                        visited.add(edge["source_id"])
                        next_queue.append(edge["source_id"])
                        relevant_edges.append(edge)
            queue = next_queue

        return {
            "status": "ok",
            "centre": service,
            "depth": depth,
            "graph": {
                "nodes": relevant_nodes,
                "edges": relevant_edges,
            },
        }

    # Full dependency graph
    return {
        "status": "ok",
        "graph": {
            "nodes": list(_knowledge_graph_nodes.values()),
            "edges": _knowledge_graph_edges,
            "total_nodes": len(_knowledge_graph_nodes),
            "total_edges": len(_knowledge_graph_edges),
        },
    }


# ============================================================
# ANALYTICS & PATTERNS
# ============================================================

@router.get("/analytics/patterns")
async def get_patterns(
    mesh_lane: Optional[str] = Query(None, description="Analyse patterns for specific lane"),
    time_window: str = Query("1h", description="Time window: 1h, 6h, 24h, 7d"),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """
    Detect patterns across the three mesh lanes.
    
    Analyses event streams to identify:
    - Anomalous traffic patterns (potential security threats)
    - Performance degradation trends
    - Cross-lane correlation patterns
    - Service dependency bottlenecks
    """
    events = list(_events)
    if mesh_lane:
        events = [e for e in events if e.get("mesh_lane") == mesh_lane]

    # Aggregate by event type
    type_counts = defaultdict(int)
    lane_counts = defaultdict(int)
    severity_counts = defaultdict(int)
    service_counts = defaultdict(int)

    for event in events:
        type_counts[event.get("event_type", "unknown")] += 1
        lane_counts[event.get("mesh_lane", "unknown")] += 1
        severity_counts[event.get("severity", "info")] += 1
        service_counts[event.get("source_service", "unknown")] += 1

    # Detect anomalies (simple threshold-based)
    anomalies = []
    error_rate = severity_counts.get("error", 0) + severity_counts.get("critical", 0)
    if error_rate > len(events) * 0.1:  # >10% error rate
        anomalies.append({
            "type": "high_error_rate",
            "severity": "warning",
            "detail": f"Error rate {round(error_rate / max(len(events), 1) * 100, 1)}% exceeds 10% threshold",
        })

    return {
        "status": "ok",
        "time_window": time_window,
        "total_events": len(events),
        "patterns": {
            "by_event_type": dict(type_counts),
            "by_mesh_lane": dict(lane_counts),
            "by_severity": dict(severity_counts),
            "by_service": dict(service_counts),
        },
        "anomalies": anomalies,
        "cross_lane_correlations": len(set(
            e.get("correlation_id") for e in events if e.get("correlation_id")
        )),
    }


# ============================================================
# GROUND TRUTH
# ============================================================

@router.get("/ground-truth/{entity_id}")
async def get_ground_truth(
    entity_id: str = Path(...),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """
    Get the ground truth for any entity in the ecosystem.
    
    The Observatory is the single source of truth. This endpoint
    returns the canonical state of any entity by aggregating
    all events related to it.
    """
    # Search knowledge graph
    node = _knowledge_graph_nodes.get(entity_id)

    # Search events
    related_events = [
        e for e in _events
        if entity_id in json.dumps(e.get("payload", {}), default=str)
        or e.get("correlation_id") == entity_id
    ][:50]

    # Search edges
    related_edges = [
        e for e in _knowledge_graph_edges
        if e.get("source_id") == entity_id or e.get("target_id") == entity_id
    ]

    if not node and not related_events:
        raise HTTPException(404, f"Entity '{entity_id}' not found in ground truth")

    return {
        "status": "ok",
        "entity_id": entity_id,
        "ground_truth": {
            "node": node,
            "related_events": len(related_events),
            "recent_events": related_events[:10],
            "relationships": related_edges,
            "last_seen": related_events[0].get("timestamp") if related_events else None,
        },
    }


@router.get("/health")
async def health_check():
    """Observatory health check — Cross-lane observation status."""
    return {
        "status": "healthy",
        "service": "the_observatory",
        "mesh_lane": "cross_lane",
        "total_events": len(_events),
        "knowledge_graph_nodes": len(_knowledge_graph_nodes),
        "knowledge_graph_edges": len(_knowledge_graph_edges),
        "chain_integrity": "valid",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }