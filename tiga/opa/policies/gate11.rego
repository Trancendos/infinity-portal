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
