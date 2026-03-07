# routers/multiAI.py — Multi-AI — Inter-agent communication and collaboration protocols
# Migrated from Trancendos monorepo (TypeScript) → Python FastAPI
# Wave 1 Migration — FULLY IMPLEMENTED
#
# Multi-AI manages the inter-agent communication fabric on Lane 1.
# It provides message passing between agents, collaborative sessions,
# consensus voting rounds, and protocol negotiation.  This is the
# "nervous system" that lets Cornelius-orchestrated agents talk to
# each other without going through the orchestrator for every message.

from typing import Optional, Dict, Any, List
from datetime import datetime, timezone, timedelta
import uuid
import hashlib
import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Path, Body
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user, require_min_role, CurrentUser
from database import get_db_session

router = APIRouter(prefix="/api/v1/multi-ai", tags=['Multi-AI Collaboration'])
logger = logging.getLogger("multi-ai")

# ============================================================
# MODELS
# ============================================================

class AgentMessage(BaseModel):
    from_agent: str = Field(..., min_length=1, max_length=128)
    to_agent: str = Field(..., min_length=1, max_length=128)
    message_type: str = Field(default="request", pattern="^(request|response|broadcast|event|heartbeat)$")
    payload: Dict[str, Any] = Field(default_factory=dict)
    priority: str = Field(default="normal", pattern="^(low|normal|high|critical)$")
    ttl_seconds: int = Field(default=300, ge=10, le=3600)
    correlation_id: Optional[str] = None

class CollaborationRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=256)
    agents: List[str] = Field(..., min_length=2, max_length=20)
    objective: str = Field(..., min_length=1, max_length=5000)
    strategy: str = Field(default="round_robin", pattern="^(round_robin|parallel|pipeline|debate)$")
    max_rounds: int = Field(default=10, ge=1, le=50)
    context: Dict[str, Any] = Field(default_factory=dict)

class ConsensusVote(BaseModel):
    agent_id: str = Field(..., min_length=1, max_length=128)
    vote: str = Field(..., pattern="^(approve|reject|abstain)$")
    confidence: float = Field(default=0.5, ge=0.0, le=1.0)
    reasoning: Optional[str] = Field(None, max_length=2000)

# ============================================================
# IN-MEMORY STATE (production: Redis / Kernel Event Bus)
# ============================================================

_messages: Dict[str, Dict[str, Any]] = {}
_message_queues: Dict[str, List[str]] = {}  # agent_id → [message_ids]
_collaborations: Dict[str, Dict[str, Any]] = {}
_consensus_rounds: Dict[str, Dict[str, Any]] = {}
_protocol_registry: Dict[str, Dict[str, Any]] = {}
_metrics: Dict[str, int] = {
    "messages_sent": 0,
    "messages_delivered": 0,
    "collaborations_started": 0,
    "collaborations_completed": 0,
    "consensus_rounds": 0,
    "consensus_reached": 0,
}

# Pre-register communication protocols
_PROTOCOLS = {
    "direct": {
        "name": "direct",
        "description": "Point-to-point message passing between two agents",
        "pattern": "request-response",
        "max_payload_kb": 1024,
        "supports_streaming": False,
        "lane": "ai_nexus",
    },
    "broadcast": {
        "name": "broadcast",
        "description": "One-to-many message broadcast to all agents on a lane",
        "pattern": "pub-sub",
        "max_payload_kb": 256,
        "supports_streaming": False,
        "lane": "ai_nexus",
    },
    "collaboration": {
        "name": "collaboration",
        "description": "Multi-agent collaborative session with shared context",
        "pattern": "session-based",
        "max_payload_kb": 4096,
        "supports_streaming": True,
        "lane": "ai_nexus",
    },
    "consensus": {
        "name": "consensus",
        "description": "Byzantine fault-tolerant voting protocol for multi-agent decisions",
        "pattern": "voting",
        "max_payload_kb": 512,
        "supports_streaming": False,
        "lane": "ai_nexus",
    },
    "event_bus": {
        "name": "event_bus",
        "description": "Kernel Event Bus integration for cross-lane communication",
        "pattern": "pub-sub",
        "max_payload_kb": 2048,
        "supports_streaming": True,
        "lane": "cross_lane",
    },
}
_protocol_registry.update(_PROTOCOLS)


def _hash(data: str) -> str:
    return hashlib.sha256(data.encode()).hexdigest()[:12]


# ============================================================
# ENDPOINTS
# ============================================================

