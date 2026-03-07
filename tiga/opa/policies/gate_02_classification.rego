# ══════════════════════════════════════════════════════════════
# TIGA Gate 2: Classification
# Validates Logic Level classification and required governance
# Source: TIGA v2.0 Doc 10 + Canon 07 (Metric Canon)
# ══════════════════════════════════════════════════════════════

package tiga.gates.gate02

import rego.v1
import data.tiga.logic_levels

default result := {"status": "FAIL", "violations": [], "gate": "02_classification"}

result := {"status": "PASS", "violations": [], "gate": "02_classification", "classification": classification} if {
    count(violations) == 0
}

result := {"status": "FAIL", "violations": violations, "gate": "02_classification", "classification": classification} if {
    count(violations) > 0
}

# Computed classification
classification := {
    "computed_logic_level": logic_levels.logic_level,
    "declared_logic_level": input.system.governance.logic_level,
    "computed_risk_tier": logic_levels.risk_tier,
    "declared_risk_tier": input.system.governance.risk_tier,
    "match": logic_levels.logic_level == input.system.governance.logic_level
}

# Violation: declared LL does not match computed LL
violations contains v if {
    logic_levels.logic_level != input.system.governance.logic_level
    v := {
        "rule": "Declared Logic Level does not match computed classification",
        "severity": "CRITICAL",
        "detail": sprintf("Declared: %s, Computed: %s", [input.system.governance.logic_level, logic_levels.logic_level])
    }
}

# Violation: risk tier mismatch
violations contains v if {
    logic_levels.risk_tier != input.system.governance.risk_tier
    v := {
        "rule": "Declared Risk Tier does not match computed tier",
        "severity": "HIGH",
        "detail": sprintf("Declared: %s, Computed: %s", [input.system.governance.risk_tier, logic_levels.risk_tier])
    }
}

# Violation: LL3+ without design review
violations contains v if {
    logic_levels.logic_level in {"LL3", "LL4", "LL5"}
    not input.system.governance.design_review_completed
    v := {
        "rule": "Design review required for LL3+ systems",
        "severity": "CRITICAL",
        "detail": sprintf("Logic Level %s requires design review", [logic_levels.logic_level])
    }
}

# Violation: LL4+ without red-team
violations contains v if {
    logic_levels.logic_level in {"LL4", "LL5"}
    not input.system.governance.red_team_completed
    v := {
        "rule": "Red-team evaluation required for LL4+ systems",
        "severity": "CRITICAL",
        "detail": sprintf("Logic Level %s requires red-team evaluation", [logic_levels.logic_level])
    }
}

# Violation: LL5 without external audit
violations contains v if {
    logic_levels.logic_level == "LL5"
    not input.system.governance.external_audit_completed
    v := {
        "rule": "External audit required for LL5 systems",
        "severity": "CRITICAL",
        "detail": "LL5 (AGI-like) systems require external audit"
    }
}

# Violation: LL4+ without governance board approval
violations contains v if {
    logic_levels.logic_level in {"LL4", "LL5"}
    not input.system.governance.board_approval
    v := {
        "rule": "Governance board approval required for LL4+ systems",
        "severity": "CRITICAL",
        "detail": sprintf("Logic Level %s requires governance board approval", [logic_levels.logic_level])
    }
}