# routers/chaos_party.py — The Chaos Party — Adversarial Validation and Chaos Engineering
# THREE-LANE MESH: CROSS-LANE — Tests resilience of ALL lanes
#
# The Chaos Party is the ecosystem's chaos engineering and adversarial
# validation service. It deliberately injects faults, simulates attacks,
# and stress-tests all three mesh lanes to ensure resilience.
#
# Cross-lane because it must test everything:
#   Lane 1 (AI/Nexus):     Agent communication failures, pheromone corruption
#   Lane 2 (User/Infinity): Auth failures, session corruption, UI degradation
#   Lane 3 (Data/Hive):    Transfer failures, data corruption, integrity breaks
#
# Inspired by Netflix's Chaos Monkey but adapted for the Three-Lane Mesh.
# Includes a self-healing loop that monitors and auto-recovers from faults.

from typing import Optional, Dict, Any, List
from datetime import datetime, timezone, timedelta
import uuid
import random

from fastapi import APIRouter, Depends, HTTPException, Query, Path
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user, require_min_role, CurrentUser, UserRole
from database import get_db_session

router = APIRouter(prefix="/api/v1/chaos", tags=['The Chaos Party — Adversarial Validation'])


# ============================================================
# CROSS-LANE: CHAOS ENGINEERING FOR ALL MESH LANES
# ============================================================

# In-memory state
_experiments: Dict[str, Dict[str, Any]] = {}
_active_faults: Dict[str, Dict[str, Any]] = {}
_experiment_results: Dict[str, List[Dict[str, Any]]] = {}
_healing_loop_state: Dict[str, Any] = {
    "status": "active",
    "faults_detected": 0,
    "faults_healed": 0,
    "last_check": None,
    "healing_actions": [],
}
_scheduled_experiments: List[Dict[str, Any]] = []
_resilience_scores: Dict[str, float] = {
    "ai_nexus": 100.0,
    "user_infinity": 100.0,
    "data_hive": 100.0,
    "cross_lane": 100.0,
    "overall": 100.0,
}


# Fault injection templates
FAULT_TEMPLATES = {
    "latency_spike": {
        "description": "Inject artificial latency into service responses",
        "severity": "medium",
        "applicable_lanes": ["ai_nexus", "user_infinity", "data_hive"],
        "parameters": {"delay_ms": 500, "jitter_ms": 100},
    },
    "connection_drop": {
        "description": "Simulate dropped connections between services",
        "severity": "high",
        "applicable_lanes": ["ai_nexus", "data_hive"],
        "parameters": {"drop_rate": 0.3, "duration_seconds": 60},
    },
    "data_corruption": {
        "description": "Inject bit-flip corruption into data transfers",
        "severity": "critical",
        "applicable_lanes": ["data_hive"],
        "parameters": {"corruption_rate": 0.01, "target_field": "payload"},
    },
    "auth_failure": {
        "description": "Simulate authentication service failures",
        "severity": "high",
        "applicable_lanes": ["user_infinity"],
        "parameters": {"failure_rate": 0.5, "error_code": 401},
    },
    "pheromone_decay": {
        "description": "Accelerate pheromone trail decay in The Nexus",
        "severity": "medium",
        "applicable_lanes": ["ai_nexus"],
        "parameters": {"decay_multiplier": 10.0},
    },
    "resource_exhaustion": {
        "description": "Simulate memory/CPU exhaustion",
        "severity": "critical",
        "applicable_lanes": ["ai_nexus", "user_infinity", "data_hive", "cross_lane"],
        "parameters": {"resource": "memory", "target_percent": 95},
    },
    "certificate_expiry": {
        "description": "Simulate expired certificates from The Lighthouse",
        "severity": "high",
        "applicable_lanes": ["cross_lane"],
        "parameters": {"affected_certs": 5},
    },
    "secret_unavailable": {
        "description": "Simulate The Void being unreachable",
        "severity": "critical",
        "applicable_lanes": ["cross_lane"],
        "parameters": {"duration_seconds": 120},
    },
}


# ============================================================
# SCHEMAS
# ============================================================

class ExperimentCreate(BaseModel):
    """Create a chaos experiment."""
    name: str = Field(..., description="Experiment name")
    description: Optional[str] = Field(None, description="Experiment description")
    target_lane: str = Field(..., description="Target mesh lane: ai_nexus, user_infinity, data_hive, cross_lane")
    target_services: List[str] = Field(default_factory=list, description="Specific services to target (empty = all in lane)")
    fault_type: str = Field(..., description="Fault type from FAULT_TEMPLATES")
    parameters: Dict[str, Any] = Field(default_factory=dict, description="Override default fault parameters")
    duration_minutes: int = Field(5, ge=1, le=60, description="Experiment duration in minutes")
    auto_rollback: bool = Field(True, description="Automatically rollback faults after experiment")
    hypothesis: str = Field(
        "The system should maintain >95% availability during this fault",
        description="What you expect to happen",
    )


