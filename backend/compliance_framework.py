"""
Infinity OS — Multi-Framework Compliance Engine
Adapted from infinity-worker v5.4 compliance_engine.py

Supports: SOC 2, ISO 27001, GDPR, HIPAA, HITRUST, NIST CSF, PCI DSS, EU AI Act, 2060 Standard
Vanta-style automated compliance monitoring with evidence collection.
"""

import json
import hashlib
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any, Callable
from enum import Enum
from dataclasses import dataclass, field
from collections import defaultdict
import re
import uuid


class ComplianceFramework(str, Enum):
    SOC2_TYPE1 = "soc2_type1"
    SOC2_TYPE2 = "soc2_type2"
    ISO27001 = "iso27001"
    GDPR = "gdpr"
    HIPAA = "hipaa"
    HITRUST = "hitrust"
    NIST_CSF = "nist_csf"
    PCI_DSS = "pci_dss"
    CMMC = "cmmc"
    SOX = "sox"
    EU_AI_ACT = "eu_ai_act"
    STANDARD_2060 = "standard_2060"
    CUSTOM = "custom"


class ControlStatus(str, Enum):
    PASSING = "passing"
    FAILING = "failing"
    WARNING = "warning"
    NOT_APPLICABLE = "not_applicable"
    NOT_TESTED = "not_tested"
    MANUAL_REVIEW = "manual_review"


class ControlCategory(str, Enum):
    ACCESS_CONTROL = "access_control"
    DATA_PROTECTION = "data_protection"
    ENCRYPTION = "encryption"
    LOGGING_MONITORING = "logging_monitoring"
    INCIDENT_RESPONSE = "incident_response"
    VENDOR_MANAGEMENT = "vendor_management"
    CHANGE_MANAGEMENT = "change_management"
    BUSINESS_CONTINUITY = "business_continuity"
    PHYSICAL_SECURITY = "physical_security"
    HR_SECURITY = "hr_security"
    NETWORK_SECURITY = "network_security"
    APPLICATION_SECURITY = "application_security"
    ASSET_MANAGEMENT = "asset_management"
    RISK_MANAGEMENT = "risk_management"
    AI_GOVERNANCE = "ai_governance"
    DATA_LINEAGE = "data_lineage"
    CONSENT_MANAGEMENT = "consent_management"


class Severity(str, Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "info"


@dataclass
class Control:
    """A compliance control definition"""
    id: str
    name: str
    description: str
    category: ControlCategory
    frameworks: List[ComplianceFramework]
    severity: Severity = Severity.MEDIUM
    remediation: str = ""
    evidence_required: List[str] = field(default_factory=list)
    automated: bool = True
    test_function: Optional[str] = None

    def to_dict(self) -> Dict:
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "category": self.category.value,
            "frameworks": [f.value for f in self.frameworks],
            "severity": self.severity.value,
            "remediation": self.remediation,
            "evidence_required": self.evidence_required,
            "automated": self.automated,
        }


@dataclass
class ControlResult:
    """Result of testing a control"""
    control_id: str
    status: ControlStatus
    tested_at: str
    evidence: List[str] = field(default_factory=list)
    findings: List[str] = field(default_factory=list)
    remediation_steps: List[str] = field(default_factory=list)
    score: float = 0.0  # 0-100
    next_test_due: Optional[str] = None

    def to_dict(self) -> Dict:
        return {
            "control_id": self.control_id,
            "status": self.status.value,
            "tested_at": self.tested_at,
            "evidence": self.evidence,
            "findings": self.findings,
            "remediation_steps": self.remediation_steps,
            "score": self.score,
            "next_test_due": self.next_test_due,
        }


@dataclass
class ComplianceReport:
    """Full compliance report for a framework"""
    id: str
    framework: ComplianceFramework
    organisation_id: str
    generated_at: str
    total_controls: int
    passing: int
    failing: int
    warning: int
    not_tested: int
    manual_review: int
    not_applicable: int
    overall_score: float
    control_results: List[ControlResult] = field(default_factory=list)
    critical_findings: List[str] = field(default_factory=list)
    recommendations: List[str] = field(default_factory=list)
    certification_ready: bool = False

    def to_dict(self) -> Dict:
        return {
            "id": self.id,
            "framework": self.framework.value,
            "organisation_id": self.organisation_id,
            "generated_at": self.generated_at,
            "summary": {
                "total_controls": self.total_controls,
                "passing": self.passing,
                "failing": self.failing,
                "warning": self.warning,
                "not_tested": self.not_tested,
                "manual_review": self.manual_review,
                "not_applicable": self.not_applicable,
                "overall_score": round(self.overall_score, 2),
                "certification_ready": self.certification_ready,
            },
            "critical_findings": self.critical_findings,
            "recommendations": self.recommendations,
            "control_results": [r.to_dict() for r in self.control_results],
        }


# ============================================================================
# CONTROL LIBRARY — Pre-built controls for each framework
# ============================================================================

