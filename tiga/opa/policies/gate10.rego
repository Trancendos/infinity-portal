# ── Gate 10: Monitoring & Incident Response ───────────────────
package tiga.gates.gate10

import rego.v1

default result := {"status": "NOT_ASSESSED", "gate": "10_monitoring"}

result := {"status": "PASS", "violations": [], "gate": "10_monitoring"} if {
    count(violations) == 0
}

result := {"status": "FAIL", "violations": violations, "gate": "10_monitoring"} if {
    count(violations) > 0
}

violations contains v if {
    not input.system.observability.metrics_endpoint
    v := {"rule": "Metrics endpoint must be exposed", "severity": "HIGH"}
}

violations contains v if {
    not input.system.observability.logging_configured
    v := {"rule": "Structured logging must be configured", "severity": "HIGH"}
}

violations contains v if {
    not input.system.operations.incident_response_plan
    v := {"rule": "Incident response plan must exist", "severity": "HIGH"}
}
