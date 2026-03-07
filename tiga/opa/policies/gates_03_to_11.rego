# ══════════════════════════════════════════════════════════════
# TIGA Gates 3-11: Stub Policies
# Each gate validates specific compliance requirements
# Source: TIGA v2.0 Doc 10 (OPA Policy Bundle)
# Status: Stubs — expand as services mature through gates
# ══════════════════════════════════════════════════════════════

# ── Gate 3: Risk & DPIA/FRIA ──────────────────────────────────
package tiga.gates.gate03

import rego.v1

default result := {"status": "NOT_ASSESSED", "gate": "03_risk_dpia"}

result := {"status": "PASS", "violations": [], "gate": "03_risk_dpia"} if {
    count(violations) == 0
}

result := {"status": "FAIL", "violations": violations, "gate": "03_risk_dpia"} if {
    count(violations) > 0
}

violations contains v if {
    input.system.governance.logic_level in {"LL3", "LL4", "LL5"}
    not input.system.risk.dpia_completed
    v := {"rule": "DPIA required for LL3+ systems", "severity": "CRITICAL"}
}

violations contains v if {
    input.system.governance.logic_level in {"LL4", "LL5"}
    not input.system.risk.fria_completed
    v := {"rule": "FRIA required for LL4+ systems (EU AI Act)", "severity": "CRITICAL"}
}

violations contains v if {
    not input.system.risk.risk_register_exists
    v := {"rule": "Risk register must exist", "severity": "HIGH"}
}

---
# ── Gate 4: Data Governance ───────────────────────────────────
package tiga.gates.gate04

import rego.v1

default result := {"status": "NOT_ASSESSED", "gate": "04_data_governance"}

result := {"status": "PASS", "violations": [], "gate": "04_data_governance"} if {
    count(violations) == 0
}

result := {"status": "FAIL", "violations": violations, "gate": "04_data_governance"} if {
    count(violations) > 0
}

violations contains v if {
    input.system.capabilities.processes_personal_data == true
    not input.system.data.ropa_exists
    v := {"rule": "Record of Processing Activities (ROPA) required", "severity": "CRITICAL"}
}

violations contains v if {
    input.system.capabilities.processes_personal_data == true
    not input.system.data.retention_policy_defined
    v := {"rule": "Data retention policy must be defined", "severity": "HIGH"}
}

violations contains v if {
    not input.system.data.encryption_at_rest
    v := {"rule": "Encryption at rest required", "severity": "CRITICAL"}
}

violations contains v if {
    not input.system.data.encryption_in_transit
    v := {"rule": "Encryption in transit required", "severity": "CRITICAL"}
}

---
# ── Gate 5: Model Governance ──────────────────────────────────
package tiga.gates.gate05

import rego.v1

default result := {"status": "NOT_ASSESSED", "gate": "05_model_governance"}

result := {"status": "PASS", "violations": [], "gate": "05_model_governance"} if {
    count(violations) == 0
}

result := {"status": "FAIL", "violations": violations, "gate": "05_model_governance"} if {
    count(violations) > 0
}

violations contains v if {
    input.system.capabilities.has_ai_features == true
    not input.system.model.bias_audit_completed
    v := {"rule": "Bias audit required for AI systems", "severity": "HIGH"}
}

violations contains v if {
    input.system.capabilities.has_ai_features == true
    not input.system.model.benchmark_bundle_executed
    v := {"rule": "Benchmark bundle must be executed per Logic Level", "severity": "HIGH"}
}

---
# ── Gate 6: Security & Privacy Hardening ──────────────────────
package tiga.gates.gate06

import rego.v1

default result := {"status": "NOT_ASSESSED", "gate": "06_security"}

result := {"status": "PASS", "violations": [], "gate": "06_security"} if {
    count(violations) == 0
}

result := {"status": "FAIL", "violations": violations, "gate": "06_security"} if {
    count(violations) > 0
}

violations contains v if {
    not input.system.security.sast_scan_passed
    v := {"rule": "SAST scan must pass with no critical findings", "severity": "CRITICAL"}
}

violations contains v if {
    not input.system.security.sca_scan_passed
    v := {"rule": "SCA dependency scan must pass", "severity": "CRITICAL"}
}

violations contains v if {
    not input.system.security.container_scan_passed
    v := {"rule": "Container image scan must pass", "severity": "HIGH"}
}

violations contains v if {
    not input.system.security.rbac_configured
    v := {"rule": "RBAC must be configured with least privilege", "severity": "HIGH"}
}

---
# ── Gate 7: Human Oversight ───────────────────────────────────
package tiga.gates.gate07

import rego.v1

default result := {"status": "NOT_ASSESSED", "gate": "07_human_oversight"}

result := {"status": "PASS", "violations": [], "gate": "07_human_oversight"} if {
    count(violations) == 0
}

result := {"status": "FAIL", "violations": violations, "gate": "07_human_oversight"} if {
    count(violations) > 0
}

violations contains v if {
    input.system.governance.logic_level in {"LL3", "LL4", "LL5"}
    not input.system.oversight.human_in_the_loop
    v := {"rule": "Human-in-the-loop required for LL3+ action-taking systems", "severity": "CRITICAL"}
}

violations contains v if {
    not input.system.oversight.escalation_path_defined
    v := {"rule": "Escalation path to human must be defined", "severity": "HIGH"}
}

---
# ── Gate 8: Economic & Sustainability ─────────────────────────
package tiga.gates.gate08

import rego.v1

default result := {"status": "NOT_ASSESSED", "gate": "08_economic"}

result := {"status": "PASS", "violations": [], "gate": "08_economic"} if {
    count(violations) == 0
}

result := {"status": "FAIL", "violations": violations, "gate": "08_economic"} if {
    count(violations) > 0
}

violations contains v if {
    not input.system.economic_model.cost_model_defined
    v := {"rule": "Cost model must be defined (Magna Carta Article VI)", "severity": "HIGH"}
}

violations contains v if {
    not input.system.economic_model.budget_limit_set
    v := {"rule": "Budget limit must be set with auto-throttling", "severity": "HIGH"}
}

violations contains v if {
    not input.system.economic_model.zero_net_cost_strategy_defined
    v := {"rule": "Zero-net-cost strategy must be documented", "severity": "MEDIUM"}
}

---
# ── Gate 9: Production Readiness ──────────────────────────────
package tiga.gates.gate09

import rego.v1

default result := {"status": "NOT_ASSESSED", "gate": "09_prod_readiness"}

result := {"status": "PASS", "violations": [], "gate": "09_prod_readiness"} if {
    count(violations) == 0
}

result := {"status": "FAIL", "violations": violations, "gate": "09_prod_readiness"} if {
    count(violations) > 0
}

violations contains v if {
    not input.system.observability.slo_defined
    v := {"rule": "SLOs must be defined (availability, latency, error rate)", "severity": "HIGH"}
}

violations contains v if {
    not input.system.observability.alerting_configured
    v := {"rule": "Alerting must be configured", "severity": "HIGH"}
}

violations contains v if {
    not input.system.operations.runbook_exists
    v := {"rule": "Operational runbook must exist", "severity": "HIGH"}
}

violations contains v if {
    not input.system.operations.rollback_procedure_tested
    v := {"rule": "Rollback procedure must be tested", "severity": "HIGH"}
}

---
# ── Gate 10: Monitoring & Incident Response ───────────────────
package tiga.gates.gate10

import rego.v1

default result := {"status": "NOT_ASSESSED", "gate": "10_monitoring"}

result := {"status": "PASS", "violations": [], "gate": "10_monitoring"} if {
    count(violations) == 0
}

result := {"status": "FAIL", "violations": violations, "gate": "10_monitoring"} if {
    count(violations) > 0
}

violations contains v if {
    not input.system.observability.metrics_endpoint
    v := {"rule": "Metrics endpoint must be exposed", "severity": "HIGH"}
}

violations contains v if {
    not input.system.observability.logging_configured
    v := {"rule": "Structured logging must be configured", "severity": "HIGH"}
}

violations contains v if {
    not input.system.operations.incident_response_plan
    v := {"rule": "Incident response plan must exist", "severity": "HIGH"}
}

---
# ── Gate 11: Periodic Review & Decommissioning ────────────────
package tiga.gates.gate11

import rego.v1

default result := {"status": "NOT_ASSESSED", "gate": "11_review"}

result := {"status": "PASS", "violations": [], "gate": "11_review"} if {
    count(violations) == 0
}

result := {"status": "FAIL", "violations": violations, "gate": "11_review"} if {
    count(violations) > 0
}

violations contains v if {
    input.system.lifecycle.last_review_date == null
    v := {"rule": "System must have been reviewed at least once", "severity": "MEDIUM"}
}

violations contains v if {
    input.system.lifecycle.next_review_date == null
    v := {"rule": "Next review date must be scheduled", "severity": "MEDIUM"}
}

violations contains v if {
    not input.system.lifecycle.decommissioning_criteria
    v := {"rule": "Decommissioning criteria must be defined", "severity": "LOW"}
}