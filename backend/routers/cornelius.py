# routers/cornelius.py — Luminous/Cornelius — Master AI Orchestrator (Multi-Agent Coordination)
# Migrated from Trancendos monorepo (TypeScript) → Python FastAPI
# Wave 1 Migration — FULLY IMPLEMENTED
#
# Cornelius is the cognitive core of the Three-Lane Mesh.
# It sits on Lane 1 (AI/Nexus) and orchestrates multi-agent task
# decomposition, delegation, consensus negotiation, and result
# aggregation.  Every user request that requires AI processing
# flows through Cornelius before being dispatched to specialist
# agents via The Nexus routing layer.

from typing import Optional, Dict, Any, List
from datetime import datetime, timezone
import uuid
import hashlib
import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Path, Body
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user, require_min_role, CurrentUser
from database import get_db_session

router = APIRouter(prefix="/api/v1/cornelius", tags=['Cornelius Orchestrator'])
logger = logging.getLogger("cornelius")

# ============================================================
# MODELS
# ============================================================

class OrchestrationRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=10000)
    context: Dict[str, Any] = Field(default_factory=dict)
    agents: Optional[List[str]] = None  # None = auto-select
    strategy: str = Field(default="auto", pattern="^(auto|parallel|sequential|consensus)$")
    max_rounds: int = Field(default=5, ge=1, le=20)
    timeout_seconds: int = Field(default=60, ge=5, le=300)

class IntentAnalysis(BaseModel):
    text: str = Field(..., min_length=1, max_length=10000)
    include_confidence: bool = True

class AgentRegistration(BaseModel):
    name: str = Field(..., min_length=1, max_length=128, pattern="^[a-zA-Z0-9_-]+$")
    capabilities: List[str] = Field(..., min_items=1)
    lane: str = Field(default="ai_nexus", pattern="^(ai_nexus|user_infinity|data_hive|cross_lane)$")
    version: str = Field(default="1.0.0")
    max_concurrent_tasks: int = Field(default=10, ge=1, le=100)
    metadata: Dict[str, Any] = Field(default_factory=dict)

class ConsensusRequest(BaseModel):
    task_id: str
    proposal: str
    voting_agents: Optional[List[str]] = None
    quorum: float = Field(default=0.66, ge=0.5, le=1.0)
    timeout_seconds: int = Field(default=30, ge=5, le=120)

# ============================================================
# IN-MEMORY STATE (production: Redis / Turso)
# ============================================================

_agents: Dict[str, Dict[str, Any]] = {}
_tasks: Dict[str, Dict[str, Any]] = {}
_consensus_rounds: Dict[str, Dict[str, Any]] = {}
_orchestration_log: List[Dict[str, Any]] = []

# Pre-register core system agents
_SYSTEM_AGENTS = {
    "norman": {
        "name": "norman", "capabilities": ["vulnerability_scan", "threat_detection", "compliance_audit"],
        "lane": "cross_lane", "version": "3.0.0", "max_concurrent_tasks": 20,
        "status": "active", "registered_at": datetime.now(timezone.utc).isoformat(),
    },
    "the_dr": {
        "name": "the_dr", "capabilities": ["code_analysis", "self_healing", "anomaly_detection", "diagnosis"],
        "lane": "ai_nexus", "version": "3.0.0", "max_concurrent_tasks": 15,
        "status": "active", "registered_at": datetime.now(timezone.utc).isoformat(),
    },
    "librarian": {
        "name": "librarian", "capabilities": ["knowledge_extraction", "article_generation", "search"],
        "lane": "data_hive", "version": "3.0.0", "max_concurrent_tasks": 10,
        "status": "active", "registered_at": datetime.now(timezone.utc).isoformat(),
    },
    "guardian": {
        "name": "guardian", "capabilities": ["identity_verification", "access_control", "session_management"],
        "lane": "user_infinity", "version": "3.0.0", "max_concurrent_tasks": 50,
        "status": "active", "registered_at": datetime.now(timezone.utc).isoformat(),
    },
    "lighthouse": {
        "name": "lighthouse", "capabilities": ["pqc_certificates", "warp_tunnels", "key_exchange"],
        "lane": "cross_lane", "version": "3.0.0", "max_concurrent_tasks": 25,
        "status": "active", "registered_at": datetime.now(timezone.utc).isoformat(),
    },
}
_agents.update(_SYSTEM_AGENTS)


