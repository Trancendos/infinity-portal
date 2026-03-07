# ══════════════════════════════════════════════════════════════
# TIGA Gate 1: Canon Alignment
# Validates that a system's manifest aligns with the AI Magna Carta
# Source: TIGA v2.0 Doc 10 + Canon 00 (AI Magna Carta)
# ══════════════════════════════════════════════════════════════

package tiga.gates.gate01

import rego.v1

default result := {"status": "FAIL", "violations": [], "gate": "01_canon_alignment"}

result := {"status": "PASS", "violations": [], "gate": "01_canon_alignment"} if {
    count(violations) == 0
}

result := {"status": "FAIL", "violations": violations, "gate": "01_canon_alignment"} if {
    count(violations) > 0
}

# Article I: Human Primacy
violations contains v if {
    not input.system.guardrails.human_review_available
    v := {"article": "I", "rule": "Human review must be available for all AI outputs", "severity": "CRITICAL"}
}

violations contains v if {
    input.system.governance.logic_level in {"LL3", "LL4", "LL5"}
    not input.system.guardrails.kill_switch_enabled
    v := {"article": "I", "rule": "Kill switch must be enabled for LL3+ systems", "severity": "CRITICAL"}
}

# Article II: Transparency and Traceability
violations contains v if {
    not input.system.observability.decision_logging_enabled
    v := {"article": "II", "rule": "Decision logging must be enabled", "severity": "CRITICAL"}
}

violations contains v if {
    input.system.capabilities.has_ai_features == true
    not input.system.guardrails.ai_identification_enabled
    v := {"article": "II", "rule": "AI must identify itself in human interactions", "severity": "HIGH"}
}

violations contains v if {
    not input.system.daisy_chain
    v := {"article": "II", "rule": "Daisy-chain traceability must be configured", "severity": "CRITICAL"}
}

# Article III: Safety and Self-Healing
violations contains v if {
    not input.system.interfaces.health_endpoint
    v := {"article": "III", "rule": "Health check endpoint must be configured", "severity": "CRITICAL"}
}

violations contains v if {
    not input.system.guardrails.circuit_breaker.enabled
    v := {"article": "III", "rule": "Circuit breaker must be enabled", "severity": "HIGH"}
}

# Article IV: Privacy and Data Stewardship
violations contains v if {
    input.system.capabilities.processes_personal_data == true
    not input.system.guardrails.consent_mechanism_enabled
    v := {"article": "IV", "rule": "Consent mechanism required for personal data processing", "severity": "CRITICAL"}
}

violations contains v if {
    input.system.capabilities.processes_personal_data == true
    not input.system.guardrails.data_minimisation_policy
    v := {"article": "IV", "rule": "Data minimisation policy required", "severity": "HIGH"}
}

# Article V: Autonomy Boundaries
violations contains v if {
    not input.system.governance.autonomy_level
    v := {"article": "V", "rule": "Autonomy level must be declared", "severity": "CRITICAL"}
}

violations contains v if {
    input.system.governance.logic_level in {"LL3", "LL4", "LL5"}
    not input.system.guardrails.guardian_monitoring_active
    v := {"article": "V", "rule": "Guardian monitoring required for LL3+ systems", "severity": "HIGH"}
}

# Article VI: Economic Responsibility
violations contains v if {
    not input.system.economic_model.cost_model_defined
    v := {"article": "VI", "rule": "Cost model must be defined before production", "severity": "HIGH"}
}

violations contains v if {
    not input.system.economic_model.budget_limit_set
    v := {"article": "VI", "rule": "Budget limits must be configured", "severity": "HIGH"}
}

# Article VII: Cryptographic Integrity
violations contains v if {
    not input.system.security.tls_enabled
    v := {"article": "VII", "rule": "TLS must be enabled for all communications", "severity": "CRITICAL"}
}

# Article VIII: Learning and Guarded Self-Improvement
violations contains v if {
    input.system.governance.logic_level in {"LL3", "LL4", "LL5"}
    not input.system.governance.maturity_level
    v := {"article": "VIII", "rule": "Maturity level must be declared for LL3+ systems", "severity": "HIGH"}
}

# Article IX: Governance and Public Benefit
violations contains v if {
    not input.system.governance.governance_documentation
    v := {"article": "IX", "rule": "Governance documentation must exist", "severity": "HIGH"}
}