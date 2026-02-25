# [Agent Name] — Agent Specification

> **Status:** [🔴 Planned | 🟡 In Development | 🟢 Active]
> **Tier:** [T1_CRITICAL | T2_IMPORTANT | T3_NICE_TO_HAVE]
> **Repository:** [link]
> **Version:** [semver]

## Purpose & Role

[1-2 sentences describing what this agent does and why it exists in the ecosystem.]

## Capabilities

| Capability | Description | Priority |
|-----------|-------------|----------|
| [capability-1] | [What it does] | [Must-have / Should-have / Nice-to-have] |
| [capability-2] | [What it does] | [Priority] |
| [capability-3] | [What it does] | [Priority] |

## Limitations & Constraints

- [What this agent explicitly does NOT do]
- [Resource constraints (memory, CPU, API rate limits)]
- [Known limitations of underlying models or services]

## Dependencies

### Agent Dependencies
| Agent | Relationship | Required? |
|-------|-------------|-----------|
| [agent-id] | [How they interact] | [Yes/No] |

### External Services
| Service | Purpose | Free Tier Limit |
|---------|---------|-----------------|
| [service] | [Why needed] | [Limit] |

### Data Sources
- [What data this agent consumes]
- [Where that data comes from]

## API

### Events Published
| Event Type | Payload | Description |
|-----------|---------|-------------|
| [event.type] | `{ field: type }` | [When/why published] |

### Events Subscribed
| Event Type | Source | Handler | Description |
|-----------|--------|---------|-------------|
| [event.type] | [agent-id] | [method] | [What happens] |

### HTTP Endpoints (if applicable)
| Method | Path | Description |
|--------|------|-------------|
| [GET/POST] | [/path] | [What it does] |

## Deployment

- **Target:** [Cloudflare Worker / K3s Pod / Docker Container / Standalone]
- **Region:** [Where it runs, GDPR considerations]
- **Resources:** [CPU, memory, storage requirements]
- **Scaling:** [How it scales, concurrency limits]

## Health Checks

| Check | Description | Threshold |
|-------|-------------|-----------|
| [check-name] | [What it validates] | [Pass/warn/fail criteria] |

## Configuration

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| [setting] | [type] | [default] | [What it controls] |

## Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `trancendos_agent_[name]` | [counter/gauge/histogram] | [labels] | [What it measures] |

## Runbook

### Common Issues
| Symptom | Cause | Resolution |
|---------|-------|------------|
| [What you see] | [Why it happens] | [How to fix] |

### Escalation
1. Check agent health status
2. Review logs in Grafana/Loki
3. Restart agent pod if degraded
4. Escalate to [owner] if persistent
