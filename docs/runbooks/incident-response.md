# Runbook: Incident Response Playbook

**Category:** Security & Operations  
**ISO 27001:** A.16.1 — Management of information security incidents  
**Last Updated:** 2025-01-09

---

## Incident Severity Levels

| Level | Description | Response Time | Examples |
|-------|-------------|---------------|----------|
| **P1 — Critical** | Service down, data breach, security compromise | < 15 minutes | Vault sealed, DB unreachable, auth bypass |
| **P2 — High** | Major feature degraded, performance severely impacted | < 1 hour | API response > 5s, error rate > 5%, agent failures |
| **P3 — Medium** | Minor feature impacted, workaround available | < 4 hours | Single worker failing, non-critical service degraded |
| **P4 — Low** | Cosmetic issue, minor inconvenience | < 24 hours | UI glitch, log noise, non-critical alert |

---

## Incident Response Process

### Phase 1: Detect (0-5 minutes)

**Automated Detection:**
- Prometheus alerts fire → Grafana notification
- Cloudflare health checks fail → email/webhook
- CI/CD pipeline failure → GitHub notification

**Manual Detection:**
- User reports issue
- Team member notices anomaly

**First Responder Actions:**
```bash
# 1. Check system health
curl -s https://<DOMAIN>/health | jq .

# 2. Check Grafana dashboards
open https://grafana.<DOMAIN>/d/infinity-os-overview

# 3. Check recent deployments
gh run list --repo Trancendos/infinity-portal --limit 5

# 4. Check error logs
docker-compose -f infrastructure/docker/docker-compose.prod.yml logs --tail=100 backend
```

### Phase 2: Triage (5-15 minutes)

**Determine severity using this checklist:**

- [ ] Is the service completely down? → **P1**
- [ ] Is there a security breach or data exposure? → **P1**
- [ ] Is a core feature (auth, AI, files) degraded? → **P2**
- [ ] Is performance severely impacted (>5s response)? → **P2**
- [ ] Is a non-core feature impacted? → **P3**
- [ ] Is there a workaround? → Downgrade by 1 level

**Assign incident commander:**
- P1/P2: Senior engineer or team lead
- P3/P4: On-call engineer

### Phase 3: Mitigate (15-60 minutes)

**Common Mitigation Actions:**

#### Service Down
```bash
# Restart service
docker-compose -f infrastructure/docker/docker-compose.prod.yml restart backend

# Scale up if overloaded
docker-compose -f infrastructure/docker/docker-compose.prod.yml up -d --scale backend=3

# Check resource usage
docker stats
```

#### Database Issues
```bash
# Check connections
psql "$DATABASE_URL" -c "SELECT count(*) FROM pg_stat_activity;"

# Kill long-running queries
psql "$DATABASE_URL" -c "
  SELECT pg_terminate_backend(pid)
  FROM pg_stat_activity
  WHERE state = 'active'
  AND query_start < now() - interval '5 minutes'
  AND pid <> pg_backend_pid();
"
```

#### Deployment Rollback
```bash
# Rollback to previous Docker image
docker-compose -f infrastructure/docker/docker-compose.prod.yml \
  up -d --no-deps backend

# Rollback Cloudflare Worker
cd workers/identity
npx wrangler rollback

# Rollback via Git
git revert HEAD
git push origin main
```

#### Security Incident
```bash
# 1. Rotate compromised secrets immediately
vault write -force auth/token/revoke-self

# 2. Rotate JWT secret
vault kv put secret/infinity-os/config jwt_secret=$(openssl rand -base64 48)

# 3. Check audit logs
vault audit list
docker-compose logs backend | grep -i "auth\|security\|unauthorized"

# 4. Block suspicious IPs (Cloudflare)
curl -X POST "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/firewall/rules" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '[{"filter":{"expression":"ip.src eq <SUSPICIOUS_IP>"},"action":"block"}]'
```

### Phase 4: Resolve (1-24 hours)

1. **Identify root cause** — review logs, metrics, recent changes
2. **Implement fix** — code change, config update, infrastructure adjustment
3. **Test fix** — verify in staging or with canary deployment
4. **Deploy fix** — follow standard deployment process
5. **Verify resolution** — confirm all metrics return to normal

### Phase 5: Post-Mortem (Within 48 hours)

**Create post-mortem document:**

```markdown
## Incident Post-Mortem: [TITLE]

**Date:** YYYY-MM-DD
**Duration:** X hours Y minutes
**Severity:** P1/P2/P3/P4
**Incident Commander:** [Name]

### Timeline
- HH:MM — Alert fired / Issue reported
- HH:MM — Triage began
- HH:MM — Root cause identified
- HH:MM — Mitigation applied
- HH:MM — Service restored
- HH:MM — Fix deployed

### Root Cause
[Description of what caused the incident]

### Impact
- Users affected: X
- Duration: X minutes
- Data loss: None / [Description]

### What Went Well
- [Item]

### What Went Wrong
- [Item]

### Action Items
- [ ] [Action] — Owner: [Name] — Due: [Date]

### Lessons Learned
- [Lesson]
```

---

## Communication Templates

### P1 — Initial Notification
```
🔴 P1 INCIDENT: [Brief description]
Status: Investigating
Impact: [Service] is [down/degraded]
ETA: Assessing — update in 15 minutes
Commander: [Name]
```

### P1 — Update
```
🔴 P1 UPDATE: [Brief description]
Status: [Investigating/Mitigating/Resolved]
Root cause: [Known/Unknown]
ETA: [Time estimate]
Next update: [Time]
```

### P1 — Resolution
```
✅ P1 RESOLVED: [Brief description]
Duration: [X hours Y minutes]
Root cause: [Brief description]
Fix: [Brief description]
Post-mortem: [Link] (within 48 hours)
```

---

## Escalation Path

```
On-Call Engineer (P3/P4)
    │
    ├── Cannot resolve in 30 min → Senior Engineer (P2)
    │                                    │
    │                                    ├── Cannot resolve in 1 hour → Team Lead (P1)
    │                                    │                                   │
    │                                    │                                   └── Data breach → CISO / Legal
    │                                    │
    │                                    └── Infrastructure issue → DevOps Lead
    │
    └── Security incident → Security Engineer → CISO
```

---

## Key Contacts

| Role | Responsibility | Escalation Trigger |
|------|---------------|-------------------|
| **On-Call Engineer** | First response, triage | All alerts |
| **Senior Engineer** | Complex debugging, architecture decisions | P2+ unresolved > 30 min |
| **Team Lead** | Incident command, stakeholder communication | P1 incidents |
| **DevOps Lead** | Infrastructure, deployment issues | Infra-related P1/P2 |
| **Security Engineer** | Security incidents, forensics | Any security alert |