# routers/nexus.py — The Nexus — Swarm Intelligence AI Data Transfer Hub (ACO Routing)
# THREE-LANE MESH: LANE 1 — AI AGENT COMMUNICATION
#
# The Nexus is the AI lane. All AI agent traffic flows through here.
# Uses Ant Colony Optimisation (ACO) for intelligent message routing
# between AI agents (Cornelius, Norman, The Dr, Guardian, etc.)
#
# Architecture:
#   AI Agent → The Nexus → Pheromone Trail → Target Agent
#   The Nexus maintains a topology map of all registered agents
#   and uses pheromone reinforcement to optimise routing paths.

from typing import Optional, Dict, Any, List
from datetime import datetime, timezone
from collections import defaultdict
import uuid
import math
import random

from fastapi import APIRouter, Depends, HTTPException, Query, Path
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user, require_min_role, CurrentUser, UserRole
from database import get_db_session

router = APIRouter(prefix="/api/v1/nexus", tags=['The Nexus — AI Swarm Intelligence'])


# ============================================================
# LANE 1: AI AGENT COMMUNICATION HUB
# ============================================================
# Every AI agent in the Trancendos ecosystem communicates through
# The Nexus. This provides:
#   1. Centralised monitoring of all AI-to-AI traffic
#   2. Pheromone-based routing optimisation (ACO algorithm)
#   3. Agent registration and discovery
#   4. Broadcast messaging for swarm coordination
#   5. Topology awareness for The Observatory
# ============================================================


# In-memory state (production: persist to DB + Kernel Event Bus)
_registered_agents: Dict[str, Dict[str, Any]] = {}
_pheromone_trails: Dict[str, Dict[str, float]] = defaultdict(lambda: defaultdict(float))
_route_history: List[Dict[str, Any]] = []
_broadcast_log: List[Dict[str, Any]] = []


# ============================================================
# SCHEMAS
# ============================================================

class RouteRequest(BaseModel):
    """Request to route a message between AI agents."""
    source_agent: str = Field(..., description="Source agent ID (e.g., 'cornelius', 'norman')")
    target_agent: str = Field(..., description="Target agent ID")
    payload: Dict[str, Any] = Field(default_factory=dict, description="Message payload")
    priority: str = Field("normal", description="Priority: critical, high, normal, low")
    require_ack: bool = Field(True, description="Require acknowledgement from target")


class AgentRegistration(BaseModel):
    """Register an AI agent with The Nexus."""
    agent_id: str = Field(..., description="Unique agent identifier")
    agent_type: str = Field(..., description="Agent type: pillar_ai, utility_ai, guardian")
    capabilities: List[str] = Field(default_factory=list, description="Agent capabilities")
    lane_permissions: List[str] = Field(
        default=["ai_nexus"],
        description="Mesh lanes this agent can access",
    )
    endpoint: Optional[str] = Field(None, description="Agent's API endpoint")


class PheromoneReinforcement(BaseModel):
    """Reinforce a pheromone trail between agents."""
    source: str
    target: str
    strength: float = Field(1.0, ge=0.0, le=10.0, description="Reinforcement strength")
    reason: str = Field("successful_communication", description="Why this trail is reinforced")


class BroadcastRequest(BaseModel):
    """Broadcast a message to all registered agents."""
    message_type: str = Field(..., description="Message type: alert, coordination, status_request")
    payload: Dict[str, Any] = Field(default_factory=dict)
    target_types: List[str] = Field(
        default=[],
        description="Filter by agent type (empty = all agents)",
    )
    priority: str = Field("normal")


# ============================================================
# ACO ROUTING ENGINE
# ============================================================

def _calculate_route_probability(source: str, target: str, candidates: List[str]) -> Dict[str, float]:
    """
    Ant Colony Optimisation routing probability.
    
    P(next_hop) = (pheromone^alpha * heuristic^beta) / sum(all candidates)
    
    Alpha controls pheromone influence (exploitation)
    Beta controls heuristic influence (exploration)
    """
    ALPHA = 1.0   # Pheromone weight
    BETA = 2.0    # Heuristic weight (favour direct routes)
    EVAPORATION = 0.1  # Pheromone decay rate

    probabilities = {}
    total = 0.0

    for candidate in candidates:
        pheromone = max(_pheromone_trails[source].get(candidate, 0.1), 0.01)
        # Heuristic: direct connection to target gets higher score
        heuristic = 10.0 if candidate == target else 1.0

        score = (pheromone ** ALPHA) * (heuristic ** BETA)
        probabilities[candidate] = score
        total += score

    # Normalise
    if total > 0:
        for k in probabilities:
            probabilities[k] /= total

    return probabilities


