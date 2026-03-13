# ── Gate 6: Security & Privacy Hardening ──────────────────────
package tiga.gates.gate06

import rego.v1

default result := {"status": "NOT_ASSESSED", "gate": "06_security"}

result := {"status": "PASS", "violations": [], "gate": "06_security"} if {
    count(violations) == 0
}

result := {"status": "FAIL", "violations": violations, "gate": "06_security"} if {
    count(violations) > 0
}

violations contains v if {
    not input.system.security.sast_scan_passed
    v := {"rule": "SAST scan must pass with no critical findings", "severity": "CRITICAL"}
}

violations contains v if {
    not input.system.security.sca_scan_passed
    v := {"rule": "SCA dependency scan must pass", "severity": "CRITICAL"}
}

violations contains v if {
    not input.system.security.container_scan_passed
    v := {"rule": "Container image scan must pass", "severity": "HIGH"}
}

violations contains v if {
    not input.system.security.rbac_configured
    v := {"rule": "RBAC must be configured with least privilege", "severity": "HIGH"}
}
