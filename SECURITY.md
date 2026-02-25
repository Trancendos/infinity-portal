# Security Policy

## Supported Versions

| Version | Supported          |
|---------|--------------------|
| latest  | ✅ Active support   |
| < latest| ⚠️ Best effort      |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do NOT** open a public GitHub issue
2. Email: security@trancendos.com
3. Include: description, reproduction steps, impact assessment

**Response Timeline:**
- Acknowledgement: within 48 hours
- Initial assessment: within 5 business days
- Fix timeline: based on severity (Critical: 24h, High: 7d, Medium: 30d)

## Security Measures

This repository implements:
- Automated dependency scanning (Dependabot)
- Secret detection (Gitleaks)
- Vulnerability scanning (Trivy)
- SAST analysis (Bandit for Python, ESLint security rules for TypeScript)
- Branch protection with required reviews
- GDPR/ISO 27001 compliance controls

## Scope

This policy covers all code in this repository and its dependencies.
Third-party service vulnerabilities should be reported to their respective maintainers.
