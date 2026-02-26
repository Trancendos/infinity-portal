"""
Infinity OS — Multi-Framework Compliance Router
Exposes: SOC2, ISO27001, GDPR, HIPAA, NIST CSF, EU AI Act, 2060 Standard
"""

from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone

from auth import get_current_user, require_min_role, require_permission, UserRole
from compliance_framework import (
    get_compliance_engine, ComplianceFramework, ControlCategory,
    ControlStatus, Severity,
)
from standard_2060 import (
    get_validator, Standard2060Validator, CapabilityInvocationAudit,
    DataLineageEntry, ConsentRecord2060, ConsentType2060, DataResidency,
    InvocationRisk,
)

router = APIRouter(prefix="/api/v1/compliance-frameworks", tags=["Compliance Frameworks"])


# ── Request Models ────────────────────────────────────────────────────────────

class PlatformStateRequest(BaseModel):
    has_mfa: bool = False
    has_rbac: bool = True
    has_audit_log: bool = True
    has_encryption_at_rest: bool = False
    has_tls: bool = True
    has_hitl: bool = True
    has_c2pa: bool = False
    has_dpia: bool = False
    has_vuln_scanning: bool = False
    has_secrets_manager: bool = False
    has_consent_collection: bool = False
    has_data_deletion: bool = False
    has_merkle_audit: bool = False
    has_crypto_shredding: bool = False
    ai_systems_registered: int = 0
    open_critical_vulns: int = 0
    api_key_rotation_days: int = 90
    session_timeout_minutes: int = 30


class ConsentGrantRequest(BaseModel):
    consent_types: List[str] = Field(..., description="List of consent type values")
    data_residency: str = Field("eu", description="Data residency zone")
    expires_days: Optional[int] = Field(None, description="Consent expiry in days")


class InvocationCheckRequest(BaseModel):
    agent: str
    capability: str
    risk_level: str = "low"
    data_residency: str = "eu"
    consent_tokens: List[str] = Field(default_factory=list)
    data_sources: List[Dict[str, Any]] = Field(default_factory=list)
    model_used: Optional[str] = None
    provider: Optional[str] = None


# ── Framework Controls ────────────────────────────────────────────────────────

@router.get("/frameworks")
async def list_frameworks():
    """List all supported compliance frameworks."""
    return {
        "frameworks": [
            {"id": f.value, "name": f.value.replace("_", " ").upper()}
            for f in ComplianceFramework
        ]
    }


@router.get("/controls")
async def list_controls(
    framework: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    current_user=Depends(require_min_role(UserRole.USER)),
):
    """List compliance controls, optionally filtered by framework or category."""
    engine = get_compliance_engine()

    fw_enum = None
    if framework:
        try:
            fw_enum = ComplianceFramework(framework)
        except ValueError:
            raise HTTPException(400, f"Unknown framework: {framework}")

    cat_enum = None
    if category:
        try:
            cat_enum = ControlCategory(category)
        except ValueError:
            raise HTTPException(400, f"Unknown category: {category}")

    controls = engine.get_controls(framework=fw_enum, category=cat_enum)
    return {
        "controls": [c.to_dict() for c in controls],
        "count": len(controls),
        "filters": {"framework": framework, "category": category},
    }


# ── Automated Testing ─────────────────────────────────────────────────────────

@router.post("/test")
async def run_compliance_tests(
    state: PlatformStateRequest,
    current_user=Depends(require_min_role(UserRole.ORG_ADMIN)),
):
    """Run automated compliance tests against provided platform state."""
    engine = get_compliance_engine()
    org_id = str(current_user.organisation_id) if current_user.organisation_id else "default"

    results = engine.run_automated_tests(org_id, state.model_dump())

    passing = sum(1 for r in results.values() if r.status == ControlStatus.PASSING)
    failing = sum(1 for r in results.values() if r.status == ControlStatus.FAILING)
    total = len(results)

    return {
        "organisation_id": org_id,
        "tested_at": datetime.now(timezone.utc).isoformat(),
        "summary": {
            "total": total,
            "passing": passing,
            "failing": failing,
            "score": round(passing / total * 100, 1) if total > 0 else 0,
        },
        "results": {cid: r.to_dict() for cid, r in results.items()},
    }


# ── Reports ───────────────────────────────────────────────────────────────────

@router.get("/report/{framework}")
async def get_framework_report(
    framework: str,
    current_user=Depends(require_min_role(UserRole.USER)),
):
    """Generate a compliance report for a specific framework."""
    try:
        fw_enum = ComplianceFramework(framework)
    except ValueError:
        raise HTTPException(400, f"Unknown framework: {framework}")

    engine = get_compliance_engine()
    org_id = str(current_user.organisation_id) if current_user.organisation_id else "default"

    # Use default platform state if no tests run yet
    default_state = {
        "has_mfa": False, "has_rbac": True, "has_audit_log": True,
        "has_encryption_at_rest": False, "has_tls": True, "has_hitl": True,
        "has_c2pa": False, "has_dpia": False, "has_vuln_scanning": False,
        "has_secrets_manager": False, "has_consent_collection": False,
        "has_data_deletion": False, "has_merkle_audit": False,
        "has_crypto_shredding": False, "ai_systems_registered": 0,
        "open_critical_vulns": 0, "api_key_rotation_days": 90,
        "session_timeout_minutes": 30,
    }

    report = engine.generate_report(org_id, fw_enum, platform_state=default_state)
    return report.to_dict()


@router.post("/report/{framework}")
async def generate_framework_report(
    framework: str,
    state: PlatformStateRequest,
    current_user=Depends(require_min_role(UserRole.USER)),
):
    """Generate a compliance report with custom platform state."""
    try:
        fw_enum = ComplianceFramework(framework)
    except ValueError:
        raise HTTPException(400, f"Unknown framework: {framework}")

    engine = get_compliance_engine()
    org_id = str(current_user.organisation_id) if current_user.organisation_id else "default"
    report = engine.generate_report(org_id, fw_enum, platform_state=state.model_dump())
    return report.to_dict()


@router.get("/summary")
async def get_cross_framework_summary(
    current_user=Depends(require_min_role(UserRole.USER)),
):
    """Get compliance posture summary across all frameworks."""
    engine = get_compliance_engine()
    org_id = str(current_user.organisation_id) if current_user.organisation_id else "default"
    return engine.get_cross_framework_summary(org_id)


# ── 2060 Standard ─────────────────────────────────────────────────────────────

@router.post("/2060/check")
async def check_2060_compliance(
    request: InvocationCheckRequest,
    current_user=Depends(get_current_user),
):
    """Check a capability invocation against the 2060 Standard."""
    validator = get_validator()
    org_id = str(current_user.organisation_id) if current_user.organisation_id else "default"

    # Build data lineage entries
    data_sources = []
    for ds in request.data_sources:
        data_sources.append(DataLineageEntry(
            timestamp=datetime.now(timezone.utc).isoformat(),
            source_type=ds.get("source_type", "unknown"),
            identifier=ds.get("identifier", ""),
            license=ds.get("license", "proprietary"),
            generated_by_ai=ds.get("generated_by_ai", False),
            human_reviewed=ds.get("human_reviewed", False),
        ))

    try:
        risk = InvocationRisk(request.risk_level)
    except ValueError:
        risk = InvocationRisk.LOW

    audit = CapabilityInvocationAudit(
        user_id=str(current_user.id),
        organisation_id=org_id,
        agent=request.agent,
        capability=request.capability,
        risk_level=risk,
        data_residency=request.data_residency,
        consent_tokens=request.consent_tokens,
        data_sources=data_sources,
        model_used=request.model_used,
        provider=request.provider,
    )

    # Determine org tier
    org_tier = "free"
    if hasattr(current_user, "organisation") and current_user.organisation:
        plan = getattr(current_user.organisation, "plan", "free")
        org_tier = plan.value if hasattr(plan, "value") else str(plan)

    result = validator.validate(audit, org_tier=org_tier)
    return result.to_dict()


@router.post("/2060/consent")
async def grant_consent(
    request: ConsentGrantRequest,
    current_user=Depends(get_current_user),
):
    """Grant consent for data processing under 2060 Standard."""
    validator = get_validator()

    consent_types = []
    for ct in request.consent_types:
        try:
            consent_types.append(ConsentType2060(ct))
        except ValueError:
            raise HTTPException(400, f"Unknown consent type: {ct}")

    try:
        residency = DataResidency(request.data_residency)
    except ValueError:
        raise HTTPException(400, f"Unknown data residency: {request.data_residency}")

    expires_at = None
    if request.expires_days:
        from datetime import timedelta
        expires_at = (datetime.now(timezone.utc) + timedelta(days=request.expires_days)).isoformat()

    record = ConsentRecord2060(
        user_id=str(current_user.id),
        organisation_id=str(current_user.organisation_id) if current_user.organisation_id else "",
        consent_types=consent_types,
        data_residency=residency,
        expires_at=expires_at,
    )

    token = validator.register_consent(record)
    return {
        "consent_token": token,
        "consent_types": [ct.value for ct in consent_types],
        "data_residency": residency.value,
        "granted_at": record.granted_at,
        "expires_at": expires_at,
    }


@router.delete("/2060/consent/{token}")
async def revoke_consent(
    token: str,
    current_user=Depends(get_current_user),
):
    """Revoke a consent record."""
    validator = get_validator()
    revoked = validator.revoke_consent(token)
    if not revoked:
        raise HTTPException(404, f"Consent token not found")
    return {"revoked": True, "token": token, "revoked_at": datetime.now(timezone.utc).isoformat()}


@router.get("/2060/residency-zones")
async def get_residency_zones():
    """Get available data residency zones."""
    return {"zones": [{"id": z.value, "name": z.value.upper()} for z in DataResidency]}


@router.get("/2060/consent-types")
async def get_consent_types():
    """Get available consent types."""
    descriptions = {
        "processing": "Allow data processing for service delivery",
        "analytics": "Allow usage analytics and performance monitoring",
        "training": "Allow use of data for AI model training (opt-in only)",
        "third_party": "Allow sharing with trusted third parties",
        "export": "Allow data export and portability",
        "profiling": "Allow behavioural profiling for personalisation",
    }
    return {
        "consent_types": [
            {"id": ct.value, "description": descriptions.get(ct.value, ct.value)}
            for ct in ConsentType2060
        ]
    }