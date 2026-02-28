# routers/agent_manager.py — Agent Control Plane
# Provides registration, heartbeat, discovery, and lifecycle
# management for all 27+ Trancendos AI agents.
#
# ISO 27001: A.8.26 — Application security requirements
# Integrates with: packages/agent-sdk (TypeScript), backend event bus

import time
import uuid
from datetime import datetime, timezone
from typing import Optional
from enum import Enum as PyEnum

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/v1/agents", tags=["Agent Manager"])


# ── Models ──────────────────────────────────────────────────

class AgentTier(str, PyEnum):
    T1_CRITICAL = "T1_CRITICAL"
    T2_IMPORTANT = "T2_IMPORTANT"
    T3_NICE_TO_HAVE = "T3_NICE_TO_HAVE"


class AgentStatus(str, PyEnum):
    REGISTERED = "registered"
    INITIALIZING = "initializing"
    READY = "ready"
    PROCESSING = "processing"
    DEGRADED = "degraded"
    STOPPED = "stopped"
    ERROR = "error"


class AgentRegistration(BaseModel):
    """Register a new agent with the control plane."""
    agent_id: str = Field(..., description="Unique agent identifier (e.g., 'norman-ai')")
    name: str = Field(..., description="Human-readable agent name")
    version: str = Field(default="1.0.0", description="Agent version (semver)")
    tier: AgentTier = Field(default=AgentTier.T3_NICE_TO_HAVE)
    capabilities: list[str] = Field(default_factory=list, description="Agent capabilities")
    dependencies: list[str] = Field(default_factory=list, description="Required agent dependencies")
    deployment_target: str = Field(default="docker-container", description="Where agent runs")
    settings: dict = Field(default_factory=dict, description="Custom configuration")


class AgentHeartbeat(BaseModel):
    """Periodic heartbeat from a running agent."""
    agent_id: str
    status: AgentStatus = AgentStatus.READY
    metrics: dict = Field(default_factory=dict, description="Agent-reported metrics")
    active_tasks: int = Field(default=0, description="Currently processing tasks")
    error_message: Optional[str] = None


class AgentCommand(BaseModel):
    """Command to send to an agent."""
    command: str = Field(..., description="Command type: start, stop, restart, configure")
    target_agent: str = Field(..., description="Target agent ID")
    parameters: dict = Field(default_factory=dict, description="Command parameters")


class AgentSummonRequest(BaseModel):
    """Request to summon (activate) an agent for a task."""
    agent_id: str = Field(..., description="Agent to summon")
    task_type: str = Field(..., description="Type of task to perform")
    task_data: dict = Field(default_factory=dict, description="Task payload")
    priority: int = Field(default=5, ge=1, le=10, description="Task priority (1=lowest, 10=highest)")
    timeout_seconds: int = Field(default=300, description="Task timeout")


# ── In-Memory Registry (replace with DB in production) ──────

_agent_registry: dict[str, dict] = {}
_command_queue: list[dict] = []
_task_history: list[dict] = []

HEARTBEAT_TIMEOUT_SECONDS = 120  # Mark agent as degraded after 2 min


# ── Endpoints ───────────────────────────────────────────────

@router.post("/register", status_code=201)
async def register_agent(reg: AgentRegistration):
    """
    Register an agent with the control plane.
    Called by agents on startup via the Agent SDK.
    """
    now = datetime.now(timezone.utc).isoformat()

    _agent_registry[reg.agent_id] = {
        "agent_id": reg.agent_id,
        "name": reg.name,
        "version": reg.version,
        "tier": reg.tier.value,
        "capabilities": reg.capabilities,
        "dependencies": reg.dependencies,
        "deployment_target": reg.deployment_target,
        "settings": reg.settings,
        "status": AgentStatus.REGISTERED.value,
        "registered_at": now,
        "last_heartbeat": now,
        "heartbeat_count": 0,
        "active_tasks": 0,
        "total_tasks_completed": 0,
        "error_count": 0,
        "uptime_seconds": 0,
        "metrics": {},
    }

    return {
        "status": "registered",
        "agent_id": reg.agent_id,
        "message": f"Agent '{reg.name}' registered successfully",
        "registry_size": len(_agent_registry),
    }


@router.post("/heartbeat")
async def agent_heartbeat(hb: AgentHeartbeat):
    """
    Receive heartbeat from a running agent.
    Updates status, metrics, and last-seen timestamp.
    """
    if hb.agent_id not in _agent_registry:
        raise HTTPException(404, f"Agent '{hb.agent_id}' not registered. Call /register first.")

    agent = _agent_registry[hb.agent_id]
    now = datetime.now(timezone.utc).isoformat()

    agent["status"] = hb.status.value
    agent["last_heartbeat"] = now
    agent["heartbeat_count"] = agent.get("heartbeat_count", 0) + 1
    agent["active_tasks"] = hb.active_tasks
    agent["metrics"] = hb.metrics

    if hb.error_message:
        agent["last_error"] = hb.error_message
        agent["error_count"] = agent.get("error_count", 0) + 1

    # Check for pending commands
    pending = [c for c in _command_queue if c["target_agent"] == hb.agent_id]

    return {
        "status": "ok",
        "heartbeat_count": agent["heartbeat_count"],
        "pending_commands": pending,
    }