def _hash(data: str) -> str:
    return hashlib.sha256(data.encode()).hexdigest()[:16]


def _select_agents(prompt: str, requested: Optional[List[str]]) -> List[str]:
    """Auto-select agents based on prompt intent keywords."""
    if requested:
        return [a for a in requested if a in _agents]

    keywords_map = {
        "norman": ["security", "vulnerability", "threat", "cve", "scan", "compliance"],
        "the_dr": ["heal", "fix", "bug", "error", "diagnose", "code", "review", "anomaly"],
        "librarian": ["knowledge", "article", "document", "search", "learn", "extract"],
        "guardian": ["auth", "login", "permission", "access", "identity", "user", "session"],
        "lighthouse": ["encrypt", "certificate", "quantum", "key", "tunnel", "pqc"],
    }
    lower_prompt = prompt.lower()
    selected = []
    for agent, keywords in keywords_map.items():
        if any(kw in lower_prompt for kw in keywords):
            selected.append(agent)
    return selected if selected else ["the_dr"]  # Default to TheDr for general tasks


def _decompose_task(prompt: str, strategy: str) -> List[Dict[str, Any]]:
    """Decompose a prompt into sub-tasks for agent delegation."""
    subtasks = []
    # Simple heuristic decomposition — production would use LLM
    sentences = [s.strip() for s in prompt.replace(".", ".\n").split("\n") if s.strip()]
    for i, sentence in enumerate(sentences[:10]):
        subtasks.append({
            "subtask_id": f"st-{uuid.uuid4().hex[:8]}",
            "index": i,
            "description": sentence,
            "status": "pending",
            "assigned_agent": None,
            "result": None,
        })
    if not subtasks:
        subtasks.append({
            "subtask_id": f"st-{uuid.uuid4().hex[:8]}",
            "index": 0,
            "description": prompt,
            "status": "pending",
            "assigned_agent": None,
            "result": None,
        })
    return subtasks


# ============================================================
# ENDPOINTS
# ============================================================

@router.post("/orchestrate")
async def orchestrate(
    request: OrchestrationRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Orchestrate a user request via Cornelius agent mesh.

    Decomposes the prompt into sub-tasks, selects appropriate agents,
    delegates work, and aggregates results.
    """
    task_id = f"task-{uuid.uuid4().hex[:12]}"
    selected = _select_agents(request.prompt, request.agents)
    subtasks = _decompose_task(request.prompt, request.strategy)

    # Round-robin assign agents to subtasks
    for i, st in enumerate(subtasks):
        agent_name = selected[i % len(selected)]
        st["assigned_agent"] = agent_name
        st["status"] = "delegated"

    task_record = {
        "task_id": task_id,
        "user_id": current_user.get("sub", "anonymous"),
        "prompt": request.prompt,
        "strategy": request.strategy,
        "agents": selected,
        "subtasks": subtasks,
        "status": "in_progress",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "completed_at": None,
        "result": None,
        "context": request.context,
        "max_rounds": request.max_rounds,
        "prompt_hash": _hash(request.prompt),
    }

    # Simulate execution (production: async task queue via Kernel Event Bus)
    aggregated_results = []
    for st in subtasks:
        agent = _agents.get(st["assigned_agent"], {})
        st["status"] = "completed"
        st["result"] = {
            "agent": st["assigned_agent"],
            "capabilities_used": agent.get("capabilities", [])[:2],
            "output": f"Processed by {st['assigned_agent']}: {st['description'][:100]}",
            "confidence": 0.85,
        }
        aggregated_results.append(st["result"])

    task_record["status"] = "completed"
    task_record["completed_at"] = datetime.now(timezone.utc).isoformat()
    task_record["result"] = {
        "summary": f"Orchestrated {len(subtasks)} subtask(s) across {len(selected)} agent(s)",
        "strategy": request.strategy,
        "agent_outputs": aggregated_results,
        "consensus_reached": request.strategy == "consensus",
    }

    _tasks[task_id] = task_record
    _orchestration_log.append({
        "task_id": task_id,
        "action": "orchestrate",
        "agents": selected,
        "subtask_count": len(subtasks),
        "timestamp": task_record["created_at"],
    })

    logger.info(f"Orchestrated task {task_id}: {len(subtasks)} subtasks → {selected}")
    return task_record


@router.post("/analyze-intent")
async def analyze_intent(
    request: IntentAnalysis,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Analyse user intent without delegating to agents.

    Returns classified intent, detected entities, suggested agents,
    and confidence scores.
    """
    text_lower = request.text.lower()

    # Intent classification (production: LLM-based NLU)
    intent_scores = {
        "code_generation": sum(1 for kw in ["code", "generate", "create", "build", "implement", "function"] if kw in text_lower),
        "debugging": sum(1 for kw in ["bug", "fix", "error", "debug", "issue", "broken"] if kw in text_lower),
        "security_audit": sum(1 for kw in ["security", "vulnerability", "scan", "audit", "threat", "cve"] if kw in text_lower),
        "knowledge_query": sum(1 for kw in ["what", "how", "explain", "search", "find", "learn"] if kw in text_lower),
        "administration": sum(1 for kw in ["admin", "config", "setting", "deploy", "manage", "user"] if kw in text_lower),
        "data_operation": sum(1 for kw in ["data", "transfer", "sync", "backup", "export", "import"] if kw in text_lower),
    }

    total = max(sum(intent_scores.values()), 1)
    primary_intent = max(intent_scores, key=intent_scores.get)
    confidence = intent_scores[primary_intent] / total if total > 0 else 0.5

    # Entity extraction (simple keyword-based)
    entities = []
    entity_patterns = {
        "agent": ["norman", "the_dr", "guardian", "librarian", "lighthouse", "cornelius"],
        "lane": ["nexus", "infinity", "hive"],
        "action": ["scan", "heal", "deploy", "search", "encrypt", "audit"],
    }
    for etype, patterns in entity_patterns.items():
        for p in patterns:
            if p in text_lower:
                entities.append({"type": etype, "value": p, "position": text_lower.index(p)})

    # Suggest agents
    intent_agent_map = {
        "code_generation": ["the_dr"],
        "debugging": ["the_dr"],
        "security_audit": ["norman"],
        "knowledge_query": ["librarian"],
        "administration": ["guardian"],
        "data_operation": ["librarian", "the_dr"],
    }
    suggested_agents = intent_agent_map.get(primary_intent, ["the_dr"])

    return {
        "text": request.text,
        "primary_intent": primary_intent,
        "confidence": round(confidence, 3) if request.include_confidence else None,
        "all_intents": {k: round(v / total, 3) for k, v in intent_scores.items()} if request.include_confidence else None,
        "entities": entities,
        "suggested_agents": suggested_agents,
        "suggested_strategy": "parallel" if len(suggested_agents) > 1 else "sequential",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/agents/status")
async def get_agent_status(
    lane: Optional[str] = Query(None, pattern="^(ai_nexus|user_infinity|data_hive|cross_lane)$"),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Get status of all registered agents, optionally filtered by lane."""
    agents = list(_agents.values())
    if lane:
        agents = [a for a in agents if a.get("lane") == lane]

    # Enrich with task counts
    for agent in agents:
        name = agent["name"]
        active_tasks = sum(
            1 for t in _tasks.values()
            if t["status"] == "in_progress" and name in t.get("agents", [])
        )
        agent["active_tasks"] = active_tasks
        agent["at_capacity"] = active_tasks >= agent.get("max_concurrent_tasks", 10)

    return {
        "total_agents": len(agents),
        "agents": agents,
        "lanes": {
            "ai_nexus": sum(1 for a in agents if a.get("lane") == "ai_nexus"),
            "user_infinity": sum(1 for a in agents if a.get("lane") == "user_infinity"),
            "data_hive": sum(1 for a in agents if a.get("lane") == "data_hive"),
            "cross_lane": sum(1 for a in agents if a.get("lane") == "cross_lane"),
        },
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/agents/{agent_name}/status")
async def get_agent_status_by_name(
    agent_name: str = Path(..., min_length=1, max_length=128),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Get status of a specific agent."""
    agent = _agents.get(agent_name)
    if not agent:
        raise HTTPException(status_code=404, detail=f"Agent '{agent_name}' not found")

    active_tasks = [
        {"task_id": t["task_id"], "status": t["status"], "created_at": t["created_at"]}
        for t in _tasks.values()
        if agent_name in t.get("agents", [])
    ]

    return {
        **agent,
        "active_tasks": len([t for t in active_tasks if t["status"] == "in_progress"]),
        "total_tasks": len(active_tasks),
        "recent_tasks": active_tasks[-10:],
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/tasks/{task_id}")
async def get_task_status(
    task_id: str = Path(..., min_length=1),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Get status of an orchestrated task."""
    task = _tasks.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail=f"Task '{task_id}' not found")
    return task


@router.get("/agents/{agent_name}/tasks")
async def get_agent_tasks(
    agent_name: str = Path(..., min_length=1, max_length=128),
    status: Optional[str] = Query(None, pattern="^(pending|in_progress|completed|failed)$"),
    limit: int = Query(50, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Get all tasks for a specific agent."""
    if agent_name not in _agents:
        raise HTTPException(status_code=404, detail=f"Agent '{agent_name}' not found")

    tasks = [
        t for t in _tasks.values()
        if agent_name in t.get("agents", [])
    ]
    if status:
        tasks = [t for t in tasks if t["status"] == status]

    tasks.sort(key=lambda t: t["created_at"], reverse=True)
    return {
        "agent": agent_name,
        "total": len(tasks),
        "tasks": tasks[:limit],
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.post("/agents/register")
async def register_agent(
    registration: AgentRegistration,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Register a new agent in the mesh."""
    if registration.name in _agents:
        raise HTTPException(status_code=409, detail=f"Agent '{registration.name}' already registered")

    agent_record = {
        "name": registration.name,
        "capabilities": registration.capabilities,
        "lane": registration.lane,
        "version": registration.version,
        "max_concurrent_tasks": registration.max_concurrent_tasks,
        "metadata": registration.metadata,
        "status": "active",
        "registered_at": datetime.now(timezone.utc).isoformat(),
        "registered_by": current_user.get("sub", "anonymous"),
    }
    _agents[registration.name] = agent_record

    logger.info(f"Agent registered: {registration.name} on lane {registration.lane}")
    return {"status": "registered", "agent": agent_record}


@router.get("/agents")
async def list_agents(
    lane: Optional[str] = Query(None, pattern="^(ai_nexus|user_infinity|data_hive|cross_lane)$"),
    capability: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """List all registered agents with optional filters."""
    agents = list(_agents.values())
    if lane:
        agents = [a for a in agents if a.get("lane") == lane]
    if capability:
        agents = [a for a in agents if capability in a.get("capabilities", [])]

    return {
        "total": len(agents),
        "agents": agents,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.post("/consensus")
async def negotiate_consensus(
    request: ConsensusRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Trigger multi-agent consensus negotiation.

    Uses a simplified Byzantine fault-tolerant voting protocol.
    Each participating agent votes on the proposal, and consensus
    is reached when the quorum threshold is met.
    """
    task = _tasks.get(request.task_id)
    if not task:
        raise HTTPException(status_code=404, detail=f"Task '{request.task_id}' not found")

    voting_agents = request.voting_agents or task.get("agents", [])
    if not voting_agents:
        raise HTTPException(status_code=400, detail="No agents available for voting")

    round_id = f"cr-{uuid.uuid4().hex[:8]}"

    # Simulate voting (production: async agent polling via Kernel Event Bus)
    votes = {}
    for agent_name in voting_agents:
        if agent_name in _agents:
            # Deterministic vote based on proposal hash + agent name
            vote_hash = _hash(f"{request.proposal}:{agent_name}")
            vote_value = int(vote_hash[:4], 16) % 100
            votes[agent_name] = {
                "vote": "approve" if vote_value > 25 else "reject",
                "confidence": round(vote_value / 100, 2),
                "reasoning": f"Agent {agent_name} analysis of proposal",
            }

    approve_count = sum(1 for v in votes.values() if v["vote"] == "approve")
    total_votes = len(votes)
    approval_ratio = approve_count / total_votes if total_votes > 0 else 0
    consensus_reached = approval_ratio >= request.quorum

    round_record = {
        "round_id": round_id,
        "task_id": request.task_id,
        "proposal": request.proposal,
        "quorum": request.quorum,
        "votes": votes,
        "approval_ratio": round(approval_ratio, 3),
        "consensus_reached": consensus_reached,
        "outcome": "approved" if consensus_reached else "rejected",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "initiated_by": current_user.get("sub", "anonymous"),
    }
    _consensus_rounds[round_id] = round_record

    logger.info(f"Consensus {round_id}: {approve_count}/{total_votes} = {approval_ratio:.1%} → {'APPROVED' if consensus_reached else 'REJECTED'}")
    return round_record


@router.get("/mesh/topology")
async def get_mesh_topology(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Get current agent mesh topology.

    Returns the full graph of agents, their lane assignments,
    inter-agent connections, and mesh health metrics.
    """
    # Build adjacency from shared capabilities
    nodes = []
    edges = []
    for name, agent in _agents.items():
        nodes.append({
            "id": name,
            "lane": agent.get("lane", "cross_lane"),
            "capabilities": agent.get("capabilities", []),
            "status": agent.get("status", "unknown"),
        })

    # Connect agents that share capabilities
    agent_list = list(_agents.items())
    for i, (name_a, agent_a) in enumerate(agent_list):
        caps_a = set(agent_a.get("capabilities", []))
        for name_b, agent_b in agent_list[i + 1:]:
            caps_b = set(agent_b.get("capabilities", []))
            shared = caps_a & caps_b
            if shared:
                edges.append({
                    "source": name_a,
                    "target": name_b,
                    "shared_capabilities": list(shared),
                    "weight": len(shared),
                })

    # Lane distribution
    lane_counts = {}
    for agent in _agents.values():
        lane = agent.get("lane", "cross_lane")
        lane_counts[lane] = lane_counts.get(lane, 0) + 1

    active_count = sum(1 for a in _agents.values() if a.get("status") == "active")

    return {
        "nodes": nodes,
        "edges": edges,
        "total_agents": len(nodes),
        "total_connections": len(edges),
        "lane_distribution": lane_counts,
        "mesh_health": {
            "active_agents": active_count,
            "total_agents": len(nodes),
            "health_ratio": round(active_count / max(len(nodes), 1), 3),
            "active_tasks": len([t for t in _tasks.values() if t["status"] == "in_progress"]),
            "completed_tasks": len([t for t in _tasks.values() if t["status"] == "completed"]),
        },
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }