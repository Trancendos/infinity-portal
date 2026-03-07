"""
Compliance Engine - Vanta-Style Compliance Automation
Infinity Worker v5.4

Supports:
- SOC 2 Type I & II
- ISO 27001
- GDPR
- HIPAA
- HITRUST
- NIST CSF
- PCI DSS
- CMMC
- SOX
- Custom Frameworks
"""

import json
import hashlib
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any, Callable
from enum import Enum
from dataclasses import dataclass, field
from collections import defaultdict
import re


class ComplianceFramework(Enum):
    """Supported compliance frameworks"""
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
    CUSTOM = "custom"


class ControlStatus(Enum):
    """Control test status"""
    PASSING = "passing"
    FAILING = "failing"
    WARNING = "warning"
    NOT_APPLICABLE = "not_applicable"
    NOT_TESTED = "not_tested"
    MANUAL_REVIEW = "manual_review"


class ControlCategory(Enum):
    """Control categories"""
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
    COMPLIANCE = "compliance"


class Severity(Enum):
    """Control failure severity"""
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "info"


@dataclass
class Control:
    """A compliance control"""
    id: str
    name: str
    description: str
    category: ControlCategory
    frameworks: List[ComplianceFramework]
    test_function: Optional[str] = None
    severity: Severity = Severity.MEDIUM
    remediation: str = ""
    evidence_required: List[str] = field(default_factory=list)
    automated: bool = True
    
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
            "automated": self.automated
        }


@dataclass
class ControlResult:
    """Result of a control test"""
    control_id: str
    status: ControlStatus
    message: str
    evidence: Dict[str, Any] = field(default_factory=dict)
    tested_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    details: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict:
        return {
            "control_id": self.control_id,
            "status": self.status.value,
            "message": self.message,
            "evidence": self.evidence,
            "tested_at": self.tested_at,
            "details": self.details
        }


@dataclass
class ComplianceReport:
    """Compliance assessment report"""
    id: str
    framework: ComplianceFramework
    generated_at: str
    total_controls: int
    passing: int
    failing: int
    warnings: int
    not_applicable: int
    compliance_score: float
    results: List[ControlResult]
    gaps: List[Dict]
    recommendations: List[str]
    
    def to_dict(self) -> Dict:
        return {
            "id": self.id,
            "framework": self.framework.value,
            "generated_at": self.generated_at,
            "total_controls": self.total_controls,
            "passing": self.passing,
            "failing": self.failing,
            "warnings": self.warnings,
            "not_applicable": self.not_applicable,
            "compliance_score": self.compliance_score,
            "results": [r.to_dict() for r in self.results],
            "gaps": self.gaps,
            "recommendations": self.recommendations
        }


class ComplianceEngine:
    """
    Vanta-style compliance automation engine.
    Provides continuous monitoring and automated testing of compliance controls.
    """
    
    def __init__(self):
        self.controls: Dict[str, Control] = {}
        self.test_functions: Dict[str, Callable] = {}
        self.evidence_store: Dict[str, Dict] = {}
        self.results_history: List[ControlResult] = []
        self._initialize_controls()
        self._register_test_functions()
    
    def _initialize_controls(self):
        """Initialize pre-built compliance controls"""
        
        # Access Control
        self._add_control(Control(
            id="AC-001",
            name="Multi-Factor Authentication",
            description="MFA is enabled for all user accounts with access to sensitive systems",
            category=ControlCategory.ACCESS_CONTROL,
            frameworks=[ComplianceFramework.SOC2_TYPE2, ComplianceFramework.ISO27001, ComplianceFramework.HIPAA],
            severity=Severity.CRITICAL,
            remediation="Enable MFA for all user accounts. Configure MFA requirements in identity provider settings.",
            evidence_required=["mfa_policy", "mfa_enrollment_report"],
            test_function="test_mfa_enabled"
        ))
        
        self._add_control(Control(
            id="AC-002",
            name="Role-Based Access Control",
            description="Access to systems is granted based on job roles and responsibilities",
            category=ControlCategory.ACCESS_CONTROL,
            frameworks=[ComplianceFramework.SOC2_TYPE2, ComplianceFramework.ISO27001, ComplianceFramework.GDPR],
            severity=Severity.HIGH,
            remediation="Implement RBAC policies. Review and document role definitions and access permissions.",
            evidence_required=["rbac_policy", "role_definitions", "access_matrix"],
            test_function="test_rbac_implemented"
        ))
        
        self._add_control(Control(
            id="AC-003",
            name="Access Review Process",
            description="User access is reviewed quarterly and revoked when no longer needed",
            category=ControlCategory.ACCESS_CONTROL,
            frameworks=[ComplianceFramework.SOC2_TYPE2, ComplianceFramework.ISO27001, ComplianceFramework.SOX],
            severity=Severity.HIGH,
            remediation="Establish quarterly access review process. Document reviews and remediation actions.",
            evidence_required=["access_review_policy", "review_records"],
            test_function="test_access_reviews"
        ))
        
        self._add_control(Control(
            id="AC-004",
            name="Password Policy",
            description="Strong password policy enforced with minimum complexity requirements",
            category=ControlCategory.ACCESS_CONTROL,
            frameworks=[ComplianceFramework.SOC2_TYPE2, ComplianceFramework.ISO27001, ComplianceFramework.PCI_DSS],
            severity=Severity.MEDIUM,
            remediation="Configure password policy: minimum 12 characters, complexity requirements, 90-day rotation.",
            evidence_required=["password_policy", "idp_configuration"],
            test_function="test_password_policy"
        ))
        
        self._add_control(Control(
            id="AC-005",
            name="Privileged Access Management",
            description="Privileged accounts are limited and monitored",
            category=ControlCategory.ACCESS_CONTROL,
            frameworks=[ComplianceFramework.SOC2_TYPE2, ComplianceFramework.ISO27001, ComplianceFramework.CMMC],
            severity=Severity.CRITICAL,
            remediation="Implement PAM solution. Limit admin accounts. Enable session recording for privileged access.",
            evidence_required=["pam_policy", "admin_account_list", "session_logs"],
            test_function="test_privileged_access"
        ))
        
        # Data Protection
        self._add_control(Control(
            id="DP-001",
            name="Data Classification",
            description="Data is classified according to sensitivity levels",
            category=ControlCategory.DATA_PROTECTION,
            frameworks=[ComplianceFramework.ISO27001, ComplianceFramework.GDPR, ComplianceFramework.HIPAA],
            severity=Severity.HIGH,
            remediation="Implement data classification scheme. Label all data assets according to classification.",
            evidence_required=["classification_policy", "data_inventory"],
            test_function="test_data_classification"
        ))
        
        self._add_control(Control(
            id="DP-002",
            name="Data Retention Policy",
            description="Data retention periods are defined and enforced",
            category=ControlCategory.DATA_PROTECTION,
            frameworks=[ComplianceFramework.GDPR, ComplianceFramework.HIPAA, ComplianceFramework.SOX],
            severity=Severity.HIGH,
            remediation="Define retention periods for each data type. Implement automated deletion processes.",
            evidence_required=["retention_policy", "deletion_logs"],
            test_function="test_data_retention"
        ))
        
        self._add_control(Control(
            id="DP-003",
            name="Data Backup",
            description="Critical data is backed up regularly with tested recovery procedures",
            category=ControlCategory.DATA_PROTECTION,
            frameworks=[ComplianceFramework.SOC2_TYPE2, ComplianceFramework.ISO27001, ComplianceFramework.HIPAA],
            severity=Severity.CRITICAL,
            remediation="Configure automated backups. Test recovery procedures quarterly. Document RTO/RPO.",
            evidence_required=["backup_policy", "backup_logs", "recovery_test_results"],
            test_function="test_data_backup"
        ))
        
        self._add_control(Control(
            id="DP-004",
            name="PII Handling",
            description="Personal Identifiable Information is handled according to privacy regulations",
            category=ControlCategory.DATA_PROTECTION,
            frameworks=[ComplianceFramework.GDPR, ComplianceFramework.HIPAA, ComplianceFramework.SOC2_TYPE2],
            severity=Severity.CRITICAL,
            remediation="Implement PII handling procedures. Enable data masking. Document data flows.",
            evidence_required=["pii_policy", "data_flow_diagram", "privacy_impact_assessment"],
            test_function="test_pii_handling"
        ))
        
        # Encryption
        self._add_control(Control(
            id="EN-001",
            name="Encryption at Rest",
            description="Sensitive data is encrypted at rest using strong encryption",
            category=ControlCategory.ENCRYPTION,
            frameworks=[ComplianceFramework.SOC2_TYPE2, ComplianceFramework.ISO27001, ComplianceFramework.PCI_DSS, ComplianceFramework.HIPAA],
            severity=Severity.CRITICAL,
            remediation="Enable encryption for all databases and storage. Use AES-256 or stronger.",
            evidence_required=["encryption_policy", "encryption_configuration"],
            test_function="test_encryption_at_rest"
        ))
        
        self._add_control(Control(
            id="EN-002",
            name="Encryption in Transit",
            description="All data in transit is encrypted using TLS 1.2 or higher",
            category=ControlCategory.ENCRYPTION,
            frameworks=[ComplianceFramework.SOC2_TYPE2, ComplianceFramework.ISO27001, ComplianceFramework.PCI_DSS],
            severity=Severity.CRITICAL,
            remediation="Enforce TLS 1.2+ for all connections. Disable older protocols. Configure HSTS.",
            evidence_required=["tls_policy", "ssl_scan_results"],
            test_function="test_encryption_in_transit"
        ))
        
        self._add_control(Control(
            id="EN-003",
            name="Key Management",
            description="Encryption keys are managed securely with proper rotation",
            category=ControlCategory.ENCRYPTION,
            frameworks=[ComplianceFramework.ISO27001, ComplianceFramework.PCI_DSS, ComplianceFramework.HIPAA],
            severity=Severity.HIGH,
            remediation="Use KMS for key management. Implement key rotation. Document key custodians.",
            evidence_required=["key_management_policy", "key_rotation_logs"],
            test_function="test_key_management"
        ))
        
        # Logging & Monitoring
        self._add_control(Control(
            id="LM-001",
            name="Audit Logging",
            description="Security-relevant events are logged and retained",
            category=ControlCategory.LOGGING_MONITORING,
            frameworks=[ComplianceFramework.SOC2_TYPE2, ComplianceFramework.ISO27001, ComplianceFramework.HIPAA, ComplianceFramework.PCI_DSS],
            severity=Severity.HIGH,
            remediation="Enable comprehensive audit logging. Configure log retention. Protect log integrity.",
            evidence_required=["logging_policy", "log_samples", "retention_configuration"],
            test_function="test_audit_logging"
        ))
        
        self._add_control(Control(
            id="LM-002",
            name="Security Monitoring",
            description="Security events are monitored and alerts are configured",
            category=ControlCategory.LOGGING_MONITORING,
            frameworks=[ComplianceFramework.SOC2_TYPE2, ComplianceFramework.ISO27001, ComplianceFramework.NIST_CSF],
            severity=Severity.HIGH,
            remediation="Implement SIEM or security monitoring. Configure alerts for security events.",
            evidence_required=["monitoring_policy", "alert_configuration", "incident_samples"],
            test_function="test_security_monitoring"
        ))
        
        self._add_control(Control(
            id="LM-003",
            name="Log Integrity",
            description="Logs are protected against tampering and unauthorized access",
            category=ControlCategory.LOGGING_MONITORING,
            frameworks=[ComplianceFramework.SOC2_TYPE2, ComplianceFramework.ISO27001, ComplianceFramework.SOX],
            severity=Severity.MEDIUM,
            remediation="Implement log integrity controls. Use write-once storage. Restrict log access.",
            evidence_required=["log_integrity_policy", "access_controls"],
            test_function="test_log_integrity"
        ))
        
        # Incident Response
        self._add_control(Control(
            id="IR-001",
            name="Incident Response Plan",
            description="Documented incident response plan exists and is tested",
            category=ControlCategory.INCIDENT_RESPONSE,
            frameworks=[ComplianceFramework.SOC2_TYPE2, ComplianceFramework.ISO27001, ComplianceFramework.HIPAA, ComplianceFramework.NIST_CSF],
            severity=Severity.HIGH,
            remediation="Document incident response procedures. Define roles and escalation paths. Test annually.",
            evidence_required=["ir_plan", "ir_test_results", "contact_list"],
            test_function="test_incident_response_plan"
        ))
        
        self._add_control(Control(
            id="IR-002",
            name="Breach Notification",
            description="Data breach notification procedures comply with regulations",
            category=ControlCategory.INCIDENT_RESPONSE,
            frameworks=[ComplianceFramework.GDPR, ComplianceFramework.HIPAA, ComplianceFramework.SOC2_TYPE2],
            severity=Severity.CRITICAL,
            remediation="Document breach notification procedures. Define timelines (72 hours for GDPR).",
            evidence_required=["breach_notification_policy", "notification_templates"],
            test_function="test_breach_notification"
        ))
        
        # Vendor Management
        self._add_control(Control(
            id="VM-001",
            name="Vendor Risk Assessment",
            description="Third-party vendors are assessed for security risks",
            category=ControlCategory.VENDOR_MANAGEMENT,
            frameworks=[ComplianceFramework.SOC2_TYPE2, ComplianceFramework.ISO27001, ComplianceFramework.GDPR],
            severity=Severity.HIGH,
            remediation="Implement vendor assessment process. Review SOC 2 reports. Document risk ratings.",
            evidence_required=["vendor_policy", "vendor_assessments", "vendor_inventory"],
            test_function="test_vendor_assessment"
        ))
        
        self._add_control(Control(
            id="VM-002",
            name="Vendor Contracts",
            description="Security requirements are included in vendor contracts",
            category=ControlCategory.VENDOR_MANAGEMENT,
            frameworks=[ComplianceFramework.GDPR, ComplianceFramework.HIPAA, ComplianceFramework.ISO27001],
            severity=Severity.MEDIUM,
            remediation="Include security clauses in contracts. Require DPAs for data processors.",
            evidence_required=["contract_templates", "dpa_samples"],
            test_function="test_vendor_contracts"
        ))
        
        # Change Management
        self._add_control(Control(
            id="CM-001",
            name="Change Control Process",
            description="Changes to systems follow a documented approval process",
            category=ControlCategory.CHANGE_MANAGEMENT,
            frameworks=[ComplianceFramework.SOC2_TYPE2, ComplianceFramework.ISO27001, ComplianceFramework.SOX],
            severity=Severity.HIGH,
            remediation="Implement change management process. Require approvals. Document all changes.",
            evidence_required=["change_policy", "change_records"],
            test_function="test_change_control"
        ))
        
        self._add_control(Control(
            id="CM-002",
            name="Code Review",
            description="Code changes are reviewed before deployment",
            category=ControlCategory.CHANGE_MANAGEMENT,
            frameworks=[ComplianceFramework.SOC2_TYPE2, ComplianceFramework.ISO27001],
            severity=Severity.MEDIUM,
            remediation="Require pull request reviews. Implement branch protection. Document review criteria.",
            evidence_required=["code_review_policy", "pr_samples"],
            test_function="test_code_review"
        ))
        
        # Network Security
        self._add_control(Control(
            id="NS-001",
            name="Firewall Configuration",
            description="Network firewalls are configured with deny-by-default rules",
            category=ControlCategory.NETWORK_SECURITY,
            frameworks=[ComplianceFramework.SOC2_TYPE2, ComplianceFramework.ISO27001, ComplianceFramework.PCI_DSS],
            severity=Severity.HIGH,
            remediation="Configure firewalls with least privilege. Document all allowed rules. Review quarterly.",
            evidence_required=["firewall_policy", "firewall_rules"],
            test_function="test_firewall_config"
        ))
        
        self._add_control(Control(
            id="NS-002",
            name="Network Segmentation",
            description="Networks are segmented to isolate sensitive systems",
            category=ControlCategory.NETWORK_SECURITY,
            frameworks=[ComplianceFramework.PCI_DSS, ComplianceFramework.ISO27001, ComplianceFramework.HIPAA],
            severity=Severity.HIGH,
            remediation="Implement network segmentation. Isolate production from development. Document topology.",
            evidence_required=["network_diagram", "segmentation_policy"],
            test_function="test_network_segmentation"
        ))
        
        # Application Security
        self._add_control(Control(
            id="AS-001",
            name="Vulnerability Scanning",
            description="Applications are scanned for vulnerabilities regularly",
            category=ControlCategory.APPLICATION_SECURITY,
            frameworks=[ComplianceFramework.SOC2_TYPE2, ComplianceFramework.ISO27001, ComplianceFramework.PCI_DSS],
            severity=Severity.HIGH,
            remediation="Implement automated vulnerability scanning. Scan weekly. Remediate critical findings.",
            evidence_required=["scanning_policy", "scan_reports"],
            test_function="test_vulnerability_scanning"
        ))
        
        self._add_control(Control(
            id="AS-002",
            name="Penetration Testing",
            description="Annual penetration testing is performed by qualified testers",
            category=ControlCategory.APPLICATION_SECURITY,
            frameworks=[ComplianceFramework.SOC2_TYPE2, ComplianceFramework.ISO27001, ComplianceFramework.PCI_DSS],
            severity=Severity.HIGH,
            remediation="Conduct annual penetration tests. Remediate findings. Document results.",
            evidence_required=["pentest_policy", "pentest_reports"],
            test_function="test_penetration_testing",
            automated=False
        ))
        
        self._add_control(Control(
            id="AS-003",
            name="Secure Development",
            description="Secure coding practices are followed in development",
            category=ControlCategory.APPLICATION_SECURITY,
            frameworks=[ComplianceFramework.SOC2_TYPE2, ComplianceFramework.ISO27001, ComplianceFramework.NIST_CSF],
            severity=Severity.MEDIUM,
            remediation="Train developers on secure coding. Use SAST tools. Follow OWASP guidelines.",
            evidence_required=["sdlc_policy", "training_records"],
            test_function="test_secure_development"
        ))
        
        # Business Continuity
        self._add_control(Control(
            id="BC-001",
            name="Business Continuity Plan",
            description="Business continuity plan exists and is tested annually",
            category=ControlCategory.BUSINESS_CONTINUITY,
            frameworks=[ComplianceFramework.SOC2_TYPE2, ComplianceFramework.ISO27001, ComplianceFramework.HIPAA],
            severity=Severity.HIGH,
            remediation="Document BCP. Define RTO/RPO. Test recovery procedures annually.",
            evidence_required=["bcp_document", "bcp_test_results"],
            test_function="test_business_continuity",
            automated=False
        ))
        
        self._add_control(Control(
            id="BC-002",
            name="Disaster Recovery",
            description="Disaster recovery procedures are documented and tested",
            category=ControlCategory.BUSINESS_CONTINUITY,
            frameworks=[ComplianceFramework.SOC2_TYPE2, ComplianceFramework.ISO27001, ComplianceFramework.HIPAA],
            severity=Severity.HIGH,
            remediation="Document DR procedures. Configure failover. Test recovery quarterly.",
            evidence_required=["dr_plan", "dr_test_results"],
            test_function="test_disaster_recovery"
        ))
        
        # HR Security
        self._add_control(Control(
            id="HR-001",
            name="Background Checks",
            description="Background checks are performed for employees with access to sensitive data",
            category=ControlCategory.HR_SECURITY,
            frameworks=[ComplianceFramework.SOC2_TYPE2, ComplianceFramework.ISO27001, ComplianceFramework.HIPAA],
            severity=Severity.MEDIUM,
            remediation="Implement background check policy. Document verification for all employees.",
            evidence_required=["background_check_policy", "verification_records"],
            test_function="test_background_checks",
            automated=False
        ))
        
        self._add_control(Control(
            id="HR-002",
            name="Security Awareness Training",
            description="Employees complete security awareness training annually",
            category=ControlCategory.HR_SECURITY,
            frameworks=[ComplianceFramework.SOC2_TYPE2, ComplianceFramework.ISO27001, ComplianceFramework.HIPAA, ComplianceFramework.GDPR],
            severity=Severity.MEDIUM,
            remediation="Implement annual security training. Track completion. Include phishing simulations.",
            evidence_required=["training_policy", "completion_records"],
            test_function="test_security_training"
        ))
        
        self._add_control(Control(
            id="HR-003",
            name="Offboarding Process",
            description="Access is revoked promptly when employees leave",
            category=ControlCategory.HR_SECURITY,
            frameworks=[ComplianceFramework.SOC2_TYPE2, ComplianceFramework.ISO27001, ComplianceFramework.SOX],
            severity=Severity.HIGH,
            remediation="Implement offboarding checklist. Revoke access within 24 hours. Document process.",
            evidence_required=["offboarding_policy", "offboarding_records"],
            test_function="test_offboarding"
        ))
    
    def _add_control(self, control: Control):
        """Add a control to the registry"""
        self.controls[control.id] = control
    
    def _register_test_functions(self):
        """Register automated test functions for controls"""
        
        # These are example test implementations
        # In production, these would integrate with actual systems
        
        self.test_functions["test_mfa_enabled"] = self._test_mfa_enabled
        self.test_functions["test_rbac_implemented"] = self._test_rbac_implemented
        self.test_functions["test_encryption_at_rest"] = self._test_encryption_at_rest
        self.test_functions["test_encryption_in_transit"] = self._test_encryption_in_transit
        self.test_functions["test_audit_logging"] = self._test_audit_logging
        self.test_functions["test_data_backup"] = self._test_data_backup
        self.test_functions["test_vulnerability_scanning"] = self._test_vulnerability_scanning
        self.test_functions["test_password_policy"] = self._test_password_policy
        self.test_functions["test_access_reviews"] = self._test_access_reviews
        self.test_functions["test_data_classification"] = self._test_data_classification
        self.test_functions["test_data_retention"] = self._test_data_retention
        self.test_functions["test_pii_handling"] = self._test_pii_handling
        self.test_functions["test_key_management"] = self._test_key_management
        self.test_functions["test_security_monitoring"] = self._test_security_monitoring
        self.test_functions["test_log_integrity"] = self._test_log_integrity
        self.test_functions["test_incident_response_plan"] = self._test_incident_response_plan
        self.test_functions["test_breach_notification"] = self._test_breach_notification
        self.test_functions["test_vendor_assessment"] = self._test_vendor_assessment
        self.test_functions["test_vendor_contracts"] = self._test_vendor_contracts
        self.test_functions["test_change_control"] = self._test_change_control
        self.test_functions["test_code_review"] = self._test_code_review
        self.test_functions["test_firewall_config"] = self._test_firewall_config
        self.test_functions["test_network_segmentation"] = self._test_network_segmentation
        self.test_functions["test_penetration_testing"] = self._test_penetration_testing
        self.test_functions["test_secure_development"] = self._test_secure_development
        self.test_functions["test_business_continuity"] = self._test_business_continuity
        self.test_functions["test_disaster_recovery"] = self._test_disaster_recovery
        self.test_functions["test_background_checks"] = self._test_background_checks
        self.test_functions["test_security_training"] = self._test_security_training
        self.test_functions["test_offboarding"] = self._test_offboarding
        self.test_functions["test_privileged_access"] = self._test_privileged_access
    
    # Test function implementations
    def _test_mfa_enabled(self, config: Dict) -> ControlResult:
        """Test if MFA is enabled"""
        mfa_enabled = config.get("mfa_enabled", False)
        mfa_coverage = config.get("mfa_coverage_percent", 0)
        
        if mfa_enabled and mfa_coverage >= 100:
            return ControlResult(
                control_id="AC-001",
                status=ControlStatus.PASSING,
                message="MFA is enabled for all users",
                evidence={"mfa_coverage": mfa_coverage}
            )
        elif mfa_enabled and mfa_coverage >= 80:
            return ControlResult(
                control_id="AC-001",
                status=ControlStatus.WARNING,
                message=f"MFA is enabled but only covers {mfa_coverage}% of users",
                evidence={"mfa_coverage": mfa_coverage}
            )
        else:
            return ControlResult(
                control_id="AC-001",
                status=ControlStatus.FAILING,
                message="MFA is not enabled or has insufficient coverage",
                evidence={"mfa_coverage": mfa_coverage}
            )
    
    def _test_rbac_implemented(self, config: Dict) -> ControlResult:
        """Test if RBAC is implemented"""
        rbac_enabled = config.get("rbac_enabled", False)
        roles_defined = config.get("roles_defined", 0)
        
        if rbac_enabled and roles_defined >= 3:
            return ControlResult(
                control_id="AC-002",
                status=ControlStatus.PASSING,
                message=f"RBAC implemented with {roles_defined} roles defined",
                evidence={"roles_count": roles_defined}
            )
        else:
            return ControlResult(
                control_id="AC-002",
                status=ControlStatus.FAILING,
                message="RBAC not properly implemented",
                evidence={"rbac_enabled": rbac_enabled, "roles_count": roles_defined}
            )
    
    def _test_encryption_at_rest(self, config: Dict) -> ControlResult:
        """Test encryption at rest"""
        encryption_enabled = config.get("encryption_at_rest", False)
        algorithm = config.get("encryption_algorithm", "")
        
        strong_algorithms = ["AES-256", "AES-256-GCM", "ChaCha20-Poly1305"]
        
        if encryption_enabled and algorithm in strong_algorithms:
            return ControlResult(
                control_id="EN-001",
                status=ControlStatus.PASSING,
                message=f"Encryption at rest enabled using {algorithm}",
                evidence={"algorithm": algorithm}
            )
        elif encryption_enabled:
            return ControlResult(
                control_id="EN-001",
                status=ControlStatus.WARNING,
                message=f"Encryption enabled but using weak algorithm: {algorithm}",
                evidence={"algorithm": algorithm}
            )
        else:
            return ControlResult(
                control_id="EN-001",
                status=ControlStatus.FAILING,
                message="Encryption at rest is not enabled",
                evidence={}
            )
    
    def _test_encryption_in_transit(self, config: Dict) -> ControlResult:
        """Test encryption in transit"""
        tls_enabled = config.get("tls_enabled", False)
        tls_version = config.get("tls_version", "")
        hsts_enabled = config.get("hsts_enabled", False)
        
        if tls_enabled and tls_version in ["1.2", "1.3"] and hsts_enabled:
            return ControlResult(
                control_id="EN-002",
                status=ControlStatus.PASSING,
                message=f"TLS {tls_version} enabled with HSTS",
                evidence={"tls_version": tls_version, "hsts": hsts_enabled}
            )
        elif tls_enabled and tls_version in ["1.2", "1.3"]:
            return ControlResult(
                control_id="EN-002",
                status=ControlStatus.WARNING,
                message=f"TLS {tls_version} enabled but HSTS not configured",
                evidence={"tls_version": tls_version, "hsts": hsts_enabled}
            )
        else:
            return ControlResult(
                control_id="EN-002",
                status=ControlStatus.FAILING,
                message="TLS not properly configured",
                evidence={"tls_enabled": tls_enabled, "tls_version": tls_version}
            )
    
    def _test_audit_logging(self, config: Dict) -> ControlResult:
        """Test audit logging"""
        logging_enabled = config.get("audit_logging", False)
        retention_days = config.get("log_retention_days", 0)
        
        if logging_enabled and retention_days >= 90:
            return ControlResult(
                control_id="LM-001",
                status=ControlStatus.PASSING,
                message=f"Audit logging enabled with {retention_days} day retention",
                evidence={"retention_days": retention_days}
            )
        elif logging_enabled and retention_days >= 30:
            return ControlResult(
                control_id="LM-001",
                status=ControlStatus.WARNING,
                message=f"Audit logging enabled but retention only {retention_days} days",
                evidence={"retention_days": retention_days}
            )
        else:
            return ControlResult(
                control_id="LM-001",
                status=ControlStatus.FAILING,
                message="Audit logging not properly configured",
                evidence={"logging_enabled": logging_enabled, "retention_days": retention_days}
            )
    
    def _test_data_backup(self, config: Dict) -> ControlResult:
        """Test data backup configuration"""
        backup_enabled = config.get("backup_enabled", False)
        backup_frequency = config.get("backup_frequency_hours", 0)
        last_test = config.get("last_recovery_test", "")
        
        if backup_enabled and backup_frequency <= 24:
            return ControlResult(
                control_id="DP-003",
                status=ControlStatus.PASSING,
                message=f"Backups configured every {backup_frequency} hours",
                evidence={"frequency_hours": backup_frequency, "last_test": last_test}
            )
        else:
            return ControlResult(
                control_id="DP-003",
                status=ControlStatus.FAILING,
                message="Backup configuration insufficient",
                evidence={"backup_enabled": backup_enabled, "frequency_hours": backup_frequency}
            )
    
    def _test_vulnerability_scanning(self, config: Dict) -> ControlResult:
        """Test vulnerability scanning"""
        scanning_enabled = config.get("vuln_scanning_enabled", False)
        scan_frequency = config.get("scan_frequency_days", 0)
        
        if scanning_enabled and scan_frequency <= 7:
            return ControlResult(
                control_id="AS-001",
                status=ControlStatus.PASSING,
                message=f"Vulnerability scanning runs every {scan_frequency} days",
                evidence={"frequency_days": scan_frequency}
            )
        elif scanning_enabled:
            return ControlResult(
                control_id="AS-001",
                status=ControlStatus.WARNING,
                message=f"Scanning enabled but frequency is {scan_frequency} days",
                evidence={"frequency_days": scan_frequency}
            )
        else:
            return ControlResult(
                control_id="AS-001",
                status=ControlStatus.FAILING,
                message="Vulnerability scanning not enabled",
                evidence={}
            )
    
    # Placeholder implementations for other tests
    def _test_password_policy(self, config: Dict) -> ControlResult:
        min_length = config.get("password_min_length", 0)
        complexity = config.get("password_complexity", False)
        if min_length >= 12 and complexity:
            return ControlResult(control_id="AC-004", status=ControlStatus.PASSING, message="Password policy meets requirements")
        return ControlResult(control_id="AC-004", status=ControlStatus.FAILING, message="Password policy insufficient")
    
    def _test_access_reviews(self, config: Dict) -> ControlResult:
        reviews_enabled = config.get("access_reviews_enabled", False)
        if reviews_enabled:
            return ControlResult(control_id="AC-003", status=ControlStatus.PASSING, message="Access reviews configured")
        return ControlResult(control_id="AC-003", status=ControlStatus.FAILING, message="Access reviews not configured")
    
    def _test_data_classification(self, config: Dict) -> ControlResult:
        classification_enabled = config.get("data_classification_enabled", False)
        if classification_enabled:
            return ControlResult(control_id="DP-001", status=ControlStatus.PASSING, message="Data classification implemented")
        return ControlResult(control_id="DP-001", status=ControlStatus.FAILING, message="Data classification not implemented")
    
    def _test_data_retention(self, config: Dict) -> ControlResult:
        retention_policy = config.get("retention_policy_defined", False)
        if retention_policy:
            return ControlResult(control_id="DP-002", status=ControlStatus.PASSING, message="Data retention policy defined")
        return ControlResult(control_id="DP-002", status=ControlStatus.FAILING, message="Data retention policy not defined")
    
    def _test_pii_handling(self, config: Dict) -> ControlResult:
        pii_policy = config.get("pii_handling_policy", False)
        if pii_policy:
            return ControlResult(control_id="DP-004", status=ControlStatus.PASSING, message="PII handling procedures in place")
        return ControlResult(control_id="DP-004", status=ControlStatus.FAILING, message="PII handling procedures missing")
    
    def _test_key_management(self, config: Dict) -> ControlResult:
        kms_enabled = config.get("kms_enabled", False)
        if kms_enabled:
            return ControlResult(control_id="EN-003", status=ControlStatus.PASSING, message="Key management system in use")
        return ControlResult(control_id="EN-003", status=ControlStatus.FAILING, message="Key management not configured")
    
    def _test_security_monitoring(self, config: Dict) -> ControlResult:
        monitoring_enabled = config.get("security_monitoring", False)
        if monitoring_enabled:
            return ControlResult(control_id="LM-002", status=ControlStatus.PASSING, message="Security monitoring active")
        return ControlResult(control_id="LM-002", status=ControlStatus.FAILING, message="Security monitoring not configured")
    
    def _test_log_integrity(self, config: Dict) -> ControlResult:
        integrity_enabled = config.get("log_integrity", False)
        if integrity_enabled:
            return ControlResult(control_id="LM-003", status=ControlStatus.PASSING, message="Log integrity controls in place")
        return ControlResult(control_id="LM-003", status=ControlStatus.FAILING, message="Log integrity not protected")
    
    def _test_incident_response_plan(self, config: Dict) -> ControlResult:
        ir_plan = config.get("ir_plan_exists", False)
        if ir_plan:
            return ControlResult(control_id="IR-001", status=ControlStatus.PASSING, message="Incident response plan documented")
        return ControlResult(control_id="IR-001", status=ControlStatus.FAILING, message="Incident response plan missing")
    
    def _test_breach_notification(self, config: Dict) -> ControlResult:
        notification_procedure = config.get("breach_notification_procedure", False)
        if notification_procedure:
            return ControlResult(control_id="IR-002", status=ControlStatus.PASSING, message="Breach notification procedures defined")
        return ControlResult(control_id="IR-002", status=ControlStatus.FAILING, message="Breach notification procedures missing")
    
    def _test_vendor_assessment(self, config: Dict) -> ControlResult:
        vendor_assessment = config.get("vendor_assessment_process", False)
        if vendor_assessment:
            return ControlResult(control_id="VM-001", status=ControlStatus.PASSING, message="Vendor assessment process in place")
        return ControlResult(control_id="VM-001", status=ControlStatus.FAILING, message="Vendor assessment process missing")
    
    def _test_vendor_contracts(self, config: Dict) -> ControlResult:
        security_clauses = config.get("vendor_security_clauses", False)
        if security_clauses:
            return ControlResult(control_id="VM-002", status=ControlStatus.PASSING, message="Security clauses in vendor contracts")
        return ControlResult(control_id="VM-002", status=ControlStatus.FAILING, message="Security clauses missing from contracts")
    
    def _test_change_control(self, config: Dict) -> ControlResult:
        change_process = config.get("change_control_process", False)
        if change_process:
            return ControlResult(control_id="CM-001", status=ControlStatus.PASSING, message="Change control process implemented")
        return ControlResult(control_id="CM-001", status=ControlStatus.FAILING, message="Change control process missing")
    
    def _test_code_review(self, config: Dict) -> ControlResult:
        code_review = config.get("code_review_required", False)
        if code_review:
            return ControlResult(control_id="CM-002", status=ControlStatus.PASSING, message="Code review required for changes")
        return ControlResult(control_id="CM-002", status=ControlStatus.FAILING, message="Code review not required")
    
    def _test_firewall_config(self, config: Dict) -> ControlResult:
        firewall_configured = config.get("firewall_configured", False)
        if firewall_configured:
            return ControlResult(control_id="NS-001", status=ControlStatus.PASSING, message="Firewall properly configured")
        return ControlResult(control_id="NS-001", status=ControlStatus.FAILING, message="Firewall not properly configured")
    
    def _test_network_segmentation(self, config: Dict) -> ControlResult:
        segmentation = config.get("network_segmentation", False)
        if segmentation:
            return ControlResult(control_id="NS-002", status=ControlStatus.PASSING, message="Network segmentation implemented")
        return ControlResult(control_id="NS-002", status=ControlStatus.FAILING, message="Network segmentation missing")
    
    def _test_penetration_testing(self, config: Dict) -> ControlResult:
        pentest_date = config.get("last_pentest_date", "")
        if pentest_date:
            return ControlResult(control_id="AS-002", status=ControlStatus.PASSING, message=f"Last pentest: {pentest_date}")
        return ControlResult(control_id="AS-002", status=ControlStatus.MANUAL_REVIEW, message="Penetration testing status requires manual review")
    
    def _test_secure_development(self, config: Dict) -> ControlResult:
        sdlc = config.get("secure_sdlc", False)
        if sdlc:
            return ControlResult(control_id="AS-003", status=ControlStatus.PASSING, message="Secure SDLC practices followed")
        return ControlResult(control_id="AS-003", status=ControlStatus.FAILING, message="Secure SDLC not implemented")
    
    def _test_business_continuity(self, config: Dict) -> ControlResult:
        bcp = config.get("bcp_exists", False)
        if bcp:
            return ControlResult(control_id="BC-001", status=ControlStatus.PASSING, message="Business continuity plan exists")
        return ControlResult(control_id="BC-001", status=ControlStatus.MANUAL_REVIEW, message="BCP requires manual review")
    
    def _test_disaster_recovery(self, config: Dict) -> ControlResult:
        dr_plan = config.get("dr_plan_exists", False)
        if dr_plan:
            return ControlResult(control_id="BC-002", status=ControlStatus.PASSING, message="Disaster recovery plan documented")
        return ControlResult(control_id="BC-002", status=ControlStatus.FAILING, message="Disaster recovery plan missing")
    
    def _test_background_checks(self, config: Dict) -> ControlResult:
        bg_checks = config.get("background_checks_performed", False)
        if bg_checks:
            return ControlResult(control_id="HR-001", status=ControlStatus.PASSING, message="Background checks performed")
        return ControlResult(control_id="HR-001", status=ControlStatus.MANUAL_REVIEW, message="Background check status requires manual review")
    
    def _test_security_training(self, config: Dict) -> ControlResult:
        training = config.get("security_training_completed", False)
        if training:
            return ControlResult(control_id="HR-002", status=ControlStatus.PASSING, message="Security training completed")
        return ControlResult(control_id="HR-002", status=ControlStatus.FAILING, message="Security training not completed")
    
    def _test_offboarding(self, config: Dict) -> ControlResult:
        offboarding = config.get("offboarding_process", False)
        if offboarding:
            return ControlResult(control_id="HR-003", status=ControlStatus.PASSING, message="Offboarding process implemented")
        return ControlResult(control_id="HR-003", status=ControlStatus.FAILING, message="Offboarding process missing")
    
    def _test_privileged_access(self, config: Dict) -> ControlResult:
        pam = config.get("pam_implemented", False)
        if pam:
            return ControlResult(control_id="AC-005", status=ControlStatus.PASSING, message="Privileged access management in place")
        return ControlResult(control_id="AC-005", status=ControlStatus.FAILING, message="PAM not implemented")
    
    def run_control_test(self, control_id: str, config: Dict) -> ControlResult:
        """Run a single control test"""
        if control_id not in self.controls:
            return ControlResult(
                control_id=control_id,
                status=ControlStatus.NOT_TESTED,
                message=f"Control {control_id} not found"
            )
        
        control = self.controls[control_id]
        
        if not control.automated:
            return ControlResult(
                control_id=control_id,
                status=ControlStatus.MANUAL_REVIEW,
                message=f"Control {control_id} requires manual review"
            )
        
        if control.test_function and control.test_function in self.test_functions:
            result = self.test_functions[control.test_function](config)
            self.results_history.append(result)
            return result
        
        return ControlResult(
            control_id=control_id,
            status=ControlStatus.NOT_TESTED,
            message="No test function available"
        )
    
    def run_framework_assessment(self, framework: ComplianceFramework, config: Dict) -> ComplianceReport:
        """Run a complete framework assessment"""
        framework_controls = [
            c for c in self.controls.values()
            if framework in c.frameworks
        ]
        
        results = []
        passing = 0
        failing = 0
        warnings = 0
        not_applicable = 0
        
        for control in framework_controls:
            result = self.run_control_test(control.id, config)
            results.append(result)
            
            if result.status == ControlStatus.PASSING:
                passing += 1
            elif result.status == ControlStatus.FAILING:
                failing += 1
            elif result.status == ControlStatus.WARNING:
                warnings += 1
            elif result.status == ControlStatus.NOT_APPLICABLE:
                not_applicable += 1
        
        total = len(framework_controls)
        testable = total - not_applicable
        compliance_score = (passing / testable * 100) if testable > 0 else 0
        
        # Identify gaps
        gaps = []
        for result in results:
            if result.status in [ControlStatus.FAILING, ControlStatus.WARNING]:
                control = self.controls.get(result.control_id)
                if control:
                    gaps.append({
                        "control_id": result.control_id,
                        "control_name": control.name,
                        "severity": control.severity.value,
                        "status": result.status.value,
                        "message": result.message,
                        "remediation": control.remediation
                    })
        
        # Sort gaps by severity
        severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}
        gaps.sort(key=lambda x: severity_order.get(x["severity"], 5))
        
        # Generate recommendations
        recommendations = self._generate_recommendations(gaps, compliance_score)
        
        report_id = hashlib.md5(
            f"{framework.value}_{datetime.now(timezone.utc).isoformat()}".encode()
        ).hexdigest()[:12]
        
        return ComplianceReport(
            id=report_id,
            framework=framework,
            generated_at=datetime.now(timezone.utc).isoformat(),
            total_controls=total,
            passing=passing,
            failing=failing,
            warnings=warnings,
            not_applicable=not_applicable,
            compliance_score=round(compliance_score, 1),
            results=results,
            gaps=gaps,
            recommendations=recommendations
        )
    
    def _generate_recommendations(self, gaps: List[Dict], score: float) -> List[str]:
        """Generate recommendations based on gaps"""
        recommendations = []
        
        if score < 50:
            recommendations.append("Critical: Compliance score is below 50%. Immediate action required on failing controls.")
        elif score < 80:
            recommendations.append("Warning: Compliance score is below 80%. Address high-severity gaps to improve posture.")
        
        critical_gaps = [g for g in gaps if g["severity"] == "critical"]
        if critical_gaps:
            recommendations.append(f"Address {len(critical_gaps)} critical control failures immediately.")
        
        high_gaps = [g for g in gaps if g["severity"] == "high"]
        if high_gaps:
            recommendations.append(f"Plan remediation for {len(high_gaps)} high-severity gaps within 7 days.")
        
        # Category-specific recommendations
        categories = defaultdict(int)
        for gap in gaps:
            control = self.controls.get(gap["control_id"])
            if control:
                categories[control.category.value] += 1
        
        for category, count in sorted(categories.items(), key=lambda x: -x[1])[:3]:
            recommendations.append(f"Focus on {category.replace('_', ' ').title()}: {count} controls need attention.")
        
        return recommendations
    
    def get_all_controls(self) -> List[Dict]:
        """Get all controls"""
        return [c.to_dict() for c in self.controls.values()]
    
    def get_controls_by_framework(self, framework: ComplianceFramework) -> List[Dict]:
        """Get controls for a specific framework"""
        return [
            c.to_dict() for c in self.controls.values()
            if framework in c.frameworks
        ]
    
    def get_controls_by_category(self, category: ControlCategory) -> List[Dict]:
        """Get controls by category"""
        return [
            c.to_dict() for c in self.controls.values()
            if c.category == category
        ]
    
    def get_framework_summary(self) -> Dict:
        """Get summary of all frameworks"""
        summary = {}
        for framework in ComplianceFramework:
            if framework == ComplianceFramework.CUSTOM:
                continue
            controls = [c for c in self.controls.values() if framework in c.frameworks]
            summary[framework.value] = {
                "name": framework.value.upper().replace("_", " "),
                "total_controls": len(controls),
                "categories": list(set(c.category.value for c in controls))
            }
        return summary
    
    def add_evidence(self, control_id: str, evidence_type: str, evidence_data: Dict):
        """Add evidence for a control"""
        if control_id not in self.evidence_store:
            self.evidence_store[control_id] = {}
        
        self.evidence_store[control_id][evidence_type] = {
            "data": evidence_data,
            "uploaded_at": datetime.now(timezone.utc).isoformat()
        }
    
    def get_evidence(self, control_id: str) -> Dict:
        """Get evidence for a control"""
        return self.evidence_store.get(control_id, {})


# Singleton instance
_compliance_engine: Optional[ComplianceEngine] = None


def get_compliance_engine() -> ComplianceEngine:
    """Get the singleton compliance engine instance"""
    global _compliance_engine
    if _compliance_engine is None:
        _compliance_engine = ComplianceEngine()
    return _compliance_engine


def run_compliance_assessment(framework: str, config: Dict) -> Dict:
    """Run a compliance assessment for a framework"""
    engine = get_compliance_engine()
    try:
        fw = ComplianceFramework(framework)
    except ValueError:
        return {"error": f"Unknown framework: {framework}"}
    
    report = engine.run_framework_assessment(fw, config)
    return report.to_dict()
