# Hymn Sheet 1: Design Review
## Source: Canon 02 — Operational Hymn Sheets

### Purpose
Ensure proposed AI systems comply with the Magna Carta and Development Bible.
Validate architecture, risks, and value before implementation begins.

### Participants
- Owner / Product Lead
- Architect
- Risk / Compliance
- SRE
- Product
- Observer AIs (read-only)

### Pre-Work (Must Be Attached)
- [ ] One-pager with problem statement and value proposition
- [ ] Architecture diagrams (C4 model preferred)
- [ ] ADRs (Architecture Decision Records)
- [ ] Risk register link
- [ ] Automated reports: security scan results, performance baseline, data lineage
- [ ] TIGA manifest (`tiga-manifest.json`) with declared Logic Level

### Agenda (60 minutes)
| Time | Topic | Lead |
|------|-------|------|
| 0-5 min | Context recap | Owner |
| 5-15 min | Problem and value proposition | Product |
| 15-30 min | Architecture walkthrough | Architect |
| 30-45 min | Risk and alignment checks (Magna Carta articles) | Risk/Compliance |
| 45-55 min | Open questions and decisions | All |
| 55-60 min | Actions, owners, deadlines | Owner |

### Magna Carta Alignment Checklist
- [ ] **Article I (Human Primacy)**: Human override available?
- [ ] **Article II (Transparency)**: Decision logging configured?
- [ ] **Article III (Safety)**: Self-healing mechanisms designed?
- [ ] **Article IV (Privacy)**: Data minimisation applied?
- [ ] **Article V (Autonomy)**: Autonomy level declared and bounded?
- [ ] **Article VI (Economic)**: Cost model defined?
- [ ] **Article VII (Crypto)**: TLS/mTLS configured?
- [ ] **Article VIII (Learning)**: Maturity level declared?
- [ ] **Article IX (Governance)**: Documentation complete?

### Decision Log
- **Outcome**: `[ ] Approved` / `[ ] Blocked` / `[ ] Changes Required`
- **Key decisions and rationales**: _(record here)_
- **Follow-up**: Update ADRs and Bible references; schedule next review if needed