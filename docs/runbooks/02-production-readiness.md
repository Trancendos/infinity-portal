# Hymn Sheet 2: Production Readiness & Monetisation Review
## Source: Canon 02 — Operational Hymn Sheets

### Purpose
Ensure any AI service entering production is safe, aligned, observable,
self-healing, and economically viable with zero-net-cost, revenue-aware
design consistent with the Magna Carta.

### Participants
- Product Owner
- Tech Lead / AI Architect
- SRE / Ops
- Security and Compliance
- Revenue / Growth Representative
- Observer agents (read-only dashboards, summariser agents)

### Pre-Work (Must Be Attached)
- [ ] One-pager and architecture diagram
- [ ] Agent blueprints and autonomy levels
- [ ] Evals and red-team results (LL3+ mandatory)
- [ ] Cost model and projected usage
- [ ] Monetisation strategy and revenue streams
- [ ] Runbooks (incident, self-healing, rollback)
- [ ] TIGA manifest with all 11 gates assessed

### Agenda (60 minutes)
| Time | Topic | Lead |
|------|-------|------|
| 0-5 min | Context and Goals | Product Owner |
| 5-20 min | Architecture and Self-Healing: failure modes, health checks, SLOs, error budgets | Tech Lead |
| 20-30 min | Safety and Alignment: eval results, residual risks | AI Architect |
| 30-45 min | Economic Model: unit economics, monetisation levers, zero-net-cost plan | Revenue Lead |
| 45-55 min | Security and Crypto: encryption, key management, audit logging, abuse detection | Security |
| 55-60 min | Decision and Actions | Product Owner |

### Production Readiness Checklist
#### Safety & Alignment
- [ ] Benchmark bundle executed for declared Logic Level
- [ ] Red-team evaluation completed (LL3+ mandatory)
- [ ] Safety regression tests passing
- [ ] Guardrails configured and tested

#### Self-Healing & Reliability
- [ ] Health checks (liveness + readiness) implemented
- [ ] Circuit breakers configured
- [ ] Automatic rollback tested
- [ ] SLOs defined (availability, latency p95, error rate)
- [ ] Error budget established

#### Economic Viability
- [ ] Cost per operation calculated
- [ ] Budget limits set with auto-throttling at 80%
- [ ] Zero-net-cost strategy documented
- [ ] Revenue attribution configured
- [ ] Break-even point estimated

#### Security & Crypto
- [ ] TLS 1.3 for all communications
- [ ] mTLS for inter-service communication
- [ ] API key rotation policy active
- [ ] RBAC with least privilege
- [ ] Audit logging enabled

#### Observability
- [ ] Metrics endpoint exposed (/metrics)
- [ ] Structured logging configured
- [ ] Alerting rules defined
- [ ] Grafana dashboard created
- [ ] Trace IDs propagated

### Decision Log
- **Outcome**: `[ ] Approved` / `[ ] Conditional` / `[ ] Blocked`
- **Conditions** (if conditional): _(list here)_
- **Post-review**: Update ADRs, register in economic and metric registries, schedule post-launch review