# Hymn Sheet 3: Incident Response
## Source: Canon 02 — Operational Hymn Sheets

### Purpose
Standardised response procedure for production incidents to minimise impact,
restore service, and capture learnings.

### Severity Levels
| Level | Definition | Response Time | Communication |
|-------|-----------|---------------|---------------|
| SEV-1 | Full service outage or data breach | Immediate; all-hands war room | Every 30 minutes |
| SEV-2 | Major degradation affecting >25% users | Within 15 minutes; on-call + escalation | Every 2 hours |
| SEV-3 | Minor degradation or isolated failures | Within 1 hour; on-call investigation | As needed |
| SEV-4 | Cosmetic issues or non-critical bugs | Next business day | N/A |

### Response Procedure

#### Phase 1: Detect
- [ ] Automated alerts or user reports trigger incident
- [ ] Incident logged in tracking system with timestamp
- [ ] Initial severity assessment

#### Phase 2: Triage
- [ ] Assign severity level (SEV-1 to SEV-4)
- [ ] Assign Incident Commander
- [ ] Open dedicated communication channel
- [ ] Notify relevant stakeholders per severity matrix

#### Phase 3: Contain
- [ ] Isolate affected components
- [ ] Engage self-healing mechanisms (see Hymn Sheet 4)
- [ ] Activate circuit breakers if needed
- [ ] Shed traffic if error rate exceeds threshold
- [ ] Prevent lateral spread to other services

#### Phase 4: Resolve
- [ ] Apply fix (surgical patch — no destructive refactoring)
- [ ] Validate fix in staging if possible
- [ ] Deploy fix to production
- [ ] Confirm service restoration
- [ ] Verify SLOs are being met

#### Phase 5: Communicate
- [ ] Status updates to stakeholders at defined intervals
- [ ] User-facing communication if SEV-1 or SEV-2
- [ ] Internal status page updated
- [ ] All-clear notification when resolved

#### Phase 6: Post-Mortem
- [ ] Blameless review within 48 hours (SEV-1/2) or 5 business days (SEV-3)
- [ ] Document in Book of Heresies (Canon 08)
- [ ] Identify root cause
- [ ] Define preventive actions with owners and deadlines
- [ ] Update runbooks and alerting rules
- [ ] Share learnings with team

### Post-Mortem Template
```markdown
## Incident Post-Mortem: [INCIDENT-ID]
**Date**: YYYY-MM-DD
**Severity**: SEV-X
**Duration**: X hours Y minutes
**Incident Commander**: [Name]

### Summary
[One paragraph description of what happened]

### Timeline
| Time (UTC) | Event |
|-----------|-------|
| HH:MM | [Event description] |

### Root Cause
[Description of the underlying cause]

### Impact
- Users affected: X
- Revenue impact: $X
- SLO budget consumed: X%

### What Went Well
- [Item]

### What Went Wrong
- [Item]

### Action Items
| Action | Owner | Deadline | Status |
|--------|-------|----------|--------|
| [Action] | [Name] | YYYY-MM-DD | [ ] |

### Book of Heresies Entry
- **Smell**: [Observable symptom]
- **Consequences**: [What happened]
- **How to Fix**: [Steps taken]
- **How to Prevent**: [Systemic changes]
```