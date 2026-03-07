# Hymn Sheet 5: Secure Delivery & CVE Review
## Source: Canon 02 — Operational Hymn Sheets

### Purpose
Ensure all changes to AI services undergo automated security, CVE, and
dependency scanning before deployment.

### Pre-Work
- [ ] CI pipeline logs (SAST, DAST, SCA, container scans)
- [ ] Open vulnerability and patch backlog
- [ ] Risk acceptance or mitigation notes for any unresolved findings

### Security Checks

#### 1. Code and Config Scans (SAST + IaC)
- [ ] SAST scan completed with no untriaged high/critical findings
- [ ] IaC scanning (Terraform, Docker, Kubernetes) completed
- [ ] No hardcoded secrets detected (use Properties Service / Vault)
- [ ] Signed commits verified

#### 2. Dependency Scans (SCA)
- [ ] All high/critical CVEs patched
- [ ] OR explicitly risk-accepted with:
  - [ ] Documented mitigation
  - [ ] Expiry date for risk acceptance
  - [ ] Owner assigned
- [ ] License compliance verified (no GPL in proprietary components)

#### 3. Container/Image Scans
- [ ] Base images up to date (within 30 days of latest)
- [ ] No known critical vulnerabilities in container layers
- [ ] Minimal attack surface (distroless/slim images preferred)
- [ ] Non-root user configured

#### 4. Regression Evals
- [ ] Key safety benchmarks re-run after security updates
- [ ] Capability benchmarks show no regression
- [ ] Performance benchmarks within acceptable range

#### 5. Audit Logging
- [ ] All changes linked to signed commits
- [ ] Change requests documented
- [ ] Deployment audit trail complete

### Decision Matrix

| Outcome | Criteria | Action |
|---------|----------|--------|
| **Deploy** | All checks pass, no open critical/high findings | Proceed to production |
| **Conditional Deploy** | Risk-accepted findings with documented mitigations and expiry | Deploy with monitoring; track risk items |
| **Block** | Untriaged critical findings OR regression in safety benchmarks | Fix before re-attempting deployment |

### CVE Response SLAs

| Severity | Patch SLA | Escalation |
|----------|----------|------------|
| Critical (CVSS 9.0+) | 24 hours | Immediate — Incident Commander notified |
| High (CVSS 7.0-8.9) | 7 days | Weekly security review |
| Medium (CVSS 4.0-6.9) | 30 days | Monthly patch cycle |
| Low (CVSS 0.1-3.9) | 90 days | Quarterly review |

### Integration with TIGA Gate 6 (Security Hardening)
This Hymn Sheet implements the checks required by TIGA Gate 6.
The CI/CD pipeline (`tiga-gate-validation.yml`) automatically runs
these checks. Manual review is required for:
- Risk acceptance decisions
- Conditional deploy approvals
- Any override of automated blocking

### Crypto & Security Alignment (Canon 06b)
- [ ] TLS 1.3 verified for all endpoints
- [ ] mTLS configured for inter-service communication
- [ ] API key rotation within policy (30-day max)
- [ ] DEK rotation within policy (90-day max)
- [ ] No secrets in environment variables (use KMS/Vault)