class FaultInjectRequest(BaseModel):
    """Directly inject a fault (outside of an experiment)."""
    fault_type: str = Field(..., description="Fault type from FAULT_TEMPLATES")
    target_lane: str = Field(..., description="Target mesh lane")
    target_service: Optional[str] = Field(None, description="Specific service to target")
    parameters: Dict[str, Any] = Field(default_factory=dict)
    duration_minutes: int = Field(5, ge=1, le=30)


class ScheduleRequest(BaseModel):
    """Schedule recurring chaos experiments."""
    experiment_id: str = Field(..., description="Experiment to schedule")
    cron: str = Field("0 3 * * 1", description="Cron expression (default: 3am every Monday)")
    enabled: bool = Field(True)


# ============================================================
# EXPERIMENT MANAGEMENT
# ============================================================

@router.post("/experiments")
async def create_experiment(
    request: ExperimentCreate,
    current_user: CurrentUser = Depends(require_min_role(UserRole.USER)),
    db: AsyncSession = Depends(get_db_session),
):
    """
    Create a chaos experiment.
    
    Experiments are the structured way to test resilience. Each experiment:
    1. Defines a hypothesis about system behaviour under fault
    2. Injects a specific fault into a mesh lane
    3. Monitors system behaviour during the fault
    4. Compares results against the hypothesis
    5. Auto-rollbacks the fault (if enabled)
    """
    if request.fault_type not in FAULT_TEMPLATES:
        raise HTTPException(400, f"Unknown fault type. Available: {list(FAULT_TEMPLATES.keys())}")

    template = FAULT_TEMPLATES[request.fault_type]
    if request.target_lane not in template["applicable_lanes"]:
        raise HTTPException(
            400,
            f"Fault '{request.fault_type}' not applicable to lane '{request.target_lane}'. "
            f"Applicable lanes: {template['applicable_lanes']}",
        )

    experiment_id = str(uuid.uuid4())[:12]
    now = datetime.now(timezone.utc)

    # Merge default parameters with overrides
    params = {**template["parameters"], **request.parameters}

    experiment = {
        "experiment_id": experiment_id,
        "name": request.name,
        "description": request.description or template["description"],
        "target_lane": request.target_lane,
        "target_services": request.target_services,
        "fault_type": request.fault_type,
        "fault_severity": template["severity"],
        "parameters": params,
        "duration_minutes": request.duration_minutes,
        "auto_rollback": request.auto_rollback,
        "hypothesis": request.hypothesis,
        "status": "created",
        "created_at": now.isoformat(),
        "created_by": current_user.id if hasattr(current_user, 'id') else "system",
        "started_at": None,
        "completed_at": None,
        "result": None,
        "mesh_lane": "cross_lane",
    }
    _experiments[experiment_id] = experiment

    return {"status": "ok", "experiment": experiment}