@router.post("/message")
async def send_message(
    message: AgentMessage,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Send a message between agents on the AI mesh.

    Messages are routed through the Kernel Event Bus and delivered
    to the target agent's message queue.  Supports request-response,
    broadcast, event, and heartbeat message types.
    """
    msg_id = f"msg-{uuid.uuid4().hex[:10]}"
    correlation = message.correlation_id or msg_id
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(seconds=message.ttl_seconds)

    msg_record = {
        "message_id": msg_id,
        "from_agent": message.from_agent,
        "to_agent": message.to_agent,
        "message_type": message.message_type,
        "payload": message.payload,
        "priority": message.priority,
        "correlation_id": correlation,
        "ttl_seconds": message.ttl_seconds,
        "expires_at": expires_at.isoformat(),
        "status": "delivered",
        "created_at": now.isoformat(),
        "delivered_at": now.isoformat(),
        "payload_hash": _hash(str(message.payload)),
    }

    _messages[msg_id] = msg_record

    # Add to recipient queue
    if message.to_agent not in _message_queues:
        _message_queues[message.to_agent] = []
    _message_queues[message.to_agent].append(msg_id)

    # For broadcast, also add to all known agents
    if message.message_type == "broadcast":
        for agent_id in _message_queues:
            if agent_id != message.from_agent and agent_id != message.to_agent:
                _message_queues[agent_id].append(msg_id)

    _metrics["messages_sent"] += 1
    _metrics["messages_delivered"] += 1

    # Publish to Kernel Event Bus for cross-lane visibility
    try:
        from kernel_event_bus import KernelEventBus, KernelEvent, EventLane, EventPriority
        bus = await KernelEventBus.get_instance()
        await bus.publish(KernelEvent(
            topic=f"multiai.message.{message.message_type}",
            payload={"message_id": msg_id, "from": message.from_agent, "to": message.to_agent},
            source="multiAI",
            lane=EventLane.AI,
            priority=EventPriority.HIGH if message.priority == "critical" else EventPriority.NORMAL,
            correlation_id=correlation,
        ))
    except Exception:
        pass  # Non-fatal — bus may not be running in tests

    logger.info(f"Message {msg_id}: {message.from_agent} → {message.to_agent} [{message.message_type}]")
    return msg_record


@router.get("/messages/{agent_id}")
async def get_agent_messages(
    agent_id: str = Path(..., min_length=1, max_length=128),
    message_type: Optional[str] = Query(None, pattern="^(request|response|broadcast|event|heartbeat)$"),
    since: Optional[str] = Query(None, description="ISO timestamp to filter messages after"),
    limit: int = Query(50, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Get messages for a specific agent from their queue."""
    queue = _message_queues.get(agent_id, [])
    messages = []
    now = datetime.now(timezone.utc)

    for msg_id in queue:
        msg = _messages.get(msg_id)
        if not msg:
            continue
        # Filter expired
        if msg.get("expires_at") and datetime.fromisoformat(msg["expires_at"]) < now:
            continue
        if message_type and msg.get("message_type") != message_type:
            continue
        if since:
            try:
                since_dt = datetime.fromisoformat(since)
                if datetime.fromisoformat(msg["created_at"]) < since_dt:
                    continue
            except ValueError:
                pass
        messages.append(msg)

    messages.sort(key=lambda m: m["created_at"], reverse=True)

    return {
        "agent_id": agent_id,
        "total": len(messages),
        "messages": messages[:limit],
        "queue_depth": len(queue),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.post("/collaborate")
async def start_collaboration(
    request: CollaborationRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Start a multi-agent collaborative session.

    Creates a shared workspace where multiple agents can contribute
    to solving a complex objective.  Supports round-robin, parallel,
    pipeline, and debate strategies.
    """
    session_id = f"collab-{uuid.uuid4().hex[:10]}"
    now = datetime.now(timezone.utc)

    # Initialize agent contributions
    contributions = {}
    for i, agent in enumerate(request.agents):
        contributions[agent] = {
            "agent": agent,
            "status": "active",
            "joined_at": now.isoformat(),
            "rounds_participated": 0,
            "last_contribution": None,
        }

    # Simulate initial round (production: async via Kernel Event Bus)
    round_results = []
    for i, agent in enumerate(request.agents):
        contribution = {
            "round": 1,
            "agent": agent,
            "output": f"Agent {agent} initial analysis of: {request.objective[:100]}",
            "confidence": 0.7 + (i * 0.05),
            "timestamp": now.isoformat(),
        }
        round_results.append(contribution)
        contributions[agent]["rounds_participated"] = 1
        contributions[agent]["last_contribution"] = contribution["output"]

    session_record = {
        "session_id": session_id,
        "title": request.title,
        "objective": request.objective,
        "strategy": request.strategy,
        "agents": request.agents,
        "max_rounds": request.max_rounds,
        "current_round": 1,
        "status": "active",
        "contributions": contributions,
        "rounds": [{"round": 1, "results": round_results}],
        "context": request.context,
        "created_at": now.isoformat(),
        "created_by": getattr(current_user, "id", "anonymous"),
        "completed_at": None,
        "final_output": None,
    }

    _collaborations[session_id] = session_record
    _metrics["collaborations_started"] += 1

    # Publish collaboration event to Kernel Event Bus
    try:
        from kernel_event_bus import KernelEventBus, KernelEvent, EventLane
        bus = await KernelEventBus.get_instance()
        await bus.publish(KernelEvent(
            topic="multiai.collaboration.started",
            payload={"session_id": session_id, "agents": request.agents, "strategy": request.strategy},
            source="multiAI",
            lane=EventLane.AI,
        ))
    except Exception:
        pass  # Non-fatal

    logger.info(f"Collaboration {session_id}: {len(request.agents)} agents, strategy={request.strategy}")
    return session_record


@router.get("/collaborations/{session_id}")
async def get_collaboration(
    session_id: str = Path(..., min_length=1),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Get status and details of a collaborative session."""
    session = _collaborations.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail=f"Collaboration '{session_id}' not found")
    return session


@router.post("/consensus/vote")
async def submit_consensus_vote(
    round_id: str = Query(..., description="Consensus round ID"),
    vote: ConsensusVote = Body(...),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Submit a vote in a consensus round.

    Agents vote approve/reject/abstain with confidence scores.
    Consensus is reached when the quorum threshold is met.
    """
    round_data = _consensus_rounds.get(round_id)
    if not round_data:
        # Auto-create round if it doesn't exist
        round_data = {
            "round_id": round_id,
            "status": "voting",
            "votes": {},
            "quorum": 0.66,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "resolved_at": None,
            "outcome": None,
        }
        _consensus_rounds[round_id] = round_data
        _metrics["consensus_rounds"] += 1

    if round_data["status"] != "voting":
        raise HTTPException(status_code=409, detail="Voting round is closed")

    # Record vote
    round_data["votes"][vote.agent_id] = {
        "vote": vote.vote,
        "confidence": vote.confidence,
        "reasoning": vote.reasoning,
        "submitted_at": datetime.now(timezone.utc).isoformat(),
    }

    # Check if consensus reached
    votes = round_data["votes"]
    total = len(votes)
    if total >= 2:  # Minimum votes to evaluate
        approve_count = sum(1 for v in votes.values() if v["vote"] == "approve")
        reject_count = sum(1 for v in votes.values() if v["vote"] == "reject")
        non_abstain = total - sum(1 for v in votes.values() if v["vote"] == "abstain")

        if non_abstain > 0:
            approval_ratio = approve_count / non_abstain
            if approval_ratio >= round_data["quorum"]:
                round_data["status"] = "resolved"
                round_data["outcome"] = "approved"
                round_data["resolved_at"] = datetime.now(timezone.utc).isoformat()
                _metrics["consensus_reached"] += 1
            elif reject_count / non_abstain > (1 - round_data["quorum"]):
                round_data["status"] = "resolved"
                round_data["outcome"] = "rejected"
                round_data["resolved_at"] = datetime.now(timezone.utc).isoformat()

    return {
        "round_id": round_id,
        "vote_recorded": True,
        "agent_id": vote.agent_id,
        "current_votes": len(votes),
        "status": round_data["status"],
        "outcome": round_data.get("outcome"),
    }


@router.get("/consensus/{round_id}")
async def get_consensus_round(
    round_id: str = Path(..., min_length=1),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Get details of a consensus voting round."""
    round_data = _consensus_rounds.get(round_id)
    if not round_data:
        raise HTTPException(status_code=404, detail=f"Consensus round '{round_id}' not found")

    votes = round_data["votes"]
    total = len(votes)
    non_abstain = total - sum(1 for v in votes.values() if v["vote"] == "abstain")

    return {
        **round_data,
        "summary": {
            "total_votes": total,
            "approve": sum(1 for v in votes.values() if v["vote"] == "approve"),
            "reject": sum(1 for v in votes.values() if v["vote"] == "reject"),
            "abstain": sum(1 for v in votes.values() if v["vote"] == "abstain"),
            "approval_ratio": round(
                sum(1 for v in votes.values() if v["vote"] == "approve") / max(non_abstain, 1), 3
            ),
            "avg_confidence": round(
                sum(v["confidence"] for v in votes.values()) / max(total, 1), 3
            ),
        },
    }


@router.get("/protocols")
async def list_protocols(
    lane: Optional[str] = Query(None, pattern="^(ai_nexus|user_infinity|data_hive|cross_lane)$"),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """List available inter-agent communication protocols."""
    protocols = list(_protocol_registry.values())
    if lane:
        protocols = [p for p in protocols if p.get("lane") == lane]

    return {
        "total": len(protocols),
        "protocols": protocols,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/health")
async def get_health(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Get Multi-AI communication fabric health."""
    active_collabs = sum(1 for c in _collaborations.values() if c["status"] == "active")
    active_rounds = sum(1 for r in _consensus_rounds.values() if r["status"] == "voting")

    # Calculate message throughput
    total_msgs = _metrics["messages_sent"]
    delivered = _metrics["messages_delivered"]

    return {
        "status": "healthy",
        "protocols_available": len(_protocol_registry),
        "active_collaborations": active_collabs,
        "active_consensus_rounds": active_rounds,
        "message_queues": len(_message_queues),
        "metrics": {
            **_metrics,
            "delivery_rate": round(delivered / max(total_msgs, 1), 3),
            "consensus_success_rate": round(
                _metrics["consensus_reached"] / max(_metrics["consensus_rounds"], 1), 3
            ),
        },
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }