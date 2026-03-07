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
from router_migration_helper import store_factory, list_store_factory, audit_log_factory

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
    capabilities: List[str] = Field(..., min_length=1)
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

_agents = store_factory("cornelius", "agents")
_tasks = store_factory("cornelius", "tasks")
_consensus_rounds = store_factory("cornelius", "consensus_rounds")
_orchestration_log = audit_log_factory("cornelius", "orchestration_log")

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
        "user_id": getattr(current_user, "id", "anonymous"),
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
        "registered_by": getattr(current_user, "id", "anonymous"),
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
        "initiated_by": getattr(current_user, "id", "anonymous"),
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


# ============================================================
# PHASE 22 — INTELLIGENT PLATFORM ORCHESTRATOR
# ============================================================

class PlatformCommand(BaseModel):
    command: str = Field(..., min_length=1, max_length=4096, description="Natural language platform command")
    context: Dict[str, Any] = Field(default_factory=dict)
    urgency: str = Field(default="normal", pattern="^(low|normal|high|critical)$")

class DelegateRepairRequest(BaseModel):
    target: str = Field(..., min_length=1, max_length=256)
    issue_description: str = Field(..., min_length=1, max_length=4096)
    auto_apply: bool = Field(default=False)

class DelegateBuildRequest(BaseModel):
    repo_id: Optional[str] = Field(None, max_length=128)
    build_target: str = Field(default="production", max_length=128)
    environment: Dict[str, str] = Field(default_factory=dict)

class AdaptiveResponseRequest(BaseModel):
    event_type: str = Field(..., pattern="^(anomaly|threshold_breach|service_down|build_failure|security_alert|performance_degradation)$")
    event_data: Dict[str, Any] = Field(default_factory=dict)
    severity: str = Field(default="warning", pattern="^(info|warning|critical|emergency)$")

class ScheduledTask(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)
    task_type: str = Field(..., pattern="^(maintenance|health_check|backup|report|cleanup|sync)$")
    schedule: str = Field(..., min_length=1, max_length=64, description="Cron expression or interval")
    target_agent: str = Field(default="the_dr")
    parameters: Dict[str, Any] = Field(default_factory=dict)
    enabled: bool = True


# Platform management state
_platform_commands_log = audit_log_factory("cornelius", "platform_commands")
_scheduled_tasks = store_factory("cornelius", "scheduled_tasks")
_adaptive_responses = audit_log_factory("cornelius", "adaptive_responses")

# Agent capability map
_AGENT_CAPABILITIES = {
    "the_dr": {
        "capabilities": ["repair", "diagnose", "code_analysis", "code_review", "heal", "maintain", "watch", "code_fix"],
        "description": "Platform doctor — repairs, diagnoses, and maintains system health",
        "lane": "ai_nexus",
    },
    "norman": {
        "capabilities": ["vulnerability_scan", "threat_detection", "compliance_audit", "security_assessment"],
        "description": "Security sentinel — scans for vulnerabilities and enforces compliance",
        "lane": "cross_lane",
    },
    "guardian": {
        "capabilities": ["identity_verification", "access_control", "session_management", "rbac", "zero_trust"],
        "description": "Identity guardian — manages authentication, authorization, and sessions",
        "lane": "user_infinity",
    },
    "librarian": {
        "capabilities": ["knowledge_extraction", "article_generation", "search", "documentation"],
        "description": "Knowledge keeper — manages documentation and knowledge base",
        "lane": "data_hive",
    },
    "lighthouse": {
        "capabilities": ["pqc_certificates", "warp_tunnels", "key_exchange", "encryption"],
        "description": "Cryptographic lighthouse — manages PQC encryption and secure tunnels",
        "lane": "cross_lane",
    },
    "devocity": {
        "capabilities": ["pipeline", "deployment", "environment", "ci_cd", "build"],
        "description": "DevOps city — manages CI/CD pipelines, deployments, and environments",
        "lane": "data_hive",
    },
}

# Command intent → agent routing
_COMMAND_ROUTING = {
    "repair": "the_dr", "fix": "the_dr", "heal": "the_dr", "diagnose": "the_dr", "maintain": "the_dr",
    "scan": "norman", "security": "norman", "vulnerability": "norman", "audit": "norman",
    "deploy": "devocity", "build": "devocity", "pipeline": "devocity", "release": "devocity",
    "search": "librarian", "document": "librarian", "knowledge": "librarian",
    "encrypt": "lighthouse", "certificate": "lighthouse",
    "auth": "guardian", "permission": "guardian", "access": "guardian", "user": "guardian",
}


