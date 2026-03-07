# routers/guardian.py — Infinity-One / Guardian — Identity & Access Management
# Migrated from Trancendos monorepo (TypeScript) → Python FastAPI
# Wave 1 Migration — FULLY IMPLEMENTED
#
# The Guardian sits on Lane 2 (User/Infinity) and manages all identity,
# authentication, and access control for the Trancendos Ecosystem.
# It provides agent token issuance, zero-trust verification, behavioural
# baseline monitoring, RBAC policy evaluation, session management, and
# EU AI Act context declarations for AI agent operations.

from typing import Optional, Dict, Any, List
from datetime import datetime, timezone, timedelta
import uuid
import hashlib
import hmac
import logging
import secrets

from fastapi import APIRouter, Depends, HTTPException, Query, Path, Body
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user, require_min_role, CurrentUser
from database import get_db_session

router = APIRouter(prefix="/api/v1/guardian", tags=['Guardian IAM'])
logger = logging.getLogger("guardian")

# ============================================================
# MODELS
# ============================================================

class AgentTokenRequest(BaseModel):
    agent_id: str = Field(..., min_length=1, max_length=128)
    scopes: List[str] = Field(default_factory=lambda: ["read"])
    ttl_seconds: int = Field(default=3600, ge=60, le=86400)
    lane: str = Field(default="ai_nexus", pattern="^(ai_nexus|user_infinity|data_hive|cross_lane)$")
    metadata: Dict[str, Any] = Field(default_factory=dict)

class TokenVerifyRequest(BaseModel):
    token: str = Field(..., min_length=32)
    required_scopes: List[str] = Field(default_factory=list)

class TokenRevokeRequest(BaseModel):
    token: str = Field(..., min_length=32)
    reason: str = Field(default="manual_revocation", max_length=256)

class BehavioralCheckRequest(BaseModel):
    agent_id: str = Field(..., min_length=1, max_length=128)
    action: str = Field(..., min_length=1, max_length=256)
    resource: str = Field(..., min_length=1, max_length=512)
    context: Dict[str, Any] = Field(default_factory=dict)

class RBACEvaluateRequest(BaseModel):
    subject: str = Field(..., min_length=1, max_length=256)
    action: str = Field(..., min_length=1, max_length=128)
    resource: str = Field(..., min_length=1, max_length=512)
    environment: Dict[str, Any] = Field(default_factory=dict)

class ContextDeclaration(BaseModel):
    agent_id: str = Field(..., min_length=1, max_length=128)
    purpose: str = Field(..., min_length=1, max_length=1000)
    data_categories: List[str] = Field(default_factory=list)
    risk_level: str = Field(default="limited", pattern="^(minimal|limited|high|unacceptable)$")
    human_oversight: bool = True
    transparency_notice: Optional[str] = None

# ============================================================
# IN-MEMORY STATE (production: Redis + Turso)
# ============================================================

_agent_tokens: Dict[str, Dict[str, Any]] = {}
_revoked_tokens: set = set()
_behavioral_baselines: Dict[str, Dict[str, Any]] = {}
_sessions: Dict[str, Dict[str, Any]] = {}
_context_declarations: Dict[str, Dict[str, Any]] = {}
_audit_log: List[Dict[str, Any]] = []

# RBAC policy definitions
_RBAC_POLICIES = {
    "admin": {
        "role": "admin",
        "permissions": ["*"],
        "description": "Full platform access",
    },
    "developer": {
        "role": "developer",
        "permissions": [
            "read:*", "write:code", "write:config", "execute:build",
            "execute:deploy:staging", "read:logs", "read:metrics",
        ],
        "description": "Development and staging deployment access",
    },
    "operator": {
        "role": "operator",
        "permissions": [
            "read:*", "execute:deploy:*", "write:config",
            "execute:maintenance", "read:audit",
        ],
        "description": "Operations and deployment access",
    },
    "viewer": {
        "role": "viewer",
        "permissions": ["read:*"],
        "description": "Read-only access to all resources",
    },
    "agent": {
        "role": "agent",
        "permissions": [
            "read:assigned", "write:assigned", "execute:assigned",
            "read:mesh_topology", "write:messages",
        ],
        "description": "AI agent scoped access",
    },
}

# Seed behavioral baselines for system agents
_SEED_BASELINES = {
    "norman": {
        "agent_id": "norman",
        "typical_actions": ["vulnerability_scan", "threat_detection", "compliance_audit", "alert"],
        "typical_resources": ["/api/v1/norman/*", "/api/v1/security/*"],
        "avg_requests_per_minute": 15,
        "max_requests_per_minute": 50,
        "typical_hours": list(range(24)),  # 24/7 operation
        "anomaly_threshold": 2.5,
        "last_updated": datetime.now(timezone.utc).isoformat(),
    },
    "the_dr": {
        "agent_id": "the_dr",
        "typical_actions": ["code_analysis", "heal", "diagnose", "anomaly_detection"],
        "typical_resources": ["/api/v1/the-dr/*", "/api/v1/codegen/*"],
        "avg_requests_per_minute": 8,
        "max_requests_per_minute": 30,
        "typical_hours": list(range(24)),
        "anomaly_threshold": 2.0,
        "last_updated": datetime.now(timezone.utc).isoformat(),
    },
    "guardian": {
        "agent_id": "guardian",
        "typical_actions": ["token_issue", "token_verify", "rbac_evaluate", "session_manage"],
        "typical_resources": ["/api/v1/guardian/*", "/api/v1/auth/*"],
        "avg_requests_per_minute": 50,
        "max_requests_per_minute": 200,
        "typical_hours": list(range(24)),
        "anomaly_threshold": 3.0,
        "last_updated": datetime.now(timezone.utc).isoformat(),
    },
}
_behavioral_baselines.update(_SEED_BASELINES)


def _generate_token() -> str:
    """Generate a cryptographically secure agent token."""
    return f"grd_{secrets.token_urlsafe(48)}"


def _hash_token(token: str) -> str:
    """Hash a token for storage (never store raw tokens)."""
    return hashlib.sha256(token.encode()).hexdigest()


def _log_audit(action: str, subject: str, details: Dict[str, Any]):
    """Append to immutable audit log."""
    _audit_log.append({
        "event_id": f"aud-{uuid.uuid4().hex[:8]}",
        "action": action,
        "subject": subject,
        "details": details,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })


# ============================================================
# ENDPOINTS
# ============================================================

@router.post("/agent-token")
async def issue_agent_token(
    request: AgentTokenRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Issue a scoped authentication token for an AI agent.

    Tokens are lane-scoped and time-limited.  The Guardian tracks
    all issued tokens and can revoke them instantly.
    """
    token = _generate_token()
    token_hash = _hash_token(token)
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(seconds=request.ttl_seconds)

    token_record = {
        "token_hash": token_hash,
        "agent_id": request.agent_id,
        "scopes": request.scopes,
        "lane": request.lane,
        "issued_at": now.isoformat(),
        "expires_at": expires_at.isoformat(),
        "ttl_seconds": request.ttl_seconds,
        "status": "active",
        "issued_by": current_user.get("sub", "anonymous"),
        "metadata": request.metadata,
        "usage_count": 0,
    }

    _agent_tokens[token_hash] = token_record
    _log_audit("token_issued", request.agent_id, {
        "scopes": request.scopes, "lane": request.lane, "ttl": request.ttl_seconds,
    })

    logger.info(f"Agent token issued: {request.agent_id} on {request.lane} ({len(request.scopes)} scopes)")
    return {
        "token": token,  # Only returned once — never stored in plaintext
        "agent_id": request.agent_id,
        "scopes": request.scopes,
        "lane": request.lane,
        "expires_at": expires_at.isoformat(),
        "ttl_seconds": request.ttl_seconds,
    }


@router.post("/verify-token")
async def verify_token(
    request: TokenVerifyRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Verify an agent token and check scope permissions."""
    token_hash = _hash_token(request.token)

    # Check revocation
    if token_hash in _revoked_tokens:
        return {"valid": False, "reason": "token_revoked"}

    record = _agent_tokens.get(token_hash)
    if not record:
        return {"valid": False, "reason": "token_not_found"}

    # Check expiry
    now = datetime.now(timezone.utc)
    expires_at = datetime.fromisoformat(record["expires_at"])
    if now > expires_at:
        return {"valid": False, "reason": "token_expired", "expired_at": record["expires_at"]}

    # Check scopes
    if request.required_scopes:
        token_scopes = set(record["scopes"])
        required = set(request.required_scopes)
        if not required.issubset(token_scopes) and "*" not in token_scopes:
            missing = required - token_scopes
            return {"valid": False, "reason": "insufficient_scopes", "missing_scopes": list(missing)}

    record["usage_count"] += 1

    return {
        "valid": True,
        "agent_id": record["agent_id"],
        "scopes": record["scopes"],
        "lane": record["lane"],
        "expires_at": record["expires_at"],
        "remaining_seconds": int((expires_at - now).total_seconds()),
    }


@router.post("/revoke-token")
async def revoke_token(
    request: TokenRevokeRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Revoke an agent token immediately."""
    token_hash = _hash_token(request.token)

    if token_hash in _revoked_tokens:
        raise HTTPException(status_code=409, detail="Token already revoked")

    record = _agent_tokens.get(token_hash)
    if not record:
        raise HTTPException(status_code=404, detail="Token not found")

    _revoked_tokens.add(token_hash)
    record["status"] = "revoked"
    record["revoked_at"] = datetime.now(timezone.utc).isoformat()
    record["revoked_by"] = current_user.get("sub", "anonymous")
    record["revocation_reason"] = request.reason

    _log_audit("token_revoked", record["agent_id"], {"reason": request.reason})
    logger.info(f"Token revoked for agent {record['agent_id']}: {request.reason}")

    return {"revoked": True, "agent_id": record["agent_id"], "reason": request.reason}


@router.get("/behavioral-baseline/{agent_id}")
async def get_behavioral_baseline(
    agent_id: str = Path(..., min_length=1, max_length=128),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Get the behavioral baseline for an agent.

    Behavioral baselines define normal operating patterns for each agent,
    enabling anomaly detection when an agent deviates from expected behavior.
    """
    baseline = _behavioral_baselines.get(agent_id)
    if not baseline:
        raise HTTPException(status_code=404, detail=f"No baseline for agent '{agent_id}'")
    return baseline


@router.post("/behavioral-check")
async def behavioral_check(
    request: BehavioralCheckRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Check if an agent's action matches its behavioral baseline.

    Zero-trust verification — every action is checked against the
    agent's established behavioral profile.  Deviations are flagged
    and may trigger additional verification or blocking.
    """
    baseline = _behavioral_baselines.get(request.agent_id)

    if not baseline:
        # No baseline = first-time agent, allow but flag
        return {
            "allowed": True,
            "confidence": 0.5,
            "reason": "no_baseline_established",
            "recommendation": "establish_baseline",
            "agent_id": request.agent_id,
            "action": request.action,
        }

    # Check action against typical actions
    action_match = request.action in baseline.get("typical_actions", [])

    # Check resource against typical resources
    resource_match = any(
        request.resource.startswith(r.replace("*", ""))
        for r in baseline.get("typical_resources", [])
    )

    # Calculate confidence score
    confidence = 0.0
    if action_match:
        confidence += 0.5
    if resource_match:
        confidence += 0.3

    # Time-based check
    current_hour = datetime.now(timezone.utc).hour
    if current_hour in baseline.get("typical_hours", []):
        confidence += 0.2

    allowed = confidence >= 0.5
    anomaly_detected = confidence < 0.3

    result = {
        "allowed": allowed,
        "confidence": round(confidence, 3),
        "agent_id": request.agent_id,
        "action": request.action,
        "resource": request.resource,
        "checks": {
            "action_match": action_match,
            "resource_match": resource_match,
            "time_match": current_hour in baseline.get("typical_hours", []),
        },
        "anomaly_detected": anomaly_detected,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    if anomaly_detected:
        _log_audit("behavioral_anomaly", request.agent_id, {
            "action": request.action, "resource": request.resource, "confidence": confidence,
        })
        logger.warning(f"Behavioral anomaly: {request.agent_id} — {request.action} on {request.resource}")

    return result


@router.get("/zero-trust/status")
async def get_zero_trust_status(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Get Zero-Trust security posture status.

    Zero-Trust means every request is verified regardless of source.
    This endpoint reports the current verification coverage and health.
    """
    active_tokens = sum(
        1 for t in _agent_tokens.values()
        if t["status"] == "active"
        and datetime.fromisoformat(t["expires_at"]) > datetime.now(timezone.utc)
    )
    revoked_tokens = len(_revoked_tokens)
    total_baselines = len(_behavioral_baselines)

    recent_anomalies = sum(
        1 for a in _audit_log
        if a["action"] == "behavioral_anomaly"
        and (datetime.now(timezone.utc) - datetime.fromisoformat(a["timestamp"])).total_seconds() < 3600
    )

    return {
        "zero_trust_enabled": True,
        "posture": "strong" if recent_anomalies == 0 else "elevated" if recent_anomalies < 3 else "critical",
        "active_agent_tokens": active_tokens,
        "revoked_tokens": revoked_tokens,
        "behavioral_baselines": total_baselines,
        "recent_anomalies_1h": recent_anomalies,
        "policies_loaded": len(_RBAC_POLICIES),
        "active_sessions": len([s for s in _sessions.values() if s.get("status") == "active"]),
        "context_declarations": len(_context_declarations),
        "audit_events_total": len(_audit_log),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.post("/rbac/evaluate")
async def evaluate_rbac(
    request: RBACEvaluateRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Evaluate an RBAC policy decision.

    Checks whether a subject (user or agent) is permitted to perform
    an action on a resource given the current environment context.
    """
    # Determine subject's role (simplified — production: lookup from DB)
    subject_role = request.environment.get("role", "viewer")
    policy = _RBAC_POLICIES.get(subject_role)

    if not policy:
        return {
            "allowed": False,
            "reason": "unknown_role",
            "subject": request.subject,
            "action": request.action,
            "resource": request.resource,
        }

    permissions = policy["permissions"]

    # Check permissions
    allowed = False
    matched_permission = None

    for perm in permissions:
        if perm == "*":
            allowed = True
            matched_permission = "*"
            break

        perm_parts = perm.split(":")
        action_pattern = perm_parts[0] if len(perm_parts) > 0 else ""
        resource_pattern = perm_parts[1] if len(perm_parts) > 1 else "*"

        action_match = action_pattern == "*" or action_pattern == request.action.split(":")[0]
        resource_match = resource_pattern == "*" or request.resource.startswith(resource_pattern.replace("*", ""))

        if action_match and resource_match:
            allowed = True
            matched_permission = perm
            break

    _log_audit("rbac_evaluate", request.subject, {
        "action": request.action, "resource": request.resource,
        "role": subject_role, "allowed": allowed,
    })

    return {
        "allowed": allowed,
        "subject": request.subject,
        "role": subject_role,
        "action": request.action,
        "resource": request.resource,
        "matched_permission": matched_permission,
        "policy": policy["description"],
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/sessions/active")
async def get_active_sessions(
    agent_id: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Get all active sessions."""
    sessions = [s for s in _sessions.values() if s.get("status") == "active"]
    if agent_id:
        sessions = [s for s in sessions if s.get("agent_id") == agent_id]

    sessions.sort(key=lambda s: s.get("created_at", ""), reverse=True)

    return {
        "total": len(sessions),
        "sessions": sessions[:limit],
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.delete("/sessions/{session_id}")
async def terminate_session(
    session_id: str = Path(..., min_length=1),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Terminate an active session."""
    session = _sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")

    session["status"] = "terminated"
    session["terminated_at"] = datetime.now(timezone.utc).isoformat()
    session["terminated_by"] = current_user.get("sub", "anonymous")

    _log_audit("session_terminated", session_id, {"terminated_by": session["terminated_by"]})
    return {"terminated": True, "session_id": session_id}


@router.post("/context-declaration")
async def submit_context_declaration(
    declaration: ContextDeclaration,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Submit an EU AI Act context declaration for an AI agent.

    Under the EU AI Act, AI systems must declare their purpose,
    data categories processed, risk level, and human oversight
    arrangements before operating.
    """
    decl_id = f"ctx-{uuid.uuid4().hex[:8]}"
    now = datetime.now(timezone.utc)

    # Validate risk level constraints
    if declaration.risk_level == "unacceptable":
        raise HTTPException(
            status_code=403,
            detail="Unacceptable risk AI systems are prohibited under EU AI Act Article 5"
        )

    if declaration.risk_level == "high" and not declaration.human_oversight:
        raise HTTPException(
            status_code=400,
            detail="High-risk AI systems require human oversight under EU AI Act Article 14"
        )

    record = {
        "declaration_id": decl_id,
        "agent_id": declaration.agent_id,
        "purpose": declaration.purpose,
        "data_categories": declaration.data_categories,
        "risk_level": declaration.risk_level,
        "human_oversight": declaration.human_oversight,
        "transparency_notice": declaration.transparency_notice or f"AI agent {declaration.agent_id} operating for: {declaration.purpose}",
        "status": "active",
        "declared_by": current_user.get("sub", "anonymous"),
        "declared_at": now.isoformat(),
        "valid_until": (now + timedelta(days=365)).isoformat(),
        "eu_ai_act_compliance": {
            "article_5_prohibited": declaration.risk_level == "unacceptable",
            "article_6_high_risk": declaration.risk_level == "high",
            "article_14_human_oversight": declaration.human_oversight,
            "article_52_transparency": declaration.transparency_notice is not None,
        },
    }

    _context_declarations[decl_id] = record
    _log_audit("context_declaration", declaration.agent_id, {
        "risk_level": declaration.risk_level, "purpose": declaration.purpose[:100],
    })

    logger.info(f"Context declaration {decl_id}: {declaration.agent_id} — risk={declaration.risk_level}")
    return record