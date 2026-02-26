# Agent Blueprint Template
**Version:** 1.0 | **Template Type:** Agent Specification  
**Usage:** Copy this template for every new AI agent in the Trancendos ecosystem

---

## 1. Identity

| Field | Value |
|-------|-------|
| **Agent Name** | `[e.g. norman-ai, guardian-ai]` |
| **Purpose** | One-sentence description of what this agent does |
| **Domain(s)** | `[e.g. compliance, security, content-generation]` |
| **Owner / Steward** | GitHub username or team |
| **Repository** | `Trancendos/[agent-name]` |
| **Autonomy Level** | `L0 / L1 / L2 / L3 / L4` |
| **Risk Classification** | `MINIMAL / LIMITED / HIGH / PROHIBITED` |
| **Status** | `draft / active / deprecated` |
| **Version** | `1.0.0` |

---

## 2. Capabilities

### Core Skills
- [ ] Skill 1: Description
- [ ] Skill 2: Description

### Non-Goals (Explicit Exclusions)
- This agent does NOT: ...
- This agent does NOT: ...

### Autonomy Boundaries
- **Can do without approval:** List of permitted autonomous actions
- **Requires HITL approval:** List of actions requiring human review
- **Cannot do under any circumstances:** Hard prohibitions

---

## 3. Interfaces

### Input Formats
```typescript
interface AgentInput {
  task_type: string;
  payload: Record<string, unknown>;
  context?: {
    user_id: string;
    organisation_id: string;
    session_id?: string;
  };
  priority?: 'low' | 'normal' | 'high' | 'urgent';
}
```

### Output Formats
```typescript
interface AgentOutput {
  status: 'completed' | 'pending_review' | 'failed';
  result: Record<string, unknown>;
  confidence_score: number;  // 0.0-1.0
  reasoning?: string;
  provenance_manifest_url?: string;
  hitl_task_id?: string;  // If pending review
}
```

### APIs and Tools
| Tool/API | Purpose | Auth Method | Rate Limit |
|----------|---------|-------------|------------|
| `POST /api/v1/ai/generate` | LLM generation | Bearer JWT | 100/min |
| `GET /api/v1/kb/articles` | Knowledge retrieval | Bearer JWT | 500/min |
| Add more... | | | |

---

## 4. Knowledge & Memory

### Data Sources
- Primary: `[e.g. Knowledge Base articles, compliance documents]`
- Secondary: `[e.g. External APIs, web search]`

### Retrieval Strategy
- [ ] RAG (vector similarity search over KB)
- [ ] Tool-based (explicit API calls)
- [ ] Both

### Context Window Management
- Max context tokens: `[e.g. 32,000]`
- Context compression strategy: `[e.g. summarise older messages]`
- Memory persistence: `[session-only / persistent / none]`

### Retention and Forgetting Rules
- Session data: Cleared after `[X hours]`
- Long-term memory: Retained for `[X days]`
- PII: Never stored beyond session (GDPR compliance)

---

## 5. Guardrails

### Policy References
- Magna Carta Articles: `[e.g. I, II, V]`
- EU AI Act: `[e.g. Art. 9, Art. 14]`
- ISO 27001 Controls: `[e.g. A.8.16, A.9.4]`

### Hard Constraints
```python
BLOCKED_ACTIONS = [
    "delete_production_database",
    "send_external_email_without_approval",
    "modify_user_permissions",
    # Add more...
]

HIGH_RISK_KEYWORDS = [
    "biometric", "medical_diagnosis", "law_enforcement",
    # Add more...
]
```

### Escalation Rules
- Escalate to HITL when: `[risk_score > 70, task_type in HIGH_RISK, confidence < 0.6]`
- Escalation timeout: `[e.g. 24 hours — auto-reject if no response]`
- Emergency stop: `[Describe kill switch mechanism]`

---

## 6. Observability

### Key Metrics
| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| Success rate | > 95% | < 90% |
| P95 latency | < 5s | > 10s |
| HITL escalation rate | < 10% | > 25% |
| Error rate | < 1% | > 5% |

### Logging
- All actions logged to: `AuditLog` table with `event_type = "ai.*"`
- Sensitive data: Never logged in plaintext
- Log retention: 7 years (EU AI Act compliance)

### Tracing
- OpenTelemetry trace IDs on all requests
- Correlation ID propagated through all downstream calls

### Feedback Loops
- User ratings: `POST /api/v1/billing/usage/record` with `metric_type = "ai_generation"`
- HITL decisions feed into: `AITrainingDataset` for model evaluation
- Benchmark schedule: Quarterly via `AIModelEvaluation`

---

## 7. Lifecycle

### Versioning Scheme
- Semantic versioning: `MAJOR.MINOR.PATCH`
- Breaking changes: Increment MAJOR, notify all consumers
- Deprecation notice: Minimum 30 days before removal

### Deployment Tiers
| Tier | Purpose | Approval Required |
|------|---------|-------------------|
| `dev` | Development testing | None |
| `staging` | Integration testing | PR review |
| `prod` | Production | PRINCE2 Gate G4 sign-off |

### PRINCE2 Gate Requirements
- **G0 (Concept):** Agent blueprint approved by AI Governance Body
- **G2 (Design):** Architecture review complete, risk assessment done
- **G4 (Testing):** All tests passing, security scan clean, benchmark scores met
- **G6 (Live):** Production deployment approved, monitoring active

### Decommissioning Criteria
- [ ] Replacement agent is live and stable for 30+ days
- [ ] All consumers migrated to new agent
- [ ] Data migration complete
- [ ] Crypto-shredding of agent-specific data complete
- [ ] Post-mortem written and knowledge captured in KB

---

## 8. Security

### Authentication
- Agent-to-agent: mTLS with Agent Identity Keys (TEE-protected)
- Agent-to-API: Bearer JWT with minimum required permissions
- API keys: Rotated every 30 days (automated)

### Data Classification
- Input data classification: `[PUBLIC / INTERNAL / CONFIDENTIAL / RESTRICTED / PII]`
- Output data classification: `[PUBLIC / INTERNAL / CONFIDENTIAL]`
- Encryption at rest: `[AES-256 / Not required]`

### Threat Model
| Threat | Likelihood | Impact | Mitigation |
|--------|-----------|--------|------------|
| Prompt injection | Medium | High | Input sanitisation, policy engine validation |
| Data exfiltration | Low | Critical | Network egress controls, audit logging |
| Model poisoning | Low | High | Training data approval workflow |

---

*Template version 1.0 — Trancendos AI Canon*