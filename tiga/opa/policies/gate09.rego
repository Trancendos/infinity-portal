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