CONTROL_LIBRARY: List[Control] = [
    # ── ACCESS CONTROL ──────────────────────────────────────────────────────
    Control(
        id="AC-001", name="Multi-Factor Authentication",
        description="MFA is enforced for all user accounts",
        category=ControlCategory.ACCESS_CONTROL,
        frameworks=[ComplianceFramework.SOC2_TYPE2, ComplianceFramework.ISO27001, ComplianceFramework.NIST_CSF],
        severity=Severity.CRITICAL,
        remediation="Enable MFA in auth settings for all users",
        evidence_required=["mfa_policy", "user_mfa_status"],
    ),
    Control(
        id="AC-002", name="Role-Based Access Control",
        description="RBAC is implemented with least-privilege principle",
        category=ControlCategory.ACCESS_CONTROL,
        frameworks=[ComplianceFramework.SOC2_TYPE2, ComplianceFramework.ISO27001, ComplianceFramework.HIPAA],
        severity=Severity.HIGH,
        remediation="Review and tighten role assignments",
        evidence_required=["rbac_policy", "role_assignments"],
    ),
    Control(
        id="AC-003", name="Session Timeout",
        description="User sessions expire after inactivity",
        category=ControlCategory.ACCESS_CONTROL,
        frameworks=[ComplianceFramework.SOC2_TYPE2, ComplianceFramework.PCI_DSS],
        severity=Severity.MEDIUM,
        remediation="Configure session timeout ≤ 30 minutes",
    ),
    Control(
        id="AC-004", name="Privileged Access Management",
        description="Super-admin accounts are monitored and audited",
        category=ControlCategory.ACCESS_CONTROL,
        frameworks=[ComplianceFramework.SOC2_TYPE2, ComplianceFramework.ISO27001, ComplianceFramework.PCI_DSS],
        severity=Severity.HIGH,
        remediation="Implement PAM solution and audit super-admin actions",
    ),
    Control(
        id="AC-005", name="API Key Rotation",
        description="API keys are rotated at least every 90 days",
        category=ControlCategory.ACCESS_CONTROL,
        frameworks=[ComplianceFramework.SOC2_TYPE2, ComplianceFramework.NIST_CSF],
        severity=Severity.MEDIUM,
        remediation="Implement automated API key rotation policy",
    ),

    # ── DATA PROTECTION ─────────────────────────────────────────────────────
    Control(
        id="DP-001", name="Encryption at Rest",
        description="All sensitive data is encrypted at rest (AES-256)",
        category=ControlCategory.DATA_PROTECTION,
        frameworks=[ComplianceFramework.SOC2_TYPE2, ComplianceFramework.ISO27001, ComplianceFramework.HIPAA, ComplianceFramework.GDPR],
        severity=Severity.CRITICAL,
        remediation="Enable database encryption and file system encryption",
        evidence_required=["encryption_config", "key_management_policy"],
    ),
    Control(
        id="DP-002", name="Encryption in Transit",
        description="All data in transit uses TLS 1.2+",
        category=ControlCategory.DATA_PROTECTION,
        frameworks=[ComplianceFramework.SOC2_TYPE2, ComplianceFramework.PCI_DSS, ComplianceFramework.HIPAA],
        severity=Severity.CRITICAL,
        remediation="Enforce TLS 1.2+ on all endpoints, disable older protocols",
    ),
    Control(
        id="DP-003", name="Data Classification",
        description="Data is classified by sensitivity level",
        category=ControlCategory.DATA_PROTECTION,
        frameworks=[ComplianceFramework.ISO27001, ComplianceFramework.GDPR],
        severity=Severity.HIGH,
        remediation="Implement data classification policy (Public/Internal/Confidential/Restricted)",
    ),
    Control(
        id="DP-004", name="Data Retention Policy",
        description="Data retention and deletion policies are enforced",
        category=ControlCategory.DATA_PROTECTION,
        frameworks=[ComplianceFramework.GDPR, ComplianceFramework.HIPAA, ComplianceFramework.SOC2_TYPE2],
        severity=Severity.HIGH,
        remediation="Define and automate data retention schedules",
    ),
    Control(
        id="DP-005", name="Crypto-Shredding on Deletion",
        description="Deleted user data is crypto-shredded (GDPR Art. 17)",
        category=ControlCategory.DATA_PROTECTION,
        frameworks=[ComplianceFramework.GDPR, ComplianceFramework.STANDARD_2060],
        severity=Severity.HIGH,
        remediation="Implement crypto-shredding in user deletion workflow",
        evidence_required=["crypto_shred_log"],
    ),

    # ── LOGGING & MONITORING ─────────────────────────────────────────────────
    Control(
        id="LM-001", name="Audit Logging",
        description="All privileged actions are logged with user, timestamp, and action",
        category=ControlCategory.LOGGING_MONITORING,
        frameworks=[ComplianceFramework.SOC2_TYPE2, ComplianceFramework.ISO27001, ComplianceFramework.HIPAA, ComplianceFramework.PCI_DSS],
        severity=Severity.HIGH,
        remediation="Enable comprehensive audit logging for all admin actions",
        evidence_required=["audit_log_sample"],
    ),
    Control(
        id="LM-002", name="Log Integrity",
        description="Audit logs are tamper-evident (Merkle tree or append-only)",
        category=ControlCategory.LOGGING_MONITORING,
        frameworks=[ComplianceFramework.SOC2_TYPE2, ComplianceFramework.STANDARD_2060],
        severity=Severity.HIGH,
        remediation="Implement Merkle tree batching for audit logs",
    ),
    Control(
        id="LM-003", name="Security Monitoring",
        description="Real-time security event monitoring and alerting",
        category=ControlCategory.LOGGING_MONITORING,
        frameworks=[ComplianceFramework.SOC2_TYPE2, ComplianceFramework.NIST_CSF, ComplianceFramework.ISO27001],
        severity=Severity.HIGH,
        remediation="Deploy SIEM or equivalent monitoring solution",
    ),
    Control(
        id="LM-004", name="Log Retention",
        description="Logs are retained for minimum 12 months",
        category=ControlCategory.LOGGING_MONITORING,
        frameworks=[ComplianceFramework.SOC2_TYPE2, ComplianceFramework.PCI_DSS, ComplianceFramework.HIPAA],
        severity=Severity.MEDIUM,
        remediation="Configure log retention policy ≥ 12 months",
    ),

    # ── AI GOVERNANCE ────────────────────────────────────────────────────────
    Control(
        id="AI-001", name="Human-in-the-Loop Gate",
        description="High-risk AI decisions require human review before execution",
        category=ControlCategory.AI_GOVERNANCE,
        frameworks=[ComplianceFramework.EU_AI_ACT, ComplianceFramework.STANDARD_2060],
        severity=Severity.CRITICAL,
        remediation="Implement HITL gate for all L3+ risk AI operations",
        evidence_required=["hitl_policy", "hitl_audit_log"],
    ),
    Control(
        id="AI-002", name="AI System Registration",
        description="All AI systems are registered in the AI system inventory",
        category=ControlCategory.AI_GOVERNANCE,
        frameworks=[ComplianceFramework.EU_AI_ACT],
        severity=Severity.HIGH,
        remediation="Register all AI systems in compliance dashboard",
        evidence_required=["ai_system_registry"],
    ),
    Control(
        id="AI-003", name="Content Provenance (C2PA)",
        description="AI-generated content is cryptographically signed with C2PA",
        category=ControlCategory.AI_GOVERNANCE,
        frameworks=[ComplianceFramework.EU_AI_ACT, ComplianceFramework.STANDARD_2060],
        severity=Severity.HIGH,
        remediation="Enable C2PA signing for all AI-generated outputs",
        evidence_required=["c2pa_manifest_sample"],
    ),
    Control(
        id="AI-004", name="DPIA for High-Risk AI",
        description="Data Protection Impact Assessments completed for high-risk AI",
        category=ControlCategory.AI_GOVERNANCE,
        frameworks=[ComplianceFramework.EU_AI_ACT, ComplianceFramework.GDPR],
        severity=Severity.HIGH,
        remediation="Complete DPIA for all high-risk AI systems",
        evidence_required=["dpia_records"],
    ),
    Control(
        id="AI-005", name="AI Bias Testing",
        description="AI models are tested for bias and fairness",
        category=ControlCategory.AI_GOVERNANCE,
        frameworks=[ComplianceFramework.EU_AI_ACT, ComplianceFramework.STANDARD_2060],
        severity=Severity.MEDIUM,
        remediation="Implement bias testing in AI model evaluation pipeline",
        automated=False,
    ),

    # ── CONSENT MANAGEMENT ───────────────────────────────────────────────────
    Control(
        id="CM-001", name="Explicit Consent Collection",
        description="User consent is explicitly collected before data processing",
        category=ControlCategory.CONSENT_MANAGEMENT,
        frameworks=[ComplianceFramework.GDPR, ComplianceFramework.STANDARD_2060],
        severity=Severity.CRITICAL,
        remediation="Implement consent collection at registration and for each processing purpose",
        evidence_required=["consent_records"],
    ),
    Control(
        id="CM-002", name="Consent Withdrawal",
        description="Users can withdraw consent at any time",
        category=ControlCategory.CONSENT_MANAGEMENT,
        frameworks=[ComplianceFramework.GDPR],
        severity=Severity.HIGH,
        remediation="Implement consent withdrawal mechanism in user settings",
    ),
    Control(
        id="CM-003", name="Data Subject Rights",
        description="Users can access, export, and delete their data (GDPR Art. 15-17)",
        category=ControlCategory.CONSENT_MANAGEMENT,
        frameworks=[ComplianceFramework.GDPR],
        severity=Severity.HIGH,
        remediation="Implement data subject request workflow",
    ),

    # ── APPLICATION SECURITY ─────────────────────────────────────────────────
    Control(
        id="AS-001", name="Vulnerability Scanning",
        description="Dependencies are scanned for CVEs weekly",
        category=ControlCategory.APPLICATION_SECURITY,
        frameworks=[ComplianceFramework.SOC2_TYPE2, ComplianceFramework.ISO27001, ComplianceFramework.NIST_CSF],
        severity=Severity.HIGH,
        remediation="Enable automated CVE scanning in CI/CD pipeline",
        evidence_required=["vuln_scan_report"],
    ),
    Control(
        id="AS-002", name="SAST/DAST Scanning",
        description="Static and dynamic application security testing in CI/CD",
        category=ControlCategory.APPLICATION_SECURITY,
        frameworks=[ComplianceFramework.SOC2_TYPE2, ComplianceFramework.PCI_DSS],
        severity=Severity.HIGH,
        remediation="Integrate SAST (CodeQL) and DAST (OWASP ZAP) into pipeline",
    ),
    Control(
        id="AS-003", name="Secrets Management",
        description="No secrets in source code; all secrets in vault/env",
        category=ControlCategory.APPLICATION_SECURITY,
        frameworks=[ComplianceFramework.SOC2_TYPE2, ComplianceFramework.ISO27001],
        severity=Severity.CRITICAL,
        remediation="Scan for secrets in code, move to secrets manager",
        evidence_required=["secrets_scan_report"],
    ),
    Control(
        id="AS-004", name="Dependency Update Policy",
        description="Critical security patches applied within 7 days",
        category=ControlCategory.APPLICATION_SECURITY,
        frameworks=[ComplianceFramework.SOC2_TYPE2, ComplianceFramework.NIST_CSF],
        severity=Severity.HIGH,
        remediation="Enable Dependabot and enforce SLA-based patch policy",
    ),

    # ── INCIDENT RESPONSE ────────────────────────────────────────────────────
    Control(
        id="IR-001", name="Incident Response Plan",
        description="Documented and tested incident response plan exists",
        category=ControlCategory.INCIDENT_RESPONSE,
        frameworks=[ComplianceFramework.SOC2_TYPE2, ComplianceFramework.ISO27001, ComplianceFramework.HIPAA],
        severity=Severity.HIGH,
        remediation="Document and test incident response procedures",
        automated=False,
        evidence_required=["ir_plan", "ir_test_results"],
    ),
    Control(
        id="IR-002", name="Breach Notification",
        description="Data breach notification process within 72 hours (GDPR)",
        category=ControlCategory.INCIDENT_RESPONSE,
        frameworks=[ComplianceFramework.GDPR, ComplianceFramework.HIPAA],
        severity=Severity.CRITICAL,
        remediation="Implement breach detection and 72-hour notification workflow",
        automated=False,
    ),

    # ── RISK MANAGEMENT ──────────────────────────────────────────────────────
    Control(
        id="RM-001", name="Risk Assessment",
        description="Annual risk assessment is conducted and documented",
        category=ControlCategory.RISK_MANAGEMENT,
        frameworks=[ComplianceFramework.SOC2_TYPE2, ComplianceFramework.ISO27001, ComplianceFramework.NIST_CSF],
        severity=Severity.HIGH,
        remediation="Conduct and document annual risk assessment",
        automated=False,
        evidence_required=["risk_register"],
    ),
    Control(
        id="RM-002", name="Vendor Risk Management",
        description="Third-party vendors are assessed for security risk",
        category=ControlCategory.RISK_MANAGEMENT,
        frameworks=[ComplianceFramework.SOC2_TYPE2, ComplianceFramework.ISO27001],
        severity=Severity.MEDIUM,
        remediation="Implement vendor security questionnaire process",
        automated=False,
    ),
]


class ComplianceFrameworkEngine:
    """
    Infinity OS Multi-Framework Compliance Engine.
    Runs automated control tests and generates compliance reports.
    """

    def __init__(self):
        self._controls: Dict[str, Control] = {c.id: c for c in CONTROL_LIBRARY}
        self._results: Dict[str, Dict[str, ControlResult]] = defaultdict(dict)
        # org_id -> framework -> results

    def get_controls(
        self,
        framework: Optional[ComplianceFramework] = None,
        category: Optional[ControlCategory] = None,
    ) -> List[Control]:
        controls = list(self._controls.values())
        if framework:
            controls = [c for c in controls if framework in c.frameworks]
        if category:
            controls = [c for c in controls if c.category == category]
        return controls

    def run_automated_tests(
        self,
        organisation_id: str,
        platform_state: Dict[str, Any],
    ) -> Dict[str, ControlResult]:
        """
        Run automated compliance tests against platform state.

        platform_state keys:
        - has_mfa: bool
        - has_rbac: bool
        - has_audit_log: bool
        - has_encryption_at_rest: bool
        - has_tls: bool
        - has_hitl: bool
        - has_c2pa: bool
        - has_dpia: bool
        - has_vuln_scanning: bool
        - has_secrets_manager: bool
        - has_consent_collection: bool
        - has_data_deletion: bool
        - has_merkle_audit: bool
        - ai_systems_registered: int
        - open_critical_vulns: int
        - api_key_rotation_days: int
        """
        results: Dict[str, ControlResult] = {}
        now = datetime.now(timezone.utc).isoformat()

        test_map = {
            "AC-001": ("has_mfa", "MFA is enabled for all users"),
            "AC-002": ("has_rbac", "RBAC with 5-tier role system is implemented"),
            "AC-003": ("session_timeout_minutes", "Session timeout configured"),
            "AC-005": ("api_key_rotation_days", "API key rotation policy"),
            "DP-001": ("has_encryption_at_rest", "Database encryption at rest enabled"),
            "DP-002": ("has_tls", "TLS 1.2+ enforced on all endpoints"),
            "DP-005": ("has_crypto_shredding", "Crypto-shredding implemented"),
            "LM-001": ("has_audit_log", "Audit logging enabled"),
            "LM-002": ("has_merkle_audit", "Merkle tree audit log integrity"),
            "AI-001": ("has_hitl", "HITL gate implemented"),
            "AI-002": ("ai_systems_registered", "AI systems registered"),
            "AI-003": ("has_c2pa", "C2PA content provenance signing"),
            "AI-004": ("has_dpia", "DPIA records exist"),
            "CM-001": ("has_consent_collection", "Consent collection implemented"),
            "CM-003": ("has_data_deletion", "Data subject deletion implemented"),
            "AS-001": ("has_vuln_scanning", "Vulnerability scanning enabled"),
            "AS-003": ("has_secrets_manager", "Secrets management implemented"),
        }

        for control_id, (state_key, evidence_msg) in test_map.items():
            control = self._controls.get(control_id)
            if not control:
                continue

            state_val = platform_state.get(state_key)

            if state_val is None:
                status = ControlStatus.NOT_TESTED
                score = 0.0
                findings = [f"State key '{state_key}' not provided"]
            elif isinstance(state_val, bool):
                status = ControlStatus.PASSING if state_val else ControlStatus.FAILING
                score = 100.0 if state_val else 0.0
                findings = [] if state_val else [f"Control {control_id} is not implemented"]
            elif isinstance(state_val, int):
                # Numeric checks
                if control_id == "AC-003":  # session timeout
                    passing = state_val <= 30
                    status = ControlStatus.PASSING if passing else ControlStatus.WARNING
                    score = 100.0 if passing else 50.0
                    findings = [] if passing else [f"Session timeout {state_val}min exceeds 30min recommendation"]
                elif control_id == "AC-005":  # API key rotation
                    passing = state_val <= 90
                    status = ControlStatus.PASSING if passing else ControlStatus.FAILING
                    score = 100.0 if passing else 0.0
                    findings = [] if passing else [f"API key rotation {state_val} days exceeds 90-day policy"]
                elif control_id == "AI-002":  # AI systems registered
                    passing = state_val > 0
                    status = ControlStatus.PASSING if passing else ControlStatus.WARNING
                    score = 100.0 if passing else 50.0
                    findings = [] if passing else ["No AI systems registered in inventory"]
                else:
                    status = ControlStatus.PASSING if state_val > 0 else ControlStatus.FAILING
                    score = 100.0 if state_val > 0 else 0.0
                    findings = []
            else:
                status = ControlStatus.NOT_TESTED
                score = 0.0
                findings = ["Unexpected state value type"]

            results[control_id] = ControlResult(
                control_id=control_id,
                status=status,
                tested_at=now,
                evidence=[evidence_msg] if status == ControlStatus.PASSING else [],
                findings=findings,
                remediation_steps=[control.remediation] if status == ControlStatus.FAILING else [],
                score=score,
            )

        # Manual controls default to NOT_TESTED
        for control in self._controls.values():
            if not control.automated and control.id not in results:
                results[control.id] = ControlResult(
                    control_id=control.id,
                    status=ControlStatus.MANUAL_REVIEW,
                    tested_at=now,
                    findings=["Manual review required"],
                    score=0.0,
                )

        self._results[organisation_id] = results
        return results

    def generate_report(
        self,
        organisation_id: str,
        framework: ComplianceFramework,
        platform_state: Optional[Dict[str, Any]] = None,
    ) -> ComplianceReport:
        """Generate a compliance report for a specific framework."""
        if platform_state:
            self.run_automated_tests(organisation_id, platform_state)

        org_results = self._results.get(organisation_id, {})
        framework_controls = self.get_controls(framework=framework)

        passing = failing = warning = not_tested = manual = not_applicable = 0
        total_score = 0.0
        critical_findings = []
        control_results = []

        for control in framework_controls:
            result = org_results.get(control.id)
            if not result:
                result = ControlResult(
                    control_id=control.id,
                    status=ControlStatus.NOT_TESTED,
                    tested_at=datetime.now(timezone.utc).isoformat(),
                    score=0.0,
                )

            control_results.append(result)
            total_score += result.score

            if result.status == ControlStatus.PASSING:
                passing += 1
            elif result.status == ControlStatus.FAILING:
                failing += 1
                if control.severity in [Severity.CRITICAL, Severity.HIGH]:
                    critical_findings.extend(result.findings)
            elif result.status == ControlStatus.WARNING:
                warning += 1
            elif result.status == ControlStatus.NOT_TESTED:
                not_tested += 1
            elif result.status == ControlStatus.MANUAL_REVIEW:
                manual += 1
            elif result.status == ControlStatus.NOT_APPLICABLE:
                not_applicable += 1

        total = len(framework_controls)
        overall_score = total_score / total if total > 0 else 0.0
        certification_ready = failing == 0 and not_tested == 0 and overall_score >= 80.0

        recommendations = []
        if failing > 0:
            recommendations.append(f"Address {failing} failing controls before certification")
        if not_tested > 0:
            recommendations.append(f"Complete testing for {not_tested} untested controls")
        if manual > 0:
            recommendations.append(f"Complete {manual} manual review controls")
        if overall_score < 80:
            recommendations.append("Overall score below 80% — not ready for certification")

        return ComplianceReport(
            id=str(uuid.uuid4())[:12],
            framework=framework,
            organisation_id=organisation_id,
            generated_at=datetime.now(timezone.utc).isoformat(),
            total_controls=total,
            passing=passing,
            failing=failing,
            warning=warning,
            not_tested=not_tested,
            manual_review=manual,
            not_applicable=not_applicable,
            overall_score=overall_score,
            control_results=control_results,
            critical_findings=critical_findings[:20],
            recommendations=recommendations,
            certification_ready=certification_ready,
        )

    def get_cross_framework_summary(self, organisation_id: str) -> Dict[str, Any]:
        """Get compliance posture across all frameworks."""
        org_results = self._results.get(organisation_id, {})
        if not org_results:
            return {"message": "No compliance tests run yet", "frameworks": {}}

        summary = {}
        for framework in ComplianceFramework:
            controls = self.get_controls(framework=framework)
            if not controls:
                continue
            passing = sum(1 for c in controls if org_results.get(c.id, ControlResult("", ControlStatus.NOT_TESTED, "")).status == ControlStatus.PASSING)
            total = len(controls)
            summary[framework.value] = {
                "total_controls": total,
                "passing": passing,
                "score": round(passing / total * 100, 1) if total > 0 else 0,
            }

        return {
            "organisation_id": organisation_id,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "frameworks": summary,
        }


# Global singleton
_engine: Optional[ComplianceFrameworkEngine] = None


def get_compliance_engine() -> ComplianceFrameworkEngine:
    global _engine
    if _engine is None:
        _engine = ComplianceFrameworkEngine()
    return _engine