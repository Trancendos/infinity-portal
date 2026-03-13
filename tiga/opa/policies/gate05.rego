# ── Gate 5: Model Governance ──────────────────────────────────
package tiga.gates.gate05

import rego.v1

default result := {"status": "NOT_ASSESSED", "gate": "05_model_governance"}

result := {"status": "PASS", "violations": [], "gate": "05_model_governance"} if {
    count(violations) == 0
}

result := {"status": "FAIL", "violations": violations, "gate": "05_model_governance"} if {
    count(violations) > 0
}

violations contains v if {
    input.system.capabilities.has_ai_features == true
    not input.system.model.bias_audit_completed
    v := {"rule": "Bias audit required for AI systems", "severity": "HIGH"}
}

violations contains v if {
    input.system.capabilities.has_ai_features == true
    not input.system.model.benchmark_bundle_executed
    v := {"rule": "Benchmark bundle must be executed per Logic Level", "severity": "HIGH"}
}
