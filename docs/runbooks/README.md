# Operational Hymn Sheets — Runbook Templates
## Source: Canon 02 (Operational Hymn Sheets)

These runbooks standardize the rituals, reviews, and response procedures
for the Trancendos ecosystem. Every team member and AI agent must follow
these procedures.

## Runbooks

| # | Hymn Sheet | Purpose | Frequency |
|---|-----------|---------|-----------|
| 1 | [Design Review](./01-design-review.md) | Validate architecture before implementation | Per new system/major change |
| 2 | [Production Readiness & Monetisation](./02-production-readiness.md) | Ensure safe, aligned, observable, economically viable | Before production deploy |
| 3 | [Incident Response](./03-incident-response.md) | Standardized response to production incidents | On incident |
| 4 | [Self-Healing Diagnostics](./04-self-healing-diagnostics.md) | Diagnose and engage self-healing mechanisms | On anomaly detection |
| 5 | [Secure Delivery & CVE Review](./05-secure-delivery.md) | Security, CVE, and dependency scanning before deploy | Every deployment |

## Severity Levels

| Level | Definition | Response Time |
|-------|-----------|---------------|
| SEV-1 | Full service outage or data breach | Immediate; all-hands war room |
| SEV-2 | Major degradation affecting >25% users | Within 15 minutes; on-call + escalation |
| SEV-3 | Minor degradation or isolated failures | Within 1 hour; on-call investigation |
| SEV-4 | Cosmetic issues or non-critical bugs | Next business day |