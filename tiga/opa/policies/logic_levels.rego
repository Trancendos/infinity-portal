# ══════════════════════════════════════════════════════════════
# TIGA Logic Level Classification Policy
# Classifies systems as LL1-LL5 based on capabilities and risk
# Source: TIGA v2.0 Doc 10 (OPA Policy Bundle) + Canon 07 (Metric Canon)
# ══════════════════════════════════════════════════════════════

package tiga.logic_levels

import rego.v1

# Default to LL1 (lowest)
default logic_level := "LL1"

# LL5: AGI-like systems (≥3 AGI traits OR compute threshold exceeded)
logic_level := "LL5" if {
    input.system.capabilities.agi_traits != null
    count([trait |
        some k, v in input.system.capabilities.agi_traits
        v == true
        trait := k
    ]) >= 3
}

logic_level := "LL5" if {
    input.system.compute_flops != null
    input.system.compute_flops > 1e25
}

# LL4: High-risk AI (EU AI Act Annex III categories)
logic_level := "LL4" if {
    not _is_ll5
    some category in input.system.capabilities.ai_categories
    category in high_risk_ai_categories
}

# LL3: Limited risk AI with personal data
logic_level := "LL3" if {
    not _is_ll5
    not _is_ll4
    input.system.capabilities.processes_personal_data == true
    input.system.capabilities.has_ai_features == true
}

# LL2: Systems with personal data, no AI
logic_level := "LL2" if {
    not _is_ll5
    not _is_ll4
    not _is_ll3
    input.system.capabilities.processes_personal_data == true
}

# LL1: Low-risk, no personal data (default)

# Helper predicates
_is_ll5 if { logic_level == "LL5" }
_is_ll4 if { logic_level == "LL4" }
_is_ll3 if { logic_level == "LL3" }

# Risk tier derived from logic level
default risk_tier := "Low"
risk_tier := "Frontier" if { logic_level == "LL5" }
risk_tier := "High" if { logic_level == "LL4" }
risk_tier := "High" if { logic_level == "LL3" }
risk_tier := "Medium" if { logic_level == "LL2" }

# EU AI Act Annex III high-risk categories
high_risk_ai_categories := {
    "biometric_identification",
    "critical_infrastructure",
    "education_assessment",
    "employment_decisions",
    "essential_services",
    "law_enforcement",
    "migration_control",
    "administration_of_justice"
}

# Required governance per logic level
required_governance := governance if {
    logic_level == "LL1"
    governance := {"review": "minimal", "red_team": false, "external_audit": false, "board_approval": false}
}
required_governance := governance if {
    logic_level == "LL2"
    governance := {"review": "standard", "red_team": false, "external_audit": false, "board_approval": false}
}
required_governance := governance if {
    logic_level == "LL3"
    governance := {"review": "design_review", "red_team": false, "external_audit": false, "board_approval": false}
}
required_governance := governance if {
    logic_level == "LL4"
    governance := {"review": "full_review", "red_team": true, "external_audit": false, "board_approval": true}
}
required_governance := governance if {
    logic_level == "LL5"
    governance := {"review": "full_board", "red_team": true, "external_audit": true, "board_approval": true}
}

# Classification result
result := {
    "system_id": input.system.id,
    "logic_level": logic_level,
    "risk_tier": risk_tier,
    "required_governance": required_governance,
    "timestamp": input.metadata.timestamp
}