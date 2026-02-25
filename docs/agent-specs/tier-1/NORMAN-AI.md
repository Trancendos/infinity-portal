# Norman AI — Agent Specification

> **Status:** 🟡 In Development
> **Tier:** T1_CRITICAL
> **Repository:** https://github.com/Trancendos/Norman-AI
> **Version:** 0.1.0

## Purpose & Role

Norman AI is the primary security guardian of the Trancendos ecosystem. It provides autonomous threat detection, incident response, and vulnerability scanning across all platform services, functioning as the first line of defense against attacks, misconfigurations, and policy violations.

## Capabilities

| Capability | Description | Priority |
|-----------|-------------|----------|
| threat-detection | Real-time analysis of network traffic, API calls, and system events for anomalous patterns | Must-have |
| incident-response | Automated containment and remediation workflows triggered by detected threats | Must-have |
| vulnerability-scanning | Continuous scanning of deployed services for known CVEs and misconfigurations | Must-have |
| policy-enforcement | Validation that all requests comply with security policies defined in the-foundation | Should-have |
| forensic-logging | Detailed evidence collection for post-incident analysis and compliance audits | Should-have |
| threat-intelligence | Integration with external threat feeds for proactive defense | Nice-to-have |

## Limitations & Constraints

- Does NOT handle authentication/authorization (that is Infinity Portal's domain)
- Cannot modify firewall rules directly — recommends changes to Guardian-AI for enforcement
- Rate limited to 100K event evaluations/day on free tier
- Does not perform penetration testing (passive analysis only)

## Dependencies

### Agent Dependencies
| Agent | Relationship | Required? |
|-------|-------------|-----------|
| guardian-ai | Sends containment directives when threats confirmed | Yes |
| sentinel-ai | Receives raw alert streams for correlation | Yes |
| prometheus-ai | Sends security metrics for dashboard visualization | No |
| cornelius-ai | Reports to orchestrator for multi-agent incident workflows | No |

### External Services
| Service | Purpose | Free Tier Limit |
|---------|---------|-----------------|
| Cloudflare WAF | Edge threat data | Included in free plan |
| Supabase | Incident storage | 500MB |

### Data Sources
- Cloudflare WAF logs (edge attack attempts)
- Application audit logs (AuditLog table)
- Agent health check events (anomaly in agent behavior)
- GitHub security advisories (dependency vulnerabilities)

## API

### Events Published
| Event Type | Payload | Description |
|-----------|---------|-------------|
| `security.threat_detected` | `{ threatId, severity, type, source, evidence }` | New threat identified |
| `security.incident_created` | `{ incidentId, threatIds, status, assignedTo }` | Incident opened from correlated threats |
| `security.incident_resolved` | `{ incidentId, resolution, duration }` | Incident closed |
| `security.vulnerability_found` | `{ cveId, service, severity, remediation }` | New vulnerability discovered |
| `security.scan_completed` | `{ scanId, findings, duration }` | Vulnerability scan finished |

### Events Subscribed
| Event Type | Source | Handler | Description |
|-----------|--------|---------|-------------|
| `agent.health_check` | All agents | `handleHealthAnomaly` | Detect agents behaving abnormally |
| `security.alert_raw` | sentinel-ai | `handleRawAlert` | Raw alerts for correlation |
| `compliance.violation_detected` | compliance services | `handleComplianceViolation` | Policy violations escalated to security |

## Deployment

- **Target:** Docker Container (K3s pod on Oracle Always Free)
- **Region:** Frankfurt (EU — GDPR data residency)
- **Resources:** 512MB RAM, 0.5 CPU core
- **Scaling:** Single instance (stateful — maintains incident correlation state)

## Health Checks

| Check | Description | Threshold |
|-------|-------------|-----------|
| event_processing | Events processed in last 60s | warn: < 1, fail: 0 for 5min |
| incident_backlog | Unresolved incidents older than 24h | warn: > 5, fail: > 20 |
| scan_freshness | Time since last vulnerability scan | warn: > 24h, fail: > 72h |

## Configuration

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `THREAT_SENSITIVITY` | string | "medium" | Detection sensitivity (low/medium/high) |
| `AUTO_CONTAIN` | boolean | false | Auto-trigger containment without human approval |
| `SCAN_INTERVAL_HOURS` | number | 24 | Hours between vulnerability scans |
| `MAX_CORRELATION_WINDOW` | number | 300 | Seconds to correlate related events |

## Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `trancendos_agent_threats_detected_total` | counter | severity, type | Total threats detected |
| `trancendos_agent_incidents_active` | gauge | severity | Currently open incidents |
| `trancendos_agent_scan_duration_seconds` | histogram | scan_type | Vulnerability scan duration |
| `trancendos_agent_threat_response_seconds` | histogram | severity | Time from detection to response |