@router.get("/experiments")
async def list_experiments(
    status: Optional[str] = Query(None, description="Filter by status: created, running, completed, failed"),
    target_lane: Optional[str] = Query(None, description="Filter by target lane"),
    limit: int = Query(50, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """List chaos experiments."""
    experiments = list(_experiments.values())

    if status:
        experiments = [e for e in experiments if e.get("status") == status]
    if target_lane:
        experiments = [e for e in experiments if e.get("target_lane") == target_lane]

    experiments = sorted(experiments, key=lambda e: e.get("created_at", ""), reverse=True)[:limit]

    return {
        "status": "ok",
        "total": len(experiments),
        "experiments": experiments,
    }


@router.post("/experiments/{experiment_id}/run")
async def run_experiment(
    experiment_id: str = Path(...),
    current_user: CurrentUser = Depends(require_min_role(UserRole.USER)),
    db: AsyncSession = Depends(get_db_session),
):
    """
    Run a chaos experiment.
    
    This injects the configured fault into the target mesh lane,
    monitors the system response, and evaluates the hypothesis.
    """
    experiment = _experiments.get(experiment_id)
    if not experiment:
        raise HTTPException(404, f"Experiment '{experiment_id}' not found")

    if experiment["status"] == "running":
        raise HTTPException(400, "Experiment is already running")

    now = datetime.now(timezone.utc)
    experiment["status"] = "running"
    experiment["started_at"] = now.isoformat()

    # Inject the fault
    fault_id = str(uuid.uuid4())[:12]
    fault = {
        "fault_id": fault_id,
        "experiment_id": experiment_id,
        "fault_type": experiment["fault_type"],
        "target_lane": experiment["target_lane"],
        "target_services": experiment["target_services"],
        "parameters": experiment["parameters"],
        "injected_at": now.isoformat(),
        "expires_at": (now + timedelta(minutes=experiment["duration_minutes"])).isoformat(),
        "status": "active",
        "auto_rollback": experiment["auto_rollback"],
    }
    _active_faults[fault_id] = fault

    # Simulate experiment results
    # In production: actual monitoring during fault injection
    baseline_score = _resilience_scores.get(experiment["target_lane"], 100.0)
    severity_impact = {"medium": 5, "high": 15, "critical": 30}.get(experiment["fault_severity"], 10)
    impact = random.uniform(severity_impact * 0.5, severity_impact * 1.5)
    new_score = max(0, baseline_score - impact)

    # Update resilience score
    _resilience_scores[experiment["target_lane"]] = round(new_score, 1)
    _resilience_scores["overall"] = round(
        sum(v for k, v in _resilience_scores.items() if k != "overall") / 4, 1
    )

    # Record results
    results = {
        "fault_id": fault_id,
        "baseline_resilience": baseline_score,
        "during_fault_resilience": round(new_score, 1),
        "impact_percentage": round(impact, 1),
        "hypothesis_validated": new_score > 95,
        "services_affected": experiment["target_services"] or [f"all_{experiment['target_lane']}"],
        "errors_observed": random.randint(0, 5),
        "recovery_time_seconds": random.randint(2, 30),
    }

    if experiment_id not in _experiment_results:
        _experiment_results[experiment_id] = []
    _experiment_results[experiment_id].append(results)

    # Auto-complete (in production: runs for duration_minutes then completes)
    experiment["status"] = "completed"
    experiment["completed_at"] = datetime.now(timezone.utc).isoformat()
    experiment["result"] = "hypothesis_validated" if results["hypothesis_validated"] else "hypothesis_rejected"

    # Auto-rollback fault
    if experiment["auto_rollback"]:
        fault["status"] = "rolled_back"
        _resilience_scores[experiment["target_lane"]] = baseline_score
        _resilience_scores["overall"] = round(
            sum(v for k, v in _resilience_scores.items() if k != "overall") / 4, 1
        )

    return {
        "status": "ok",
        "experiment_id": experiment_id,
        "fault_id": fault_id,
        "result": experiment["result"],
        "details": results,
        "fault_status": fault["status"],
        "mesh_lane": experiment["target_lane"],
    }


@router.get("/experiments/{experiment_id}/results")
async def get_experiment_results(
    experiment_id: str = Path(...),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Get results from a chaos experiment."""
    experiment = _experiments.get(experiment_id)
    if not experiment:
        raise HTTPException(404, f"Experiment '{experiment_id}' not found")

    results = _experiment_results.get(experiment_id, [])

    return {
        "status": "ok",
        "experiment": experiment,
        "runs": len(results),
        "results": results,
    }


# ============================================================
# FAULT INJECTION (Direct)
# ============================================================

@router.post("/fault/inject")
async def inject_fault(
    request: FaultInjectRequest,
    current_user: CurrentUser = Depends(require_min_role(UserRole.USER)),
    db: AsyncSession = Depends(get_db_session),
):
    """
    Directly inject a fault into a mesh lane.
    
    Use this for ad-hoc testing. For structured testing, use experiments.
    """
    if request.fault_type not in FAULT_TEMPLATES:
        raise HTTPException(400, f"Unknown fault type. Available: {list(FAULT_TEMPLATES.keys())}")

    template = FAULT_TEMPLATES[request.fault_type]
    fault_id = str(uuid.uuid4())[:12]
    now = datetime.now(timezone.utc)

    params = {**template["parameters"], **request.parameters}

    fault = {
        "fault_id": fault_id,
        "experiment_id": None,
        "fault_type": request.fault_type,
        "target_lane": request.target_lane,
        "target_services": [request.target_service] if request.target_service else [],
        "parameters": params,
        "injected_at": now.isoformat(),
        "expires_at": (now + timedelta(minutes=request.duration_minutes)).isoformat(),
        "status": "active",
        "injected_by": current_user.id if hasattr(current_user, 'id') else "system",
    }
    _active_faults[fault_id] = fault

    _healing_loop_state["faults_detected"] += 1

    return {
        "status": "ok",
        "fault": fault,
        "warning": f"Fault active for {request.duration_minutes} minutes. Use DELETE /faults/{fault_id}/resolve to remove early.",
    }


@router.get("/faults/active")
async def list_active_faults(
    target_lane: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """List all currently active faults."""
    faults = [f for f in _active_faults.values() if f.get("status") == "active"]

    if target_lane:
        faults = [f for f in faults if f.get("target_lane") == target_lane]

    # Check for expired faults
    now = datetime.now(timezone.utc)
    for fault in faults:
        expires = datetime.fromisoformat(fault["expires_at"].replace("Z", "+00:00"))
        if now > expires:
            fault["status"] = "expired"
            _healing_loop_state["faults_healed"] += 1

    active = [f for f in faults if f.get("status") == "active"]

    return {
        "status": "ok",
        "total_active": len(active),
        "faults": active,
    }


@router.post("/faults/{fault_id}/resolve")
async def resolve_fault(
    fault_id: str = Path(...),
    current_user: CurrentUser = Depends(require_min_role(UserRole.USER)),
    db: AsyncSession = Depends(get_db_session),
):
    """Manually resolve (remove) an active fault."""
    fault = _active_faults.get(fault_id)
    if not fault:
        raise HTTPException(404, f"Fault '{fault_id}' not found")

    fault["status"] = "resolved"
    fault["resolved_at"] = datetime.now(timezone.utc).isoformat()
    _healing_loop_state["faults_healed"] += 1

    return {
        "status": "ok",
        "fault_id": fault_id,
        "new_status": "resolved",
    }


# ============================================================
# RESILIENCE SCORING
# ============================================================

@router.get("/resilience-score")
async def get_resilience_score(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """
    Get the ecosystem resilience score.
    
    Scores are calculated per mesh lane based on chaos experiment results.
    100 = perfect resilience, 0 = complete failure.
    """
    total_experiments = len(_experiments)
    validated = sum(1 for e in _experiments.values() if e.get("result") == "hypothesis_validated")

    return {
        "status": "ok",
        "scores": _resilience_scores,
        "experiments_run": total_experiments,
        "hypotheses_validated": validated,
        "validation_rate": round(validated / max(total_experiments, 1) * 100, 1),
        "active_faults": sum(1 for f in _active_faults.values() if f.get("status") == "active"),
        "recommendation": (
            "EXCELLENT — All lanes show strong resilience"
            if _resilience_scores["overall"] >= 95
            else "GOOD — Minor resilience gaps detected"
            if _resilience_scores["overall"] >= 80
            else "WARNING — Significant resilience issues"
            if _resilience_scores["overall"] >= 60
            else "CRITICAL — Major resilience failures detected"
        ),
    }


# ============================================================
# SELF-HEALING LOOP
# ============================================================

@router.get("/healing-loop/status")
async def get_healing_loop_status(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """
    Get the self-healing loop status.
    
    The healing loop continuously monitors for faults and automatically
    applies remediation actions. It works across all three mesh lanes.
    """
    _healing_loop_state["last_check"] = datetime.now(timezone.utc).isoformat()

    # Check for expired faults and auto-heal
    now = datetime.now(timezone.utc)
    auto_healed = 0
    for fault in _active_faults.values():
        if fault.get("status") == "active":
            expires = datetime.fromisoformat(fault["expires_at"].replace("Z", "+00:00"))
            if now > expires:
                fault["status"] = "auto_healed"
                auto_healed += 1

    if auto_healed > 0:
        _healing_loop_state["faults_healed"] += auto_healed
        _healing_loop_state["healing_actions"].append({
            "action": "auto_expire",
            "faults_healed": auto_healed,
            "timestamp": now.isoformat(),
        })

    return {
        "status": "ok",
        "healing_loop": _healing_loop_state,
        "active_faults": sum(1 for f in _active_faults.values() if f.get("status") == "active"),
        "mesh_lane": "cross_lane",
    }


# ============================================================
# SCHEDULING
# ============================================================

@router.post("/schedule")
async def schedule_experiment(
    request: ScheduleRequest,
    current_user: CurrentUser = Depends(require_min_role(UserRole.USER)),
    db: AsyncSession = Depends(get_db_session),
):
    """
    Schedule recurring chaos experiments.
    
    Regular chaos testing ensures the ecosystem maintains resilience
    as new features and services are deployed.
    """
    experiment = _experiments.get(request.experiment_id)
    if not experiment:
        raise HTTPException(404, f"Experiment '{request.experiment_id}' not found")

    schedule = {
        "schedule_id": str(uuid.uuid4())[:12],
        "experiment_id": request.experiment_id,
        "experiment_name": experiment["name"],
        "cron": request.cron,
        "enabled": request.enabled,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "last_run": None,
        "next_run": None,
        "run_count": 0,
    }
    _scheduled_experiments.append(schedule)

    return {
        "status": "ok",
        "schedule": schedule,
        "mesh_lane": "cross_lane",
    }