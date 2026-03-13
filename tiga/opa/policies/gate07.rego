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
