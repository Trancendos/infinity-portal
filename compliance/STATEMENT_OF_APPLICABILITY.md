# Infinity OS — Statement of Applicability (SoA)
**ISO 27001:2022 Annex A Controls**

**Document Reference:** ISMS-SOA-001 | **Version:** 1.0 | **Owner:** Trancendos

| Control ID | Control Name | Applicable | Implemented | Justification / Evidence |
|-----------|-------------|-----------|-------------|--------------------------|
| A.5.1 | Information security policies | ✅ | ✅ | compliance/SECURITY_POLICY.md |
| A.5.2 | Information security roles | ✅ | ✅ | 4-tier RBAC in packages/types |
| A.5.7 | Threat intelligence | ✅ | Partial | Trivy + OWASP automated scans |
| A.5.23 | Information security for cloud services | ✅ | ✅ | Cloudflare + Supabase DPAs |
| A.5.30 | ICT readiness for business continuity | ✅ | Partial | Cloudflare edge redundancy |
| A.6.1 | Screening | ✅ | Manual | Developer background checks |
| A.6.3 | Information security awareness | ✅ | Planned | Training materials in docs/ |
| A.6.8 | Information security event reporting | ✅ | ✅ | GitHub Issues + Prometheus alerts |
| A.7.1 | Physical security perimeters | N/A | N/A | Cloud-native — delegated to Cloudflare/Supabase |
| A.8.1 | User endpoint devices | ✅ | Partial | WebAuthn hardware binding |
| A.8.2 | Privileged access rights | ✅ | ✅ | Super Admin role + Vault policies |
| A.8.3 | Information access restriction | ✅ | ✅ | Supabase RLS on all tables |
| A.8.4 | Access to source code | ✅ | ✅ | GitHub branch protection + CODEOWNERS |
| A.8.5 | Secure authentication | ✅ | ✅ | OAuth2 PKCE + WebAuthn + TOTP |
| A.8.6 | Capacity management | ✅ | Partial | Cloudflare auto-scaling |
| A.8.7 | Protection against malware | ✅ | ✅ | Trivy + OWASP + CSP headers |
| A.8.8 | Management of technical vulnerabilities | ✅ | ✅ | Automated scanning in CI/CD |
| A.8.9 | Configuration management | ✅ | ✅ | Infrastructure as Code (docker-compose + wrangler) |
| A.8.10 | Information deletion | ✅ | ✅ | Crypto-shredding via Vault + soft deletes |
| A.8.11 | Data masking | ✅ | Partial | PII fields encrypted via pgcrypto |
| A.8.12 | Data leakage prevention | ✅ | ✅ | RLS + field encryption + CSP |
| A.8.15 | Logging | ✅ | ✅ | Loki + Promtail + audit_logs table |
| A.8.16 | Monitoring activities | ✅ | ✅ | Prometheus + Grafana + Langfuse |
| A.8.17 | Clock synchronisation | ✅ | ✅ | NTP via Docker host |
| A.8.20 | Networks security | ✅ | ✅ | Cloudflare WAF + isolated Docker networks |
| A.8.21 | Security of network services | ✅ | ✅ | TLS 1.3 + Cloudflare Tunnel |
| A.8.22 | Segregation of networks | ✅ | ✅ | Separate Docker networks per service tier |
| A.8.23 | Web filtering | ✅ | ✅ | Cloudflare Gateway (free tier) |
| A.8.24 | Use of cryptography | ✅ | ✅ | AES-256 + HMAC-SHA256 + Vault Transit |
| A.8.25 | Secure development lifecycle | ✅ | ✅ | CI/CD gates + WASM policy engine |
| A.8.26 | Application security requirements | ✅ | ✅ | Zod validation + OWASP scanning |
| A.8.28 | Secure coding | ✅ | ✅ | TypeScript strict + Rust WASM |
| A.8.29 | Security testing in development | ✅ | ✅ | Vitest + Playwright + ZAP |
| A.8.30 | Outsourced development | N/A | N/A | All development in-house |
| A.8.32 | Change management | ✅ | ✅ | GitHub PRs + conventional commits |
| A.8.33 | Test information | ✅ | ✅ | Separate test/staging environments |
| A.8.34 | Protection of information systems during audit | ✅ | Partial | Read-only audit access via Grafana |
| A.9.1 | Physical and environmental security | N/A | N/A | Cloud-native — delegated to providers |
| A.10.1 | Cryptographic controls policy | ✅ | ✅ | infrastructure/vault/ + SECURITY_POLICY.md |
| A.10.2 | Key management | ✅ | ✅ | HashiCorp Vault Transit Engine |
| A.12.3 | Backup | ✅ | ✅ | Daily backups + 30-day retention |
| A.13.1 | Incident management planning | ✅ | ✅ | SECURITY_POLICY.md §8 + runbooks |
| A.14.1 | Information security in supplier relationships | ✅ | ✅ | DPAs with Cloudflare + Supabase + Resend |
| A.17.1 | Availability of information processing | ✅ | ✅ | Cloudflare 99.99% SLA + edge redundancy |
| A.18.1 | Compliance with legal requirements | ✅ | ✅ | GDPR + CCPA + WCAG 2.2 AA |