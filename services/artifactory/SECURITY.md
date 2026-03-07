# Security Policy — The Artifactory

## Part of the Trancendos Ecosystem

### Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | ✅ Active support  |
| < 1.0   | ❌ Not supported   |

### Reporting a Vulnerability

The Trancendos team takes security vulnerabilities seriously. We appreciate your efforts to responsibly disclose your findings.

**DO NOT** report security vulnerabilities through public GitHub issues.

Instead, please report them via one of the following channels:

1. **Email:** security@trancendos.com
2. **GitHub Security Advisories:** Use the "Report a vulnerability" button on the Security tab of this repository.

Please include the following information in your report:

- Type of vulnerability (e.g., XSS, SQL injection, buffer overflow)
- Full paths of source file(s) related to the vulnerability
- Location of the affected source code (tag/branch/commit or direct URL)
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code (if possible)
- Impact assessment of the vulnerability

### Response Timeline

- **Acknowledgment:** Within 48 hours of receipt
- **Initial Assessment:** Within 5 business days
- **Resolution Target:** Within 30 days for critical vulnerabilities
- **Disclosure:** Coordinated disclosure after patch is available

### Security Measures

The Artifactory implements the following security measures:

#### Authentication & Authorization
- Keycloak OIDC/OAuth 2.0 integration
- JWT token verification with JWKS rotation
- Role-Based Access Control (RBAC) with tenant isolation
- API key support for CI/CD pipelines

#### Supply Chain Security
- Dependency confusion protection for @trancendos scope
- Dual-scanner agreement (Trivy + Grype) for vulnerability detection
- Automated quarantine for critical vulnerabilities
- SBOM generation (CycloneDX, SPDX) for all artifacts
- Sigstore keyless signing and verification
- SLSA Level 3 provenance tracking
- License compliance enforcement

#### Infrastructure Security
- Non-root container execution
- Read-only root filesystem
- Security context constraints (no privilege escalation)
- Network policies for pod-to-pod communication
- Secrets management via sealed-secrets/external-secrets
- TLS encryption for all inter-service communication

#### Operational Security
- Immutable audit log for all operations
- Anomaly detection for unusual access patterns
- Rate limiting per tenant and per IP
- Content-addressable storage with integrity verification
- Contamination audit pipeline (CI-enforced)

#### Compliance Frameworks
- OWASP Top 10 mitigation
- Zero-trust architecture
- GDPR data handling compliance
- SOC 2 Type II controls alignment
- ISO 27001 information security management

### Security Configuration

For security-related configuration, refer to:

- `src/security/` — Security module implementations
- `src/api/middleware.ts` — Authentication and authorization middleware
- `k8s/` — Kubernetes security contexts and network policies
- `.github/workflows/security-posture.yml` — Automated security scanning

### Dependency Policy

- All dependencies must have approved licenses (MIT, Apache-2.0, BSD, ISC)
- GPL and AGPL licensed dependencies are prohibited
- Dependencies are audited weekly via Dependabot
- Critical vulnerability patches are applied within 24 hours
- All @trancendos scoped packages resolve from internal registry only