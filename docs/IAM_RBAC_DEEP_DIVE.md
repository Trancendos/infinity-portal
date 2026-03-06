# IAM & RBAC DEEP DIVE
## Comprehensive Identity, Access Management & Permission Architecture
### Trancendos Ecosystem — Infinity Portal, Admin OS, Arcadia & All Services

**Document Version:** 1.0  
**Prepared by:** SuperNinja AI  
**Repository:** Trancendos/infinity-portal  
**Classification:** Security Architecture — Pre-Implementation Research  
**Date:** 2025-03-07  
**Status:** DRAFT — Awaiting Continuity Guardian Approval  
**Companion Document:** `INFINITY_PORTAL_BLUEPRINT.md`  

---

## TABLE OF CONTENTS

1. [Executive Summary](#1-executive-summary)
2. [Current State Gap Analysis](#2-current-state-gap-analysis)
3. [Principal Taxonomy — Who & What Needs Access](#3-principal-taxonomy--who--what-needs-access)
4. [Expanded Role Architecture](#4-expanded-role-architecture)
5. [Permission Model — Hybrid RBAC + ABAC](#5-permission-model--hybrid-rbac--abac)
6. [AI Tiering System — 3-Tier Classification](#6-ai-tiering-system--3-tier-classification)
7. [Subscription-Based Service Access](#7-subscription-based-service-access)
8. [Application-Level RBAC](#8-application-level-rbac)
9. [Non-Human Identity Management](#9-non-human-identity-management)
10. [Bot & Agent Spawning Permissions](#10-bot--agent-spawning-permissions)
11. [API & Git Connection Permissions](#11-api--git-connection-permissions)
12. [Admin Restriction & Selective Elevation](#12-admin-restriction--selective-elevation)
13. [Audit, Compliance & Evidence Trail](#13-audit-compliance--evidence-trail)
14. [Database Schema](#14-database-schema)
15. [Implementation Priority Matrix](#15-implementation-priority-matrix)
16. [Future Horizon Log](#16-future-horizon-log)
17. [Sign-Off](#17-sign-off)

---

## 1. EXECUTIVE SUMMARY

The Trancendos ecosystem is not a single application — it is a constellation of 22+ agent services, 8+ backend microservices, multiple frontend applications, and an AI orchestration layer that spans free-tier, open-source, and premium AI providers. This complexity demands an IAM architecture that goes far beyond simple role-based access control.

This document defines a **hybrid RBAC + ABAC (Attribute-Based Access Control)** model that addresses every dimension of access control Drew identified:

**Human Principals:**
- **Expanded role taxonomy** with Developer, Restricted Admin, and Select-Few roles
- **Subscription-based access** where users choose which services, applications, and features they want
- **Admin restrictions** where some admins have limitations and certain permissions are held only by a select few

**Non-Human Principals:**
- **AI agents as first-class identity principals** with their own roles, permissions, and audit trails
- **3-tier AI classification** (In-House → Free-Tier → Premium) with distinct scopes, billing, and access rights
- **Bot and agent spawning permissions** ensuring AI-created entities inherit appropriate restrictions
- **API keys and Git connections** with scoped permissions and rotation policies

**Cross-Cutting Concerns:**
- **Application-level RBAC** where each application (Arcadia, Admin OS, etc.) has its own permission namespace
- **ABAC attributes** for context-sensitive decisions (time, location, device, risk score, subscription tier)
- **Complete audit trail** for every access decision, human or machine
- **TIGA governance compliance** with FF control traceability

### Why This Matters

The research is clear: the #1 security risk in AI-powered platforms is **over-permissioned agents and under-governed access**. According to Cerbos (2025), companies are giving AI agents "root access to all data and assuming sensitive data won't be leaked." According to WorkOS (2025), "AI agents are too powerful to leave unchecked — without strict permission management, they risk exposing sensitive data, violating compliance, or eroding user trust."

The Trancendos platform, with its 22 AI agents, multi-AI routing, and bot-spawning capabilities, is exactly the type of system where a robust IAM architecture is not optional — it is existential.

---

## 2. CURRENT STATE GAP ANALYSIS

### 2.1 What Exists Today

| Component | Current State | Gap |
|-----------|--------------|-----|
| **Backend Roles** | 5-tier: `super_admin`, `org_admin`, `auditor`, `power_user`, `user` | No `developer` role, no restricted admin variants, no subscription-based access |
| **Infinity-One Types** | 7 system roles: `super_admin`, `org_admin`, `security_admin`, `power_user`, `standard_user`, `guest`, `bot` | Types defined but service not fully implemented; no AI-specific roles |
| **Permissions** | 30+ permissions in `SYSTEM_PERMISSIONS` (resource:action pattern) | No per-application namespacing, no subscription gating, no AI-tier scoping |
| **Agent Manager** | `AgentTier` enum: `T1_CRITICAL`, `T2_IMPORTANT`, `T3_NICE_TO_HAVE` | This is operational priority, NOT the AI provider tiering Drew described |
| **AI Router** | `LLM_PROVIDERS`: openai, groq, anthropic, huggingface, local | No tiering (in-house/free/premium), no per-user access control, no billing hooks |
| **RBAC Router** | All endpoints are stubs ("Implementation pending — Wave 1 migration") | No working RBAC management |
| **Agent Permissions** | Agents register with `capabilities` list but no permission enforcement | Agents can do anything they register for; no IAM policy evaluation |
| **Bot Spawning** | No bot/agent creation system exists | No spawning permissions, no inheritance model |
| **API Keys** | `APIKey` model exists in `models.py` but no management endpoints | No scoped API keys, no rotation, no connection-level permissions |
| **Subscription** | No subscription system | No feature gating, no service selection, no tier-based access |

### 2.2 Critical Gaps Summary

1. **No Developer role** — Developers need repo access, build triggers, API testing, but NOT user management or compliance approval
2. **No subscription model** — All authenticated users get access to everything; no way to limit by plan or preference
3. **No AI identity system** — AI agents authenticate via service registration, not via IAM principals
4. **No AI provider tiering** — All AI providers are treated equally; no in-house/free/premium distinction
5. **No admin restrictions** — All `super_admin` users have identical, unrestricted access
6. **No application-level permissions** — Permissions are global, not scoped to specific applications
7. **No bot spawning governance** — No controls on AI agents creating other agents or bots
8. **No API connection permissions** — API keys have no scoped access; Git connections have no permission model

---

## 3. PRINCIPAL TAXONOMY — WHO & WHAT NEEDS ACCESS

A "principal" is any entity that can request access to a resource. In the Trancendos ecosystem, there are four categories of principals:

### 3.1 Human Principals

```
Human Principals
├── Platform Operators
│   ├── Continuity Guardian (Drew) — Supreme authority, select-few permissions
│   ├── Super Admin — Full platform access (can be restricted)
│   ├── Org Admin — Organisation-scoped administration
│   ├── Security Admin — Security-focused administration
│   └── Restricted Admin — Admin with specific limitations
├── Developers
│   ├── Lead Developer — Full dev access + deployment
│   ├── Developer — Code, build, test access
│   └── Contributor — Limited code access (PRs only)
├── Operational Users
│   ├── Auditor — Read-only compliance and audit
│   ├── Power User — Advanced features, shared workspaces
│   └── Analyst — Data access, reporting
├── Standard Users
│   ├── User — Standard application access
│   ├── Guest — Limited, time-bound access
│   └── Trial User — Feature-limited trial access
└── Special
    ├── Billing Admin — Financial management only
    └── Support Agent — User assistance, limited data access
```

### 3.2 AI Agent Principals (In-House)

These are the 22 Trancendos-built AI agents. Each is a first-class IAM principal:

```
AI Agent Principals (Tier 1 — In-House)
├── Financial Agents
│   ├── Cornelius AI (Financial Advisor) — Market data, portfolio analysis
│   ├── Dorris AI (Financial Auditor) — Audit trails, compliance verification
│   └── Treasury Service — Transaction processing, ledger management
├── Security Agents
│   ├── Guardian AI (Security) — Threat detection, vulnerability scanning
│   ├── Sentinel AI (Monitoring) — System monitoring, alerting
│   └── Citadel Service — Fortress-level security enforcement
├── Intelligence Agents
│   ├── Oracle AI (Prediction) — Forecasting, trend analysis
│   ├── Prometheus AI (Analytics) — Data analysis, reporting
│   ├── Renik AI (Research) — Information gathering, synthesis
│   └── Observatory Service — Insight generation, pattern recognition
├── Governance Agents
│   ├── Queen AI (Governance) — Policy enforcement, compliance
│   └── Lighthouse Service — Trust verification, token issuance
├── Wellness Agents
│   ├── Serenity AI (Wellness) — Mental health support, recovery tools
│   └── The Dr AI (Diagnostics) — Health assessment, recommendations
├── Operations Agents
│   ├── Norman AI (Butler) — Task management, scheduling
│   ├── Porter Family AI — Family-specific services
│   └── SolarScene AI (Energy) — Energy monitoring, sustainability
├── Infrastructure Agents
│   ├── Hive Service (Swarm Router) — Request routing, load balancing
│   ├── Nexus Service (Integration) — Cross-service integration
│   ├── Library Service (Knowledge) — Knowledge base management
│   └── Workshop Service (Build) — CI/CD, build management
└── Community Agents
    ├── Agora Service (Forum) — Community discussions
    └── Arcadia Service (Marketplace) — Marketplace + community
```

### 3.3 External AI Principals (Tier 2 & 3)

These are external AI providers accessed via API:

```
External AI Principals
├── Tier 2 — Free-Tier AI Providers
│   ├── Hugging Face Inference API (Mistral-7B, etc.)
│   ├── Cloudflare AI Workers (10,000 neurons/day)
│   ├── Google AI Studio (Gemini free tier)
│   ├── Groq Cloud (free tier — Llama, Mixtral)
│   └── Ollama/Local Models (self-hosted)
└── Tier 3 — Premium AI Providers
    ├── OpenAI (GPT-4o, GPT-4-turbo)
    ├── Anthropic (Claude 3.5 Sonnet, Claude 3 Opus)
    ├── Google Vertex AI (Gemini Pro, Ultra)
    ├── Cohere (Command R+)
    └── Mistral AI (Large, Medium)
```

### 3.4 Machine Principals (Non-Human, Non-AI)

```
Machine Principals
├── Service Accounts
│   ├── API Gateway Service Account
│   ├── Database Migration Service Account
│   ├── CI/CD Pipeline Service Account
│   └── Monitoring Stack Service Account
├── API Keys
│   ├── External Integration Keys (webhook receivers)
│   ├── Developer API Keys (testing, development)
│   └── Partner API Keys (third-party integrations)
├── Bot Accounts (AI-Spawned)
│   ├── Automated Workflow Bots
│   ├── Notification Bots
│   ├── Data Processing Bots
│   └── Scheduled Task Bots
└── Git Connections
    ├── GitHub App Installations
    ├── Deploy Keys
    └── Webhook Secrets
```

---

## 4. EXPANDED ROLE ARCHITECTURE

### 4.1 Role Hierarchy

The role system uses a **hierarchical inheritance model** where higher-level roles inherit permissions from lower levels, but can also have **restrictions** that override inherited permissions.

```
Level 0: Continuity Guardian ──────────────────── (Supreme, select-few only)
    │
Level 1: Super Admin ─────────────────────────── (Platform-wide, can be restricted)
    │   ├── Security Admin ────────────────────── (Security-focused subset)
    │   └── Restricted Admin ──────────────────── (Custom restriction set)
    │
Level 2: Org Admin ───────────────────────────── (Organisation-scoped)
    │   └── Billing Admin ─────────────────────── (Financial management only)
    │
Level 3: Developer Roles ─────────────────────── (Development-focused)
    │   ├── Lead Developer ────────────────────── (Full dev + deploy)
    │   ├── Developer ─────────────────────────── (Code, build, test)
    │   └── Contributor ───────────────────────── (PRs only)
    │
Level 4: Operational Roles ────────────────────── (Specialised access)
    │   ├── Auditor ───────────────────────────── (Read-only compliance)
    │   ├── Power User ────────────────────────── (Advanced features)
    │   ├── Analyst ───────────────────────────── (Data + reporting)
    │   └── Support Agent ─────────────────────── (User assistance)
    │
Level 5: Standard Roles ──────────────────────── (Basic access)
    │   ├── User ──────────────────────────────── (Standard access)
    │   ├── Trial User ────────────────────────── (Feature-limited)
    │   └── Guest ─────────────────────────────── (Minimal, time-bound)
    │
Level 6: Non-Human Roles ─────────────────────── (Machine principals)
    │   ├── AI Agent (Tier 1 — In-House) ──────── (Full ecosystem access)
    │   ├── AI Agent (Tier 2 — Free) ──────────── (Limited, metered access)
    │   ├── AI Agent (Tier 3 — Premium) ───────── (Full AI access, billed)
    │   ├── Bot (AI-Spawned) ──────────────────── (Inherited, restricted)
    │   ├── Service Account ───────────────────── (Infrastructure access)
    │   └── API Key ───────────────────────────── (Scoped external access)
```

### 4.2 New Role Definitions

#### 4.2.1 Continuity Guardian (Level 0)

This is Drew's role — the supreme authority with permissions that no other role can hold:

```typescript
const CONTINUITY_GUARDIAN: RoleDefinition = {
  name: 'continuity_guardian',
  displayName: 'Continuity Guardian',
  level: 0,
  type: RoleType.SYSTEM,
  description: 'Supreme platform authority — Lead Architect of the Trancendos Ecosystem',
  maxUsers: 1,  // Only ONE person can hold this role
  exclusive_permissions: [
    'platform:destroy',           // Delete entire platform data
    'platform:transfer',          // Transfer platform ownership
    'guardian:assign',            // Assign/revoke Continuity Guardian
    'compliance:override',        // Override compliance controls
    'ai:tier_modify',            // Change AI tier classifications
    'encryption:master_key',      // Access master encryption keys
    'audit:purge',               // Purge audit logs (with evidence)
    'role:create_system',        // Create new system-level roles
    'subscription:override',     // Override subscription limits
    'agent:spawn_unrestricted',  // Spawn agents without limits
  ],
  inherits: ['super_admin'],     // Inherits all super_admin permissions
  constraints: {
    mfa_required: true,
    max_session_duration: 3600,  // 1 hour max session
    ip_allowlist: true,          // Must configure IP allowlist
    approval_required: false,    // No approval needed (supreme authority)
  }
};
```

#### 4.2.2 Restricted Admin (Level 1)

An admin with specific limitations — for example, an admin who can manage users but cannot access financial data or modify AI configurations:

```typescript
const RESTRICTED_ADMIN: RoleDefinition = {
  name: 'restricted_admin',
  displayName: 'Restricted Administrator',
  level: 1,
  type: RoleType.CUSTOM,
  description: 'Administrator with custom restrictions applied',
  inherits: ['super_admin'],
  restrictions: [
    // These DENY permissions override inherited ALLOW
    { permission: 'treasury:*', effect: 'deny' },
    { permission: 'billing:*', effect: 'deny' },
    { permission: 'ai:configure', effect: 'deny' },
    { permission: 'compliance:override', effect: 'deny' },
    { permission: 'encryption:*', effect: 'deny' },
  ],
  // Restrictions are configurable per-user via the Admin Portal
  customizable_restrictions: true,
};
```

#### 4.2.3 Developer Roles (Level 3)

```typescript
const LEAD_DEVELOPER: RoleDefinition = {
  name: 'lead_developer',
  displayName: 'Lead Developer',
  level: 3,
  type: RoleType.SYSTEM,
  description: 'Full development access including deployment and infrastructure',
  permissions: [
    'repos:read', 'repos:write', 'repos:delete', 'repos:admin',
    'builds:read', 'builds:trigger', 'builds:cancel', 'builds:deploy',
    'files:read', 'files:write', 'files:share',
    'ai:generate', 'ai:review',
    'agents:read', 'agents:configure', 'agents:restart',
    'infrastructure:read', 'infrastructure:deploy',
    'secrets:read',  // Can read secret names (not values)
    'api_keys:create', 'api_keys:rotate',
    'git:read', 'git:write', 'git:admin',
    'observability:read', 'observability:configure',
    'compliance:read',
  ],
  denied_permissions: [
    'users:write', 'users:delete',     // Cannot manage users
    'orgs:write', 'orgs:delete',       // Cannot manage organisations
    'billing:*',                        // No financial access
    'compliance:approve',               // Cannot approve compliance
    'admin:platform',                   // No platform admin
  ],
};

const DEVELOPER: RoleDefinition = {
  name: 'developer',
  displayName: 'Developer',
  level: 3,
  type: RoleType.SYSTEM,
  description: 'Standard development access — code, build, test',
  permissions: [
    'repos:read', 'repos:write',
    'builds:read', 'builds:trigger',
    'files:read', 'files:write',
    'ai:generate',
    'agents:read',
    'api_keys:create',
    'git:read', 'git:write',
    'observability:read',
  ],
  denied_permissions: [
    'repos:delete', 'repos:admin',
    'builds:deploy',                    // Cannot deploy to production
    'infrastructure:*',
    'secrets:*',
    'users:*', 'orgs:*', 'billing:*',
    'compliance:*',
  ],
};

const CONTRIBUTOR: RoleDefinition = {
  name: 'contributor',
  displayName: 'Contributor',
  level: 3,
  type: RoleType.SYSTEM,
  description: 'External contributor — PR-only access',
  permissions: [
    'repos:read',
    'repos:write',  // Limited to PR creation only (enforced by ABAC)
    'builds:read',
    'files:read',
    'ai:generate',  // Can use AI for code assistance
    'git:read', 'git:write',  // Limited to fork + PR
  ],
  abac_conditions: {
    'repos:write': {
      action_type: ['pull_request_create', 'pull_request_update'],
      // Cannot merge, cannot push to protected branches
    }
  },
};
```

#### 4.2.4 AI Agent Roles (Level 6)

```typescript
const AI_AGENT_TIER1: RoleDefinition = {
  name: 'ai_agent_tier1',
  displayName: 'AI Agent — In-House (Tier 1)',
  level: 6,
  type: RoleType.SYSTEM,
  description: 'Trancendos-built AI agent with full ecosystem access',
  permissions: [
    'ai:generate', 'ai:review',
    'agents:communicate',              // Inter-agent messaging
    'agents:collaborate',              // Multi-agent collaboration
    'data:read',                       // Read data within scope
    'data:write',                      // Write data within scope
    'files:read',                      // Read files within scope
    'knowledge:read', 'knowledge:write',
    'observability:report',            // Report metrics and logs
  ],
  // Each agent gets ADDITIONAL permissions based on its specific function
  // (see Section 8 — Application-Level RBAC)
  per_agent_permissions: true,
  constraints: {
    rate_limit: { requests_per_minute: 100 },
    data_scope: 'organisation',        // Cannot access cross-org data
    requires_heartbeat: true,          // Must send heartbeat every 2 min
    audit_all_actions: true,           // Every action is logged
  },
};

const AI_AGENT_TIER2: RoleDefinition = {
  name: 'ai_agent_tier2',
  displayName: 'AI Agent — Free Tier (Tier 2)',
  level: 6,
  type: RoleType.SYSTEM,
  description: 'External free-tier AI provider with metered access',
  permissions: [
    'ai:generate',                     // Can generate content
    'data:read',                       // Read-only data access
  ],
  denied_permissions: [
    'ai:configure',                    // Cannot configure other AI
    'agents:communicate',              // Cannot talk to other agents
    'data:write',                      // Cannot write data directly
    'files:write',                     // Cannot write files
    'users:*', 'orgs:*',             // No user/org access
  ],
  constraints: {
    rate_limit: { requests_per_minute: 30 },
    daily_token_limit: 50000,          // Token budget per day
    data_scope: 'request_only',        // Only sees data in the request
    billing: {
      metered: true,
      cost_per_1k_tokens: 0.001,       // Small charge applied
      free_tier_limit: 10000,          // First 10K tokens free
    },
    audit_all_actions: true,
    no_pii_access: true,               // Cannot access PII fields
    no_persistent_memory: true,        // Cannot store conversation history
  },
};

const AI_AGENT_TIER3: RoleDefinition = {
  name: 'ai_agent_tier3',
  displayName: 'AI Agent — Premium (Tier 3)',
  level: 6,
  type: RoleType.SYSTEM,
  description: 'Premium AI provider with full capabilities, billed per use',
  permissions: [
    'ai:generate', 'ai:review', 'ai:analyse',
    'data:read', 'data:write',
    'files:read', 'files:write',
    'knowledge:read',
    'agents:communicate',              // Can participate in agent crews
  ],
  constraints: {
    rate_limit: { requests_per_minute: 60 },
    daily_token_limit: 500000,
    data_scope: 'organisation',
    billing: {
      metered: true,
      cost_per_1k_tokens: {
        'gpt-4o': 0.005,
        'claude-3.5-sonnet': 0.003,
        'gemini-pro': 0.00125,
      },
      requires_payment_method: true,
      spending_limit_enforced: true,
    },
    audit_all_actions: true,
    pii_access: 'with_consent',        // Can access PII if user consented
    persistent_memory: 'encrypted',    // Can store history, must be encrypted
  },
};
```

---

## 5. PERMISSION MODEL — HYBRID RBAC + ABAC

### 5.1 Why Hybrid?

Pure RBAC assigns permissions based on roles alone. This is insufficient for the Trancendos ecosystem because:

- A `developer` in the UK should not access data marked as US-only residency
- A `user` on a free subscription should not access premium AI features
- An `ai_agent` should only access data relevant to its current task
- An `admin` accessing from an untrusted device should have reduced permissions
- A `bot` spawned by an agent should inherit the agent's restrictions, not get new ones

**ABAC** adds attribute-based conditions to permission checks, enabling context-sensitive decisions.

### 5.2 Permission Evaluation Flow

```
Access Request
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│  STEP 1: IDENTIFY PRINCIPAL                              │
│  Who/what is requesting access?                          │
│  → Human user, AI agent, bot, service account, API key   │
│  → Extract: principal_id, principal_type, roles           │
└──────────────────────────┬──────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│  STEP 2: RBAC CHECK                                      │
│  Does the principal's role(s) include the permission?    │
│  → Check role hierarchy (inherited permissions)           │
│  → Check explicit denials (restrictions override allows)  │
│  → If DENIED → REJECT (short-circuit)                    │
│  → If ALLOWED → Continue to ABAC                         │
└──────────────────────────┬──────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│  STEP 3: ABAC CHECK                                      │
│  Do the contextual attributes satisfy conditions?        │
│                                                          │
│  Attributes evaluated:                                   │
│  ├── Subscription tier (free/starter/pro/enterprise)     │
│  ├── AI tier (tier1/tier2/tier3)                         │
│  ├── Time of day / day of week                           │
│  ├── IP address / geolocation                            │
│  ├── Device trust level                                  │
│  ├── MFA verification status                             │
│  ├── Risk score (0-100)                                  │
│  ├── Data classification (public/internal/confidential)  │
│  ├── Resource owner (own data vs others' data)           │
│  ├── Token budget remaining (for AI tiers)               │
│  └── Application context (which app is requesting)       │
│                                                          │
│  → If ALL conditions met → ALLOW                         │
│  → If ANY condition fails → DENY with reason             │
└──────────────────────────┬──────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│  STEP 4: SUBSCRIPTION CHECK                              │
│  Is the requested resource/feature included in the       │
│  principal's subscription?                               │
│  → Check feature flags for subscription tier             │
│  → Check service access list (user-selected services)    │
│  → If NOT subscribed → DENY with upgrade prompt          │
└──────────────────────────┬──────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│  STEP 5: AUDIT LOG                                       │
│  Record the access decision regardless of outcome        │
│  → principal_id, resource, action, decision, reason,     │
│    timestamp, ip_address, attributes_evaluated           │
└─────────────────────────────────────────────────────────┘
```

### 5.3 Permission Namespace Convention

All permissions follow the pattern: `{resource}:{action}` or `{application}:{resource}:{action}`

```
Global Permissions (no app prefix):
  users:read, users:write, users:delete, users:invite
  orgs:read, orgs:write, orgs:delete, orgs:create
  compliance:read, compliance:write, compliance:approve, compliance:override
  platform:configure, platform:destroy, platform:transfer

Application-Scoped Permissions (app prefix):
  arcadia:marketplace:read, arcadia:marketplace:list, arcadia:marketplace:purchase
  arcadia:community:read, arcadia:community:post, arcadia:community:moderate
  admin-os:services:read, admin-os:services:restart, admin-os:services:configure
  admin-os:users:manage, admin-os:config:edit, admin-os:governance:manage
  treasury:transactions:read, treasury:transactions:create, treasury:ledger:admin

AI-Scoped Permissions (ai prefix):
  ai:generate, ai:review, ai:analyse, ai:configure
  ai:tier1:access, ai:tier2:access, ai:tier3:access
  ai:agent:spawn, ai:agent:configure, ai:agent:terminate
  ai:crew:create, ai:crew:manage, ai:crew:execute
  ai:model:select, ai:model:finetune

Infrastructure Permissions:
  infra:deploy, infra:rollback, infra:scale
  secrets:read, secrets:write, secrets:rotate
  git:read, git:write, git:admin, git:deploy_key
  api_keys:create, api_keys:rotate, api_keys:revoke
  monitoring:read, monitoring:configure, monitoring:alert
```

---

## 6. AI TIERING SYSTEM — 3-TIER CLASSIFICATION

### 6.1 Tier Architecture

Drew specified three tiers of AI, which map to distinct access, billing, and permission models:

```
┌─────────────────────────────────────────────────────────────────┐
│                    AI TIERING SYSTEM                              │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  TIER 1 — IN-HOUSE AI                                       │ │
│  │  Our AI agents that we've built                              │ │
│  │                                                              │ │
│  │  Cost: FREE (zero-cost mandate)                              │ │
│  │  Access: Full ecosystem integration                          │ │
│  │  Data: Can access org data within scope                      │ │
│  │  Memory: Persistent, encrypted                               │ │
│  │  Audit: Full provenance tracking                             │ │
│  │  Spawning: Can create bots (with permission)                 │ │
│  │                                                              │ │
│  │  Agents: Cornelius, Norman, Guardian, Oracle, Sentinel,      │ │
│  │          Serenity, Prometheus, Queen, Renik, The Dr,          │ │
│  │          Porter Family, SolarScene, + infrastructure services │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  TIER 2 — FREE-TIER EXTERNAL AI                             │ │
│  │  Free tier from Hugging Face, Cloudflare AI, etc.           │ │
│  │                                                              │ │
│  │  Cost: SMALL CHARGE (metered, per-token)                    │ │
│  │  Access: Limited — request-scoped only                       │ │
│  │  Data: Cannot access PII, cannot persist data                │ │
│  │  Memory: Stateless (no conversation history)                 │ │
│  │  Audit: Full request/response logging                        │ │
│  │  Spawning: CANNOT spawn bots or agents                       │ │
│  │                                                              │ │
│  │  Providers: Hugging Face Inference, Cloudflare AI Workers,   │ │
│  │             Google AI Studio (free), Groq Cloud (free),      │ │
│  │             Ollama/Local models                              │ │
│  │                                                              │ │
│  │  Billing: First 10K tokens/day FREE                          │ │
│  │           Then £0.001 per 1K tokens                          │ │
│  │           Daily cap: 50K tokens (configurable)               │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  TIER 3 — PREMIUM EXTERNAL AI                               │ │
│  │  Primary AI providers (OpenAI, Anthropic, etc.)             │ │
│  │                                                              │ │
│  │  Cost: PREMIUM (market rate, per-token)                     │ │
│  │  Access: Full capabilities within subscription               │ │
│  │  Data: Can access data with user consent                     │ │
│  │  Memory: Encrypted persistent (provider-dependent)           │ │
│  │  Audit: Full provenance + cost tracking                      │ │
│  │  Spawning: Can participate in agent crews (not spawn)        │ │
│  │                                                              │ │
│  │  Providers: OpenAI (GPT-4o), Anthropic (Claude 3.5),        │ │
│  │             Google Vertex (Gemini Pro), Cohere, Mistral      │ │
│  │                                                              │ │
│  │  Billing: Per-token at provider rates                        │ │
│  │           Requires payment method on file                    │ │
│  │           Spending limits enforced per-user and per-org      │ │
│  │           Monthly budget caps with alerts                    │ │
│  └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### 6.2 Tier Permission Matrix

| Capability | Tier 1 (In-House) | Tier 2 (Free) | Tier 3 (Premium) |
|-----------|-------------------|---------------|------------------|
| Text generation | ✅ Unlimited | ✅ Metered | ✅ Metered |
| Code generation | ✅ Full | ✅ Basic | ✅ Full |
| Data analysis | ✅ Full | ❌ No | ✅ Full |
| Image generation | ✅ If capable | ❌ No | ✅ If capable |
| PII access | ✅ Within scope | ❌ Never | ✅ With consent |
| Persistent memory | ✅ Encrypted | ❌ Stateless | ✅ Encrypted |
| Inter-agent comms | ✅ Full | ❌ No | ✅ In crews only |
| Bot spawning | ✅ With permission | ❌ Never | ❌ Never |
| File read | ✅ Within scope | ✅ Request only | ✅ Within scope |
| File write | ✅ Within scope | ❌ No | ✅ Within scope |
| API calls | ✅ Internal APIs | ❌ No | ✅ Approved APIs |
| Knowledge base | ✅ Read/Write | ✅ Read only | ✅ Read only |
| Audit logging | ✅ Full | ✅ Full | ✅ Full |
| Cost | Free | £0.001/1K tokens | Market rate |
| Rate limit | 100 req/min | 30 req/min | 60 req/min |
| Daily token limit | Unlimited | 50K | 500K |

### 6.3 AI Tier Scoping Rules

Each AI tier has specific scoping rules that determine what data it can see:

```typescript
interface AITierScope {
  tier: 'tier1' | 'tier2' | 'tier3';
  
  data_access: {
    scope: 'full_org' | 'request_only' | 'user_consented';
    pii_access: boolean;
    financial_data: boolean;
    health_data: boolean;
    classified_data: boolean;
  };
  
  action_scope: {
    can_write_data: boolean;
    can_delete_data: boolean;
    can_spawn_agents: boolean;
    can_call_external_apis: boolean;
    can_access_secrets: boolean;
    can_modify_config: boolean;
  };
  
  billing: {
    metered: boolean;
    cost_per_1k_tokens: number;
    free_tier_tokens: number;
    daily_limit: number;
    monthly_budget_cap: number;
    requires_payment_method: boolean;
  };
  
  compliance: {
    gdpr_data_processing_agreement: boolean;
    data_residency_enforced: boolean;
    audit_all_requests: boolean;
    provenance_tracking: boolean;
    retention_period_days: number;
  };
}
```

### 6.4 AI Routing with Tier Awareness

The existing multi-AI routing system must be enhanced to respect tier permissions:

```python
# Enhanced AI routing with tier awareness
async def route_ai_request(
    request: AIRequest,
    user: CurrentUser,
    subscription: UserSubscription,
) -> AIResponse:
    
    # 1. Check user's AI tier access
    allowed_tiers = get_allowed_tiers(user.roles, subscription)
    
    # 2. Check requested model's tier
    model_tier = get_model_tier(request.model)
    if model_tier not in allowed_tiers:
        raise PermissionError(f"Your subscription does not include Tier {model_tier} AI access")
    
    # 3. Check token budget
    remaining_budget = get_remaining_budget(user.id, model_tier)
    estimated_tokens = estimate_tokens(request.prompt)
    if estimated_tokens > remaining_budget:
        raise BudgetExceededError(f"Token budget exceeded. Remaining: {remaining_budget}")
    
    # 4. Apply data scoping based on tier
    scoped_context = apply_tier_scoping(request.context, model_tier, user)
    
    # 5. Route to provider with fallback
    response = await execute_with_fallback(
        request=request,
        context=scoped_context,
        tier=model_tier,
        fallback_chain=get_fallback_chain(model_tier),
    )
    
    # 6. Record usage for billing
    await record_usage(user.id, model_tier, response.tokens_used, response.model)
    
    # 7. Audit log
    await audit_log(
        principal=user.id,
        action='ai:generate',
        resource=f'ai:{model_tier}:{response.model}',
        tokens=response.tokens_used,
        cost=calculate_cost(model_tier, response.tokens_used),
    )
    
    return response
```

---

## 7. SUBSCRIPTION-BASED SERVICE ACCESS

### 7.1 Subscription Tiers

Users may not want access to all services. The subscription model allows users to choose which services, applications, and features they want:

```
┌─────────────────────────────────────────────────────────────────┐
│                    SUBSCRIPTION TIERS                             │
│                                                                   │
│  FREE TIER (£0/month)                                            │
│  ├── Arcadia Community (read-only)                               │
│  ├── Basic AI (Tier 1 in-house agents only)                      │
│  ├── Infinity-One Profile                                        │
│  ├── 1 GB storage                                                │
│  └── Community support                                           │
│                                                                   │
│  STARTER TIER (£X/month)                                         │
│  ├── Everything in Free                                          │
│  ├── Arcadia Community (full participation)                      │
│  ├── Arcadia Marketplace (buy/sell)                              │
│  ├── Tier 2 AI access (10K free tokens/day)                      │
│  ├── Serenity AI (wellness tools)                                │
│  ├── Norman AI (task management)                                 │
│  ├── 10 GB storage                                               │
│  └── Email support                                               │
│                                                                   │
│  PROFESSIONAL TIER (£XX/month)                                   │
│  ├── Everything in Starter                                       │
│  ├── All Tier 1 AI agents                                        │
│  ├── Tier 2 AI access (50K tokens/day)                           │
│  ├── Tier 3 AI access (pay-per-use)                              │
│  ├── Cornelius AI (financial advisor)                             │
│  ├── Oracle AI (predictions)                                     │
│  ├── Prometheus AI (analytics)                                   │
│  ├── Developer tools (repos, builds)                             │
│  ├── 100 GB storage                                              │
│  └── Priority support                                            │
│                                                                   │
│  ENTERPRISE TIER (Custom)                                        │
│  ├── Everything in Professional                                  │
│  ├── All AI agents unrestricted                                  │
│  ├── Tier 3 AI with volume discounts                             │
│  ├── Custom AI agent development                                 │
│  ├── Admin OS Portal access                                      │
│  ├── Compliance Centre access                                    │
│  ├── SSO/SAML integration                                        │
│  ├── Unlimited storage                                           │
│  ├── SLA-backed support                                          │
│  └── Dedicated account manager                                   │
│                                                                   │
│  SOVEREIGN TIER (Custom — Government/Regulated)                  │
│  ├── Everything in Enterprise                                    │
│  ├── Data residency controls                                     │
│  ├── Air-gapped deployment option                                │
│  ├── Custom compliance frameworks                                │
│  ├── Quantum-safe encryption                                     │
│  └── Dedicated infrastructure                                    │
└─────────────────────────────────────────────────────────────────┘
```

### 7.2 À La Carte Service Selection

Within their subscription tier, users can additionally select which specific services they want:

```typescript
interface UserServiceSubscription {
  user_id: string;
  subscription_tier: 'free' | 'starter' | 'professional' | 'enterprise' | 'sovereign';
  
  // Services included by tier (cannot be removed)
  tier_included_services: string[];
  
  // Additional services selected by user (à la carte)
  selected_services: ServiceSelection[];
  
  // Services explicitly declined (user doesn't want them)
  declined_services: string[];
  
  // AI tier access
  ai_access: {
    tier1: boolean;  // Always true (in-house)
    tier2: boolean;  // Based on subscription
    tier3: boolean;  // Based on subscription + payment method
    tier2_daily_limit: number;
    tier3_monthly_budget: number;
  };
}

interface ServiceSelection {
  service_id: string;           // e.g., 'cornelius-ai', 'arcadia', 'treasury'
  enabled: boolean;
  selected_at: Date;
  features: string[];           // Specific features within the service
  custom_config?: Record<string, unknown>;
}
```

### 7.3 Feature Flags Integration

Subscription-based access is enforced through feature flags:

```typescript
// Permission check with subscription awareness
async function checkAccess(
  principal: Principal,
  resource: string,
  action: string,
  context: AccessContext,
): Promise<AccessDecision> {
  
  // 1. RBAC check
  const rbacResult = await checkRBAC(principal, resource, action);
  if (rbacResult.denied) return rbacResult;
  
  // 2. ABAC check
  const abacResult = await checkABAC(principal, resource, action, context);
  if (abacResult.denied) return abacResult;
  
  // 3. Subscription check
  const subscription = await getUserSubscription(principal.id);
  const serviceId = extractServiceId(resource);
  
  if (!subscription.hasAccessTo(serviceId)) {
    return {
      allowed: false,
      reason: 'subscription_required',
      message: `This feature requires a ${getRequiredTier(serviceId)} subscription`,
      upgrade_url: '/infinity-one/subscription/upgrade',
    };
  }
  
  // 4. Feature flag check
  const featureFlag = await getFeatureFlag(resource, action);
  if (featureFlag && !featureFlag.isEnabledFor(principal, subscription)) {
    return {
      allowed: false,
      reason: 'feature_not_available',
      message: featureFlag.disabledMessage,
    };
  }
  
  return { allowed: true };
}
```

---

## 8. APPLICATION-LEVEL RBAC

### 8.1 Per-Application Permission Namespaces

Each application in the ecosystem has its own permission namespace. This means a user can be an admin in Arcadia but only a viewer in the Treasury:

```typescript
interface ApplicationPermissions {
  // Arcadia (Community + Marketplace)
  'arcadia': {
    'marketplace:browse': 'View marketplace listings',
    'marketplace:list': 'Create marketplace listings',
    'marketplace:purchase': 'Purchase items',
    'marketplace:moderate': 'Moderate listings',
    'marketplace:admin': 'Full marketplace administration',
    'community:read': 'Read community posts',
    'community:post': 'Create community posts',
    'community:comment': 'Comment on posts',
    'community:moderate': 'Moderate community content',
    'community:admin': 'Full community administration',
    'events:view': 'View events',
    'events:create': 'Create events',
    'events:manage': 'Manage events',
    'recovery:access': 'Access recovery tools',
    'recovery:configure': 'Configure recovery programmes',
  };
  
  // Admin OS Portal
  'admin-os': {
    'dashboard:view': 'View admin dashboard',
    'services:read': 'View service status',
    'services:restart': 'Restart services',
    'services:configure': 'Configure services',
    'users:view': 'View user list',
    'users:manage': 'Manage users (roles, suspend, etc.)',
    'users:invite': 'Invite new users',
    'ai:view': 'View AI agent status',
    'ai:configure': 'Configure AI routing and agents',
    'ai:spawn': 'Spawn new AI agents/bots',
    'compliance:view': 'View compliance dashboards',
    'compliance:manage': 'Manage compliance controls',
    'config:view': 'View platform configuration',
    'config:edit': 'Edit platform configuration (low-code)',
    'governance:view': 'View governance centre',
    'governance:manage': 'Manage governance policies',
    'analytics:view': 'View analytics dashboards',
    'security:view': 'View security centre',
    'security:manage': 'Manage security settings',
    'ecosystem:view': 'View ecosystem overview',
  };
  
  // Treasury (Financial)
  'treasury': {
    'balance:view': 'View account balances',
    'transactions:view': 'View transaction history',
    'transactions:create': 'Create transactions',
    'transactions:approve': 'Approve transactions',
    'ledger:view': 'View ledger entries',
    'ledger:admin': 'Administer ledger',
    'reports:generate': 'Generate financial reports',
    'audit:view': 'View financial audit trail',
  };
  
  // Per AI Agent
  'cornelius-ai': {
    'advice:request': 'Request financial advice',
    'analysis:run': 'Run financial analysis',
    'portfolio:view': 'View portfolio data',
    'portfolio:manage': 'Manage portfolio',
    'reports:generate': 'Generate financial reports',
  };
  
  // ... similar for each of the 22 agents
}
```

### 8.2 Application Access Assignment

Users are assigned application-level roles through the Admin Portal:

```typescript
interface UserApplicationAccess {
  user_id: string;
  application_id: string;
  roles: string[];                    // Application-specific roles
  permissions: string[];              // Direct permission grants
  denied_permissions: string[];       // Explicit denials
  granted_at: Date;
  granted_by: string;
  expires_at?: Date;                  // Time-limited access
  conditions?: ABACCondition[];       // Additional conditions
}
```

---

## 9. NON-HUMAN IDENTITY MANAGEMENT

### 9.1 NHI (Non-Human Identity) Lifecycle

Based on industry best practices (GitGuardian 2025, Cerbos 2025), non-human identities require the same lifecycle management as human identities:

```
NHI Lifecycle
├── Registration
│   ├── Agent registers with Agent Manager (POST /api/v1/agents/register)
│   ├── Receives unique NHI ID (nhi_agent_{uuid})
│   ├── Assigned default role based on agent type
│   ├── Issued short-lived service token (15-min TTL)
│   └── Registered in Infinity-One as NHI principal
│
├── Authentication
│   ├── Service-to-service: mTLS or JWT with JTI
│   ├── Agent-to-platform: Agent SDK token (auto-refresh)
│   ├── Bot-to-platform: Inherited parent token (scoped down)
│   └── API key: Scoped, rotatable, revocable
│
├── Authorization
│   ├── Same RBAC + ABAC pipeline as human principals
│   ├── Additional constraints: rate limits, token budgets, data scoping
│   ├── Tier-based restrictions (Tier 1/2/3)
│   └── Per-request permission evaluation (no cached decisions)
│
├── Monitoring
│   ├── Heartbeat requirement (every 2 minutes)
│   ├── Anomaly detection (unusual access patterns)
│   ├── Token usage tracking
│   ├── Error rate monitoring
│   └── Automatic degradation on anomaly
│
├── Rotation
│   ├── Service tokens: Auto-rotate every 15 minutes
│   ├── API keys: Mandatory rotation every 90 days
│   ├── Secrets: Rotation via Vault integration
│   └── Certificates: Auto-renewal via ACME
│
└── Decommission
    ├── Graceful shutdown (drain active tasks)
    ├── Token revocation (immediate)
    ├── Audit log preservation (10-year CRA retention)
    ├── Data cleanup (remove agent-specific data)
    └── NHI record archived (not deleted)
```

### 9.2 NHI Identity Record

```typescript
interface NonHumanIdentity {
  id: string;                          // nhi_{type}_{uuid}
  type: 'ai_agent' | 'bot' | 'service_account' | 'api_key' | 'webhook';
  name: string;
  description: string;
  
  // Ownership
  owner_id: string;                    // Human or NHI that created this
  owner_type: 'human' | 'nhi';
  organisation_id: string;
  
  // Classification
  tier: 'tier1' | 'tier2' | 'tier3' | 'infrastructure';
  sensitivity_level: 'low' | 'medium' | 'high' | 'critical';
  
  // Access
  roles: string[];
  permissions: string[];
  denied_permissions: string[];
  application_access: ApplicationAccess[];
  
  // Constraints
  rate_limit: RateLimit;
  token_budget: TokenBudget;
  data_scope: DataScope;
  ip_allowlist?: string[];
  
  // Credentials
  credential_type: 'jwt' | 'api_key' | 'mtls' | 'oauth_client';
  credential_expires_at: Date;
  last_credential_rotation: Date;
  
  // Lifecycle
  status: 'active' | 'degraded' | 'suspended' | 'decommissioned';
  created_at: Date;
  last_active_at: Date;
  decommissioned_at?: Date;
  
  // Spawning (if this NHI was created by another NHI)
  spawned_by?: string;                 // Parent NHI ID
  spawn_chain: string[];               // Full ancestry chain
  max_spawn_depth: number;             // How deep can this NHI spawn
  spawned_entities: string[];          // Children NHI IDs
}
```

---

## 10. BOT & AGENT SPAWNING PERMISSIONS

### 10.1 Spawning Rules

When an AI agent creates a bot or sub-agent, strict rules apply:

```
SPAWNING PERMISSION MATRIX
─────────────────────────────────────────────────────────────
Spawner              │ Can Spawn?  │ Max Depth │ Restrictions
─────────────────────┼─────────────┼───────────┼─────────────
Continuity Guardian  │ ✅ Yes      │ Unlimited │ None
Super Admin          │ ✅ Yes      │ 3 levels  │ Audit required
Restricted Admin     │ ⚠️ Limited  │ 1 level   │ Approval required
Developer            │ ⚠️ Limited  │ 1 level   │ Dev env only
Tier 1 AI Agent      │ ✅ Yes      │ 2 levels  │ Inherits restrictions
Tier 2 AI Agent      │ ❌ No       │ 0         │ Cannot spawn
Tier 3 AI Agent      │ ❌ No       │ 0         │ Cannot spawn
Bot (AI-Spawned)     │ ⚠️ Limited  │ 1 level   │ Parent approval
Service Account      │ ❌ No       │ 0         │ Cannot spawn
API Key              │ ❌ No       │ 0         │ Cannot spawn
─────────────────────────────────────────────────────────────
```

### 10.2 Spawning Inheritance Model

When an entity spawns a child, the child's permissions are **always a subset** of the parent's:

```typescript
async function spawnBot(
  parent: NonHumanIdentity,
  spawnRequest: SpawnRequest,
): Promise<NonHumanIdentity> {
  
  // 1. Check parent has spawning permission
  if (!await hasPermission(parent, 'ai:agent:spawn')) {
    throw new PermissionError('Parent does not have spawning permission');
  }
  
  // 2. Check spawn depth limit
  if (parent.spawn_chain.length >= parent.max_spawn_depth) {
    throw new SpawnDepthError('Maximum spawn depth exceeded');
  }
  
  // 3. Validate requested permissions are subset of parent's
  const parentPerms = await getEffectivePermissions(parent);
  for (const perm of spawnRequest.requested_permissions) {
    if (!parentPerms.includes(perm)) {
      throw new PermissionError(
        `Cannot grant permission '${perm}' — parent does not have it`
      );
    }
  }
  
  // 4. Apply mandatory restrictions
  const childPermissions = spawnRequest.requested_permissions.filter(
    p => !SPAWN_DENIED_PERMISSIONS.includes(p)
  );
  
  // 5. Create child NHI with inherited restrictions
  const child: NonHumanIdentity = {
    id: `nhi_bot_${generateUUID()}`,
    type: 'bot',
    owner_id: parent.id,
    owner_type: 'nhi',
    tier: parent.tier,  // Same tier as parent
    roles: ['bot_spawned'],
    permissions: childPermissions,
    denied_permissions: [
      ...parent.denied_permissions,
      'ai:agent:spawn',  // Bots cannot spawn by default
      'platform:configure',
      'users:write',
      'compliance:approve',
    ],
    spawn_chain: [...parent.spawn_chain, parent.id],
    max_spawn_depth: Math.max(0, parent.max_spawn_depth - 1),
    rate_limit: {
      // Child gets HALF the parent's rate limit
      requests_per_minute: Math.floor(parent.rate_limit.requests_per_minute / 2),
    },
    token_budget: {
      // Child gets 25% of parent's remaining budget
      daily_limit: Math.floor(parent.token_budget.daily_limit * 0.25),
    },
    // ... other fields
  };
  
  // 6. Audit log
  await auditLog({
    action: 'nhi:spawn',
    actor: parent.id,
    target: child.id,
    details: {
      spawn_depth: child.spawn_chain.length,
      permissions_granted: childPermissions.length,
      parent_permissions: parentPerms.length,
    },
  });
  
  return child;
}

// Permissions that spawned bots can NEVER have
const SPAWN_DENIED_PERMISSIONS = [
  'platform:destroy',
  'platform:transfer',
  'encryption:master_key',
  'audit:purge',
  'role:create_system',
  'compliance:override',
  'users:delete',
  'orgs:delete',
];
```

---

## 11. API & GIT CONNECTION PERMISSIONS

### 11.1 API Key Scoping

Every API key is scoped to specific permissions, resources, and conditions:

```typescript
interface ScopedAPIKey {
  id: string;
  key_hash: string;                    // SHA-256 hash (never store plaintext)
  name: string;
  description: string;
  
  // Ownership
  created_by: string;                  // User or NHI ID
  organisation_id: string;
  
  // Scoping
  permissions: string[];               // Explicit permission list
  allowed_resources: string[];         // Resource patterns (e.g., 'arcadia:*')
  allowed_actions: string[];           // Action patterns
  allowed_ips: string[];               // IP allowlist
  allowed_origins: string[];           // CORS origins
  
  // Limits
  rate_limit: {
    requests_per_minute: number;
    requests_per_hour: number;
    requests_per_day: number;
  };
  
  // Lifecycle
  status: 'active' | 'suspended' | 'revoked' | 'expired';
  created_at: Date;
  expires_at: Date;                    // MANDATORY expiry
  last_used_at?: Date;
  last_rotated_at: Date;
  rotation_period_days: number;        // Auto-rotation schedule
  
  // Audit
  usage_count: number;
  last_ip: string;
  last_user_agent: string;
}
```

### 11.2 Git Connection Permissions

Git connections (GitHub Apps, deploy keys, webhooks) have their own permission model:

```typescript
interface GitConnection {
  id: string;
  type: 'github_app' | 'deploy_key' | 'webhook' | 'oauth_token';
  name: string;
  
  // Scoping
  repositories: string[];              // Which repos this connection can access
  permissions: {
    contents: 'read' | 'write' | 'none';
    pull_requests: 'read' | 'write' | 'none';
    issues: 'read' | 'write' | 'none';
    actions: 'read' | 'write' | 'none';
    deployments: 'read' | 'write' | 'none';
    environments: 'read' | 'write' | 'none';
    secrets: 'read' | 'write' | 'none';
    webhooks: 'read' | 'write' | 'none';
  };
  
  // Restrictions
  branch_restrictions: string[];       // Only these branches
  environment_restrictions: string[];  // Only these environments
  ip_allowlist: string[];
  
  // Lifecycle
  status: 'active' | 'suspended' | 'revoked';
  created_by: string;
  created_at: Date;
  expires_at?: Date;
  last_used_at?: Date;
  
  // Audit
  webhook_secret_hash?: string;
  last_delivery_status?: string;
}
```

---

## 12. ADMIN RESTRICTION & SELECTIVE ELEVATION

### 12.1 The Restriction Override Model

Drew specifically asked for the ability to give some admins limitations and hold certain permissions to a select few. This is implemented through a **restriction override** system:

```
PERMISSION EVALUATION WITH RESTRICTIONS
────────────────────────────────────────

Role Permissions (ALLOW)
    │
    ▼
Restriction Overrides (DENY)  ← These override role permissions
    │
    ▼
Selective Elevations (ALLOW)  ← These override restrictions for select users
    │
    ▼
Final Decision
```

### 12.2 Restriction Profiles

Restriction profiles are pre-defined sets of limitations that can be applied to any admin:

```typescript
const RESTRICTION_PROFILES: Record<string, RestrictionProfile> = {
  
  'no_financial': {
    name: 'No Financial Access',
    description: 'Cannot access any financial data or operations',
    denied_permissions: [
      'treasury:*', 'billing:*', 'cornelius-ai:*', 'dorris-ai:*',
      'arcadia:marketplace:purchase', 'arcadia:marketplace:admin',
    ],
  },
  
  'no_ai_config': {
    name: 'No AI Configuration',
    description: 'Cannot modify AI routing, agents, or tier settings',
    denied_permissions: [
      'ai:configure', 'ai:tier_modify', 'ai:agent:spawn',
      'ai:crew:create', 'ai:crew:manage', 'ai:model:finetune',
      'admin-os:ai:configure',
    ],
  },
  
  'read_only_admin': {
    name: 'Read-Only Administrator',
    description: 'Can view everything but cannot modify anything',
    denied_permissions: [
      '*:write', '*:delete', '*:create', '*:configure',
      '*:manage', '*:approve', '*:admin',
    ],
    allowed_permissions: [
      '*:read', '*:view', '*:list',
    ],
  },
  
  'user_management_only': {
    name: 'User Management Only',
    description: 'Can only manage users, nothing else',
    denied_permissions: ['*'],  // Deny everything
    allowed_permissions: [
      'users:read', 'users:write', 'users:invite',
      'admin-os:users:view', 'admin-os:users:manage', 'admin-os:users:invite',
      'admin-os:dashboard:view',
    ],
  },
  
  'compliance_only': {
    name: 'Compliance Management Only',
    description: 'Can only manage compliance and governance',
    denied_permissions: ['*'],
    allowed_permissions: [
      'compliance:*', 'admin-os:compliance:*', 'admin-os:governance:*',
      'admin-os:dashboard:view', 'admin-os:analytics:view',
    ],
  },
};
```

### 12.3 Select-Few Permissions

Certain permissions are so sensitive that they can only be held by explicitly named individuals:

```typescript
const SELECT_FEW_PERMISSIONS: Record<string, SelectFewConfig> = {
  'platform:destroy': {
    description: 'Delete entire platform data',
    max_holders: 1,
    current_holders: ['drew_porter_id'],
    requires_mfa: true,
    requires_approval: false,  // Guardian doesn't need approval
    cool_down_hours: 72,       // 72-hour cool-down before execution
  },
  
  'platform:transfer': {
    description: 'Transfer platform ownership',
    max_holders: 1,
    current_holders: ['drew_porter_id'],
    requires_mfa: true,
    requires_approval: true,   // Requires legal review
    cool_down_hours: 168,      // 7-day cool-down
  },
  
  'encryption:master_key': {
    description: 'Access master encryption keys',
    max_holders: 2,
    current_holders: ['drew_porter_id'],
    requires_mfa: true,
    requires_approval: false,
    audit_level: 'critical',   // Every access triggers alert
  },
  
  'ai:tier_modify': {
    description: 'Change AI tier classifications and billing',
    max_holders: 3,
    current_holders: ['drew_porter_id'],
    requires_mfa: true,
    requires_approval: false,
  },
  
  'compliance:override': {
    description: 'Override compliance controls',
    max_holders: 2,
    current_holders: ['drew_porter_id'],
    requires_mfa: true,
    requires_approval: true,   // Requires auditor sign-off
    audit_level: 'critical',
  },
  
  'role:create_system': {
    description: 'Create new system-level roles',
    max_holders: 2,
    current_holders: ['drew_porter_id'],
    requires_mfa: true,
    requires_approval: false,
  },
};
```

---

## 13. AUDIT, COMPLIANCE & EVIDENCE TRAIL

### 13.1 Audit Log Schema

Every access decision — human or machine — is logged:

```typescript
interface AuditLogEntry {
  id: string;                          // UUID v7 (time-sortable)
  timestamp: Date;
  
  // Who
  principal_id: string;
  principal_type: 'human' | 'ai_agent' | 'bot' | 'service_account' | 'api_key';
  principal_name: string;
  principal_roles: string[];
  
  // On behalf of (for delegated access)
  delegated_by?: string;               // If acting on behalf of another principal
  delegation_chain?: string[];         // Full delegation chain
  
  // What
  action: string;                      // Permission string (e.g., 'arcadia:marketplace:purchase')
  resource_type: string;
  resource_id: string;
  
  // Decision
  decision: 'allow' | 'deny';
  decision_reason: string;             // Why allowed/denied
  decision_factors: {
    rbac_result: 'allow' | 'deny';
    abac_result: 'allow' | 'deny';
    subscription_result: 'allow' | 'deny';
    restriction_applied?: string;      // Which restriction profile blocked
    select_few_check?: boolean;        // Was select-few check required
  };
  
  // Context
  ip_address: string;
  user_agent: string;
  geolocation?: GeoLocation;
  device_trust_level?: string;
  mfa_verified: boolean;
  risk_score: number;
  session_id: string;
  
  // AI-specific
  ai_tier?: string;
  tokens_used?: number;
  cost_incurred?: number;
  model_used?: string;
  
  // Compliance
  data_classification?: string;
  gdpr_relevant: boolean;
  retention_until: Date;               // CRA 10-year retention
  sha256_hash: string;                 // Integrity verification
}
```

### 13.2 TIGA Compliance Mapping

Every permission maps to a TIGA Foundation Framework control:

| Permission Category | FF Control | Logic Level Target |
|-------------------|------------|-------------------|
| Authentication | FF-CTRL-001 (Identity Verification) | LL3 (Automated) |
| Role Assignment | FF-CTRL-002 (Access Control) | LL3 (Automated) |
| AI Tier Access | FF-CTRL-015 (AI Governance) | LL4 (Continuous) |
| Data Scoping | FF-CTRL-008 (Data Classification) | LL3 (Automated) |
| Bot Spawning | FF-CTRL-016 (Agent Lifecycle) | LL4 (Continuous) |
| API Key Management | FF-CTRL-009 (Credential Management) | LL3 (Automated) |
| Audit Logging | FF-CTRL-010 (Audit Trail) | LL4 (Continuous) |
| Subscription Gating | FF-CTRL-020 (Service Access) | LL3 (Automated) |
| Restriction Overrides | FF-CTRL-003 (Least Privilege) | LL4 (Continuous) |
| Select-Few Permissions | FF-CTRL-004 (Separation of Duties) | LL5 (Predictive) |

---

## 14. DATABASE SCHEMA

### 14.1 Core IAM Tables

```sql
-- Extended roles table with restrictions
CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) UNIQUE NOT NULL,
    display_name VARCHAR(200) NOT NULL,
    description TEXT,
    type VARCHAR(20) NOT NULL DEFAULT 'custom',  -- system, organisation, application, custom, temporal, emergency
    level INTEGER NOT NULL DEFAULT 5,
    parent_role_id UUID REFERENCES roles(id),     -- Inheritance
    max_users INTEGER,                             -- NULL = unlimited
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID
);

-- Permissions with application scoping
CREATE TABLE permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) UNIQUE NOT NULL,             -- 'arcadia:marketplace:read'
    display_name VARCHAR(300),
    description TEXT,
    application_id VARCHAR(100),                   -- NULL = global
    resource VARCHAR(100) NOT NULL,
    action VARCHAR(50) NOT NULL,
    scope VARCHAR(20) DEFAULT 'organisation',      -- global, organisation, team, personal, application
    risk_level VARCHAR(20) DEFAULT 'low',
    requires_mfa BOOLEAN DEFAULT FALSE,
    is_select_few BOOLEAN DEFAULT FALSE,
    max_holders INTEGER,                           -- For select-few permissions
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Role-permission assignments
CREATE TABLE role_permissions (
    role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID REFERENCES permissions(id) ON DELETE CASCADE,
    effect VARCHAR(10) NOT NULL DEFAULT 'allow',   -- 'allow' or 'deny'
    conditions JSONB,                               -- ABAC conditions
    PRIMARY KEY (role_id, permission_id)
);

-- User-role assignments (with per-application scoping)
CREATE TABLE user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    role_id UUID NOT NULL REFERENCES roles(id),
    application_id VARCHAR(100),                   -- NULL = global role
    organisation_id UUID,
    granted_at TIMESTAMPTZ DEFAULT NOW(),
    granted_by UUID,
    expires_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT TRUE,
    UNIQUE(user_id, role_id, application_id)
);

-- Restriction profiles
CREATE TABLE restriction_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) UNIQUE NOT NULL,
    display_name VARCHAR(200),
    description TEXT,
    denied_permissions TEXT[] NOT NULL,             -- Permission patterns
    allowed_permissions TEXT[],                     -- Override patterns
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User restriction assignments
CREATE TABLE user_restrictions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    restriction_profile_id UUID REFERENCES restriction_profiles(id),
    custom_denied_permissions TEXT[],               -- Additional per-user denials
    custom_allowed_permissions TEXT[],              -- Additional per-user allows
    reason TEXT,
    applied_by UUID,
    applied_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT TRUE
);

-- Non-human identities
CREATE TABLE non_human_identities (
    id VARCHAR(100) PRIMARY KEY,                   -- nhi_{type}_{uuid}
    type VARCHAR(30) NOT NULL,                     -- ai_agent, bot, service_account, api_key
    name VARCHAR(200) NOT NULL,
    description TEXT,
    owner_id VARCHAR(100) NOT NULL,                -- Human or NHI ID
    owner_type VARCHAR(10) NOT NULL,               -- human, nhi
    organisation_id UUID,
    tier VARCHAR(20),                              -- tier1, tier2, tier3, infrastructure
    sensitivity_level VARCHAR(20) DEFAULT 'medium',
    status VARCHAR(20) DEFAULT 'active',
    spawned_by VARCHAR(100),                       -- Parent NHI ID
    spawn_chain TEXT[],                            -- Full ancestry
    max_spawn_depth INTEGER DEFAULT 0,
    rate_limit JSONB,
    token_budget JSONB,
    data_scope JSONB,
    credential_type VARCHAR(20),
    credential_expires_at TIMESTAMPTZ,
    last_credential_rotation TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_active_at TIMESTAMPTZ,
    decommissioned_at TIMESTAMPTZ
);

-- NHI role assignments
CREATE TABLE nhi_roles (
    nhi_id VARCHAR(100) REFERENCES non_human_identities(id),
    role_id UUID REFERENCES roles(id),
    application_id VARCHAR(100),
    granted_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (nhi_id, role_id, application_id)
);

-- Subscription tiers
CREATE TABLE subscription_tiers (
    id VARCHAR(50) PRIMARY KEY,                    -- free, starter, professional, enterprise, sovereign
    name VARCHAR(100) NOT NULL,
    description TEXT,
    price_monthly DECIMAL(10,2),
    included_services TEXT[] NOT NULL,
    included_ai_tiers TEXT[] NOT NULL,
    storage_limit_gb INTEGER,
    ai_tier2_daily_tokens INTEGER,
    ai_tier3_monthly_budget DECIMAL(10,2),
    max_users INTEGER,
    features JSONB,
    is_active BOOLEAN DEFAULT TRUE
);

-- User subscriptions
CREATE TABLE user_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    tier_id VARCHAR(50) REFERENCES subscription_tiers(id),
    selected_services TEXT[],                      -- À la carte selections
    declined_services TEXT[],
    ai_tier2_enabled BOOLEAN DEFAULT FALSE,
    ai_tier3_enabled BOOLEAN DEFAULT FALSE,
    ai_tier3_monthly_budget DECIMAL(10,2),
    payment_method_id VARCHAR(100),
    status VARCHAR(20) DEFAULT 'active',
    started_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ
);

-- AI usage tracking (for billing)
CREATE TABLE ai_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    nhi_id VARCHAR(100),                           -- If used by NHI
    ai_tier VARCHAR(10) NOT NULL,
    provider VARCHAR(50) NOT NULL,
    model VARCHAR(100) NOT NULL,
    tokens_input INTEGER NOT NULL,
    tokens_output INTEGER NOT NULL,
    cost DECIMAL(10,6),
    request_id VARCHAR(100),
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Scoped API keys
CREATE TABLE scoped_api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key_hash VARCHAR(64) NOT NULL,                 -- SHA-256
    key_prefix VARCHAR(10) NOT NULL,               -- First 10 chars for identification
    name VARCHAR(200) NOT NULL,
    description TEXT,
    created_by UUID NOT NULL,
    organisation_id UUID,
    permissions TEXT[] NOT NULL,
    allowed_ips TEXT[],
    allowed_origins TEXT[],
    rate_limit JSONB,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    last_used_at TIMESTAMPTZ,
    last_rotated_at TIMESTAMPTZ,
    rotation_period_days INTEGER DEFAULT 90,
    usage_count BIGINT DEFAULT 0
);

-- Git connections
CREATE TABLE git_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(20) NOT NULL,                     -- github_app, deploy_key, webhook, oauth_token
    name VARCHAR(200) NOT NULL,
    repositories TEXT[],
    permissions JSONB NOT NULL,
    branch_restrictions TEXT[],
    environment_restrictions TEXT[],
    ip_allowlist TEXT[],
    status VARCHAR(20) DEFAULT 'active',
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    webhook_secret_hash VARCHAR(64)
);

-- Comprehensive audit log
CREATE TABLE iam_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    principal_id VARCHAR(100) NOT NULL,
    principal_type VARCHAR(30) NOT NULL,
    principal_roles TEXT[],
    delegated_by VARCHAR(100),
    action VARCHAR(200) NOT NULL,
    resource_type VARCHAR(100),
    resource_id VARCHAR(200),
    decision VARCHAR(10) NOT NULL,                 -- allow, deny
    decision_reason TEXT,
    decision_factors JSONB,
    ip_address INET,
    user_agent TEXT,
    geolocation JSONB,
    mfa_verified BOOLEAN,
    risk_score INTEGER,
    session_id VARCHAR(100),
    ai_tier VARCHAR(10),
    tokens_used INTEGER,
    cost_incurred DECIMAL(10,6),
    model_used VARCHAR(100),
    data_classification VARCHAR(20),
    gdpr_relevant BOOLEAN DEFAULT FALSE,
    retention_until TIMESTAMPTZ,
    sha256_hash VARCHAR(64)
);

-- Indexes for performance
CREATE INDEX idx_audit_principal ON iam_audit_log(principal_id, timestamp DESC);
CREATE INDEX idx_audit_action ON iam_audit_log(action, timestamp DESC);
CREATE INDEX idx_audit_decision ON iam_audit_log(decision, timestamp DESC);
CREATE INDEX idx_user_roles_user ON user_roles(user_id, is_active);
CREATE INDEX idx_nhi_status ON non_human_identities(status, type);
CREATE INDEX idx_ai_usage_user ON ai_usage(user_id, timestamp DESC);
CREATE INDEX idx_api_keys_hash ON scoped_api_keys(key_hash);
```

---

## 15. IMPLEMENTATION PRIORITY MATRIX

| Priority | Component | Complexity | Dependencies | Phase |
|----------|-----------|-----------|--------------|-------|
| P0 | Core role hierarchy (expanded roles) | Medium | Database schema | Phase 1 |
| P0 | Permission evaluation engine (RBAC + ABAC) | High | Roles, permissions tables | Phase 1 |
| P0 | Developer role implementation | Low | Role hierarchy | Phase 1 |
| P1 | AI tier classification system | Medium | NHI tables, AI router | Phase 2 |
| P1 | AI tier scoping and billing hooks | High | AI tier system, usage tracking | Phase 2 |
| P1 | Non-human identity management | Medium | NHI tables | Phase 2 |
| P1 | Admin restriction profiles | Medium | Restriction tables | Phase 2 |
| P1 | Select-few permissions | Low | Permission table extension | Phase 2 |
| P2 | Subscription tier system | High | Subscription tables, feature flags | Phase 3 |
| P2 | À la carte service selection | Medium | Subscription system | Phase 3 |
| P2 | Application-level RBAC | High | Per-app permission namespaces | Phase 3 |
| P2 | Bot spawning permission engine | High | NHI system, inheritance model | Phase 3 |
| P3 | Scoped API key management | Medium | API key tables | Phase 4 |
| P3 | Git connection permissions | Medium | Git connection tables | Phase 4 |
| P3 | AI usage billing and metering | High | Usage tracking, payment integration | Phase 4 |
| P3 | Comprehensive audit dashboard | Medium | Audit log tables | Phase 4 |

---

## 16. FUTURE HORIZON LOG

| # | Item | Priority | Complexity |
|---|------|----------|------------|
| 1 | SCIM 2.0 provisioning for enterprise SSO | Medium | High |
| 2 | OAuth 2.1 authorization server for MCP protocol | Medium | High |
| 3 | Machine-to-machine (M2M) OAuth for agent-to-agent auth | High | Medium |
| 4 | Cerbos-style policy decision point (PDP) for externalized auth | Medium | High |
| 5 | Attribute-based encryption (ABE) for data-level access control | Low | Very High |
| 6 | Just-in-time (JIT) access provisioning for temporal elevation | Medium | Medium |
| 7 | Continuous adaptive risk and trust assessment (CARTA) | Low | Very High |
| 8 | Decentralized identity (DID) verification via W3C standards | Low | High |
| 9 | Zero-knowledge proof-based permission verification | Low | Very High |
| 10 | AI-driven anomaly detection for access pattern analysis | Medium | High |
| 11 | Cross-organisation federation with trust boundaries | Medium | High |
| 12 | Hardware security module (HSM) integration for key management | Low | High |
| 13 | Biometric continuous authentication (behavioral) | Low | Very High |
| 14 | Quantum-safe token signing (CRYSTALS-Dilithium) | Low | Very High |
| 15 | Agent reputation scoring based on historical behavior | Medium | Medium |

---

## 17. SIGN-OFF

### Approval Required Before Implementation

This deep-dive requires approval from the Continuity Guardian before any code changes are made:

- [ ] Expanded role taxonomy is correct and complete
- [ ] Developer role permissions are appropriate
- [ ] AI 3-tier classification is accurate
- [ ] Subscription tier structure is approved
- [ ] Admin restriction model is approved
- [ ] Select-few permissions list is correct
- [ ] Bot spawning rules are appropriate
- [ ] API/Git connection permission model is approved
- [ ] Database schema is acceptable
- [ ] Implementation priority order is correct

**Continuity Guardian:** ____________________  
**Date:** ____________________  
**Decision:** ☐ Approved  ☐ Approved with Changes  ☐ Requires Revision  

---

*This document was generated by SuperNinja AI as part of the Trancendos ecosystem IAM architecture programme. All designs align with the zero-cost mandate, TIGA governance framework, OWASP security standards, and 2060 future-proofing requirements.*

*Research sources: Cerbos (AI Agent Permission Management, 2025), WorkOS (AI Agent Access Control, 2025), GitGuardian (NHI Security Zero Trust, 2025), AWS Prescriptive Guidance (Access Control Types), IBM (Agentic AI ROI Guide), OWASP (LLM Top 10), Identity Defined Security Alliance (IAM in the AI Era, 2025).*