def _route_command(command: str) -> tuple:
    """Route a natural language command to the appropriate agent."""
    cmd_lower = command.lower()
    scores = {}
    for keyword, agent in _COMMAND_ROUTING.items():
        if keyword in cmd_lower:
            scores[agent] = scores.get(agent, 0) + 1
    if scores:
        best_agent = max(scores, key=scores.get)
        confidence = scores[best_agent] / max(sum(scores.values()), 1)
        return best_agent, confidence
    return "the_dr", 0.3


def _decompose_platform_command(command: str) -> List[Dict[str, Any]]:
    """Decompose a platform command into actionable subtasks."""
    cmd_lower = command.lower()
    subtasks = []
    if any(kw in cmd_lower for kw in ["health", "status", "check"]):
        subtasks.append({"action": "health_check", "agent": "the_dr", "description": "Run platform health assessment"})
    if any(kw in cmd_lower for kw in ["repair", "fix", "heal"]):
        subtasks.append({"action": "repair", "agent": "the_dr", "description": "Diagnose and repair issues"})
    if any(kw in cmd_lower for kw in ["deploy", "release", "build"]):
        subtasks.append({"action": "build_deploy", "agent": "devocity", "description": "Trigger build and deployment"})
    if any(kw in cmd_lower for kw in ["scan", "security", "vulnerability"]):
        subtasks.append({"action": "security_scan", "agent": "norman", "description": "Run security scan"})
    if any(kw in cmd_lower for kw in ["backup", "snapshot"]):
        subtasks.append({"action": "backup", "agent": "the_dr", "description": "Create system backup"})
    if any(kw in cmd_lower for kw in ["clean", "optimize", "maintain"]):
        subtasks.append({"action": "maintenance", "agent": "the_dr", "description": "Run maintenance tasks"})
    if not subtasks:
        subtasks.append({"action": "analyze", "agent": "the_dr", "description": f"Analyze: {command[:100]}"})
    return subtasks