def _select_route(source: str, target: str) -> List[str]:
    """Select optimal route from source to target using ACO."""
    if target in _registered_agents:
        # Direct route available
        return [source, target]

    # Multi-hop: find path through registered agents
    visited = {source}
    path = [source]
    current = source
    max_hops = 5

    for _ in range(max_hops):
        candidates = [
            aid for aid in _registered_agents
            if aid not in visited and aid != current
        ]
        if not candidates:
            break

        if target in candidates:
            path.append(target)
            return path

        probs = _calculate_route_probability(current, target, candidates)
        if not probs:
            break

        # Weighted random selection (ACO probabilistic)
        items = list(probs.items())
        weights = [p for _, p in items]
        selected = random.choices([a for a, _ in items], weights=weights, k=1)[0]

        path.append(selected)
        visited.add(selected)
        current = selected

    path.append(target)
    return path


# ============================================================
# ENDPOINTS
# ============================================================

@router.post("/route")
async def route_message(
    request: RouteRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """
    Route a message between AI agents through The Nexus.
    
    Uses Ant Colony Optimisation to find the optimal path.
    All AI-to-AI communication MUST flow through this endpoint
    to maintain Lane 1 isolation in the Three-Lane Mesh.
    """
    route_id = str(uuid.uuid4())[:12]

    # Validate source agent is registered
    if request.source_agent not in _registered_agents:
        raise HTTPException(404, f"Source agent '{request.source_agent}' not registered with The Nexus")

    # Calculate optimal route
    route_path = _select_route(request.source_agent, request.target_agent)

    # Reinforce pheromone trail on successful routing
    for i in range(len(route_path) - 1):
        _pheromone_trails[route_path[i]][route_path[i + 1]] += 1.0

    route_record = {
        "route_id": route_id,
        "source": request.source_agent,
        "target": request.target_agent,
        "path": route_path,
        "hops": len(route_path) - 1,
        "priority": request.priority,
        "payload_size": len(str(request.payload)),
        "status": "delivered" if request.target_agent in _registered_agents else "queued",
        "mesh_lane": "ai_nexus",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    _route_history.append(route_record)

    # Trim history
    if len(_route_history) > 1000:
        _route_history[:] = _route_history[-500:]

    return {
        "status": "ok",
        "route_id": route_id,
        "path": route_path,
        "hops": len(route_path) - 1,
        "delivery_status": route_record["status"],
        "pheromone_reinforced": True,
        "mesh_lane": "ai_nexus",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/routes/optimal")
async def get_optimal_routes(
    source: str = Query(..., description="Source agent ID"),
    target: str = Query(..., description="Target agent ID"),
    alternatives: int = Query(3, ge=1, le=10, description="Number of alternative routes"),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Get optimal routes between two AI agents based on pheromone trails."""
    routes = []
    for i in range(alternatives):
        path = _select_route(source, target)
        # Calculate path pheromone strength
        strength = 0.0
        for j in range(len(path) - 1):
            strength += _pheromone_trails[path[j]].get(path[j + 1], 0.0)

        routes.append({
            "rank": i + 1,
            "path": path,
            "hops": len(path) - 1,
            "pheromone_strength": round(strength, 3),
            "estimated_latency_ms": len(path) * 5,  # ~5ms per hop
        })

    # Sort by pheromone strength (strongest first)
    routes.sort(key=lambda r: r["pheromone_strength"], reverse=True)
    for i, r in enumerate(routes):
        r["rank"] = i + 1

    return {
        "status": "ok",
        "source": source,
        "target": target,
        "routes": routes,
        "mesh_lane": "ai_nexus",
    }


@router.get("/pheromone-trails")
async def get_pheromone_trails(
    agent_id: Optional[str] = Query(None, description="Filter by agent ID"),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Get current pheromone trail map for the AI agent network."""
    if agent_id:
        trails = {
            agent_id: dict(_pheromone_trails.get(agent_id, {}))
        }
    else:
        trails = {k: dict(v) for k, v in _pheromone_trails.items()}

    return {
        "status": "ok",
        "trails": trails,
        "total_trails": sum(len(v) for v in _pheromone_trails.values()),
        "strongest_trail": max(
            ((s, t, strength)
             for s, targets in _pheromone_trails.items()
             for t, strength in targets.items()),
            key=lambda x: x[2],
            default=None,
        ),
        "mesh_lane": "ai_nexus",
    }


@router.post("/pheromone-trails/reinforce")
async def reinforce_pheromone_trail(
    request: PheromoneReinforcement,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Manually reinforce a pheromone trail between agents."""
    _pheromone_trails[request.source][request.target] += request.strength

    return {
        "status": "ok",
        "source": request.source,
        "target": request.target,
        "new_strength": round(_pheromone_trails[request.source][request.target], 3),
        "reason": request.reason,
        "mesh_lane": "ai_nexus",
    }


@router.get("/agents/registered")
async def list_registered_agents(
    agent_type: Optional[str] = Query(None, description="Filter by agent type"),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """List all AI agents registered with The Nexus."""
    agents = list(_registered_agents.values())
    if agent_type:
        agents = [a for a in agents if a.get("agent_type") == agent_type]

    return {
        "status": "ok",
        "total": len(agents),
        "agents": agents,
        "mesh_lane": "ai_nexus",
    }


@router.post("/agents/register")
async def register_agent(
    request: AgentRegistration,
    current_user: CurrentUser = Depends(require_min_role(UserRole.USER)),
    db: AsyncSession = Depends(get_db_session),
):
    """
    Register an AI agent with The Nexus for Lane 1 communication.
    
    All AI agents MUST register before they can send or receive
    messages through the AI lane.
    """
    agent_data = {
        "agent_id": request.agent_id,
        "agent_type": request.agent_type,
        "capabilities": request.capabilities,
        "lane_permissions": request.lane_permissions,
        "endpoint": request.endpoint,
        "registered_at": datetime.now(timezone.utc).isoformat(),
        "status": "active",
        "messages_routed": 0,
        "mesh_lane": "ai_nexus",
    }
    _registered_agents[request.agent_id] = agent_data

    # Initialise pheromone trails to other agents
    for existing_id in _registered_agents:
        if existing_id != request.agent_id:
            _pheromone_trails[request.agent_id][existing_id] = 0.1
            _pheromone_trails[existing_id][request.agent_id] = 0.1

    return {
        "status": "ok",
        "agent": agent_data,
        "connected_agents": len(_registered_agents) - 1,
        "mesh_lane": "ai_nexus",
    }


@router.get("/topology")
async def get_topology(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """
    Get the AI agent network topology.
    
    Shows all registered agents and their pheromone connections.
    Used by The Observatory for network visualisation.
    """
    nodes = [
        {
            "id": aid,
            "type": data.get("agent_type"),
            "status": data.get("status"),
            "capabilities": data.get("capabilities", []),
        }
        for aid, data in _registered_agents.items()
    ]

    edges = []
    for source, targets in _pheromone_trails.items():
        for target, strength in targets.items():
            if strength > 0:
                edges.append({
                    "source": source,
                    "target": target,
                    "weight": round(strength, 3),
                })

    return {
        "status": "ok",
        "topology": {
            "nodes": nodes,
            "edges": edges,
            "node_count": len(nodes),
            "edge_count": len(edges),
        },
        "mesh_lane": "ai_nexus",
    }


@router.get("/metrics")
async def get_metrics(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Get Nexus performance metrics for The Observatory."""
    total_routes = len(_route_history)
    delivered = sum(1 for r in _route_history if r.get("status") == "delivered")
    avg_hops = (
        sum(r.get("hops", 0) for r in _route_history) / max(total_routes, 1)
    )

    return {
        "status": "ok",
        "metrics": {
            "registered_agents": len(_registered_agents),
            "total_routes": total_routes,
            "delivered": delivered,
            "delivery_rate": round(delivered / max(total_routes, 1) * 100, 1),
            "average_hops": round(avg_hops, 2),
            "active_pheromone_trails": sum(len(v) for v in _pheromone_trails.values()),
            "total_broadcasts": len(_broadcast_log),
        },
        "mesh_lane": "ai_nexus",
    }


@router.post("/broadcast")
async def broadcast_message(
    request: BroadcastRequest,
    current_user: CurrentUser = Depends(require_min_role(UserRole.USER)),
    db: AsyncSession = Depends(get_db_session),
):
    """
    Broadcast a message to all registered AI agents (or filtered subset).
    
    Used for swarm coordination, emergency alerts, and status requests.
    """
    broadcast_id = str(uuid.uuid4())[:12]

    # Filter target agents
    targets = list(_registered_agents.values())
    if request.target_types:
        targets = [a for a in targets if a.get("agent_type") in request.target_types]

    broadcast_record = {
        "broadcast_id": broadcast_id,
        "message_type": request.message_type,
        "priority": request.priority,
        "targets_reached": len(targets),
        "target_agent_ids": [a["agent_id"] for a in targets],
        "payload_size": len(str(request.payload)),
        "mesh_lane": "ai_nexus",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    _broadcast_log.append(broadcast_record)

    return {
        "status": "ok",
        "broadcast_id": broadcast_id,
        "targets_reached": len(targets),
        "target_agents": [a["agent_id"] for a in targets],
        "mesh_lane": "ai_nexus",
    }


@router.get("/health")
async def health_check():
    """Nexus health check — Lane 1 AI communication status."""
    return {
        "status": "healthy",
        "service": "the_nexus",
        "mesh_lane": "ai_nexus",
        "registered_agents": len(_registered_agents),
        "active_trails": sum(len(v) for v in _pheromone_trails.values()),
        "uptime_routes": len(_route_history),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }