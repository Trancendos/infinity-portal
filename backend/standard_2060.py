"""
Infinity OS — Trancendos 2060 Standard
Adapted from infinity-worker app/compliance/standard_2060.py

Future-Proof AI Governance Framework.
Core Pillars:
1. Data Residency & Sovereignty
2. Consent & Transparency
3. AI Auditability
4. Zero-Cost Infrastructure
5. Future-Proof Architecture
"""

import hashlib
import json
import uuid
from datetime import datetime, timezone
from dataclasses import dataclass, asdict, field
from typing import Dict, List, Any, Optional
from enum import Enum


class DataResidency(str, Enum):
    """Allowed data residency zones per 2060 standard."""
    EU = "eu"
    UK = "uk"
    US_EAST = "us-east"
    US_WEST = "us-west"
    APAC = "apac"
    GLOBAL = "global"


class ConsentType2060(str, Enum):
    """Explicit consent categories for user data and AI processing."""
    PROCESSING = "processing"    # Allow data processing
    ANALYTICS = "analytics"      # Allow usage analytics
    TRAINING = "training"        # Allow model training (NOT default)
    THIRD_PARTY = "third_party"  # Allow third-party sharing
    EXPORT = "export"            # Allow data export
    PROFILING = "profiling"      # Allow behavioural profiling


class InvocationRisk(str, Enum):
    """Risk level of a capability invocation."""
    LOW = "low"         # L0-L1: Simple rules, no autonomy
    MEDIUM = "medium"   # L2-L3: Managed, under constraints
    HIGH = "high"       # L4: Significant autonomy
    CRITICAL = "critical"  # L5: Cross-domain, high-impact


@dataclass
class DataLineageEntry:
    """Immutable record of data origin and transformation."""
    timestamp: str
    source_type: str   # "user-upload", "system-generated", "api-feed", "synthetic"
    identifier: str    # S3 URI, DB identifier, etc.
    license: str       # "proprietary", "cc-by-4.0", etc.
    generated_by_ai: bool = False
    human_reviewed: bool = False
    ai_model_used: Optional[str] = None
    checksum: Optional[str] = None  # SHA256 for immutability

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    def compute_checksum(self) -> str:
        content = json.dumps(asdict(self), sort_keys=True, default=str)
        return hashlib.sha256(content.encode()).hexdigest()


@dataclass
class ConsentRecord2060:
    """User consent audit trail — immutable."""
    consent_token: str = field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str = ""
    organisation_id: str = ""
    consent_types: List[ConsentType2060] = field(default_factory=list)
    granted_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    expires_at: Optional[str] = None
    revoked_at: Optional[str] = None
    data_residency: DataResidency = DataResidency.EU
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None

    def is_valid(self) -> bool:
        if self.revoked_at:
            return False
        if self.expires_at:
            return datetime.now(timezone.utc).isoformat() < self.expires_at
        return True

    def has_consent(self, consent_type: ConsentType2060) -> bool:
        return self.is_valid() and consent_type in self.consent_types

    def to_dict(self) -> Dict[str, Any]:
        return {
            "consent_token": self.consent_token,
            "user_id": self.user_id,
            "organisation_id": self.organisation_id,
            "consent_types": [c.value for c in self.consent_types],
            "granted_at": self.granted_at,
            "expires_at": self.expires_at,
            "revoked_at": self.revoked_at,
            "data_residency": self.data_residency.value,
            "is_valid": self.is_valid(),
        }


@dataclass
class CapabilityInvocationAudit:
    """Immutable audit record for every AI capability invocation."""
    invocation_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    user_id: str = ""
    organisation_id: str = ""
    agent: str = ""
    capability: str = ""
    risk_level: InvocationRisk = InvocationRisk.LOW
    data_residency: str = DataResidency.EU.value
    consent_tokens: List[str] = field(default_factory=list)
    data_sources: List[DataLineageEntry] = field(default_factory=list)
    model_used: Optional[str] = None
    provider: Optional[str] = None
    latency_ms: Optional[int] = None
    approved: bool = False
    rejection_reason: Optional[str] = None
    output_hash: Optional[str] = None  # SHA256 of output for tamper detection
    hitl_required: bool = False
    hitl_completed: bool = False

    def compute_output_hash(self, output: str) -> str:
        return hashlib.sha256(output.encode()).hexdigest()

    def to_dict(self) -> Dict[str, Any]:
        return {
            "invocation_id": self.invocation_id,
            "timestamp": self.timestamp,
            "user_id": self.user_id,
            "organisation_id": self.organisation_id,
            "agent": self.agent,
            "capability": self.capability,
            "risk_level": self.risk_level.value,
            "data_residency": self.data_residency,
            "consent_tokens": self.consent_tokens,
            "data_sources": [ds.to_dict() for ds in self.data_sources],
            "model_used": self.model_used,
            "provider": self.provider,
            "latency_ms": self.latency_ms,
            "approved": self.approved,
            "rejection_reason": self.rejection_reason,
            "output_hash": self.output_hash,
            "hitl_required": self.hitl_required,
            "hitl_completed": self.hitl_completed,
        }


@dataclass
class ComplianceCheckResult:
    """Result of a 2060 Standard compliance check."""
    approved: bool
    invocation_id: str
    checks_performed: List[str] = field(default_factory=list)
    violations: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    risk_level: InvocationRisk = InvocationRisk.LOW
    hitl_required: bool = False
    reason: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "approved": self.approved,
            "invocation_id": self.invocation_id,
            "checks_performed": self.checks_performed,
            "violations": self.violations,
            "warnings": self.warnings,
            "risk_level": self.risk_level.value,
            "hitl_required": self.hitl_required,
            "reason": self.reason,
        }


class Standard2060Validator:
    """
    Validates capability invocations against the Trancendos 2060 Standard.

    Checks:
    1. Data residency compliance
    2. Consent validity
    3. Data lineage integrity
    4. Risk level assessment
    5. HITL gate requirements
    """

    # Allowed data residency zones per organisation tier
    ALLOWED_RESIDENCY = {
        "free": [DataResidency.EU, DataResidency.UK],
        "pro": [DataResidency.EU, DataResidency.UK, DataResidency.US_EAST, DataResidency.US_WEST],
        "enterprise": list(DataResidency),
    }

    # Risk thresholds requiring HITL
    HITL_RISK_THRESHOLD = InvocationRisk.HIGH

    def __init__(self, consent_store: Optional[Dict[str, ConsentRecord2060]] = None):
        self.consent_store = consent_store or {}

    def validate(
        self,
        audit: CapabilityInvocationAudit,
        org_tier: str = "free",
    ) -> ComplianceCheckResult:
        """Run all 2060 Standard checks."""
        violations = []
        warnings = []
        checks = []

        # 1. Data residency check
        checks.append("data_residency")
        try:
            residency = DataResidency(audit.data_residency)
            allowed = self.ALLOWED_RESIDENCY.get(org_tier, self.ALLOWED_RESIDENCY["free"])
            if residency not in allowed:
                violations.append(
                    f"Data residency '{audit.data_residency}' not allowed for tier '{org_tier}'"
                )
        except ValueError:
            violations.append(f"Unknown data residency zone: '{audit.data_residency}'")

        # 2. Consent validation
        checks.append("consent_validation")
        if not audit.consent_tokens:
            warnings.append("No consent tokens provided — processing consent assumed")
        else:
            for token in audit.consent_tokens:
                record = self.consent_store.get(token)
                if not record:
                    warnings.append(f"Consent token '{token[:8]}...' not found in store")
                elif not record.is_valid():
                    violations.append(f"Consent token '{token[:8]}...' is expired or revoked")

        # 3. Data lineage check
        checks.append("data_lineage")
        for source in audit.data_sources:
            if source.generated_by_ai and not source.human_reviewed:
                warnings.append(
                    f"AI-generated data source '{source.identifier}' has not been human-reviewed"
                )
            if source.checksum:
                computed = source.compute_checksum()
                if computed != source.checksum:
                    violations.append(
                        f"Data lineage checksum mismatch for '{source.identifier}' — possible tampering"
                    )

        # 4. Risk assessment
        checks.append("risk_assessment")
        hitl_required = audit.risk_level.value in [InvocationRisk.HIGH.value, InvocationRisk.CRITICAL.value]
        if audit.risk_level == InvocationRisk.CRITICAL:
            warnings.append("CRITICAL risk level — enhanced monitoring applied")

        # 5. Agent/capability validation
        checks.append("agent_capability_validation")
        if not audit.agent or not audit.capability:
            violations.append("Agent and capability must be specified")

        approved = len(violations) == 0
        reason = "; ".join(violations) if violations else "All 2060 Standard checks passed"

        return ComplianceCheckResult(
            approved=approved,
            invocation_id=audit.invocation_id,
            checks_performed=checks,
            violations=violations,
            warnings=warnings,
            risk_level=audit.risk_level,
            hitl_required=hitl_required,
            reason=reason,
        )

    def register_consent(self, record: ConsentRecord2060) -> str:
        """Register a consent record."""
        self.consent_store[record.consent_token] = record
        return record.consent_token

    def revoke_consent(self, token: str) -> bool:
        """Revoke a consent record."""
        if token in self.consent_store:
            self.consent_store[token].revoked_at = datetime.now(timezone.utc).isoformat()
            return True
        return False


# Global validator instance
_validator: Optional[Standard2060Validator] = None


def get_validator() -> Standard2060Validator:
    global _validator
    if _validator is None:
        _validator = Standard2060Validator()
    return _validator