# Hymn Sheet 4: Self-Healing Diagnostics
## Source: Canon 02 — Operational Hymn Sheets

### Purpose
Standardised procedure for diagnosing and engaging self-healing mechanisms
when automated recovery detects anomalies.

### Diagnostic Steps

#### Step 1: Health Check Review
- [ ] Verify liveness probe status across all affected components
- [ ] Verify readiness probe status across all affected components
- [ ] Check dependency health (databases, caches, external APIs)
- [ ] Review recent deployment history for correlation

#### Step 2: Anomaly Classification
Categorise the anomaly:
- [ ] **Performance**: Latency spike, throughput drop
- [ ] **Error Rate**: Increased 5xx responses, failed requests
- [ ] **Resource Exhaustion**: CPU, memory, disk, connections
- [ ] **Data Integrity**: Inconsistent state, corruption, sync failures

#### Step 3: Automated Remediation Log
Review actions already taken by self-healing layer:
- [ ] Container restarts (how many, which pods?)
- [ ] Circuit breaker trips (which dependencies?)
- [ ] Traffic shedding (what percentage?)
- [ ] Cache fallback activation
- [ ] Configuration rollback

#### Step 4: Root Cause Analysis
Trace the anomaly to source:
- [ ] **Code**: Recent deployment, bug, regression
- [ ] **Config**: Environment variable change, feature flag
- [ ] **Dependency**: External service degradation, API change
- [ ] **Data**: Bad input, schema mismatch, volume spike
- [ ] **Infrastructure**: Node failure, network partition, DNS

#### Step 5: Escalation Decision
- If automated remediation resolved the issue → **Document and close**
- If not resolved → **Escalate to Incident Response (Hymn Sheet 3)**

### Self-Healing Capabilities Checklist

| Capability | Trigger | Action | Verification |
|-----------|---------|--------|-------------|
| Container restart | Health check failure (3 consecutive) | Restart container | Liveness probe passes |
| Circuit breaker | Dependency timeout (>5s for 10+ requests) | Open circuit, return fallback | Error rate drops |
| Traffic shedding | Error rate exceeds 10% threshold | Shed 50% traffic via load balancer | Error rate normalises |
| Config rollback | Anomaly within 15 min of config change | Revert to last known good config | Metrics return to baseline |
| Cache fallback | Primary data source unavailable | Serve from cache with staleness warning | Requests succeed |
| Human escalation | All automated options exhausted | Alert on-call + Incident Commander | Human acknowledges |

### Self-Healing Flow
```
[Anomaly Detected]
       │
       ▼
[Health Check Review] ──── All healthy? ──── YES ──→ [False alarm — log & close]
       │
       NO
       ▼
[Classify Anomaly] ──→ [Performance | Error | Resource | Data]
       │
       ▼
[Check Automated Actions] ──── Resolved? ──── YES ──→ [Document & close]
       │
       NO
       ▼
[Root Cause Analysis]
       │
       ▼
[Can auto-remediate?] ──── YES ──→ [Apply fix] ──→ [Verify] ──→ [Document]
       │
       NO
       ▼
[Escalate to Incident Response (Hymn Sheet 3)]
```

### Ista Integration (Self-Healing Rule 4)
When an Ista encounters a failure:
1. **Deploy fallback**: Automatically serve cached/fallback state
2. **Log with persona**: Error logged in the Ista's distinct voice with sarcastic observation
3. **Surgical patch**: Provide isolated fix — no destructive refactoring
4. **Notify**: Route to DevOpsista (Tyler Towncroft) and Studio Lead