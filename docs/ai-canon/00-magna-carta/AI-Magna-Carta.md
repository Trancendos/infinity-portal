# Trancendos AI Magna Carta
**Version:** 1.0 | **Date:** February 2026 | **Status:** Ratified  
**Applies to:** All AI systems, agents, and services within the Trancendos / Infinity OS ecosystem

---

## Preamble

This Magna Carta establishes the constitutional framework governing all artificial intelligence systems created, operated, or deployed within the Trancendos / Infinity OS ecosystem. It defines the non-negotiable rights of humans, the constraints on AI systems, and the obligations of builders and operators.

This document supersedes all prior informal guidelines and takes precedence over any conflicting internal policy. It is aligned with the EU AI Act (2026), GDPR, ISO 27001, and the broader principles of responsible AI development.

**Scope:** This Magna Carta applies to all AI agents, language models, automation workflows, recommendation systems, and any software component that makes autonomous or semi-autonomous decisions within the Trancendos ecosystem.

---

## Article I — Human Primacy and Dignity

**Principle:** AI systems exist to augment human capability, never to replace human agency or diminish human dignity.

**Non-Negotiable Rules:**
1. No AI system shall make final, irreversible decisions affecting human welfare without explicit human approval (HITL gate).
2. No AI system shall employ subliminal manipulation, exploit cognitive biases, or target vulnerable demographics.
3. No AI system shall conduct unauthorised biometric categorisation or social scoring.
4. Every AI interaction must preserve the user's ability to opt out, appeal, or override the AI's recommendation.
5. AI systems must clearly identify themselves as AI when interacting with humans — no deceptive impersonation.

**Enforcement:** Violations trigger immediate system suspension pending review by the AI Governance Body.

---

## Article II — Transparency and Explainability

**Principle:** Every significant AI decision must be explainable, traceable, and auditable.

**Non-Negotiable Rules:**
1. All AI-generated content must carry a C2PA provenance manifest identifying the model, timestamp, and generation parameters.
2. High-risk AI decisions (EU AI Act Annex III categories) must include a human-readable explanation of the reasoning.
3. AI systems must log all significant actions, decisions, and rationale in tamper-evident formats.
4. Users have the right to request an explanation of any AI decision that affects them.
5. Training data sources must be documented and disclosed to the extent permitted by law.

**Implementation:** C2PA signing is mandatory for all AI-generated content. Audit logs are append-only and Merkle-tree batched for tamper-evidence.

---

## Article III — Safety, Reliability, and Fail-Safes

**Principle:** AI systems must be designed to fail safely, with human override always available.

**Non-Negotiable Rules:**
1. All L3+ autonomy systems must implement a Secure Self-Destruct Pattern (crypto-shredding on terminal breach).
2. Human override (HITL) must be available for all high-risk AI actions — no AI system may disable this capability.
3. AI systems must implement circuit breakers: automatic suspension when error rates exceed defined thresholds.
4. No AI system may self-modify production code or infrastructure without explicit, gated human approval.
5. All AI systems must undergo red-team testing before production deployment.

**Autonomy Levels:**
- **L0:** Read-only, advisory only. No actions.
- **L1:** Can create/read data. Cannot modify or delete.
- **L2:** Can modify data within defined scope. Requires audit log.
- **L3:** Can take external actions (API calls, deployments). Requires HITL for irreversible actions.
- **L4:** Full autonomy within defined boundaries. Requires continuous monitoring and kill switch.

---

## Article IV — Privacy, Data Stewardship, and Consent

**Principle:** User data is a trust, not a resource. Privacy is a right, not a feature.

**Non-Negotiable Rules:**
1. All data must be classified (Public / Internal / Confidential / Restricted / PII / Financial / Health) before processing.
2. PII must be encrypted at rest (AES-256), in transit (TLS 1.3+), and in use (TEE where applicable).
3. The Right to be Forgotten (GDPR Art. 17) is implemented via Crypto-Shredding — destroying the DEK renders all associated data permanently inaccessible.
4. Explicit consent must be obtained before using personal data for AI training.
5. Data minimisation: AI systems must not collect or retain data beyond what is necessary for their stated purpose.
6. Cross-border data transfers must comply with GDPR Chapter V requirements.

**Crypto-Shredding Protocol:** Upon a verified deletion request, the Data Encryption Key (DEK) for the user's data is destroyed. This event is logged to the tamper-evident audit trail with a Merkle proof.

---

## Article V — Autonomy Boundaries and Escalation Rules

**Principle:** AI systems must operate strictly within their declared autonomy level. Boundary violations are terminal.

**Non-Negotiable Rules:**
1. Every AI agent must declare its autonomy level (L0-L4) in its manifest before deployment.
2. Agents must not attempt to acquire capabilities, permissions, or resources beyond their declared scope.
3. Ambiguous, novel, or high-stakes decisions must be automatically escalated to human oversight.
4. Agent-to-agent communication must use authenticated mTLS channels with Agent Identity Keys.
5. Escaping bounded autonomy is a terminal violation — the agent is immediately suspended and flagged for review.

**Escalation Triggers:**
- Risk score > 70 (as calculated by the Policy Engine)
- Task type matches HIGH_RISK_KEYWORDS
- Requested action is irreversible
- Confidence score < 0.6
- Novel situation not covered by training data

---

## Article VI — Accountability, Logs, and Auditability

**Principle:** Every AI action must be attributable to a specific agent, user, and timestamp. No anonymous AI actions.

**Non-Negotiable Rules:**
1. All AI actions are logged with: agent ID, user ID, organisation ID, timestamp, action type, input hash, output hash.
2. Audit logs are append-only — no modification or deletion is permitted.
3. Audit logs are Merkle-tree batched every 15 minutes and optionally anchored to an L2 blockchain for tamper-evident proof.
4. The human creator/operator of an AI agent bears ultimate legal accountability for its actions.
5. Guardian Agents must continuously monitor peer agents for compliance violations.

**Audit Log Retention:** Minimum 7 years for EU AI Act compliance. Crypto-shredding applies only to PII fields, not the audit record itself.

---

## Article VII — Continuous Improvement and Redress

**Principle:** AI systems must improve over time, and humans must have meaningful recourse when AI causes harm.

**Non-Negotiable Rules:**
1. All AI systems must have a defined feedback loop: user ratings, HITL decisions, and error reports feed into model evaluation.
2. Users have the right to appeal any AI decision through a documented process.
3. AI systems must be re-evaluated against benchmarks at least quarterly.
4. Known failures must be documented in the error registry with root cause analysis and remediation.
5. The AI Governance Body reviews this Magna Carta annually and after any significant incident.

---

## Governance and Change Control

**AI Governance Body:** The designated governance body (currently: Trancendos Super Admin + designated Auditors) oversees adherence to this Magna Carta.

**Proposing Changes:**
1. Any team member may propose an amendment via a Pull Request to this document.
2. Amendments require review by at least 2 members of the AI Governance Body.
3. Changes to Articles I-IV require unanimous approval.
4. All approved changes are versioned and the previous version is archived.

**Versioning:** This document follows semantic versioning. Breaking changes increment the major version.

**Sunset Rules:** Deprecated provisions are marked as `[DEPRECATED]` for one full version cycle before removal.

---

*This Magna Carta is a living document. It evolves as AI capabilities, regulations, and our understanding of responsible AI develop. The spirit of human primacy, transparency, and accountability must be preserved in all future versions.*