# Guardian AI — Agent Specification

> **Status:** 🟡 In Development
> **Tier:** T1_CRITICAL
> **Repository:** https://github.com/Trancendos/Guardian-AI
> **Version:** 0.1.0

## Purpose & Role

Guardian AI is the enforcement arm of the Trancendos security layer. While Norman-AI detects threats, Guardian-AI executes containment, blocking, and defensive actions. It manages perimeter defense, access control enforcement, and DDoS mitigation across the platform.

## Capabilities

| Capability | Description | Priority |
|-----------|-------------|----------|
| containment-execution | Execute blocking/isolation directives from Norman-AI | Must-have |
| perimeter-defense | Manage IP allowlists/blocklists, geo-fencing, rate limiting | Must-have |
| ddos-mitigation | Detect and respond to volumetric and application-layer DDoS | Must-have |
| access-control | Dynamic access policy enforcement based on risk signals | Should-have |
| kill-switch | Emergency system-wide lockdown capability (EU AI Act Art. 14 HITL) | Must-have |

## Dependencies

### Agent Dependencies
| Agent | Relationship | Required? |
|-------|-------------|-----------|
| norman-ai | Receives threat containment directives | Yes |
| sentinel-ai | Receives real-time alert streams | Yes |
| cornelius-ai | Reports status during multi-agent incident workflows | No |

## Events Published
| Event Type | Payload | Description |
|-----------|---------|-------------|
| `security.containment_executed` | `{ directiveId, action, target, result }` | Containment action completed |
| `security.access_denied` | `{ userId, resource, reason, riskScore }` | Access request blocked |
| `security.kill_switch_activated` | `{ reason, activatedBy, scope }` | Emergency lockdown triggered |

## Events Subscribed
| Event Type | Source | Description |
|-----------|--------|-------------|
| `security.threat_detected` | norman-ai | Triggers containment evaluation |
| `security.containment_directive` | norman-ai | Direct containment order |

## Deployment

- **Target:** Cloudflare Worker (edge enforcement) + Docker Container (deep analysis)
- **Region:** Global edge (Cloudflare) + Frankfurt (K3s)
- **Resources:** 128MB RAM per Worker, 256MB RAM container
- **Scaling:** Multi-instance (stateless enforcement layer)
