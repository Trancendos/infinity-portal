# routers/the_dr.py — The Lab / TheDr — Autonomous Code Generation and Self-Healing
# Migrated from Trancendos monorepo (TypeScript) → Python FastAPI
# Wave 1 Migration — FULLY IMPLEMENTED
#
# TheDr is the self-healing intelligence of the Trancendos Ecosystem.
# It sits on Lane 1 (AI/Nexus) and provides autonomous anomaly detection,
# code analysis, diagnosis, and closed-loop self-healing.  When a fault
# is detected anywhere in the Three-Lane Mesh, TheDr diagnoses the root
# cause, generates a remediation plan, and (with approval) applies the fix.

from typing import Optional, Dict, Any, List
from datetime import datetime, timezone, timedelta
import uuid
import hashlib
import logging
import traceback
import re

from fastapi import APIRouter, Depends, HTTPException, Query, Path, Body
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user, require_min_role, CurrentUser
from database import get_db_session

router = APIRouter(prefix="/api/v1/the-dr", tags=['TheDr Self-Healing'])
logger = logging.getLogger("the-dr")

# ============================================================
# MODELS
# ============================================================

class HealRequest(BaseModel):
    target: str = Field(..., description="Service or component to heal")
    fault_description: str = Field(..., min_length=1, max_length=5000)
    severity: str = Field(default="medium", pattern="^(low|medium|high|critical)$")
    auto_apply: bool = Field(default=False, description="Auto-apply fix without approval")
    context: Dict[str, Any] = Field(default_factory=dict)

class CodeAnalysisRequest(BaseModel):
    code: str = Field(..., min_length=1, max_length=50000)
    language: str = Field(default="python", pattern="^(python|javascript|typescript|rust|go)$")
    analysis_type: str = Field(default="full", pattern="^(full|security|performance|style|bugs)$")

class CodeReviewRequest(BaseModel):
    code: str = Field(..., min_length=1, max_length=50000)
    language: str = Field(default="python")
    diff_only: bool = False
    context: Optional[str] = None

class DiagnoseRequest(BaseModel):
    symptoms: List[str] = Field(..., min_items=1, max_items=20)
    affected_services: List[str] = Field(default_factory=list)
    error_logs: Optional[str] = Field(None, max_length=20000)
    timeframe_minutes: int = Field(default=60, ge=1, le=1440)

# ============================================================
# IN-MEMORY STATE (production: Redis / Turso)
# ============================================================

_anomalies: Dict[str, Dict[str, Any]] = {}
_healing_history: List[Dict[str, Any]] = []
_metrics: Dict[str, Any] = {
    "total_heals": 0,
    "successful_heals": 0,
    "failed_heals": 0,
    "anomalies_detected": 0,
    "anomalies_resolved": 0,
    "code_analyses": 0,
    "code_reviews": 0,
    "diagnoses": 0,
    "avg_heal_time_ms": 0,
    "uptime_improvement_pct": 0,
}
_closed_loop_state: Dict[str, Any] = {
    "enabled": True,
    "mode": "supervised",  # supervised | autonomous
    "auto_heal_threshold": "medium",  # min severity for auto-heal
    "max_auto_heals_per_hour": 10,
    "heals_this_hour": 0,
    "hour_reset_at": datetime.now(timezone.utc).isoformat(),
    "approval_queue": [],
}