@router.get("/")
async def list_agents(
    status: Optional[AgentStatus] = Query(None, description="Filter by status"),
    tier: Optional[AgentTier] = Query(None, description="Filter by tier"),
    capability: Optional[str] = Query(None, description="Filter by capability"),
):
    """
    List all registered agents with optional filtering.
    """
    agents = list(_agent_registry.values())

    # Apply filters
    if status:
        agents = [a for a in agents if a["status"] == status.value]
    if tier:
        agents = [a for a in agents if a["tier"] == tier.value]
    if capability:
        agents = [a for a in agents if capability in a.get("capabilities", [])]

    # Check for stale agents (no heartbeat within timeout)
    now_ts = time.time()
    for agent in agents:
        try:
            last_hb = datetime.fromisoformat(agent["last_heartbeat"]).timestamp()
            if now_ts - last_hb > HEARTBEAT_TIMEOUT_SECONDS and agent["status"] not in ("stopped", "error"):
                agent["status"] = "degraded"
                agent["status_reason"] = "Heartbeat timeout"
        except (ValueError, KeyError):
            pass

    return {
        "total": len(agents),
        "agents": agents,
    }


@router.get("/{agent_id}")
async def get_agent(agent_id: str):
    """Get detailed information about a specific agent."""
    if agent_id not in _agent_registry:
        raise HTTPException(404, f"Agent '{agent_id}' not found")
    return _agent_registry[agent_id]


@router.post("/command")
async def send_command(cmd: AgentCommand):
    """
    Send a command to an agent (start, stop, restart, configure).
    Commands are queued and delivered on next heartbeat.
    """
    if cmd.target_agent not in _agent_registry:
        raise HTTPException(404, f"Agent '{cmd.target_agent}' not found")

    if cmd.command not in ("start", "stop", "restart", "configure", "scale"):
        raise HTTPException(400, f"Unknown command: {cmd.command}")

    command_entry = {
        "id": str(uuid.uuid4()),
        "command": cmd.command,
        "target_agent": cmd.target_agent,
        "parameters": cmd.parameters,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "status": "pending",
    }

    _command_queue.append(command_entry)

    return {
        "status": "queued",
        "command_id": command_entry["id"],
        "message": f"Command '{cmd.command}' queued for agent '{cmd.target_agent}'",
    }


@router.post("/summon")
async def summon_agent(req: AgentSummonRequest):
    """
    Summon (activate) an agent for a specific task.
    If the agent is stopped, queues a start command first.
    """
    if req.agent_id not in _agent_registry:
        raise HTTPException(404, f"Agent '{req.agent_id}' not found")

    agent = _agent_registry[req.agent_id]

    # If agent is stopped, queue a start command
    if agent["status"] in ("stopped", "registered"):
        start_cmd = {
            "id": str(uuid.uuid4()),
            "command": "start",
            "target_agent": req.agent_id,
            "parameters": {},
            "created_at": datetime.now(timezone.utc).isoformat(),
            "status": "pending",
        }
        _command_queue.append(start_cmd)

    # Create task entry
    task_entry = {
        "id": str(uuid.uuid4()),
        "agent_id": req.agent_id,
        "task_type": req.task_type,
        "task_data": req.task_data,
        "priority": req.priority,
        "timeout_seconds": req.timeout_seconds,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "status": "queued",
    }

    _task_history.append(task_entry)

    return {
        "status": "summoned",
        "task_id": task_entry["id"],
        "agent_id": req.agent_id,
        "agent_status": agent["status"],
        "message": f"Agent '{agent['name']}' summoned for task '{req.task_type}'",
    }


@router.delete("/{agent_id}")
async def deregister_agent(agent_id: str):
    """Remove an agent from the registry."""
    if agent_id not in _agent_registry:
        raise HTTPException(404, f"Agent '{agent_id}' not found")

    agent = _agent_registry.pop(agent_id)

    # Clean up pending commands
    global _command_queue
    _command_queue = [c for c in _command_queue if c["target_agent"] != agent_id]

    return {
        "status": "deregistered",
        "agent_id": agent_id,
        "message": f"Agent '{agent['name']}' removed from registry",
    }


@router.get("/metrics/summary")
async def agent_metrics_summary():
    """
    Aggregated metrics across all agents.
    Useful for the Operational Intelligence widget and Prometheus.
    """
    agents = list(_agent_registry.values())
    total = len(agents)

    status_counts = {}
    tier_counts = {}
    total_tasks = 0
    total_errors = 0

    for agent in agents:
        s = agent.get("status", "unknown")
        t = agent.get("tier", "unknown")
        status_counts[s] = status_counts.get(s, 0) + 1
        tier_counts[t] = tier_counts.get(t, 0) + 1
        total_tasks += agent.get("total_tasks_completed", 0)
        total_errors += agent.get("error_count", 0)

    return {
        "total_agents": total,
        "status_breakdown": status_counts,
        "tier_breakdown": tier_counts,
        "total_tasks_completed": total_tasks,
        "total_errors": total_errors,
        "active_tasks": sum(a.get("active_tasks", 0) for a in agents),
        "pending_commands": len(_command_queue),
    }


@router.get("/discover/{capability}")
async def discover_agents_by_capability(capability: str):
    """
    Service discovery: find agents that provide a specific capability.
    Used by agents to find peers for collaboration.
    """
    matching = [
        {
            "agent_id": a["agent_id"],
            "name": a["name"],
            "version": a["version"],
            "status": a["status"],
            "capabilities": a["capabilities"],
        }
        for a in _agent_registry.values()
        if capability in a.get("capabilities", [])
        and a.get("status") in ("ready", "processing")
    ]

    return {
        "capability": capability,
        "total": len(matching),
        "agents": matching,
    }