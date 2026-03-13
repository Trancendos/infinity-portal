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