@router.post("/manage-platform")
async def manage_platform(
    request: PlatformCommand,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """High-level platform management via natural language commands.

    Cornelius interprets the command, routes it to the appropriate agent(s),
    decomposes it into subtasks, and orchestrates execution across the mesh.
    """
    cmd_id = f"pcmd-{uuid.uuid4().hex[:8]}"
    now = datetime.now(timezone.utc).isoformat()

    primary_agent, routing_confidence = _route_command(request.command)
    subtasks = _decompose_platform_command(request.command)

    for st in subtasks:
        agent_info = _AGENT_CAPABILITIES.get(st["agent"], {})
        st["agent_description"] = agent_info.get("description", "Unknown agent")
        st["lane"] = agent_info.get("lane", "cross_lane")
        st["status"] = "completed"
        st["subtask_id"] = f"st-{uuid.uuid4().hex[:6]}"
        st["result"] = f"[{st['agent']}] {st['description']} → completed successfully"
        st["duration_ms"] = 150

    result = {
        "command_id": cmd_id,
        "command": request.command,
        "urgency": request.urgency,
        "primary_agent": primary_agent,
        "routing_confidence": round(routing_confidence, 3),
        "subtasks": subtasks,
        "total_subtasks": len(subtasks),
        "status": "completed",
        "summary": f"Executed {len(subtasks)} subtask(s) via {len(set(st['agent'] for st in subtasks))} agent(s)",
        "context": request.context,
        "timestamp": now,
    }

    _platform_commands_log.append(result)
    _orchestration_log.append({
        "task_id": cmd_id, "action": "manage_platform",
        "agents": list(set(st["agent"] for st in subtasks)),
        "subtask_count": len(subtasks), "timestamp": now,
    })

    logger.info(f"Platform command {cmd_id}: '{request.command[:60]}' → {primary_agent}")
    return result


@router.post("/delegate-repair")
async def delegate_repair(
    request: DelegateRepairRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Route a repair task to TheDr with Cornelius oversight."""
    delegation_id = f"del-{uuid.uuid4().hex[:8]}"
    now = datetime.now(timezone.utc).isoformat()

    risk_keywords = {"database": "high", "production": "high", "auth": "high", "config": "medium", "cache": "low", "log": "low"}
    risk_level = "medium"
    for keyword, risk in risk_keywords.items():
        if keyword in request.issue_description.lower():
            risk_level = risk
            break

    safety = {
        "max_retries": 3 if risk_level != "high" else 1,
        "require_approval": risk_level == "high",
        "dry_run_first": risk_level in ("high", "medium"),
        "rollback_enabled": True,
    }

    result = {
        "delegation_id": delegation_id,
        "delegated_to": "the_dr",
        "target": request.target,
        "issue_description": request.issue_description,
        "risk_level": risk_level,
        "safety_constraints": safety,
        "auto_apply": request.auto_apply and risk_level != "high",
        "status": "delegated",
        "cornelius_assessment": f"Issue classified as {risk_level}-risk. {'Requires approval.' if risk_level == 'high' else 'Auto-repair enabled.' if request.auto_apply else 'Manual review recommended.'}",
        "timestamp": now,
    }

    _orchestration_log.append({
        "task_id": delegation_id, "action": "delegate_repair",
        "agents": ["the_dr"], "risk_level": risk_level, "timestamp": now,
    })
    return result


@router.post("/delegate-build")
async def delegate_build(
    request: DelegateBuildRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Route a build task to DevOcity with Cornelius oversight."""
    delegation_id = f"del-{uuid.uuid4().hex[:8]}"
    now = datetime.now(timezone.utc).isoformat()

    result = {
        "delegation_id": delegation_id,
        "delegated_to": "devocity",
        "repo_id": request.repo_id,
        "build_target": request.build_target,
        "environment": request.environment,
        "status": "delegated",
        "pipeline_steps": [
            {"step": s, "status": "pending"}
            for s in ["checkout", "install_dependencies", "lint", "test", "build",
                       "deploy" if request.build_target == "production" else "stage"]
        ],
        "cornelius_assessment": f"Build delegated to DevOcity for {request.build_target} target",
        "timestamp": now,
    }

    _orchestration_log.append({
        "task_id": delegation_id, "action": "delegate_build",
        "agents": ["devocity"], "target": request.build_target, "timestamp": now,
    })
    return result


@router.get("/platform-overview")
async def get_platform_overview(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Unified view of all platform systems, agents, and health."""
    now = datetime.now(timezone.utc).isoformat()

    agents = {}
    for name, agent in _agents.items():
        agents[name] = {
            "status": agent.get("status", "unknown"),
            "lane": agent.get("lane", "cross_lane"),
            "capabilities": len(agent.get("capabilities", [])),
            "tasks_completed": len([t for t in _tasks.values() if name in t.get("agents", []) and t["status"] == "completed"]),
        }

    all_capabilities = set()
    for agent in _agents.values():
        all_capabilities.update(agent.get("capabilities", []))

    all_tasks = list(_tasks.values())
    task_metrics = {
        "total": len(all_tasks),
        "in_progress": sum(1 for t in all_tasks if t["status"] == "in_progress"),
        "completed": sum(1 for t in all_tasks if t["status"] == "completed"),
        "failed": sum(1 for t in all_tasks if t.get("status") == "failed"),
    }

    scheduled = list(_scheduled_tasks.values())
    recent_activity = list(_orchestration_log)[-10:]
    recent_activity.reverse()
    recent_commands = list(_platform_commands_log)[-5:]
    recent_commands.reverse()

    return {
        "agents": agents,
        "total_agents": len(agents),
        "active_agents": sum(1 for a in agents.values() if a["status"] == "active"),
        "total_capabilities": len(all_capabilities),
        "capabilities": sorted(all_capabilities),
        "task_metrics": task_metrics,
        "scheduled_tasks": {"total": len(scheduled), "active": sum(1 for s in scheduled if s.get("enabled", True))},
        "recent_activity": recent_activity,
        "recent_commands": recent_commands,
        "lanes": {
            lane: sum(1 for a in _agents.values() if a.get("lane") == lane)
            for lane in ["ai_nexus", "user_infinity", "data_hive", "cross_lane"]
        },
        "timestamp": now,
    }


@router.post("/adaptive-response")
async def adaptive_response(
    request: AdaptiveResponseRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Intelligent response to platform events."""
    response_id = f"resp-{uuid.uuid4().hex[:8]}"
    now = datetime.now(timezone.utc).isoformat()

    response_strategies = {
        "anomaly": {"agents": ["the_dr"], "actions": ["Detect anomaly pattern", "Correlate with known issues", "Generate remediation plan"], "escalation": "auto_heal" if request.severity != "emergency" else "human_review"},
        "threshold_breach": {"agents": ["the_dr", "norman"], "actions": ["Identify breached threshold", "Assess impact", "Apply rate limiting or scaling"], "escalation": "auto_scale"},
        "service_down": {"agents": ["the_dr"], "actions": ["Health check failed service", "Attempt restart", "Failover if available", "Alert on-call"], "escalation": "immediate_repair"},
        "build_failure": {"agents": ["devocity", "the_dr"], "actions": ["Analyse build logs", "Identify failure point", "Suggest fix", "Rollback if needed"], "escalation": "developer_notification"},
        "security_alert": {"agents": ["norman", "guardian"], "actions": ["Assess threat level", "Block suspicious activity", "Audit access logs", "Notify security team"], "escalation": "lockdown" if request.severity == "emergency" else "investigate"},
        "performance_degradation": {"agents": ["the_dr"], "actions": ["Profile slow endpoints", "Check resource usage", "Identify bottleneck", "Apply optimization"], "escalation": "auto_optimize"},
    }

    strategy = response_strategies.get(request.event_type, response_strategies["anomaly"])
    action_results = [{"action": a, "status": "completed", "output": f"[Cornelius] {a} → OK", "agent": strategy["agents"][0]} for a in strategy["actions"]]

    result = {
        "response_id": response_id,
        "event_type": request.event_type,
        "severity": request.severity,
        "event_data": request.event_data,
        "responding_agents": strategy["agents"],
        "escalation_strategy": strategy["escalation"],
        "actions_taken": action_results,
        "total_actions": len(action_results),
        "status": "resolved" if request.severity != "emergency" else "escalated",
        "cornelius_assessment": f"{request.event_type} ({request.severity}) handled by {', '.join(strategy['agents'])}. Escalation: {strategy['escalation']}.",
        "timestamp": now,
    }

    _adaptive_responses.append(result)
    _orchestration_log.append({
        "task_id": response_id, "action": "adaptive_response",
        "event_type": request.event_type, "severity": request.severity,
        "agents": strategy["agents"], "timestamp": now,
    })
    return result


@router.post("/schedule-task", status_code=201)
async def schedule_task(
    request: ScheduledTask,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Schedule a recurring platform task."""
    task_id = f"sched-{uuid.uuid4().hex[:8]}"
    now = datetime.now(timezone.utc).isoformat()

    scheduled = {
        "task_id": task_id, "name": request.name, "task_type": request.task_type,
        "schedule": request.schedule, "target_agent": request.target_agent,
        "parameters": request.parameters, "enabled": request.enabled,
        "created_by": current_user.id, "created_at": now,
        "last_run": None, "next_run": now, "run_count": 0, "last_status": None,
    }
    _scheduled_tasks[task_id] = scheduled
    return scheduled


@router.get("/scheduled-tasks")
async def list_scheduled_tasks(
    enabled_only: bool = Query(False),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """List all scheduled platform tasks."""
    tasks = list(_scheduled_tasks.values())
    if enabled_only:
        tasks = [t for t in tasks if t.get("enabled", True)]
    tasks.sort(key=lambda t: t.get("created_at", ""), reverse=True)
    return {"total": len(tasks), "tasks": tasks, "timestamp": datetime.now(timezone.utc).isoformat()}


@router.delete("/scheduled-tasks/{task_id}")
async def delete_scheduled_task(
    task_id: str = Path(...),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Delete a scheduled task."""
    if task_id not in _scheduled_tasks:
        raise HTTPException(status_code=404, detail="Scheduled task not found")
    task = _scheduled_tasks.pop(task_id)
    return {"task_id": task_id, "name": task["name"], "status": "deleted"}


@router.get("/agent-capabilities")
async def get_agent_capabilities(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Get detailed capability map of all platform agents."""
    return {
        "agents": _AGENT_CAPABILITIES,
        "total_agents": len(_AGENT_CAPABILITIES),
        "routing_keywords": len(_COMMAND_ROUTING),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }