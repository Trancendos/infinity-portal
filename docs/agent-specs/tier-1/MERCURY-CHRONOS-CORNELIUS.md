# Mercury AI — Agent Specification

> **Status:** 🟡 In Development | **Tier:** T1_CRITICAL

## Purpose & Role

Mercury AI handles all trading, financial analysis, and portfolio management operations within the Trancendos ecosystem. It provides market analysis, risk assessment, and automated trading strategy execution with full audit trails for financial compliance.

## Capabilities

| Capability | Description | Priority |
|-----------|-------------|----------|
| market-analysis | Real-time and historical market data analysis | Must-have |
| portfolio-management | Portfolio tracking, rebalancing recommendations | Must-have |
| risk-assessment | Position risk calculation, exposure analysis | Must-have |
| trade-execution | Automated trade execution via exchange APIs | Should-have |
| compliance-reporting | Financial regulatory reporting (MiFID II, tax) | Should-have |

## Dependencies
- **Oracle-AI:** Receives price predictions and trend forecasts
- **Norman-AI:** Reports suspicious trading patterns
- **Cornelius-AI:** Participates in financial workflow orchestration

## Deployment
- **Target:** Docker Container (K3s)
- **Region:** Frankfurt (EU financial regulations)
- **Resources:** 1GB RAM (model inference), 1 CPU core

---

# Chronos AI — Agent Specification

> **Status:** 🟡 In Development | **Tier:** T1_CRITICAL

## Purpose & Role

Chronos AI is the temporal coordination agent responsible for scheduling, deadline tracking, time-based automation, and calendar management across the Trancendos ecosystem. It ensures time-sensitive operations execute reliably and coordinates temporal dependencies between agents.

## Capabilities

| Capability | Description | Priority |
|-----------|-------------|----------|
| scheduling | Cron-like job scheduling with timezone awareness | Must-have |
| deadline-tracking | Monitor approaching deadlines, send escalation alerts | Must-have |
| temporal-coordination | Sequence time-dependent multi-agent workflows | Must-have |
| maintenance-windows | Coordinate Solarscene/Lunascene for peak/off-peak ops | Should-have |
| sla-monitoring | Track and alert on SLA/SLO compliance timing | Should-have |

## Dependencies
- **Cornelius-AI:** Receives workflow schedules for temporal orchestration
- **Solarscene-AI / Lunascene-AI:** Coordinates day/night operational windows

## Deployment
- **Target:** Docker Container (K3s) — requires persistent timer state
- **Region:** Frankfurt
- **Resources:** 256MB RAM, 0.25 CPU core

---

# Cornelius AI — Agent Specification

> **Status:** 🟡 In Development | **Tier:** T1_CRITICAL

## Purpose & Role

Cornelius AI is the master orchestrator of the Trancendos agent ecosystem. It coordinates multi-agent workflows, manages task delegation, resolves dependencies between agents, and provides the declarative workflow engine that powers complex automation sequences.

## Capabilities

| Capability | Description | Priority |
|-----------|-------------|----------|
| workflow-execution | Execute YAML-defined multi-step agent workflows | Must-have |
| task-delegation | Route tasks to the most appropriate agent by capability | Must-have |
| dependency-resolution | DAG-based dependency evaluation for parallel execution | Must-have |
| error-handling | Retry policies, circuit breakers, rollback on failure | Must-have |
| workflow-history | Full audit trail of all workflow executions | Should-have |
| agent-discovery | Maintain registry of available agents and their capabilities | Should-have |

## Dependencies
- **All agents:** Cornelius orchestrates workflows that span any combination of agents
- **Chronos-AI:** Provides temporal scheduling for workflow triggers
- **The Nexus:** Service discovery for agent endpoints

## Events Published
| Event Type | Payload | Description |
|-----------|---------|-------------|
| `workflow.started` | `{ workflowId, name, steps, trigger }` | Workflow execution begun |
| `workflow.step_completed` | `{ workflowId, stepId, agentId, result }` | Individual step finished |
| `workflow.completed` | `{ workflowId, status, duration, results }` | Entire workflow finished |
| `workflow.failed` | `{ workflowId, failedStep, error, rollbackStatus }` | Workflow failed |

## Deployment
- **Target:** Docker Container (K3s) — stateful (workflow state persistence)
- **Region:** Frankfurt
- **Resources:** 512MB RAM, 0.5 CPU core
