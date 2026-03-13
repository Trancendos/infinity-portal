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
