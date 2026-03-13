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
