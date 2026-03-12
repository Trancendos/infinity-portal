# Security Policy — Infinity OS Platform

## 🔐 Supported Versions

| Version | Supported |
|---------|-----------|
| main (latest) | ✅ Active security patches |
| All prior releases | ❌ No longer supported |

## 📣 Reporting a Vulnerability

**Please do NOT open a public GitHub issue for security vulnerabilities.**

### Responsible Disclosure Process

1. **GitHub:** Use [GitHub Private Security Advisories](https://github.com/Trancendos/infinity-portal/security/advisories/new)
2. **Response SLA:** Acknowledge within **48 hours**, remediation timeline within **7 days**

### What to Include

- Description of the vulnerability and potential impact
- Steps to reproduce or proof-of-concept
- Affected component(s) and version(s)
- Any suggested mitigations

### Disclosure Timeline

| Severity | Acknowledgement | Fix Target | Public Disclosure |
|----------|----------------|------------|-------------------|
| Critical | 24 hours | 7 days | After fix deployed |
| High | 48 hours | 14 days | After fix deployed |
| Medium | 5 days | 30 days | After fix deployed |
| Low | 14 days | 90 days | After fix deployed |

## 🛡️ Security Architecture

### Authentication & Authorization
- **Auth API:** Cloudflare Workers + D1 (SQLite at edge)
- **Password Hashing:** PBKDF2-SHA256 (100,000 iterations) via Web Crypto API
- **JWT:** HS256 with 1-hour access tokens, 30-day refresh token rotation
- **RBAC:** Role hierarchy: superadmin → admin → manager → member → viewer

### Infrastructure Security
- **Platform:** 100% Cloudflare (Workers, D1, R2, KV, Durable Objects)
- **Zero-trust networking:** No backend servers, edge-only execution
- **Encryption:** TLS 1.3 everywhere, no plaintext data transmission
- **Secrets:** All secrets stored in Cloudflare Workers Secrets (encrypted at rest)

### Dependency Security
- **Scanner:** CVE SLA Enforcement Engine v2.0 (runs every 6h)
- **Deduplication:** Issues created once per CVE per package (Phase 28+)
- **SLA:** Critical: 7d | High: 14d | Medium: 30d | Low: 90d
- **Issue creation:** Only HIGH and CRITICAL vulnerabilities create GitHub issues (max 5/run)

### Supply Chain Security
- **Package pinning:** All dependencies use exact version pinning
- **python-jose REPLACED:** Migrated to PyJWT 2.11.0 (5 CVEs resolved)
- **Dependabot:** Weekly automated dependency updates with auto-merge for patches
- **SBOM:** Software Bill of Materials generated on every release

## 📋 CVE Remediation Status

See [SECURITY_STATUS.md](./SECURITY_STATUS.md) for current CVE remediation status.

## 🏛️ Compliance

- **ISO 27001** — Information Security Management (A.12.6.1, A.16.1.4)
- **EU AI Act** — Transparency and content provenance (C2PA)
- **GDPR** — Data protection and privacy
- **OWASP Top 10** — Application security best practices

## 🚫 Out of Scope

- Issues in third-party services (Cloudflare infrastructure itself)
- Social engineering attacks
- Physical attacks
- Denial of service attacks targeting availability