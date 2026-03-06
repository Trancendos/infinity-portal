# INFINITY PORTAL BLUEPRINT
## Comprehensive Architecture, Research & Implementation Plan
### Infinity Admin OS Portal · Infinity Portal Login · Infinity-One Integration · Low-Code/No-Code Platform

**Document Version:** 1.0  
**Prepared by:** SuperNinja AI  
**Repository:** Trancendos/infinity-portal  
**Classification:** Strategic Architecture Blueprint — Pre-Implementation Research  
**Date:** 2025-03-07  
**Status:** DRAFT — Awaiting Continuity Guardian Approval  

---

## TABLE OF CONTENTS

1. [Executive Summary](#1-executive-summary)
2. [Document Analysis & Insights Synthesis](#2-document-analysis--insights-synthesis)
3. [Current State Assessment](#3-current-state-assessment)
4. [Architecture Overview — The Infinity Ecosystem](#4-architecture-overview--the-infinity-ecosystem)
5. [Infinity Portal — Login & Role-Based Routing](#5-infinity-portal--login--role-based-routing)
6. [Infinity Admin OS Portal — Monitoring & Management Platform](#6-infinity-admin-os-portal--monitoring--management-platform)
7. [Infinity-One — Universal Identity & Cross-App Presence](#7-infinity-one--universal-identity--cross-app-presence)
8. [Role Switching & Multi-Role Navigation](#8-role-switching--multi-role-navigation)
9. [Low-Code / No-Code Editing Capabilities](#9-low-code--no-code-editing-capabilities)
10. [TIGA Governance Integration](#10-tiga-governance-integration)
11. [Service Map — All 22 Agents + Ports](#11-service-map--all-22-agents--ports)
12. [Implementation Phases with Backups & Remediation](#12-implementation-phases-with-backups--remediation)
13. [Future Horizon Log](#13-future-horizon-log)
14. [Risk Register](#14-risk-register)
15. [Sign-Off](#15-sign-off)

---

## 1. EXECUTIVE SUMMARY

This blueprint defines the complete architecture for three interconnected systems that form the front door and nervous system of the Trancendos ecosystem:

**Infinity Portal** is the unified authentication gateway. Every user — whether admin, power user, auditor, or standard user — enters the ecosystem through a single login page. After authentication, users with multiple roles are presented with a role-selection screen that routes them to the appropriate destination: Infinity Admin OS Portal for administrators, Arcadia for standard users, or any other role-specific application.

**Infinity Admin OS Portal** is the command centre for platform operators. It provides real-time monitoring of all 22 agent services, user management, compliance dashboards, AI assignment configuration, service health visualisation, and critically — low-code/no-code editing capabilities that allow the Continuity Guardian to modify platform configurations, AI assignments, segment definitions, and section layouts without writing code.

**Infinity-One** is the universal identity layer that spans every application in the ecosystem. It provides a persistent connection indicator visible across all apps, manages user profiles and settings, handles role switching, and serves as the single source of truth for identity, access, and preferences. When a user navigates to Infinity from any application, they can manage their Infinity-One profile, security settings, and ecosystem-wide configurations.

All three systems are designed with the following non-negotiable constraints derived from the Trancendos governance framework and the uploaded documents:

- **Zero-cost mandate** — All infrastructure uses free tiers exclusively (Neon, Cloudflare, Koyeb, GitHub Actions)
- **TIGA compliance** — Foundation Framework → TEF → App-specific daisy chain traceability
- **Security-by-default** — OWASP standards, zero-trust, 5-tier RBAC, MFA support
- **2060 future-proofing** — Quantum-safe crypto readiness, BCI-ready type definitions, modular architecture
- **Cognitive ease** — Stress-inducing features are critical failures; every interaction must feel natural
- **Legal/ethical compliance** — EU AI Act, GDPR, ISO 27001/42001, NIST CSF, SOC 2, DORA, CRA

---

## 2. DOCUMENT ANALYSIS & INSIGHTS SYNTHESIS

### 2.1 TIGA Governance Framework (Grok Reading Mode PDF + MHT)

The Trancendos Intelligent Governance Architecture (TIGA) defines a 20+ phase compliance framework that must be woven into every platform component. Key elements to incorporate:

**Foundation Framework (FF) Controls:**
The FF establishes 40+ controls (FF-CTRL-001 through FF-CTRL-040+) that cascade through the Trancendos Ecosystem Framework (TEF) into application-specific implementations. This "daisy chain" traceability model means every control in the Infinity Admin OS Portal must trace back to a FF control, through a TEF mapping, to the specific implementation.

**Logic Levels (LL1–LL5):**
Controls mature through five logic levels:
- LL1: Policy documented
- LL2: Process defined and assigned
- LL3: Automated monitoring in place
- LL4: Continuous improvement with metrics
- LL5: Predictive/self-healing with AI augmentation

The Infinity Admin OS Portal must display the current Logic Level for each control and provide a pathway for advancement. The low-code editor must allow the Continuity Guardian to update control statuses and evidence without developer intervention.

**Canon-to-Codex Compliance System:**
The TIGA framework introduces a Canon (immutable governance principles) that generates a Codex (actionable compliance rules). The Admin Portal must provide a Canon viewer and Codex editor, allowing governance principles to be reviewed and compliance rules to be managed through a visual interface.

**Compliance Dimensions:**
The framework maps compliance across 20+ dimensions including EU AI Act (risk classification, transparency obligations, human oversight), UK AI Regulation (pro-innovation approach, sector-specific guidance), Singapore AI Framework (FEAT principles — Fairness, Ethics, Accountability, Transparency), ISO 42001 (AI management system), ISO 27001 (information security), NIST CSF AI Profile, OWASP SAMM, SOC 2 Type II, DORA (digital operational resilience), and CRA (Cyber Resilience Act with SBOM requirements).

**zkML/ZKP for AGI Safety:**
The framework includes conceptual provisions for zero-knowledge machine learning proofs and zero-knowledge proofs for AGI safety verification. While these are future-horizon items, the type system and API contracts should accommodate them.

**Key Insight for Implementation:** The Admin Portal needs a dedicated "Governance Centre" module that visualises the FF → TEF → App daisy chain, displays Logic Level progression, and provides CRUD operations for controls and evidence — all through a low-code interface.

### 2.2 Mobile-First Setup Guide (Grok Report PDF — Image-Based)

This document reveals the existing tooling strategy for the Trancendos ecosystem:

**GitHub Transfer Terminal Bot:**
A bot-based workflow using GitHub as the source of truth, with Google Drive as a document store, Apps Script (Security.gs, Features.gs, Code.gs) for automation, and AppSheet for mobile-first bot interaction. This pattern should be preserved and integrated into the Admin Portal as a "Bot Management" section.

**AppSheet + Retool RSX Dashboard:**
The document describes a "Trancendos Noir" themed dashboard built with Retool RSX, featuring the signature colour scheme (#00E5FF cyan on #0f172a dark background). This aesthetic must be carried forward into the Infinity Admin OS Portal design. The AppSheet integration demonstrates the low-code/no-code philosophy already in use — the Admin Portal must match or exceed this capability.

**Multi-AI Routing Pattern:**
The document specifies a routing hierarchy: Gemini (primary) → Groq (speed) → Claude (analysis) → DeepSeek (fallback). This routing configuration must be editable through the Admin Portal's low-code interface, allowing the Continuity Guardian to reassign AI providers to different tasks without code changes.

**CrewAI/LangChain Integration:**
Agent orchestration uses CrewAI and LangChain patterns via a proxy layer. The Admin Portal must provide visibility into agent crews, their task assignments, and execution status. The low-code editor must allow crew composition changes (which agents are in which crew, what tools they have access to).

**Key Insight for Implementation:** The existing AppSheet/Retool pattern validates the low-code approach. The Admin Portal should provide equivalent or superior configuration capabilities natively, reducing dependency on external low-code platforms while maintaining the same ease of use.

### 2.3 IBM Agentic AI ROI Guide

This document provides strategic guidance on maximising return from agentic AI investments:

**Barriers to AI ROI:**
- Unstructured data (80% of enterprise data) — The Admin Portal must provide data pipeline visibility
- Poor governance — TIGA framework addresses this directly
- Task-level vs workflow-level automation — The platform must support end-to-end workflow automation, not just individual task automation

**ROI Maximisation Strategies:**
- Productivity gains through agent-assisted workflows
- Process optimisation through continuous monitoring and feedback loops
- Governance-first approach — compliance is not a bolt-on but a foundation

**Agentic AI Maturity Model:**
The guide describes a maturity progression from basic chatbots → task agents → workflow agents → autonomous agents → self-improving agents. The Admin Portal's monitoring capabilities must track where each of the 22 agents sits on this maturity curve and provide controls for advancing them.

**Key Insight for Implementation:** The Admin Portal needs an "AI Operations Centre" that shows agent maturity levels, ROI metrics per agent, workflow completion rates, and governance compliance scores. This directly addresses the IBM guide's recommendation for governance-first agentic AI deployment.

### 2.4 Google Accelerators Impact Report 2025

This document provides ecosystem-level insights:

**Portfolio Patterns:**
- 1,700+ startups, $129.5B valuation, 94% survival rate
- Key verticals: productivity, fintech, sustainability, cybersecurity
- Trancendos spans all four verticals through its agent ecosystem

**Accelerator Success Factors:**
- Technical mentorship and architecture review
- Market validation through pilot programmes
- Community building and knowledge sharing
- Sustainable business model development

**Key Insight for Implementation:** The Arcadia marketplace (community + marketplace platform) should be positioned as the ecosystem's accelerator equivalent, with the Admin Portal providing oversight of marketplace health, community engagement metrics, and sustainability indicators.

### 2.5 Cross-Document Synthesis

Across all documents, five themes emerge consistently:

1. **Governance is foundational, not optional** — Every feature must trace to a governance control
2. **Low-code/no-code is the operational model** — The Continuity Guardian must be able to configure everything without developers
3. **Multi-AI orchestration is the execution model** — No single AI provider; routing and fallback are essential
4. **Zero-cost is non-negotiable** — Every architectural decision must validate against free-tier limits
5. **Monitoring and observability are first-class concerns** — You cannot manage what you cannot see

---

## 3. CURRENT STATE ASSESSMENT

### 3.1 Frontend Architecture (apps/shell/)

The current shell application implements a basic OS-style desktop environment:

```
apps/shell/src/
├── App.tsx                    # Routes: /login → /desktop (no role routing)
├── main.tsx                   # Entry point
├── components/
│   ├── ContextMenu.tsx        # Right-click context menu
│   ├── DesktopWidgets.tsx     # Desktop widget grid
│   ├── LoadingScreen.tsx      # Loading spinner
│   ├── NotificationCentre.tsx # Notification panel
│   ├── Taskbar.tsx            # Bottom taskbar
│   ├── UniversalSearch.tsx    # Spotlight-style search
│   └── WindowManager.tsx      # Floating window manager
├── hooks/
│   ├── useBatteryStatus.ts
│   ├── useDeviceDetection.ts
│   ├── useNetworkStatus.ts
│   └── useWindowSize.ts
├── modules/                   # 30+ application modules
│   ├── AdminPanel.tsx         # Basic user/org management
│   ├── AIStudio.tsx           # AI interaction studio
│   ├── ComplianceDashboard.tsx
│   ├── InfinityOneDashboard.tsx  # IAM dashboard
│   ├── ObservabilityDashboard.tsx
│   ├── Settings.tsx
│   ├── Terminal.tsx
│   ├── WorkflowBuilder.tsx
│   └── ... (20+ more modules)
├── providers/
│   ├── AuthProvider.tsx       # JWT auth with refresh, talks to FastAPI
│   ├── BackendProvider.tsx    # API client
│   ├── KernelProvider.tsx     # OS kernel abstraction
│   └── ThemeProvider.tsx      # Theme management
└── views/
    ├── Desktop.tsx            # Main desktop environment
    ├── LockScreen.tsx         # Lock screen
    ├── Login.tsx              # Email/password + MFA login
    ├── Register.tsx           # Registration
    └── finance/
        ├── ArcadianExchange.tsx
        └── RoyalBankDashboard.tsx
```

**Critical Gap:** The current `App.tsx` routes directly from `/login` to `/desktop` with no role-based routing. There is no role-selection page, no multi-role detection, and no destination routing based on user roles.

### 3.2 Backend RBAC System

The backend implements a 5-tier role hierarchy:

| Role | Level | Description |
|------|-------|-------------|
| `super_admin` | 5 | Unrestricted platform access |
| `org_admin` | 4 | Organisation-level administration |
| `auditor` | 3 | Read-only compliance and audit access |
| `power_user` | 2 | Advanced features and shared workspaces |
| `user` | 1 | Standard user access |

The `auth.py` module implements JWT authentication with JTI revocation, brute force protection, and fine-grained permission scopes. However, the RBAC router endpoints are all stubs (`"Implementation pending — Wave 1 migration"`).

### 3.3 Infinity-One Package

The `@trancendos/infinity-one` package contains an extraordinarily comprehensive type system (600+ lines) covering:
- Full user identity with W3C DID support
- Security profiles with quantum-safe key references
- IAM policies with AWS-style policy statements
- RBAC with 7 system roles (super_admin, org_admin, security_admin, power_user, standard_user, guest, bot)
- Application access with OAuth scopes
- Compliance profiles with GDPR consent records
- Organisation management with branding
- SCIM 2.0 provisioning types
- OIDC claims with custom Infinity-One extensions

**Critical Gap:** The types are defined but the `InfinityOneService` is only partially implemented. The frontend `InfinityOneDashboard` module exists but operates with mock data.

### 3.4 Portal App (apps/portal/)

A secondary app with four dashboard components:
- `HiveDashboard.tsx` — HIVE routing visualisation
- `InfinityOneDashboard.tsx` — Identity management
- `LighthouseDashboard.tsx` — Security monitoring
- `VoidDashboard.tsx` — Secrets management

These appear to be standalone dashboard views, separate from the shell's module system.

### 3.5 Backend Routers (55 Total)

The backend has comprehensive router coverage across all ecosystem domains:

**Core Platform:** admin, auth, rbac, users, organisations, security, compliance, compliance_frameworks
**AI Agents:** cornelius, norman, guardian, the_dr, multiAI, agent_manager, agent_memory
**Infrastructure:** hive, lighthouse, the_void, icebox, nexus, observatory
**Operations:** workflows, kanban, itsm, build, gates, observability, self_healing
**Content:** documents, files, library, kb, search, artifacts
**Commerce:** billing, treasury, arcadia, appstore
**Community:** townhall, federation, workshop
**Advanced:** codegen, chaos_party, adaptive_engine, vulnerability, sync, version_history

---

## 4. ARCHITECTURE OVERVIEW — THE INFINITY ECOSYSTEM

### 4.1 System Topology

```
┌─────────────────────────────────────────────────────────────────────┐
│                        INFINITY PORTAL                               │
│                    (Authentication Gateway)                           │
│                                                                       │
│  ┌──────────┐    ┌──────────────────┐    ┌────────────────────────┐  │
│  │  LOGIN   │───▶│  ROLE SELECTION  │───▶│  DESTINATION ROUTING   │  │
│  │  PAGE    │    │  (Multi-Role)    │    │                        │  │
│  └──────────┘    └──────────────────┘    │  ┌──────────────────┐  │  │
│                                           │  │ Admin → Admin OS │  │  │
│                                           │  │ User  → Arcadia  │  │  │
│                                           │  │ Auditor → Comply │  │  │
│                                           │  └──────────────────┘  │  │
│                                           └────────────────────────┘  │
└───────────────────────────┬─────────────────────────────────────────┘
                            │
                            │ Infinity-One Token (JWT + Role Context)
                            │
        ┌───────────────────┼───────────────────────┐
        │                   │                       │
        ▼                   ▼                       ▼
┌───────────────┐  ┌───────────────┐  ┌─────────────────────────┐
│ INFINITY      │  │   ARCADIA     │  │  OTHER DESTINATIONS     │
│ ADMIN OS      │  │  (User App)   │  │  (Auditor, Power User)  │
│ PORTAL        │  │               │  │                         │
│               │  │  Community    │  │  ComplianceDashboard    │
│  Monitoring   │  │  Marketplace  │  │  ObservabilityDashboard │
│  Management   │  │  Events       │  │  KnowledgeHub           │
│  Low-Code     │  │  Recovery     │  │  ...                    │
│  Governance   │  │               │  │                         │
└───────┬───────┘  └───────┬───────┘  └────────────┬────────────┘
        │                  │                        │
        └──────────────────┼────────────────────────┘
                           │
                    ┌──────┴──────┐
                    │ INFINITY-ONE │
                    │ (Universal   │
                    │  Identity    │
                    │  Layer)      │
                    │              │
                    │ • Connection │
                    │   Indicator  │
                    │ • Profile    │
                    │ • Settings   │
                    │ • Role Switch│
                    └─────────────┘
```

### 4.2 Authentication Flow

```
User arrives at infinity-portal.trancendos.com
        │
        ▼
┌─────────────────────────────────────────┐
│           LOGIN PAGE                     │
│                                          │
│  Email + Password                        │
│  WebAuthn Passkey (optional)             │
│  MFA Challenge (if enabled)              │
│                                          │
│  POST /api/v1/auth/login                 │
│  Response: { access_token, user: {       │
│    id, email, role, permissions,         │
│    available_roles: ["admin", "user"]    │  ◄── NEW FIELD
│  }}                                      │
└──────────────────┬──────────────────────┘
                   │
                   ▼
        ┌──────────────────┐
        │ Multiple Roles?  │
        └────┬────────┬────┘
             │        │
          YES│        │NO
             │        │
             ▼        ▼
┌────────────────┐  ┌──────────────────────┐
│ ROLE SELECTION │  │ DIRECT ROUTING       │
│ PAGE           │  │                      │
│                │  │ admin → /admin-os    │
│ "Choose your   │  │ user  → /arcadia    │
│  workspace"    │  │ auditor → /comply   │
│                │  │ power_user → /desktop│
│ ┌────────────┐ │  └──────────────────────┘
│ │ Admin OS   │ │
│ │ Portal  ▶  │ │
│ └────────────┘ │
│ ┌────────────┐ │
│ │ Arcadia    │ │
│ │ Hub     ▶  │ │
│ └────────────┘ │
│                │
│ [Remember my   │
│  choice]       │
└────────────────┘
```

### 4.3 Key Design Decisions

**Decision 1: Single Entry Point**
All users enter through the same login page regardless of their destination. This simplifies the authentication surface, reduces code duplication, and provides a single point for security controls (rate limiting, brute force protection, MFA enforcement).

**Decision 2: Backend-Driven Role Resolution**
The backend's `/api/v1/auth/login` response must include an `available_roles` array. This is a new field that lists all roles assigned to the user. The frontend uses this to determine whether to show the role-selection page. This keeps role logic server-side where it belongs.

**Decision 3: Role Context in JWT**
When a user selects a role (or is auto-routed for single-role users), the JWT is issued with an `active_role` claim. This allows the backend to enforce role-specific permissions without additional lookups. Role switching generates a new JWT with the updated `active_role`.

**Decision 4: Infinity-One as Cross-Cutting Concern**
The Infinity-One connection indicator and profile access are not part of any specific application — they are injected at the shell level, visible in every application's chrome. This is implemented as a persistent React component that lives outside the route tree.

**Decision 5: Low-Code Configuration Over Code Changes**
Every configurable aspect of the platform (AI assignments, segment definitions, section layouts, agent routing, compliance controls) is stored as structured data in the database, not as code. The Admin Portal provides CRUD interfaces for this data. Code changes are only required for new features, not for configuration changes.

---

## 5. INFINITY PORTAL — LOGIN & ROLE-BASED ROUTING

### 5.1 Login Page Enhancement

The existing `Login.tsx` is well-structured with Zod validation, MFA support, and WCAG compliance. The required changes are minimal:

**Current Flow:** Login → Navigate to `/desktop`
**New Flow:** Login → Check `available_roles` → Route accordingly

**Backend API Change Required:**
```python
# In auth.py — login endpoint response
# CURRENT:
{
    "access_token": "...",
    "refresh_token": "...",
    "user": {
        "id": "...",
        "email": "...",
        "role": "admin",        # Single role
        "permissions": [...]
    }
}

# PROPOSED:
{
    "access_token": "...",
    "refresh_token": "...",
    "user": {
        "id": "...",
        "email": "...",
        "primary_role": "super_admin",
        "active_role": "super_admin",
        "available_roles": ["super_admin", "user"],  # NEW
        "permissions": [...],
        "role_destinations": {                         # NEW
            "super_admin": "/admin-os",
            "org_admin": "/admin-os",
            "auditor": "/compliance",
            "power_user": "/desktop",
            "user": "/arcadia"
        }
    }
}
```

### 5.2 Role Selection Page (New View)

A new view `RoleSelector.tsx` is needed when `available_roles.length > 1`:

**Design Specifications:**
- Full-screen view with the Trancendos Noir theme (#0f172a background, #00E5FF accents)
- User's avatar and display name at the top
- Card-based layout showing each available role as a destination card
- Each card shows: Role icon, role name, destination name, brief description
- "Remember my choice" checkbox that stores preference in localStorage
- Smooth transition animations (respect `prefers-reduced-motion`)
- Keyboard navigable (Tab between cards, Enter to select)
- WCAG 2.2 AA compliant

**Role-to-Destination Mapping:**

| Role | Destination | Route | Description |
|------|-------------|-------|-------------|
| `super_admin` | Infinity Admin OS Portal | `/admin-os` | Full platform monitoring & management |
| `org_admin` | Infinity Admin OS Portal | `/admin-os` | Organisation-level administration |
| `auditor` | Compliance Centre | `/compliance` | Audit trails, compliance dashboards |
| `power_user` | Infinity Desktop | `/desktop` | Full desktop environment with all modules |
| `user` | Arcadia | `/arcadia` | Community, marketplace, recovery tools |

### 5.3 Route Architecture Changes

**Current App.tsx Routes:**
```tsx
<Routes>
  <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
  <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
  <Route path="/desktop" element={<ProtectedRoute><Desktop /></ProtectedRoute>} />
  <Route path="/lock" element={<ProtectedRoute><LockScreen /></ProtectedRoute>} />
  <Route path="/" element={<Navigate to="/desktop" replace />} />
  <Route path="*" element={<Navigate to="/desktop" replace />} />
</Routes>
```

**Proposed App.tsx Routes:**
```tsx
<Routes>
  {/* Public routes */}
  <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
  <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />

  {/* Role selection (authenticated but pre-destination) */}
  <Route path="/select-role" element={<ProtectedRoute><RoleSelector /></ProtectedRoute>} />

  {/* Destination routes (role-gated) */}
  <Route path="/admin-os/*" element={<RoleGate roles={['super_admin','org_admin']}><AdminOS /></RoleGate>} />
  <Route path="/arcadia/*" element={<RoleGate roles={['user','power_user']}><Arcadia /></RoleGate>} />
  <Route path="/compliance/*" element={<RoleGate roles={['auditor','super_admin']}><ComplianceCentre /></RoleGate>} />
  <Route path="/desktop" element={<ProtectedRoute><Desktop /></ProtectedRoute>} />
  <Route path="/lock" element={<ProtectedRoute><LockScreen /></ProtectedRoute>} />

  {/* Infinity-One profile (accessible from any role) */}
  <Route path="/infinity-one/*" element={<ProtectedRoute><InfinityOneHub /></ProtectedRoute>} />

  {/* Smart default redirect */}
  <Route path="/" element={<SmartRedirect />} />
  <Route path="*" element={<SmartRedirect />} />
</Routes>
```

**New Components Required:**
- `RoleSelector.tsx` — Role selection view
- `RoleGate.tsx` — Route guard that checks active role
- `SmartRedirect.tsx` — Redirects based on active role or shows role selector
- `AdminOS.tsx` — Admin OS Portal shell (new major view)
- `Arcadia.tsx` — Arcadia user experience shell
- `ComplianceCentre.tsx` — Auditor-focused compliance view
- `InfinityOneHub.tsx` — Profile, settings, and ecosystem configuration

### 5.4 AuthProvider Enhancement

The `AuthProvider.tsx` needs these additions:

```typescript
interface AuthContextValue {
  // ... existing fields ...
  availableRoles: string[];           // NEW
  activeRole: string | null;          // NEW
  roleDestinations: Record<string, string>;  // NEW
  switchRole: (role: string) => Promise<void>;  // NEW
  hasMultipleRoles: boolean;          // NEW computed
}
```

The `switchRole` function calls a new backend endpoint:
```
POST /api/v1/auth/switch-role
Body: { target_role: "user" }
Response: { access_token: "...", active_role: "user" }
```

This issues a new JWT with the updated `active_role` claim without requiring re-authentication.

---

## 6. INFINITY ADMIN OS PORTAL — MONITORING & MANAGEMENT PLATFORM

### 6.1 Portal Structure

The Admin OS Portal is a dedicated application shell (not a module within the Desktop) that provides comprehensive platform management. It has its own navigation, layout, and module system optimised for administrative workflows.

```
┌─────────────────────────────────────────────────────────────────┐
│  ∞ Infinity Admin OS                    🟢 Drew Porter  ⚙️  🔔  │
│  ─────────────────────────────────────────────────────────────  │
│  │ 📊 Dashboard    │                                           │
│  │ 🖥️ Services     │  ┌─────────────────────────────────────┐  │
│  │ 👥 Users        │  │                                     │  │
│  │ 🤖 AI Agents    │  │     ACTIVE MODULE CONTENT AREA      │  │
│  │ 📋 Compliance   │  │                                     │  │
│  │ 🔧 Config       │  │     (Dashboard / Services /         │  │
│  │ 📝 Low-Code     │  │      Users / AI / Compliance /      │  │
│  │ 🏛️ Governance   │  │      Config / Low-Code /            │  │
│  │ 📈 Analytics    │  │      Governance / Analytics)        │  │
│  │ 🔐 Security     │  │                                     │  │
│  │ 🌍 Ecosystem    │  │                                     │  │
│  │                  │  └─────────────────────────────────────┘  │
│  │ ─────────────── │                                           │
│  │ ∞ Infinity-One  │  ┌─────────────────────────────────────┐  │
│  │ 🔄 Switch Role  │  │  Infinity-One Connection: 🟢 Active │  │
│  │ 🚪 Sign Out     │  │  Role: Super Admin  │  Switch ▾     │  │
│  └──────────────────┘  └─────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 6.2 Admin OS Modules

#### 6.2.1 Dashboard (Home)
- **System Health Overview:** Traffic light status for all 22 agent services
- **Active Users:** Real-time count with trend sparkline
- **Resource Utilisation:** CPU, memory, bandwidth across free-tier limits
- **Compliance Score:** Aggregate TIGA compliance percentage
- **Recent Alerts:** Last 10 system alerts with severity indicators
- **Quick Actions:** Common admin tasks (invite user, restart service, view logs)

#### 6.2.2 Services Monitor
- **Service Grid:** All 22 agents displayed as cards with:
  - Service name and port
  - Status indicator (healthy/degraded/down)
  - Uptime percentage
  - Last health check timestamp
  - Response time (p50, p95, p99)
  - Error rate
- **Service Detail View:** Click any service for:
  - Real-time log stream
  - Endpoint list with health status
  - Configuration viewer/editor
  - Dependency graph
  - Restart/stop controls (with confirmation)

#### 6.2.3 User Management
- **User List:** Searchable, filterable table of all users
- **User Detail:** Full profile view with:
  - Role assignments (add/remove roles)
  - Permission overrides
  - Session history
  - Audit trail
  - Risk score
  - MFA status
- **Bulk Operations:** Multi-select for role changes, suspensions, invitations
- **Invitation System:** Email-based invitations with role pre-assignment

#### 6.2.4 AI Agent Management
- **Agent Registry:** All 22 agents with their current assignments
- **AI Routing Configuration:** Visual editor for the multi-AI routing table:
  - Which AI provider handles which task type
  - Fallback chains (Gemini → Groq → Claude → DeepSeek)
  - Rate limit monitoring per provider
  - Cost tracking (even on free tiers, track usage against limits)
- **Agent Crew Composer:** Visual drag-and-drop interface for composing CrewAI crews
- **Agent Maturity Tracker:** IBM-style maturity levels per agent

#### 6.2.5 Compliance Centre
- **TIGA Dashboard:** Visual representation of FF → TEF → App control chain
- **Control Registry:** All 40+ FF controls with current Logic Level
- **Evidence Manager:** Upload and link evidence to controls
- **Audit Trail:** Immutable log of all compliance-relevant actions
- **Framework Mapper:** Visual mapping of controls to ISO 27001, EU AI Act, GDPR, etc.

#### 6.2.6 Configuration Manager (Low-Code)
*See Section 9 for detailed low-code/no-code specifications*

#### 6.2.7 Governance Centre
- **Canon Viewer:** Read-only display of immutable governance principles
- **Codex Editor:** CRUD interface for actionable compliance rules
- **Policy Manager:** Create, edit, activate/deactivate IAM policies
- **Approval Workflows:** Multi-step approval for sensitive changes

#### 6.2.8 Analytics
- **Usage Analytics:** Page views, feature adoption, user engagement
- **Performance Analytics:** Response times, error rates, throughput
- **AI Analytics:** Token usage, model performance, routing efficiency
- **Business Analytics:** User growth, retention, marketplace activity

#### 6.2.9 Security Centre
- **Threat Dashboard:** Real-time security event stream
- **Session Manager:** View and terminate active sessions
- **API Key Manager:** Create, rotate, revoke API keys
- **Vulnerability Scanner:** Integration with Guardian AI findings
- **Incident Response:** Playbook execution for security incidents

#### 6.2.10 Ecosystem Overview
- **Service Topology Map:** Visual graph of all services and their connections
- **Port Allocation Table:** All 22 agents with their assigned ports
- **Health Matrix:** Cross-service dependency health
- **Deployment Status:** Current versions, last deploy times, rollback availability

### 6.3 Design System — Trancendos Noir

The Admin OS Portal follows the "Trancendos Noir" design language identified in the Grok report:

**Colour Palette:**
- Background: `#0f172a` (deep navy)
- Surface: `#1e293b` (slate)
- Surface Elevated: `#334155` (lighter slate)
- Primary Accent: `#00E5FF` (cyan)
- Secondary Accent: `#7c3aed` (violet)
- Success: `#22c55e` (green)
- Warning: `#f59e0b` (amber)
- Error: `#ef4444` (red)
- Text Primary: `#f8fafc` (near-white)
- Text Secondary: `#94a3b8` (muted)
- Border: `#334155` (subtle)

**Typography:**
- Headings: Inter (system font stack fallback)
- Body: Inter
- Code/Monospace: JetBrains Mono (system monospace fallback)

**Component Patterns:**
- Cards with subtle border and hover glow effect
- Status indicators using coloured dots (🟢🟡🔴)
- Data tables with alternating row backgrounds
- Sidebar navigation with icon + label
- Breadcrumb navigation for deep views
- Toast notifications for async operations
- Modal confirmations for destructive actions

---

## 7. INFINITY-ONE — UNIVERSAL IDENTITY & CROSS-APP PRESENCE

### 7.1 Connection Indicator

The Infinity-One connection indicator is a persistent UI element visible in every application across the ecosystem. It serves three purposes:

1. **Connection Status:** Shows whether the user's session is active and connected
2. **Identity Display:** Shows the user's avatar and display name
3. **Quick Access:** Provides a dropdown for profile, settings, role switching, and sign out

**Implementation:**
The indicator is rendered by a `<InfinityOneBar />` component that lives at the shell level, outside the route tree. It is always visible regardless of which application the user is in.

```
┌─────────────────────────────────────────────────────────────┐
│  [App Content Area]                                          │
│                                                              │
│                                                              │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│  ∞ Connected │ 🟢 Drew Porter │ Admin │ ⚙️ Settings │ 🔄 Switch │
└──────────────────────────────────────────────────────────────┘
```

**States:**
- 🟢 **Connected** — Active session, all services reachable
- 🟡 **Degraded** — Session active but some services unreachable
- 🔴 **Disconnected** — Session expired or network failure
- ⚪ **Reconnecting** — Attempting to restore connection

**Dropdown Menu:**
```
┌──────────────────────────────┐
│  Drew Porter                 │
│  drew@trancendos.com         │
│  ─────────────────────────── │
│  👤 My Profile               │
│  ⚙️ Settings                 │
│  🔐 Security                 │
│  ─────────────────────────── │
│  🔄 Switch Role              │
│     ├ 🛡️ Admin (active)      │
│     └ 👤 User                │
│  ─────────────────────────── │
│  ∞ Infinity-One Hub          │
│  🚪 Sign Out                 │
└──────────────────────────────┘
```

### 7.2 Infinity-One Hub (Profile & Settings)

Accessible from any application via the connection indicator or direct navigation to `/infinity-one`, the Hub provides:

**Profile Management:**
- Display name, avatar, bio
- Contact information (email, phone)
- Social links
- Language and timezone preferences
- Accessibility settings

**Security Settings:**
- Password change
- MFA configuration (TOTP, WebAuthn, backup codes)
- Active sessions (view and terminate)
- Trusted devices
- Login history
- Security score

**Ecosystem Configuration:**
- Theme preferences (applied across all apps)
- Notification preferences (per-app granularity)
- Default role selection
- Dashboard widget layout
- Keyboard shortcuts
- AI preferences (enabled/disabled, preferred models)

**Data & Privacy:**
- GDPR consent management
- Data export (right to portability)
- Account deletion request (right to erasure)
- Privacy settings (profile visibility, activity tracking)

### 7.3 Cross-App State Synchronisation

Infinity-One maintains a real-time state that is synchronised across all open application tabs/windows:

- **Theme changes** propagate instantly via `BroadcastChannel` API
- **Role switches** trigger navigation in all tabs
- **Session expiry** triggers lock screen in all tabs
- **Notification counts** update across all tabs
- **Profile changes** reflect immediately everywhere

---

## 8. ROLE SWITCHING & MULTI-ROLE NAVIGATION

### 8.1 Role Switching Flow

```
User clicks "Switch Role" in Infinity-One dropdown
        │
        ▼
┌─────────────────────────────────────┐
│  SELECT WORKSPACE                    │
│                                      │
│  You are currently in: Admin OS      │
│                                      │
│  ┌─────────────────────────────────┐ │
│  │ 🛡️ Infinity Admin OS Portal    │ │
│  │    Currently active ✓           │ │
│  └─────────────────────────────────┘ │
│  ┌─────────────────────────────────┐ │
│  │ 👤 Arcadia                      │ │
│  │    Community & Marketplace      │ │
│  │    [Switch →]                   │ │
│  └─────────────────────────────────┘ │
│                                      │
│  ☐ Remember this choice             │
│  [Cancel]                            │
└─────────────────────────────────────┘
```

### 8.2 Technical Implementation

Role switching is a lightweight operation that does NOT require re-authentication:

1. User selects target role from the dropdown or role selector
2. Frontend calls `POST /api/v1/auth/switch-role` with the target role
3. Backend validates the user has the requested role
4. Backend issues a new JWT with updated `active_role` claim
5. Frontend stores new token, updates AuthContext
6. Frontend navigates to the role's destination route
7. All open tabs receive the role change via BroadcastChannel

**Security Considerations:**
- Role switching is logged in the audit trail
- Each role switch generates a new JWT (old one is not revoked immediately but has short TTL)
- Rate limiting on role switches (max 10 per hour) to prevent abuse
- MFA re-verification can be required for switching to admin roles (configurable)

### 8.3 Persistent Role Memory

Users can opt to "remember" their role choice:
- Stored in `localStorage` as `infinity_preferred_role`
- On next login, if the user still has that role, they are auto-routed
- If the remembered role has been revoked, the role selector is shown
- The preference can be cleared from Infinity-One settings

---

## 9. LOW-CODE / NO-CODE EDITING CAPABILITIES

### 9.1 Philosophy

The Continuity Guardian must be able to modify any configurable aspect of the platform without writing code, deploying changes, or waiting for developer assistance. This is achieved through a structured data approach where all configuration is stored as JSON/YAML in the database, and the Admin Portal provides visual editors for this data.

### 9.2 Configurable Domains

#### 9.2.1 AI Assignment Editor
**What it configures:** Which AI provider handles which task type across the ecosystem

```
┌─────────────────────────────────────────────────────────────┐
│  AI ROUTING CONFIGURATION                                    │
│                                                              │
│  Task Type          │ Primary    │ Fallback 1 │ Fallback 2  │
│  ───────────────────┼────────────┼────────────┼──────────── │
│  Text Generation    │ Gemini ▾   │ Groq ▾     │ DeepSeek ▾  │
│  Code Analysis      │ Claude ▾   │ Gemini ▾   │ Groq ▾      │
│  Financial Audit    │ Gemini ▾   │ Claude ▾   │ DeepSeek ▾  │
│  Security Scan      │ Groq ▾     │ Gemini ▾   │ Claude ▾    │
│  Content Moderation │ Gemini ▾   │ Claude ▾   │ Groq ▾      │
│  ───────────────────┼────────────┼────────────┼──────────── │
│  [+ Add Task Type]  │            │            │             │
│                                                              │
│  [Save Changes]  [Reset to Defaults]  [View Change History]  │
└─────────────────────────────────────────────────────────────┘
```

**Storage:** `platform_config` table, key: `ai_routing`, value: JSON
**Audit:** Every change is logged with before/after snapshots
**Validation:** Changes are validated against available AI providers before saving

#### 9.2.2 Segment & Section Editor
**What it configures:** The layout and content of application sections, navigation segments, and dashboard widgets

```
┌─────────────────────────────────────────────────────────────┐
│  SECTION EDITOR — Arcadia Dashboard                          │
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  DRAG TO REORDER                                        │ │
│  │                                                         │ │
│  │  ☰ Community Feed        [Visible ✓] [Edit ✏️] [🗑️]    │ │
│  │  ☰ Marketplace Listings  [Visible ✓] [Edit ✏️] [🗑️]    │ │
│  │  ☰ Recovery Tools        [Visible ✓] [Edit ✏️] [🗑️]    │ │
│  │  ☰ Events Calendar       [Hidden ☐]  [Edit ✏️] [🗑️]    │ │
│  │  ☰ AI Assistant          [Visible ✓] [Edit ✏️] [🗑️]    │ │
│  │                                                         │ │
│  │  [+ Add Section]                                        │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                              │
│  Section Properties (when Edit clicked):                     │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  Name: [Community Feed          ]                       │ │
│  │  Icon: [🏘️ ▾]                                           │ │
│  │  Component: [CommunityFeed ▾]                           │ │
│  │  Permissions: [user, power_user ▾]                      │ │
│  │  Order: [1]                                             │ │
│  │  Visible: [✓]                                           │ │
│  │  [Save] [Cancel]                                        │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

#### 9.2.3 Agent Configuration Editor
**What it configures:** Individual agent settings, tool access, crew membership

```
┌─────────────────────────────────────────────────────────────┐
│  AGENT: Cornelius AI (Financial Advisor)                     │
│                                                              │
│  Status: [Active ▾]     Port: [3001]                        │
│  Description: [Financial analysis and advisory agent    ]    │
│                                                              │
│  AI Provider: [Gemini ▾]                                    │
│  Fallback:    [Groq ▾]                                      │
│  Temperature: [0.7 ────●──── ]                              │
│  Max Tokens:  [4096        ]                                │
│                                                              │
│  Tools Access:                                               │
│  ☑ Market Data API    ☑ Financial Calculator                │
│  ☑ Report Generator   ☐ External API Access                 │
│  ☑ Database Read      ☐ Database Write                      │
│                                                              │
│  Crew Membership:                                            │
│  ☑ Financial Analysis Crew                                  │
│  ☐ Security Audit Crew                                      │
│  ☑ Reporting Crew                                           │
│                                                              │
│  [Save Changes]  [View Logs]  [Restart Agent]               │
└─────────────────────────────────────────────────────────────┘
```

#### 9.2.4 Navigation Editor
**What it configures:** Sidebar navigation items, their order, visibility, and role requirements

#### 9.2.5 Dashboard Widget Editor
**What it configures:** Which widgets appear on dashboards, their layout, data sources, and refresh intervals

#### 9.2.6 Compliance Control Editor
**What it configures:** TIGA control statuses, evidence links, Logic Level progression, framework mappings

### 9.3 Low-Code Editor Architecture

All low-code editors follow the same architectural pattern:

```
┌──────────────────────────────────────────────────────────┐
│                    LOW-CODE EDITOR                         │
│                                                           │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐ │
│  │ Config Store │  │ Schema       │  │ Visual Editor   │ │
│  │ (Database)   │──│ Validator    │──│ (React Forms)   │ │
│  │              │  │ (Zod/JSON    │  │                 │ │
│  │ JSON configs │  │  Schema)     │  │ Drag & drop     │ │
│  │ with version │  │              │  │ Form fields     │ │
│  │ history      │  │ Prevents     │  │ Preview mode    │ │
│  │              │  │ invalid      │  │ Undo/redo       │ │
│  └─────────────┘  │ configs      │  │                 │ │
│                    └──────────────┘  └─────────────────┘ │
│                                                           │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐ │
│  │ Audit Log   │  │ Change       │  │ Rollback        │ │
│  │             │  │ Preview      │  │ Manager         │ │
│  │ Who changed │  │              │  │                 │ │
│  │ what, when  │  │ Side-by-side │  │ One-click       │ │
│  │             │  │ diff view    │  │ revert to any   │ │
│  │             │  │ before save  │  │ previous version│ │
│  └─────────────┘  └──────────────┘  └─────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

**Key Principles:**
1. **Schema-validated:** Every configuration has a Zod schema that prevents invalid states
2. **Version-controlled:** Every change creates a new version; previous versions are preserved
3. **Audit-logged:** Every change records who, what, when, and why
4. **Preview-before-save:** Changes can be previewed before committing
5. **Instant rollback:** Any previous version can be restored with one click
6. **No deployment required:** Changes take effect immediately (or after approval workflow)

### 9.4 Backend Support

New backend endpoints required:

```
GET    /api/v1/config/{domain}              # Get current config for a domain
PUT    /api/v1/config/{domain}              # Update config (creates new version)
GET    /api/v1/config/{domain}/history      # Get version history
GET    /api/v1/config/{domain}/version/{v}  # Get specific version
POST   /api/v1/config/{domain}/rollback/{v} # Rollback to specific version
GET    /api/v1/config/{domain}/schema       # Get Zod schema for validation
GET    /api/v1/config/{domain}/diff/{v1}/{v2} # Diff between versions
```

**Database Table:**
```sql
CREATE TABLE platform_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain VARCHAR(100) NOT NULL,        -- 'ai_routing', 'sections', 'agents', etc.
    version INTEGER NOT NULL DEFAULT 1,
    config JSONB NOT NULL,
    schema_version VARCHAR(20) NOT NULL,
    changed_by UUID REFERENCES users(id),
    change_reason TEXT,
    previous_config JSONB,               -- Snapshot for diff
    created_at TIMESTAMPTZ DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE,
    UNIQUE(domain, version)
);

CREATE INDEX idx_config_domain_active ON platform_config(domain, is_active);
```

---

## 10. TIGA GOVERNANCE INTEGRATION

### 10.1 Governance Data Model

The TIGA framework requires a structured data model for controls, evidence, and mappings:

```sql
-- Foundation Framework Controls
CREATE TABLE ff_controls (
    id VARCHAR(20) PRIMARY KEY,          -- 'FF-CTRL-001'
    name VARCHAR(200) NOT NULL,
    description TEXT,
    category VARCHAR(100),
    logic_level INTEGER DEFAULT 1,       -- LL1-LL5
    status VARCHAR(20) DEFAULT 'documented',
    owner VARCHAR(100),
    last_reviewed TIMESTAMPTZ,
    next_review TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- TEF Mappings (FF → TEF → App)
CREATE TABLE tef_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ff_control_id VARCHAR(20) REFERENCES ff_controls(id),
    tef_control_id VARCHAR(20),
    app_control_id VARCHAR(20),
    application VARCHAR(100),            -- 'arcadia', 'admin-os', etc.
    implementation_status VARCHAR(20),
    evidence_ids UUID[],
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Evidence Records
CREATE TABLE compliance_evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    control_id VARCHAR(20),
    type VARCHAR(50),                    -- 'document', 'screenshot', 'log', 'test_result'
    title VARCHAR(200),
    description TEXT,
    file_url TEXT,
    sha256_hash VARCHAR(64),            -- Evidence integrity
    uploaded_by UUID,
    uploaded_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ              -- CRA 10-year retention
);

-- Framework Compliance Mappings
CREATE TABLE framework_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ff_control_id VARCHAR(20) REFERENCES ff_controls(id),
    framework VARCHAR(50),               -- 'ISO27001', 'EU_AI_ACT', 'GDPR', etc.
    framework_control VARCHAR(50),       -- 'A.5.1', 'Article 9', etc.
    compliance_status VARCHAR(20),
    notes TEXT
);
```

### 10.2 Admin Portal Governance Views

The Governance Centre in the Admin Portal provides:

1. **Control Explorer:** Tree view of FF → TEF → App control hierarchy
2. **Logic Level Dashboard:** Visual progression bars showing LL1→LL5 advancement per control
3. **Evidence Manager:** Upload, link, and verify evidence against controls
4. **Framework Compliance Matrix:** Cross-reference table showing control coverage across all frameworks
5. **Audit Calendar:** Scheduled review dates with reminders
6. **Canon Viewer:** Read-only display of immutable governance principles
7. **Codex Editor:** Low-code editor for actionable compliance rules

---

## 11. SERVICE MAP — ALL 22 AGENTS + PORTS

| # | Service | Port | Engine | Repository | Status |
|---|---------|------|--------|------------|--------|
| 1 | Cornelius AI | 3001 | FinancialAdvisorEngine | cornelius-ai | ✅ Migrated |
| 2 | Norman AI | 3002 | ButlerEngine | norman-ai | ✅ Migrated |
| 3 | Guardian AI | 3003 | SecurityEngine | guardian-ai | ✅ Migrated |
| 4 | Oracle AI | 3004 | PredictionEngine | oracle-ai | ✅ Migrated |
| 5 | Sentinel AI | 3005 | MonitoringEngine | sentinel-ai | ✅ Migrated |
| 6 | Serenity AI | 3006 | WellnessEngine | serenity-ai | ✅ Migrated |
| 7 | Prometheus AI | 3007 | AnalyticsEngine | prometheus-ai | ✅ Migrated |
| 8 | Queen AI | 3008 | GovernanceEngine | queen-ai | ✅ Migrated |
| 9 | Renik AI | 3009 | ResearchEngine | renik-ai | ✅ Migrated |
| 10 | The Dr AI | 3010 | DiagnosticsEngine | the-dr-ai | ✅ Migrated |
| 11 | Porter Family AI | 3011 | FamilyEngine | porter-family-ai | ✅ Migrated |
| 12 | SolarScene AI | 3012 | EnergyEngine | solarscene-ai | ✅ Migrated |
| 13 | The Hive | 3013 | SwarmRouter | the-hive | ✅ Migrated |
| 14 | The Citadel | 3014 | FortressEngine | the-citadel | ✅ Migrated |
| 15 | The Library | 3015 | KnowledgeEngine | the-library | ✅ Migrated |
| 16 | The Nexus | 3016 | IntegrationEngine | the-nexus | ✅ Migrated |
| 17 | The Observatory | 3017 | InsightEngine | the-observatory | ✅ Migrated |
| 18 | The Treasury | 3018 | FinanceEngine | the-treasury | ✅ Migrated |
| 19 | The Workshop | 3019 | BuildEngine | the-workshop | ✅ Migrated |
| 20 | The Agora | 3020 | ForumEngine | the-agora | ✅ Migrated |
| 21 | Dorris AI | 3025 | FinancialAuditorEngine | dorris-ai | ✅ Migrated |
| 22 | Arcadia | 3026 | MarketplaceEngine + CommunityEngine | arcadia | ✅ Migrated |

**Backend Services (Docker Compose):**

| Service | Port | Purpose |
|---------|------|---------|
| API Gateway | 8080 | Central API routing |
| AI Service | 8001 | AI orchestration |
| Billing Service | 8002 | Payment processing |
| Docs Service | 8003 | Documentation |
| Workflow Service | 8004 | Workflow automation |
| Notification Service | 8005 | Push/email notifications |
| Marketplace Service | 8006 | App store |
| Knowledge Service | 8007 | Knowledge base |
| Compliance Service | 8008 | Compliance automation |

**Monitoring Stack:**

| Service | Port | Purpose |
|---------|------|---------|
| Prometheus | 9090 | Metrics collection |
| Grafana | 3100 | Dashboards |
| Alertmanager | 9093 | Alert routing |
| Loki | 3200 | Log aggregation |
| Jaeger | 16686 | Distributed tracing |

---

## 12. IMPLEMENTATION PHASES WITH BACKUPS & REMEDIATION

### Phase 0: Pre-Implementation Safety (Day 1)

**Backup Procedures:**
1. Create Git tag `pre-infinity-portal-v2` on current main branch
2. Export current database schema and seed data
3. Document current working state in `BASELINE_SNAPSHOT.md`
4. Verify all 22 agent repos have clean main branches

**Remediation Plan:**
- If any phase fails: `git revert` to the tagged commit
- Database rollback via Neon branch restore
- All changes are on feature branches; main is never directly modified

### Phase 1: Backend Foundation (Days 2-4)

**Tasks:**
1. Add `available_roles` and `role_destinations` to auth login response
2. Create `POST /api/v1/auth/switch-role` endpoint
3. Create `platform_config` table and CRUD endpoints
4. Create governance tables (ff_controls, tef_mappings, compliance_evidence)
5. Add config domain schemas (ai_routing, sections, agents, navigation)

**Backup:** Feature branch `feat/infinity-portal-backend-v2`
**Remediation:** Revert branch, drop new tables

### Phase 2: Auth Flow & Role Routing (Days 5-7)

**Tasks:**
1. Enhance `AuthProvider.tsx` with multi-role support
2. Create `RoleSelector.tsx` view
3. Create `RoleGate.tsx` route guard
4. Create `SmartRedirect.tsx` component
5. Update `App.tsx` with new route structure
6. Create `InfinityOneBar.tsx` connection indicator

**Backup:** Feature branch `feat/infinity-portal-auth-v2`
**Remediation:** Revert to previous App.tsx routing

### Phase 3: Infinity Admin OS Portal Shell (Days 8-12)

**Tasks:**
1. Create `AdminOS.tsx` shell with sidebar navigation
2. Implement Dashboard (home) module
3. Implement Services Monitor module
4. Implement User Management module
5. Apply Trancendos Noir design system

**Backup:** Feature branch `feat/admin-os-portal`
**Remediation:** Remove admin-os route, revert to desktop-only routing

### Phase 4: Low-Code Editors (Days 13-17)

**Tasks:**
1. Create generic `ConfigEditor` component with schema validation
2. Implement AI Routing Editor
3. Implement Section/Segment Editor
4. Implement Agent Configuration Editor
5. Implement Navigation Editor
6. Add version history and rollback UI

**Backup:** Feature branch `feat/low-code-editors`
**Remediation:** Disable low-code routes, fall back to direct database edits

### Phase 5: Infinity-One Integration (Days 18-20)

**Tasks:**
1. Implement `InfinityOneHub.tsx` (profile, settings, security)
2. Implement cross-tab state synchronisation via BroadcastChannel
3. Implement role switching flow
4. Connect Infinity-One bar to all application shells
5. Implement theme/preference propagation

**Backup:** Feature branch `feat/infinity-one-integration`
**Remediation:** Revert to basic auth without Infinity-One features

### Phase 6: Governance Centre (Days 21-24)

**Tasks:**
1. Implement TIGA control explorer
2. Implement Logic Level dashboard
3. Implement evidence manager
4. Implement framework compliance matrix
5. Seed initial FF controls from TIGA document

**Backup:** Feature branch `feat/governance-centre`
**Remediation:** Remove governance routes, data persists in database

### Phase 7: Testing & Hardening (Days 25-28)

**Tasks:**
1. End-to-end testing of login → role selection → destination routing
2. Role switching testing across all role combinations
3. Low-code editor validation testing
4. Accessibility audit (WCAG 2.2 AA)
5. Security audit (OWASP top 10)
6. Performance testing (Lighthouse scores)

**Backup:** All feature branches merged to `develop` branch first
**Remediation:** Cherry-pick only passing features to `main`

---

## 13. FUTURE HORIZON LOG

Items identified during research that are out of scope for this implementation but should be tracked:

| # | Item | Source | Priority | Complexity |
|---|------|--------|----------|------------|
| 1 | zkML/ZKP integration for AGI safety verification | TIGA Framework | Low | Very High |
| 2 | BCI (Brain-Computer Interface) authentication | Infinity-One Types | Low | Very High |
| 3 | Quantum-safe cryptography migration (CRYSTALS-Kyber) | TIGA Framework | Medium | High |
| 4 | SCIM 2.0 provisioning for enterprise SSO | Infinity-One Types | Medium | Medium |
| 5 | Carbon-aware workload scheduling (WattTime API) | Sustainability Config | Medium | Medium |
| 6 | AppSheet native integration (replace with built-in low-code) | Grok Report | High | Medium |
| 7 | Retool RSX dashboard migration to native Admin OS | Grok Report | High | Medium |
| 8 | CrewAI visual crew composer (drag-and-drop) | Grok Report | Medium | High |
| 9 | Real-time collaborative editing (CRDT-based) | OS Strategy Doc | Low | Very High |
| 10 | Holographic/AR interface mode | Infinity-One Types | Low | Very High |
| 11 | Voice-based admin commands | IBM ROI Guide | Medium | Medium |
| 12 | Predictive resource management (AI-driven) | OS Strategy Doc | Medium | High |
| 13 | Multi-tenant organisation federation | Infinity-One Types | Medium | High |
| 14 | Automated compliance evidence collection | TIGA Framework | High | Medium |
| 15 | Agent self-improvement loops | IBM ROI Guide | Low | Very High |

---

## 14. RISK REGISTER

| # | Risk | Probability | Impact | Mitigation |
|---|------|-------------|--------|------------|
| 1 | Free-tier API limits exceeded during development | Medium | Medium | Monitor usage, implement request caching, use mock data for testing |
| 2 | Role switching introduces session confusion | Low | High | Comprehensive E2E testing, clear UI indicators of active role |
| 3 | Low-code editor allows invalid configurations | Medium | High | Zod schema validation, preview-before-save, instant rollback |
| 4 | Cross-tab synchronisation fails on older browsers | Low | Medium | Graceful degradation, manual refresh fallback |
| 5 | TIGA governance data model too rigid for future changes | Medium | Medium | JSONB storage for flexible schema evolution |
| 6 | Admin OS Portal becomes too complex for single-page app | Low | High | Code splitting, lazy loading, module federation |
| 7 | Backend RBAC stubs not implemented in time | High | High | Implement minimum viable RBAC endpoints first, expand iteratively |
| 8 | Design system inconsistency across apps | Medium | Medium | Shared CSS variables, component library, design tokens |
| 9 | Database migration conflicts with existing data | Low | High | Neon branching for safe migration testing |
| 10 | Scope creep from document insights | High | Medium | Strict adherence to this blueprint, Future Horizon Log for extras |

---

## 15. SIGN-OFF

### Approval Required Before Implementation

This blueprint requires approval from the Continuity Guardian before any code changes are made. The approval confirms:

- [ ] Architecture overview is accurate and complete
- [ ] Login flow and role routing design is approved
- [ ] Admin OS Portal module list is approved
- [ ] Low-code/no-code approach is approved
- [ ] TIGA governance integration approach is approved
- [ ] Implementation phases and timeline are acceptable
- [ ] Risk mitigations are adequate
- [ ] Future Horizon Log captures all deferred items

**Continuity Guardian:** ____________________  
**Date:** ____________________  
**Decision:** ☐ Approved  ☐ Approved with Changes  ☐ Requires Revision  

---

*This document was generated by SuperNinja AI as part of the Trancendos ecosystem development programme. All architectural decisions align with the zero-cost mandate, 2060 future-proofing standard, and TIGA governance framework.*