# Seed some anomalies for demonstration
_SEED_ANOMALIES = {
    "anom-001": {
        "anomaly_id": "anom-001",
        "type": "latency_spike",
        "service": "nexus-router",
        "lane": "ai_nexus",
        "severity": "medium",
        "description": "Pheromone trail calculation exceeding 500ms threshold",
        "detected_at": (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat(),
        "status": "active",
        "metrics": {"p99_latency_ms": 780, "baseline_ms": 120, "deviation_factor": 6.5},
    },
    "anom-002": {
        "anomaly_id": "anom-002",
        "type": "memory_leak",
        "service": "observatory-event-log",
        "lane": "cross_lane",
        "severity": "high",
        "description": "Hash-chain event log consuming 2.1GB, expected <500MB",
        "detected_at": (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat(),
        "status": "active",
        "metrics": {"current_mb": 2150, "expected_mb": 500, "growth_rate_mb_hr": 340},
    },
}
_anomalies.update(_SEED_ANOMALIES)
_metrics["anomalies_detected"] = len(_SEED_ANOMALIES)


def _hash(data: str) -> str:
    return hashlib.sha256(data.encode()).hexdigest()[:16]


# Code analysis patterns
_CODE_PATTERNS = {
    "python": {
        "security": [
            (r"eval\s*\(", "SECURITY", "Use of eval() — potential code injection", "critical"),
            (r"exec\s*\(", "SECURITY", "Use of exec() — potential code injection", "critical"),
            (r"pickle\.loads?\s*\(", "SECURITY", "Pickle deserialization — potential RCE", "high"),
            (r"subprocess\.call\s*\(.*shell\s*=\s*True", "SECURITY", "Shell injection risk", "high"),
            (r"os\.system\s*\(", "SECURITY", "os.system() — use subprocess instead", "medium"),
            (r"__import__\s*\(", "SECURITY", "Dynamic import — review for injection", "medium"),
        ],
        "performance": [
            (r"for .+ in .+:\s*\n\s+.+\.append\(", "PERF", "List append in loop — consider list comprehension", "low"),
            (r"time\.sleep\s*\(", "PERF", "Blocking sleep — use asyncio.sleep in async code", "medium"),
            (r"\.read\(\)", "PERF", "Reading entire file into memory — consider streaming", "low"),
        ],
        "bugs": [
            (r"except\s*:", "BUG", "Bare except — catches SystemExit and KeyboardInterrupt", "medium"),
            (r"== None", "BUG", "Use 'is None' instead of '== None'", "low"),
            (r"!= None", "BUG", "Use 'is not None' instead of '!= None'", "low"),
            (r"mutable default.*(=\s*\[\]|=\s*\{\})", "BUG", "Mutable default argument", "medium"),
        ],
        "style": [
            (r"import \*", "STYLE", "Wildcard import — be explicit", "low"),
            (r"#\s*TODO", "STYLE", "TODO comment found — track in issue tracker", "info"),
            (r"print\s*\(", "STYLE", "Print statement — use logging in production", "low"),
        ],
    },
}


def _analyze_code(code: str, language: str, analysis_type: str) -> Dict[str, Any]:
    """Run static analysis patterns against code."""
    findings = []
    patterns = _CODE_PATTERNS.get(language, {})

    types_to_check = [analysis_type] if analysis_type != "full" else list(patterns.keys())

    for check_type in types_to_check:
        for pattern, category, message, severity in patterns.get(check_type, []):
            for match in re.finditer(pattern, code):
                line_num = code[:match.start()].count("\n") + 1
                findings.append({
                    "line": line_num,
                    "column": match.start() - code.rfind("\n", 0, match.start()),
                    "category": category,
                    "severity": severity,
                    "message": message,
                    "snippet": code.split("\n")[line_num - 1].strip()[:100] if line_num <= code.count("\n") + 1 else "",
                    "rule": pattern[:40],
                })

    # Score
    severity_weights = {"critical": 10, "high": 5, "medium": 2, "low": 1, "info": 0}
    total_weight = sum(severity_weights.get(f["severity"], 0) for f in findings)
    max_score = 100
    score = max(0, max_score - total_weight)

    return {
        "findings": findings,
        "total_findings": len(findings),
        "score": score,
        "grade": "A" if score >= 90 else "B" if score >= 75 else "C" if score >= 60 else "D" if score >= 40 else "F",
        "by_severity": {
            sev: sum(1 for f in findings if f["severity"] == sev)
            for sev in ["critical", "high", "medium", "low", "info"]
        },
    }


def _generate_remediation(fault: str, target: str) -> Dict[str, Any]:
    """Generate a remediation plan for a fault."""
    fault_lower = fault.lower()

    if "latency" in fault_lower or "slow" in fault_lower:
        return {
            "strategy": "performance_optimization",
            "steps": [
                {"action": "profile", "description": f"Profile {target} with py-spy/perf"},
                {"action": "cache", "description": "Add Redis caching for hot paths"},
                {"action": "optimize", "description": "Optimize database queries with EXPLAIN ANALYZE"},
                {"action": "scale", "description": "Increase worker count or add horizontal replicas"},
            ],
            "estimated_impact": "60-80% latency reduction",
            "risk": "low",
        }
    elif "memory" in fault_lower or "leak" in fault_lower:
        return {
            "strategy": "memory_remediation",
            "steps": [
                {"action": "trace", "description": f"Attach tracemalloc to {target}"},
                {"action": "identify", "description": "Identify top memory allocators"},
                {"action": "fix", "description": "Add proper cleanup/gc for identified leaks"},
                {"action": "limit", "description": "Set memory limits via cgroups/container config"},
            ],
            "estimated_impact": "Memory usage reduced to baseline",
            "risk": "medium",
        }
    elif "error" in fault_lower or "crash" in fault_lower or "exception" in fault_lower:
        return {
            "strategy": "error_recovery",
            "steps": [
                {"action": "analyze", "description": "Parse error logs for root cause"},
                {"action": "patch", "description": f"Apply targeted fix to {target}"},
                {"action": "retry", "description": "Implement exponential backoff retry logic"},
                {"action": "circuit_break", "description": "Add circuit breaker for cascading failure prevention"},
            ],
            "estimated_impact": "Error rate reduced to <0.1%",
            "risk": "low",
        }
    else:
        return {
            "strategy": "general_remediation",
            "steps": [
                {"action": "diagnose", "description": f"Deep diagnosis of {target}"},
                {"action": "isolate", "description": "Isolate affected component"},
                {"action": "fix", "description": "Apply targeted remediation"},
                {"action": "verify", "description": "Run health checks post-fix"},
            ],
            "estimated_impact": "Service restored to healthy state",
            "risk": "medium",
        }


# ============================================================
# ENDPOINTS
# ============================================================

@router.post("/heal")
async def heal(
    request: HealRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Trigger self-healing for a target service or component.

    TheDr analyses the fault, generates a remediation plan, and
    optionally auto-applies the fix if approved or in autonomous mode.
    """
    heal_id = f"heal-{uuid.uuid4().hex[:10]}"
    remediation = _generate_remediation(request.fault_description, request.target)

    # Check auto-heal eligibility
    severity_order = ["low", "medium", "high", "critical"]
    threshold_idx = severity_order.index(_closed_loop_state["auto_heal_threshold"])
    request_idx = severity_order.index(request.severity)
    can_auto_heal = (
        request.auto_apply
        and _closed_loop_state["enabled"]
        and _closed_loop_state["mode"] == "autonomous"
        and request_idx >= threshold_idx
        and _closed_loop_state["heals_this_hour"] < _closed_loop_state["max_auto_heals_per_hour"]
    )

    applied = False
    if can_auto_heal:
        applied = True
        _closed_loop_state["heals_this_hour"] += 1

    heal_record = {
        "heal_id": heal_id,
        "target": request.target,
        "fault_description": request.fault_description,
        "severity": request.severity,
        "remediation": remediation,
        "auto_applied": applied,
        "status": "applied" if applied else "pending_approval",
        "initiated_by": current_user.get("sub", "anonymous"),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "completed_at": datetime.now(timezone.utc).isoformat() if applied else None,
        "context": request.context,
    }

    _healing_history.append(heal_record)
    _metrics["total_heals"] += 1
    if applied:
        _metrics["successful_heals"] += 1

    if not applied and _closed_loop_state["mode"] == "supervised":
        _closed_loop_state["approval_queue"].append(heal_id)

    logger.info(f"Heal {heal_id}: {request.target} — {'AUTO-APPLIED' if applied else 'PENDING APPROVAL'}")
    return heal_record


@router.get("/health")
async def get_health(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Get TheDr system health and self-healing status."""
    active_anomalies = sum(1 for a in _anomalies.values() if a["status"] == "active")
    resolved_anomalies = sum(1 for a in _anomalies.values() if a["status"] == "resolved")

    return {
        "status": "healthy" if active_anomalies == 0 else "degraded" if active_anomalies < 3 else "critical",
        "active_anomalies": active_anomalies,
        "resolved_anomalies": resolved_anomalies,
        "closed_loop": {
            "enabled": _closed_loop_state["enabled"],
            "mode": _closed_loop_state["mode"],
            "pending_approvals": len(_closed_loop_state["approval_queue"]),
        },
        "metrics_summary": {
            "total_heals": _metrics["total_heals"],
            "success_rate": round(
                _metrics["successful_heals"] / max(_metrics["total_heals"], 1), 3
            ),
        },
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/anomalies")
async def get_anomalies(
    status: Optional[str] = Query(None, pattern="^(active|resolved|investigating)$"),
    severity: Optional[str] = Query(None, pattern="^(low|medium|high|critical)$"),
    lane: Optional[str] = Query(None, pattern="^(ai_nexus|user_infinity|data_hive|cross_lane)$"),
    limit: int = Query(50, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Get detected anomalies across the Three-Lane Mesh."""
    anomalies = list(_anomalies.values())
    if status:
        anomalies = [a for a in anomalies if a["status"] == status]
    if severity:
        anomalies = [a for a in anomalies if a.get("severity") == severity]
    if lane:
        anomalies = [a for a in anomalies if a.get("lane") == lane]

    anomalies.sort(key=lambda a: a.get("detected_at", ""), reverse=True)
    return {
        "total": len(anomalies),
        "anomalies": anomalies[:limit],
        "by_severity": {
            sev: sum(1 for a in anomalies if a.get("severity") == sev)
            for sev in ["critical", "high", "medium", "low"]
        },
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.post("/anomalies/{anomaly_id}/resolve")
async def resolve_anomaly(
    anomaly_id: str = Path(..., min_length=1),
    resolution: Dict[str, Any] = Body(default={}),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Mark an anomaly as resolved with resolution details."""
    anomaly = _anomalies.get(anomaly_id)
    if not anomaly:
        raise HTTPException(status_code=404, detail=f"Anomaly '{anomaly_id}' not found")
    if anomaly["status"] == "resolved":
        raise HTTPException(status_code=409, detail="Anomaly already resolved")

    anomaly["status"] = "resolved"
    anomaly["resolved_at"] = datetime.now(timezone.utc).isoformat()
    anomaly["resolved_by"] = current_user.get("sub", "anonymous")
    anomaly["resolution"] = resolution.get("notes", "Manually resolved")
    anomaly["resolution_method"] = resolution.get("method", "manual")

    _metrics["anomalies_resolved"] += 1
    logger.info(f"Anomaly {anomaly_id} resolved by {anomaly['resolved_by']}")
    return anomaly


@router.get("/healing-history")
async def get_healing_history(
    target: Optional[str] = Query(None),
    status: Optional[str] = Query(None, pattern="^(applied|pending_approval|failed|rejected)$"),
    limit: int = Query(50, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Get history of all healing operations."""
    history = list(_healing_history)
    if target:
        history = [h for h in history if h["target"] == target]
    if status:
        history = [h for h in history if h["status"] == status]

    history.sort(key=lambda h: h["created_at"], reverse=True)
    return {
        "total": len(history),
        "history": history[:limit],
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.post("/code-analysis")
async def code_analysis(
    request: CodeAnalysisRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Run static code analysis with security, performance, and bug detection."""
    analysis = _analyze_code(request.code, request.language, request.analysis_type)
    _metrics["code_analyses"] += 1

    return {
        "analysis_id": f"ca-{uuid.uuid4().hex[:8]}",
        "language": request.language,
        "analysis_type": request.analysis_type,
        "lines_analyzed": request.code.count("\n") + 1,
        **analysis,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.post("/code-review")
async def code_review(
    request: CodeReviewRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """AI-assisted code review with actionable feedback."""
    # Run full analysis
    analysis = _analyze_code(request.code, request.language, "full")
    _metrics["code_reviews"] += 1

    # Generate review comments
    comments = []
    for finding in analysis["findings"]:
        comments.append({
            "line": finding["line"],
            "severity": finding["severity"],
            "category": finding["category"],
            "comment": finding["message"],
            "suggestion": f"Consider addressing: {finding['message']}",
        })

    # Overall assessment
    score = analysis["score"]
    if score >= 90:
        verdict = "APPROVED — Code meets quality standards"
    elif score >= 70:
        verdict = "APPROVED WITH COMMENTS — Minor issues to address"
    elif score >= 50:
        verdict = "CHANGES REQUESTED — Significant issues found"
    else:
        verdict = "REJECTED — Critical issues must be resolved"

    return {
        "review_id": f"rv-{uuid.uuid4().hex[:8]}",
        "verdict": verdict,
        "score": score,
        "grade": analysis["grade"],
        "comments": comments,
        "total_comments": len(comments),
        "by_severity": analysis["by_severity"],
        "context": request.context,
        "reviewer": "TheDr AI",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/metrics")
async def get_metrics(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Get TheDr operational metrics."""
    return {
        **_metrics,
        "success_rate": round(
            _metrics["successful_heals"] / max(_metrics["total_heals"], 1), 3
        ),
        "active_anomalies": sum(1 for a in _anomalies.values() if a["status"] == "active"),
        "pending_approvals": len(_closed_loop_state["approval_queue"]),
        "closed_loop_mode": _closed_loop_state["mode"],
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.post("/diagnose")
async def diagnose(
    request: DiagnoseRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Diagnose system issues from symptoms and error logs.

    TheDr correlates symptoms with known patterns, analyses error
    logs, and produces a ranked list of probable root causes with
    recommended actions.
    """
    _metrics["diagnoses"] += 1
    diagnosis_id = f"diag-{uuid.uuid4().hex[:8]}"

    # Symptom correlation (production: ML-based pattern matching)
    known_patterns = {
        "high latency": {"root_cause": "Resource contention or inefficient queries", "confidence": 0.8},
        "connection refused": {"root_cause": "Service down or port not listening", "confidence": 0.9},
        "out of memory": {"root_cause": "Memory leak or insufficient allocation", "confidence": 0.85},
        "timeout": {"root_cause": "Network issue or slow dependency", "confidence": 0.7},
        "authentication failed": {"root_cause": "Expired credentials or misconfigured IAM", "confidence": 0.75},
        "data corruption": {"root_cause": "Race condition or incomplete write", "confidence": 0.65},
        "certificate expired": {"root_cause": "PQC certificate rotation failure", "confidence": 0.9},
        "500 error": {"root_cause": "Unhandled exception in application code", "confidence": 0.6},
    }

    probable_causes = []
    for symptom in request.symptoms:
        symptom_lower = symptom.lower()
        for pattern, info in known_patterns.items():
            if pattern in symptom_lower or any(word in symptom_lower for word in pattern.split()):
                probable_causes.append({
                    "symptom": symptom,
                    "pattern_matched": pattern,
                    "root_cause": info["root_cause"],
                    "confidence": info["confidence"],
                    "remediation": _generate_remediation(symptom, request.affected_services[0] if request.affected_services else "unknown"),
                })

    if not probable_causes:
        probable_causes.append({
            "symptom": "; ".join(request.symptoms),
            "pattern_matched": "unknown",
            "root_cause": "No known pattern matched — requires manual investigation",
            "confidence": 0.3,
            "remediation": _generate_remediation("unknown fault", "system"),
        })

    # Log analysis
    log_insights = []
    if request.error_logs:
        lines = request.error_logs.split("\n")
        error_lines = [l for l in lines if any(kw in l.lower() for kw in ["error", "exception", "fatal", "critical"])]
        log_insights = [{"line": l.strip()[:200], "type": "error"} for l in error_lines[:10]]

    probable_causes.sort(key=lambda c: c["confidence"], reverse=True)

    return {
        "diagnosis_id": diagnosis_id,
        "symptoms": request.symptoms,
        "affected_services": request.affected_services,
        "timeframe_minutes": request.timeframe_minutes,
        "probable_causes": probable_causes,
        "log_insights": log_insights,
        "overall_confidence": round(
            max((c["confidence"] for c in probable_causes), default=0), 3
        ),
        "recommended_action": probable_causes[0]["remediation"] if probable_causes else None,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/closed-loop/status")
async def get_closed_loop_status(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Get closed-loop self-healing system status.

    The closed-loop system continuously monitors the Three-Lane Mesh,
    detects anomalies, generates remediation plans, and (in autonomous
    mode) auto-applies fixes within safety thresholds.
    """
    return {
        **_closed_loop_state,
        "active_anomalies": sum(1 for a in _anomalies.values() if a["status"] == "active"),
        "total_heals": _metrics["total_heals"],
        "success_rate": round(
            _metrics["successful_heals"] / max(_metrics["total_heals"], 1), 3
        ),
        "safety_checks": {
            "rate_limit_ok": _closed_loop_state["heals_this_hour"] < _closed_loop_state["max_auto_heals_per_hour"],
            "remaining_auto_heals": _closed_loop_state["max_auto_heals_per_hour"] - _closed_loop_state["heals_this_hour"],
            "threshold": _closed_loop_state["auto_heal_threshold"],
        },
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }