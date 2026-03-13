# ══════════════════════════════════════════════════════════════════
# TIGA Logic Level Classification Policy
# Classifies systems as LL1-LL5 based on capabilities and risk
# Source: TIGA v2.0 Doc 10 (OPA Policy Bundle) + Canon 07 (Metric Canon)
# Fixed: use else-chain (no recursion); consistent input.system.* paths
# ══════════════════════════════════════════════════════════════════

package tiga.logic_levels

import rego.v1

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

# Helper: count AGI traits that are true (non-recursive)
agi_trait_count := count([k |
    some k, v in input.system.capabilities.agi_traits
    v == true
])

# Logic level using else-chain (evaluated top to bottom, first match wins)
# This avoids circular references entirely
logic_level := "LL5" if {
    input.system.capabilities.agi_traits != null
    agi_trait_count >= 3
} else := "LL5" if {
    input.system.compute_flops > 1e25
} else := "LL4" if {
    some category in input.system.capabilities.ai_categories
    category in high_risk_ai_categories
} else := "LL3" if {
    input.system.capabilities.processes_personal_data == true
    input.system.capabilities.has_ai_features == true
} else := "LL2" if {
    input.system.capabilities.processes_personal_data == true
} else := "LL1"

# Risk tier derived from logic level
risk_tier := "Frontier" if { logic_level == "LL5" }
risk_tier := "High" if { logic_level == "LL4" }
risk_tier := "High" if { logic_level == "LL3" }
risk_tier := "Medium" if { logic_level == "LL2" }
default risk_tier := "Low"

# Required governance per logic level
required_governance := {"review": "minimal", "red_team": false, "external_audit": false, "board_approval": false} if {
    logic_level == "LL1"
}
required_governance := {"review": "standard", "red_team": false, "external_audit": false, "board_approval": false} if {
    logic_level == "LL2"
}
required_governance := {"review": "design_review", "red_team": false, "external_audit": false, "board_approval": false} if {
    logic_level == "LL3"
}
required_governance := {"review": "full_review", "red_team": true, "external_audit": false, "board_approval": true} if {
    logic_level == "LL4"
}
required_governance := {"review": "full_board", "red_team": true, "external_audit": true, "board_approval": true} if {
    logic_level == "LL5"
}

# Classification result
result := {
    "system_id": input.system.id,
    "logic_level": logic_level,
    "risk_tier": risk_tier,
    "required_governance": required_governance,
}