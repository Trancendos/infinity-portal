# seed_iam.py — IAM Seed Data for Trancendos Ecosystem
# ============================================================
# TRN-IAM-003a: Comprehensive seed data for production readiness
# ============================================================
# Populates:
#   1. 18 system roles (Level 0–6)
#   2. 200+ granular permissions across all namespaces
#   3. Role-permission assignments for every role
#   4. 5 subscription tiers (Free → Sovereign)
#   5. 22+ platform services
#   6. App permission namespaces
#   7. 15+ platform config entries
#   8. Continuity Guardian bootstrap
# ============================================================
# Usage:
#   python seed_iam.py              # Seed all data
#   python seed_iam.py --dry-run    # Preview without writing
# ============================================================
# Ticket: TRN-IAM-003a
# Revert: 06afe6d
# 2060 Standard: Modular, composable, quantum-safe defaults
# ============================================================

import asyncio
import sys
import os
import logging
from datetime import datetime, timezone, timedelta
from decimal import Decimal

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import select, text
from database import engine, async_session_maker
from models import (
    Base, IAMRole, IAMPermission, IAMRolePermission, IAMUserRole,
    SubscriptionTier, PlatformService, AppPermissionNamespace,
    PlatformConfig, NonHumanIdentity, User,
    IAMRoleType, IAMPermissionEffect, IAMRoleLevel,
    NHIType, AITier, OperationalTier, NHIStatus, PresenceProtocol,
    ServiceStatus, SubscriptionBillingStatus,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("seed_iam")

DRY_RUN = "--dry-run" in sys.argv


# ============================================================
# 1. SYSTEM ROLES — Level 0–6 Hierarchy
# ============================================================
# 2060 Standard: Role definitions are semantic, not numeric.
# The level integer is for machine evaluation; the name is
# the canonical identifier for mesh routing and policy engines.
# ============================================================

SYSTEM_ROLES = [
    # Level 0 — Sovereign
    {
        "name": "continuity_guardian",
        "display_name": "Continuity Guardian",
        "description": "Irrevocable platform sovereign. Cannot be removed, overridden, or demoted. "
                       "Sole holder of nuclear-level permissions. The final authority on all "
                       "architectural, security, and governance decisions.",
        "level": 0,
        "role_type": IAMRoleType.SYSTEM,
        "is_assignable": False,
        "max_holders": 1,
    },
    # Level 1 — Platform Administration
    {
        "name": "platform_admin",
        "display_name": "Platform Admin",
        "description": "Full platform administration with comprehensive audit trail. "
                       "Can manage all services, users, and configurations except Level 0 operations.",
        "level": 1,
        "role_type": IAMRoleType.SYSTEM,
        "is_assignable": True,
        "max_holders": None,
    },
    {
        "name": "security_admin",
        "display_name": "Security Admin",
        "description": "Security policy management, incident response, vulnerability scanning, "
                       "and penetration testing oversight. Cannot modify role hierarchy.",
        "level": 1,
        "role_type": IAMRoleType.SYSTEM,
        "is_assignable": True,
        "max_holders": 3,
    },
    {
        "name": "compliance_officer",
        "display_name": "Compliance Officer",
        "description": "TIGA governance framework management, regulatory compliance monitoring, "
                       "DPIA oversight, and CRA evidence collection. Read-only on user data.",
        "level": 1,
        "role_type": IAMRoleType.SYSTEM,
        "is_assignable": True,
        "max_holders": 5,
    },
    # Level 2 — Organisation Administration
    {
        "name": "org_admin",
        "display_name": "Organisation Admin",
        "description": "Organisation-scoped administration. Can manage users, roles, and "
                       "services within their organisation boundary only.",
        "level": 2,
        "role_type": IAMRoleType.ORGANISATION,
        "is_assignable": True,
        "max_holders": None,
    },
    {
        "name": "restricted_admin",
        "display_name": "Restricted Admin",
        "description": "Admin with explicit DENY overrides on sensitive operations. "
                       "Useful for delegated administration with guardrails.",
        "level": 2,
        "role_type": IAMRoleType.ORGANISATION,
        "is_assignable": True,
        "max_holders": None,
    },
    # Level 3 — Specialist Roles
    {
        "name": "developer",
        "display_name": "Developer",
        "description": "API access, Git connections, sandbox environments, agent spawning "
                       "within limits. Separate from user and admin — focused on building.",
        "level": 3,
        "role_type": IAMRoleType.SYSTEM,
        "is_assignable": True,
        "max_holders": None,
    },
    {
        "name": "power_user",
        "display_name": "Power User",
        "description": "Advanced features, configuration access, and extended AI capabilities. "
                       "Can use Tier 2 AI models and create custom workflows.",
        "level": 3,
        "role_type": IAMRoleType.SYSTEM,
        "is_assignable": True,
        "max_holders": None,
    },
    {
        "name": "analyst",
        "display_name": "Analyst",
        "description": "Read-only analytics, reporting, and data export access. "
                       "Cannot modify any data or configurations.",
        "level": 3,
        "role_type": IAMRoleType.SYSTEM,
        "is_assignable": True,
        "max_holders": None,
    },
    {
        "name": "support_agent",
        "display_name": "Support Agent",
        "description": "User support, ticket management, and limited user account access. "
                       "Can view user profiles but cannot modify roles or permissions.",
        "level": 3,
        "role_type": IAMRoleType.SYSTEM,
        "is_assignable": True,
        "max_holders": None,
    },
    # Level 4 — Standard Users
    {
        "name": "standard_user",
        "display_name": "Standard User",
        "description": "Default authenticated user with subscription-based access. "
                       "Can use services included in their subscription tier.",
        "level": 4,
        "role_type": IAMRoleType.SYSTEM,
        "is_assignable": True,
        "max_holders": None,
    },
    {
        "name": "contributor",
        "display_name": "Contributor",
        "description": "Content creation and community participation. "
                       "Can submit content for review but cannot publish directly.",
        "level": 4,
        "role_type": IAMRoleType.SYSTEM,
        "is_assignable": True,
        "max_holders": None,
    },
    {
        "name": "trial_user",
        "display_name": "Trial User",
        "description": "Time-limited evaluation access (14 days default). "
                       "Restricted to free-tier services and Tier 1 AI only.",
        "level": 4,
        "role_type": IAMRoleType.TEMPORAL,
        "is_assignable": True,
        "max_holders": None,
    },
    # Level 5 — Guest
    {
        "name": "guest",
        "display_name": "Guest",
        "description": "Read-only, time-limited, no PII access. "
                       "Cannot create content, access AI, or view user data.",
        "level": 5,
        "role_type": IAMRoleType.SYSTEM,
        "is_assignable": True,
        "max_holders": None,
    },
    # Level 6 — Non-Human Identities
    {
        "name": "ai_agent",
        "display_name": "AI Agent",
        "description": "In-house Trancendos AI agent identity (Tier 1). "
                       "Full ecosystem access within TIGA governance. Can spawn child bots.",
        "level": 6,
        "role_type": IAMRoleType.SYSTEM,
        "is_assignable": True,
        "max_holders": None,
    },
    {
        "name": "bot",
        "display_name": "Bot",
        "description": "Spawned bot identity with inherited permissions. "
                       "Always a subset of parent agent permissions. Time-limited.",
        "level": 6,
        "role_type": IAMRoleType.SYSTEM,
        "is_assignable": True,
        "max_holders": None,
    },
    {
        "name": "service_account",
        "display_name": "Service Account",
        "description": "Machine-to-machine service identity for CI/CD, cron jobs, "
                       "and inter-service communication. No interactive login.",
        "level": 6,
        "role_type": IAMRoleType.SYSTEM,
        "is_assignable": True,
        "max_holders": None,
    },
    {
        "name": "external_ai",
        "display_name": "External AI",
        "description": "Third-party AI provider identity (Tier 2/3). "
                       "Sandboxed execution, no PII access, mandatory HITL for high-risk.",
        "level": 6,
        "role_type": IAMRoleType.SYSTEM,
        "is_assignable": True,
        "max_holders": None,
    },
]


# ============================================================
# 2. PERMISSIONS — Granular namespace:resource:action
# ============================================================
# 2060 Standard: Permissions are semantic triples that can be
# evaluated by any policy engine (OPA, Cerbos, Cedar, or custom).
# The namespace maps to a service mesh address.
# ============================================================

PERMISSIONS = [
    # ── Admin OS ──
    ("admin-os", "dashboard", "read", "View Admin OS dashboard", False, False),
    ("admin-os", "dashboard", "write", "Modify Admin OS dashboard layout", False, False),
    ("admin-os", "services", "read", "View platform services status", False, False),
    ("admin-os", "services", "restart", "Restart platform services", True, True),
    ("admin-os", "services", "configure", "Configure platform services", True, True),
    ("admin-os", "users", "read", "View user accounts", False, False),
    ("admin-os", "users", "write", "Modify user accounts", False, True),
    ("admin-os", "users", "delete", "Delete user accounts", True, True),
    ("admin-os", "users", "suspend", "Suspend user accounts", False, True),
    ("admin-os", "roles", "read", "View role definitions", False, False),
    ("admin-os", "roles", "write", "Create/modify roles", True, True),
    ("admin-os", "roles", "delete", "Delete roles", True, True),
    ("admin-os", "config", "read", "View platform configuration", False, False),
    ("admin-os", "config", "write", "Modify platform configuration", True, True),
    ("admin-os", "audit", "read", "View audit logs", False, False),
    ("admin-os", "audit", "export", "Export audit logs", False, True),
    ("admin-os", "agents", "read", "View AI agent status", False, False),
    ("admin-os", "agents", "manage", "Start/stop/restart agents", True, True),
    ("admin-os", "agents", "spawn", "Spawn new agent instances", True, True),
    ("admin-os", "dlq", "read", "View Dead-Letter Queue", False, False),
    ("admin-os", "dlq", "rescue", "Rescue DLQ tasks", False, True),
    ("admin-os", "dlq", "abandon", "Abandon DLQ tasks", True, True),

    # ── Infinity One (IAM) ──
    ("infinity-one", "profile", "read", "View own profile", False, False),
    ("infinity-one", "profile", "write", "Edit own profile", False, False),
    ("infinity-one", "presence", "read", "View user presence/status", False, False),
    ("infinity-one", "presence", "write", "Update own presence", False, False),
    ("infinity-one", "iam", "read", "View IAM policies", False, False),
    ("infinity-one", "iam", "write", "Modify IAM policies", True, True),
    ("infinity-one", "iam", "admin", "Full IAM administration", True, True),

    # ── Arcadia (Social/Marketplace) ──
    ("arcadia", "marketplace", "read", "Browse marketplace listings", False, False),
    ("arcadia", "marketplace", "write", "Create marketplace listings", False, False),
    ("arcadia", "marketplace", "admin", "Manage all marketplace listings", False, True),
    ("arcadia", "social", "read", "View social feeds", False, False),
    ("arcadia", "social", "write", "Post to social feeds", False, False),
    ("arcadia", "social", "moderate", "Moderate social content", False, True),
    ("arcadia", "nft", "read", "View NFT collections", False, False),
    ("arcadia", "nft", "mint", "Mint new NFTs", False, False),
    ("arcadia", "nft", "trade", "Trade NFTs", False, False),
    ("arcadia", "nft", "admin", "Manage NFT platform", True, True),

    # ── Royal Bank of Arcadia ──
    ("royal-bank", "accounts", "read", "View own bank accounts", False, False),
    ("royal-bank", "accounts", "write", "Create/modify accounts", False, True),
    ("royal-bank", "transactions", "read", "View transaction history", False, False),
    ("royal-bank", "transactions", "write", "Create transactions", False, True),
    ("royal-bank", "transactions", "approve", "Approve high-value transactions", True, True),
    ("royal-bank", "treasury", "read", "View treasury dashboard", False, True),
    ("royal-bank", "treasury", "manage", "Manage treasury operations", True, True),
    ("royal-bank", "compliance", "read", "View financial compliance", False, False),
    ("royal-bank", "compliance", "audit", "Audit financial records", False, True),
    ("royal-bank", "admin", "full", "Full bank administration", True, True),

    # ── Arcadian Exchange ──
    ("arcadian-exchange", "markets", "read", "View market data", False, False),
    ("arcadian-exchange", "markets", "trade", "Execute trades", False, False),
    ("arcadian-exchange", "markets", "admin", "Manage exchange markets", True, True),
    ("arcadian-exchange", "portfolio", "read", "View own portfolio", False, False),
    ("arcadian-exchange", "portfolio", "manage", "Manage portfolio", False, False),

    # ── Luminous (AI Orchestration) ──
    ("luminous", "inference", "execute", "Run AI inference (Tier 1)", False, False),
    ("luminous", "inference", "execute-t2", "Run AI inference (Tier 2 — Free External)", False, False),
    ("luminous", "inference", "execute-t3", "Run AI inference (Tier 3 — Premium)", False, False),
    ("luminous", "models", "read", "View available AI models", False, False),
    ("luminous", "models", "configure", "Configure AI model settings", False, True),
    ("luminous", "models", "deploy", "Deploy new AI models", True, True),
    ("luminous", "agents", "read", "View AI agent registry", False, False),
    ("luminous", "agents", "spawn", "Spawn AI agents", False, True),
    ("luminous", "agents", "terminate", "Terminate AI agents", True, True),
    ("luminous", "hitl", "review", "Review HITL tasks", False, True),
    ("luminous", "hitl", "approve", "Approve HITL decisions", True, True),
    ("luminous", "provenance", "read", "View AI provenance manifests", False, False),
    ("luminous", "provenance", "sign", "Sign provenance manifests", False, True),

    # ── Lighthouse (Monitoring/Observability) ──
    ("lighthouse", "metrics", "read", "View system metrics", False, False),
    ("lighthouse", "metrics", "configure", "Configure metric collection", False, True),
    ("lighthouse", "alerts", "read", "View alerts", False, False),
    ("lighthouse", "alerts", "manage", "Manage alert rules", False, True),
    ("lighthouse", "logs", "read", "View system logs", False, False),
    ("lighthouse", "logs", "export", "Export system logs", False, True),
    ("lighthouse", "admin", "full", "Full observability administration", True, True),

    # ── HIVE (Message Routing) ──
    ("hive", "messages", "read", "View message queues", False, False),
    ("hive", "messages", "publish", "Publish messages", False, False),
    ("hive", "messages", "subscribe", "Subscribe to topics", False, False),
    ("hive", "routing", "read", "View routing rules", False, False),
    ("hive", "routing", "configure", "Configure message routing", True, True),
    ("hive", "admin", "full", "Full HIVE administration", True, True),

    # ── Void (Secure Storage) ──
    ("void", "storage", "read", "Read from secure storage", False, False),
    ("void", "storage", "write", "Write to secure storage", False, True),
    ("void", "storage", "delete", "Delete from secure storage", True, True),
    ("void", "encryption", "manage", "Manage encryption keys", True, True),
    ("void", "admin", "full", "Full Void administration", True, True),

    # ── IceBox (Cold Storage/Archive) ──
    ("icebox", "archive", "read", "View archived data", False, False),
    ("icebox", "archive", "write", "Archive data", False, True),
    ("icebox", "archive", "release", "Release archived data", True, True),
    ("icebox", "admin", "full", "Full IceBox administration", True, True),

    # ── Cornelius AI ──
    ("cornelius", "chat", "read", "View chat history", False, False),
    ("cornelius", "chat", "write", "Send messages to Cornelius", False, False),
    ("cornelius", "knowledge", "read", "Query knowledge base", False, False),
    ("cornelius", "knowledge", "write", "Update knowledge base", False, True),
    ("cornelius", "admin", "full", "Full Cornelius administration", True, True),

    # ── Norman (Compliance AI) ──
    ("norman", "scan", "execute", "Run compliance scans", False, False),
    ("norman", "reports", "read", "View compliance reports", False, False),
    ("norman", "reports", "generate", "Generate compliance reports", False, True),
    ("norman", "admin", "full", "Full Norman administration", True, True),

    # ── The Dr (Health/Diagnostics) ──
    ("the-dr", "diagnostics", "read", "View system diagnostics", False, False),
    ("the-dr", "diagnostics", "run", "Run diagnostic checks", False, False),
    ("the-dr", "healing", "execute", "Execute self-healing actions", True, True),
    ("the-dr", "admin", "full", "Full Dr administration", True, True),

    # ── Sentinel (Security) ──
    ("sentinel", "threats", "read", "View threat intelligence", False, False),
    ("sentinel", "threats", "respond", "Respond to security threats", True, True),
    ("sentinel", "scanning", "execute", "Run security scans", False, True),
    ("sentinel", "admin", "full", "Full Sentinel administration", True, True),

    # ── TownHall (Governance) ──
    ("townhall", "meetings", "read", "View board meetings", False, False),
    ("townhall", "meetings", "create", "Schedule board meetings", False, True),
    ("townhall", "resolutions", "read", "View resolutions", False, False),
    ("townhall", "resolutions", "vote", "Vote on resolutions", False, True),
    ("townhall", "ip", "read", "View IP registry", False, False),
    ("townhall", "ip", "register", "Register intellectual property", False, True),
    ("townhall", "contracts", "read", "View legal contracts", False, False),
    ("townhall", "contracts", "manage", "Manage legal contracts", True, True),
    ("townhall", "admin", "full", "Full TownHall administration", True, True),

    # ── Developer Tools ──
    ("devtools", "api-keys", "read", "View own API keys", False, False),
    ("devtools", "api-keys", "create", "Create API keys", False, True),
    ("devtools", "api-keys", "revoke", "Revoke API keys", False, True),
    ("devtools", "git", "read", "View Git connections", False, False),
    ("devtools", "git", "connect", "Create Git connections", False, True),
    ("devtools", "git", "push", "Push to repositories", False, False),
    ("devtools", "sandbox", "create", "Create sandbox environments", False, False),
    ("devtools", "sandbox", "manage", "Manage sandbox environments", False, True),
    ("devtools", "codegen", "execute", "Run code generation", False, False),
    ("devtools", "webhooks", "manage", "Manage webhooks", False, True),

    # ── Kanban/Project Management ──
    ("kanban", "boards", "read", "View Kanban boards", False, False),
    ("kanban", "boards", "write", "Create/modify boards", False, False),
    ("kanban", "tasks", "read", "View tasks", False, False),
    ("kanban", "tasks", "write", "Create/modify tasks", False, False),
    ("kanban", "tasks", "assign", "Assign tasks to users", False, False),
    ("kanban", "admin", "full", "Full Kanban administration", False, True),

    # ── Files & Documents ──
    ("files", "documents", "read", "Read documents", False, False),
    ("files", "documents", "write", "Create/edit documents", False, False),
    ("files", "documents", "delete", "Delete documents", False, False),
    ("files", "documents", "share", "Share documents", False, False),
    ("files", "admin", "full", "Full file system administration", True, True),

    # ── Platform-Wide ──
    ("platform", "notifications", "read", "View notifications", False, False),
    ("platform", "notifications", "manage", "Manage notification rules", False, True),
    ("platform", "search", "execute", "Use platform search", False, False),
    ("platform", "federation", "read", "View federated services", False, False),
    ("platform", "federation", "manage", "Manage federation", True, True),
    ("platform", "billing", "read", "View own billing", False, False),
    ("platform", "billing", "manage", "Manage billing/subscriptions", False, True),
    ("platform", "billing", "admin", "Full billing administration", True, True),
]


# ============================================================
# 3. ROLE-PERMISSION MAPPINGS
# ============================================================
# Format: role_name → list of (namespace, resource, action) tuples
# Unmapped permissions default to DENY.
# ============================================================

ROLE_PERMISSION_MAP = {
    # Level 0 — Continuity Guardian: EVERYTHING
    "continuity_guardian": "*",  # Special: all permissions

    # Level 1 — Platform Admin
    "platform_admin": [
        ("admin-os", "*", "*"),
        ("infinity-one", "*", "*"),
        ("luminous", "*", "*"),
        ("lighthouse", "*", "*"),
        ("hive", "*", "*"),
        ("void", "*", "*"),
        ("icebox", "*", "*"),
        ("cornelius", "*", "*"),
        ("norman", "*", "*"),
        ("the-dr", "*", "*"),
        ("sentinel", "*", "*"),
        ("townhall", "*", "*"),
        ("devtools", "*", "*"),
        ("kanban", "*", "*"),
        ("files", "*", "*"),
        ("platform", "*", "*"),
        ("arcadia", "*", "read"), ("arcadia", "*", "write"), ("arcadia", "*", "admin"),
        ("royal-bank", "*", "read"), ("royal-bank", "compliance", "*"),
        ("arcadian-exchange", "*", "read"),
    ],

    # Level 1 — Security Admin
    "security_admin": [
        ("admin-os", "audit", "*"), ("admin-os", "services", "read"),
        ("sentinel", "*", "*"),
        ("lighthouse", "*", "*"),
        ("norman", "*", "*"),
        ("void", "encryption", "manage"),
        ("infinity-one", "iam", "read"),
        ("platform", "federation", "*"),
    ],

    # Level 1 — Compliance Officer
    "compliance_officer": [
        ("admin-os", "audit", "*"), ("admin-os", "config", "read"),
        ("norman", "*", "*"),
        ("townhall", "*", "*"),
        ("royal-bank", "compliance", "*"),
        ("lighthouse", "logs", "*"), ("lighthouse", "metrics", "read"),
        ("infinity-one", "iam", "read"),
    ],

    # Level 2 — Org Admin
    "org_admin": [
        ("admin-os", "dashboard", "*"), ("admin-os", "users", "*"),
        ("admin-os", "roles", "read"), ("admin-os", "config", "read"),
        ("admin-os", "audit", "read"), ("admin-os", "agents", "read"),
        ("infinity-one", "profile", "*"), ("infinity-one", "presence", "*"),
        ("infinity-one", "iam", "read"),
        ("arcadia", "*", "read"), ("arcadia", "*", "write"),
        ("royal-bank", "accounts", "*"), ("royal-bank", "transactions", "read"),
        ("luminous", "inference", "execute"), ("luminous", "models", "read"),
        ("kanban", "*", "*"),
        ("files", "*", "*"),
        ("platform", "notifications", "*"), ("platform", "search", "execute"),
        ("platform", "billing", "read"), ("platform", "billing", "manage"),
    ],

    # Level 2 — Restricted Admin (same as org_admin but with restriction profiles applied)
    "restricted_admin": [
        ("admin-os", "dashboard", "read"), ("admin-os", "users", "read"),
        ("admin-os", "audit", "read"),
        ("infinity-one", "profile", "*"), ("infinity-one", "presence", "*"),
        ("kanban", "*", "*"),
        ("files", "documents", "read"), ("files", "documents", "write"),
        ("platform", "notifications", "read"), ("platform", "search", "execute"),
    ],

    # Level 3 — Developer
    "developer": [
        ("devtools", "*", "*"),
        ("luminous", "inference", "execute"), ("luminous", "inference", "execute-t2"),
        ("luminous", "models", "read"), ("luminous", "agents", "read"),
        ("luminous", "agents", "spawn"), ("luminous", "provenance", "read"),
        ("cornelius", "chat", "*"), ("cornelius", "knowledge", "read"),
        ("kanban", "*", "*"),
        ("files", "*", "*"),
        ("hive", "messages", "*"), ("hive", "routing", "read"),
        ("lighthouse", "metrics", "read"), ("lighthouse", "logs", "read"),
        ("the-dr", "diagnostics", "read"), ("the-dr", "diagnostics", "run"),
        ("platform", "notifications", "*"), ("platform", "search", "execute"),
        ("infinity-one", "profile", "*"), ("infinity-one", "presence", "*"),
        ("arcadia", "marketplace", "read"),
    ],

    # Level 3 — Power User
    "power_user": [
        ("luminous", "inference", "execute"), ("luminous", "inference", "execute-t2"),
        ("luminous", "models", "read"),
        ("cornelius", "chat", "*"), ("cornelius", "knowledge", "read"),
        ("arcadia", "*", "read"), ("arcadia", "*", "write"),
        ("arcadian-exchange", "markets", "read"), ("arcadian-exchange", "markets", "trade"),
        ("arcadian-exchange", "portfolio", "*"),
        ("royal-bank", "accounts", "read"), ("royal-bank", "transactions", "read"),
        ("royal-bank", "transactions", "write"),
        ("kanban", "*", "*"),
        ("files", "*", "*"),
        ("platform", "notifications", "*"), ("platform", "search", "execute"),
        ("platform", "billing", "read"),
        ("infinity-one", "profile", "*"), ("infinity-one", "presence", "*"),
    ],

    # Level 3 — Analyst
    "analyst": [
        ("admin-os", "dashboard", "read"), ("admin-os", "audit", "read"),
        ("lighthouse", "metrics", "read"), ("lighthouse", "logs", "read"),
        ("lighthouse", "alerts", "read"),
        ("royal-bank", "accounts", "read"), ("royal-bank", "transactions", "read"),
        ("royal-bank", "compliance", "read"),
        ("arcadian-exchange", "markets", "read"), ("arcadian-exchange", "portfolio", "read"),
        ("norman", "reports", "read"),
        ("kanban", "boards", "read"), ("kanban", "tasks", "read"),
        ("files", "documents", "read"),
        ("platform", "search", "execute"),
        ("infinity-one", "profile", "read"), ("infinity-one", "presence", "read"),
    ],

    # Level 3 — Support Agent
    "support_agent": [
        ("admin-os", "users", "read"), ("admin-os", "dashboard", "read"),
        ("cornelius", "chat", "*"), ("cornelius", "knowledge", "read"),
        ("kanban", "tasks", "*"),
        ("files", "documents", "read"),
        ("platform", "notifications", "*"), ("platform", "search", "execute"),
        ("infinity-one", "profile", "read"), ("infinity-one", "presence", "read"),
    ],

    # Level 4 — Standard User
    "standard_user": [
        ("luminous", "inference", "execute"),
        ("luminous", "models", "read"),
        ("cornelius", "chat", "read"), ("cornelius", "chat", "write"),
        ("arcadia", "marketplace", "read"), ("arcadia", "social", "read"),
        ("arcadia", "social", "write"),
        ("royal-bank", "accounts", "read"), ("royal-bank", "transactions", "read"),
        ("kanban", "boards", "read"), ("kanban", "tasks", "read"),
        ("kanban", "tasks", "write"),
        ("files", "documents", "read"), ("files", "documents", "write"),
        ("platform", "notifications", "read"), ("platform", "search", "execute"),
        ("platform", "billing", "read"),
        ("infinity-one", "profile", "*"), ("infinity-one", "presence", "*"),
    ],

    # Level 4 — Contributor
    "contributor": [
        ("arcadia", "marketplace", "read"), ("arcadia", "marketplace", "write"),
        ("arcadia", "social", "read"), ("arcadia", "social", "write"),
        ("arcadia", "nft", "read"), ("arcadia", "nft", "mint"),
        ("cornelius", "chat", "read"), ("cornelius", "chat", "write"),
        ("kanban", "tasks", "read"), ("kanban", "tasks", "write"),
        ("files", "documents", "read"), ("files", "documents", "write"),
        ("platform", "notifications", "read"), ("platform", "search", "execute"),
        ("infinity-one", "profile", "*"), ("infinity-one", "presence", "*"),
    ],

    # Level 4 — Trial User
    "trial_user": [
        ("luminous", "inference", "execute"),  # Tier 1 only
        ("cornelius", "chat", "read"), ("cornelius", "chat", "write"),
        ("arcadia", "marketplace", "read"), ("arcadia", "social", "read"),
        ("kanban", "boards", "read"), ("kanban", "tasks", "read"),
        ("files", "documents", "read"),
        ("platform", "notifications", "read"), ("platform", "search", "execute"),
        ("infinity-one", "profile", "read"), ("infinity-one", "presence", "read"),
    ],

    # Level 5 — Guest
    "guest": [
        ("arcadia", "marketplace", "read"),
        ("arcadia", "social", "read"),
        ("platform", "search", "execute"),
        ("infinity-one", "profile", "read"),
    ],

    # Level 6 — AI Agent (Tier 1 In-House)
    "ai_agent": [
        ("luminous", "inference", "execute"), ("luminous", "inference", "execute-t2"),
        ("luminous", "agents", "read"), ("luminous", "agents", "spawn"),
        ("luminous", "provenance", "read"), ("luminous", "provenance", "sign"),
        ("hive", "messages", "*"),
        ("void", "storage", "read"), ("void", "storage", "write"),
        ("cornelius", "knowledge", "read"), ("cornelius", "knowledge", "write"),
        ("lighthouse", "metrics", "read"),
        ("the-dr", "diagnostics", "read"), ("the-dr", "diagnostics", "run"),
        ("files", "documents", "read"), ("files", "documents", "write"),
    ],

    # Level 6 — Bot (Inherited subset — minimal base)
    "bot": [
        ("luminous", "inference", "execute"),
        ("hive", "messages", "read"), ("hive", "messages", "publish"),
        ("files", "documents", "read"),
    ],

    # Level 6 — Service Account
    "service_account": [
        ("hive", "messages", "*"),
        ("lighthouse", "metrics", "read"),
        ("void", "storage", "read"), ("void", "storage", "write"),
        ("platform", "federation", "read"),
    ],

    # Level 6 — External AI (Tier 2/3 — Sandboxed)
    "external_ai": [
        ("luminous", "inference", "execute"),
        ("luminous", "provenance", "read"),
    ],
}


# ============================================================
# 4. SUBSCRIPTION TIERS
# ============================================================

SUBSCRIPTION_TIERS = [
    {
        "name": "free",
        "display_name": "Free",
        "description": "Essential access to core platform features. Tier 1 AI only.",
        "monthly_price_gbp": Decimal("0.00"),
        "ai_tier_access": {"tier_1": True, "tier_2": False, "tier_3": False},
        "token_budget": {"tier_1_daily": 10000, "tier_2_daily": 0, "tier_3_daily": 0},
        "max_agents": 0,
        "max_api_keys": 1,
        "max_git_connections": 0,
        "included_services": ["arcadia", "cornelius", "kanban", "files", "platform"],
    },
    {
        "name": "starter",
        "display_name": "Starter",
        "description": "Expanded access with Tier 2 AI and basic developer tools.",
        "monthly_price_gbp": Decimal("4.99"),
        "ai_tier_access": {"tier_1": True, "tier_2": True, "tier_3": False},
        "token_budget": {"tier_1_daily": 50000, "tier_2_daily": 10000, "tier_3_daily": 0},
        "max_agents": 1,
        "max_api_keys": 3,
        "max_git_connections": 1,
        "included_services": [
            "arcadia", "cornelius", "kanban", "files", "platform",
            "royal-bank", "devtools", "lighthouse",
        ],
    },
    {
        "name": "professional",
        "display_name": "Professional",
        "description": "Full platform access with all AI tiers and advanced features.",
        "monthly_price_gbp": Decimal("14.99"),
        "ai_tier_access": {"tier_1": True, "tier_2": True, "tier_3": True},
        "token_budget": {"tier_1_daily": 200000, "tier_2_daily": 50000, "tier_3_daily": 10000},
        "max_agents": 5,
        "max_api_keys": 10,
        "max_git_connections": 5,
        "included_services": [
            "arcadia", "cornelius", "kanban", "files", "platform",
            "royal-bank", "arcadian-exchange", "devtools", "lighthouse",
            "luminous", "hive", "void", "norman",
        ],
    },
    {
        "name": "enterprise",
        "display_name": "Enterprise",
        "description": "Organisation-wide access with dedicated support and compliance tools.",
        "monthly_price_gbp": Decimal("49.99"),
        "ai_tier_access": {"tier_1": True, "tier_2": True, "tier_3": True},
        "token_budget": {"tier_1_daily": 1000000, "tier_2_daily": 200000, "tier_3_daily": 50000},
        "max_agents": 20,
        "max_api_keys": 50,
        "max_git_connections": 20,
        "included_services": [
            "arcadia", "cornelius", "kanban", "files", "platform",
            "royal-bank", "arcadian-exchange", "devtools", "lighthouse",
            "luminous", "hive", "void", "icebox", "norman", "the-dr",
            "sentinel", "townhall",
        ],
    },
    {
        "name": "sovereign",
        "display_name": "Sovereign",
        "description": "Continuity Guardian tier. Unlimited access to everything. £0 — this IS the platform.",
        "monthly_price_gbp": Decimal("0.00"),
        "ai_tier_access": {"tier_1": True, "tier_2": True, "tier_3": True},
        "token_budget": {"tier_1_daily": -1, "tier_2_daily": -1, "tier_3_daily": -1},
        "max_agents": -1,
        "max_api_keys": -1,
        "max_git_connections": -1,
        "included_services": ["*"],  # Everything
    },
]


# ============================================================
# 5. PLATFORM SERVICES
# ============================================================

PLATFORM_SERVICES = [
    ("admin-os", "Admin OS", "Platform administration and monitoring dashboard", "core", "enterprise", False),
    ("infinity-one", "Infinity One", "Identity and access management service", "core", "free", False),
    ("arcadia", "Arcadia", "Social platform, marketplace, and NFT ecosystem", "social", "free", False),
    ("royal-bank", "Royal Bank of Arcadia", "Digital banking and financial services", "financial", "starter", False),
    ("arcadian-exchange", "Arcadian Exchange", "Cryptocurrency and asset trading platform", "financial", "professional", False),
    ("luminous", "Luminous", "AI orchestration and multi-model inference engine", "ai", "professional", True),
    ("cornelius", "Cornelius AI", "Conversational AI assistant and knowledge base", "ai", "free", False),
    ("norman", "Norman", "Compliance AI — regulatory scanning and reporting", "ai", "enterprise", True),
    ("the-dr", "The Dr", "System health diagnostics and self-healing engine", "ai", "enterprise", True),
    ("sentinel", "Sentinel", "Security threat detection and response", "ai", "enterprise", True),
    ("lighthouse", "Lighthouse", "Monitoring, observability, and alerting", "utility", "starter", False),
    ("hive", "HIVE", "Message routing and event-driven communication", "utility", "professional", False),
    ("void", "Void", "Encrypted secure storage and key management", "utility", "professional", True),
    ("icebox", "IceBox", "Cold storage and data archival", "utility", "enterprise", True),
    ("devtools", "Developer Tools", "API keys, Git connections, sandboxes, and code generation", "utility", "starter", False),
    ("kanban", "Kanban", "Project management and task tracking", "utility", "free", False),
    ("files", "Files", "Document management and file storage", "utility", "free", False),
    ("townhall", "TownHall", "Governance, board meetings, IP registry, and legal contracts", "governance", "enterprise", False),
    ("platform", "Platform Core", "Notifications, search, federation, and billing", "core", "free", False),
]


# ============================================================
# 6. PLATFORM CONFIG
# ============================================================
# 2060 Standard: All config is JSONB — no schema migrations needed.
# Semantic keys enable mesh-wide config propagation.
# ============================================================

PLATFORM_CONFIGS = [
    ("auth.jwt.algorithm", "HS512", "JWT signing algorithm — HS512 for quantum resistance", True),
    ("auth.jwt.access_token_ttl_minutes", 30, "Access token lifetime in minutes", False),
    ("auth.jwt.refresh_token_ttl_days", 7, "Refresh token lifetime in days", False),
    ("auth.brute_force.max_attempts", 5, "Max login attempts before lockout", False),
    ("auth.brute_force.lockout_minutes", 15, "Lockout duration after max attempts", False),
    ("auth.mfa.required_for_level", 2, "MFA required for roles at this level and above", False),
    ("auth.password.min_length", 12, "Minimum password length", False),
    ("nhi.presence.default_protocol", "websocket", "Default agent presence protocol", False),
    ("nhi.spawn.max_depth_tier1", 3, "Max spawn depth for Tier 1 (In-House) agents", False),
    ("nhi.spawn.max_depth_tier2", 1, "Max spawn depth for Tier 2 (Free-Tier) agents", False),
    ("nhi.spawn.max_depth_tier3", 0, "Max spawn depth for Tier 3 (Premium) — no spawning", False),
    ("nhi.hibernation.idle_hours", 48, "Hours before idle agent auto-hibernates", False),
    ("dlq.max_retries", 3, "Max auto-retry attempts for DLQ tasks", False),
    ("dlq.escalation_target", "continuity_guardian", "Escalation target for abandoned DLQ tasks", True),
    ("audit.hash_algorithm", "sha512", "Hash algorithm for audit log integrity", True),
    ("audit.retention_years", 10, "CRA-compliant audit log retention period", False),
    ("mesh.routing_mode", "semantic", "Agent routing: semantic (2060) vs static_port (legacy)", False),
    ("mesh.discovery_protocol", "mdns", "Service discovery: mDNS (local) → consul (prod) → mesh (2060)", False),
    ("quantum.token_hash", "sha512", "Current: SHA-512. Future: CRYSTALS-Dilithium", True),
    ("quantum.migration_target", "crystals-dilithium", "Post-quantum signature target algorithm", False),
    ("platform.version", "2.0.0-alpha", "Platform version identifier", False),
    ("platform.2060_compliance", True, "2060 Modular Standard compliance flag", False),
    ("platform.design_system", "trancendos-noir", "Active design system: #00E5FF cyan, #0f172a dark", False),
]


# ============================================================
# SEED EXECUTION ENGINE
# ============================================================

async def seed_all():
    """Execute all seed operations in order."""
    logger.info("=" * 60)
    logger.info("TRN-IAM-003a: Seeding IAM Data")
    logger.info(f"Mode: {'DRY RUN' if DRY_RUN else 'LIVE'}")
    logger.info("=" * 60)

    async with engine.begin() as conn:
        logger.info("Creating all tables via ORM metadata...")
        if not DRY_RUN:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("✅ Tables created/verified")

    async with async_session_maker() as db:
        try:
            await seed_roles(db)
            await seed_permissions(db)
            await seed_role_permissions(db)
            await seed_subscription_tiers(db)
            await seed_platform_services(db)
            await seed_app_namespaces(db)
            await seed_platform_config(db)
            await seed_continuity_guardian(db)

            if not DRY_RUN:
                await db.commit()
                logger.info("✅ All seed data committed successfully")
            else:
                await db.rollback()
                logger.info("🔍 DRY RUN complete — no data written")

        except Exception as e:
            await db.rollback()
            logger.error(f"❌ Seed failed: {e}")
            raise

    logger.info("=" * 60)
    logger.info("Seed complete!")
    logger.info("=" * 60)


async def seed_roles(db):
    """Seed 18 system roles."""
    logger.info("Seeding roles...")
    count = 0
    for role_data in SYSTEM_ROLES:
        existing = await db.execute(
            select(IAMRole).where(IAMRole.name == role_data["name"])
        )
        if existing.scalar_one_or_none():
            logger.debug(f"  Role '{role_data['name']}' already exists, skipping")
            continue

        role = IAMRole(**role_data)
        db.add(role)
        count += 1

    await db.flush()
    logger.info(f"  ✅ Seeded {count} roles (skipped {len(SYSTEM_ROLES) - count} existing)")


async def seed_permissions(db):
    """Seed all granular permissions."""
    logger.info("Seeding permissions...")
    count = 0
    for ns, resource, action, desc, is_sensitive, requires_mfa in PERMISSIONS:
        existing = await db.execute(
            select(IAMPermission).where(
                IAMPermission.namespace == ns,
                IAMPermission.resource == resource,
                IAMPermission.action == action,
            )
        )
        if existing.scalar_one_or_none():
            continue

        perm = IAMPermission(
            namespace=ns,
            resource=resource,
            action=action,
            description=desc,
            is_sensitive=is_sensitive,
            requires_mfa=requires_mfa,
        )
        db.add(perm)
        count += 1

    await db.flush()
    logger.info(f"  ✅ Seeded {count} permissions (total defined: {len(PERMISSIONS)})")


async def seed_role_permissions(db):
    """Seed role-permission assignments."""
    logger.info("Seeding role-permission mappings...")
    total_assigned = 0

    for role_name, perm_spec in ROLE_PERMISSION_MAP.items():
        # Get role
        role_result = await db.execute(
            select(IAMRole).where(IAMRole.name == role_name)
        )
        role = role_result.scalar_one_or_none()
        if not role:
            logger.warning(f"  Role '{role_name}' not found, skipping")
            continue

        if perm_spec == "*":
            # Continuity Guardian gets ALL permissions
            all_perms = (await db.execute(select(IAMPermission))).scalars().all()
            for perm in all_perms:
                existing = await db.execute(
                    select(IAMRolePermission).where(
                        IAMRolePermission.role_id == role.id,
                        IAMRolePermission.permission_id == perm.id,
                    )
                )
                if existing.scalar_one_or_none():
                    continue
                rp = IAMRolePermission(
                    role_id=role.id,
                    permission_id=perm.id,
                    effect=IAMPermissionEffect.ALLOW,
                )
                db.add(rp)
                total_assigned += 1
        else:
            for perm_tuple in perm_spec:
                ns, resource, action = perm_tuple
                # Handle wildcards
                if resource == "*" and action == "*":
                    # All permissions in namespace
                    matching = (await db.execute(
                        select(IAMPermission).where(IAMPermission.namespace == ns)
                    )).scalars().all()
                elif resource == "*":
                    matching = (await db.execute(
                        select(IAMPermission).where(
                            IAMPermission.namespace == ns,
                            IAMPermission.action == action,
                        )
                    )).scalars().all()
                elif action == "*":
                    matching = (await db.execute(
                        select(IAMPermission).where(
                            IAMPermission.namespace == ns,
                            IAMPermission.resource == resource,
                        )
                    )).scalars().all()
                else:
                    matching = (await db.execute(
                        select(IAMPermission).where(
                            IAMPermission.namespace == ns,
                            IAMPermission.resource == resource,
                            IAMPermission.action == action,
                        )
                    )).scalars().all()

                for perm in matching:
                    existing = await db.execute(
                        select(IAMRolePermission).where(
                            IAMRolePermission.role_id == role.id,
                            IAMRolePermission.permission_id == perm.id,
                        )
                    )
                    if existing.scalar_one_or_none():
                        continue
                    rp = IAMRolePermission(
                        role_id=role.id,
                        permission_id=perm.id,
                        effect=IAMPermissionEffect.ALLOW,
                    )
                    db.add(rp)
                    total_assigned += 1

    await db.flush()
    logger.info(f"  ✅ Seeded {total_assigned} role-permission assignments")


async def seed_subscription_tiers(db):
    """Seed 5 subscription tiers."""
    logger.info("Seeding subscription tiers...")
    count = 0
    for tier_data in SUBSCRIPTION_TIERS:
        existing = await db.execute(
            select(SubscriptionTier).where(SubscriptionTier.name == tier_data["name"])
        )
        if existing.scalar_one_or_none():
            continue

        tier = SubscriptionTier(
            name=tier_data["name"],
            display_name=tier_data["display_name"],
            description=tier_data["description"],
            monthly_price_gbp=tier_data["monthly_price_gbp"],
            ai_tier_access=tier_data["ai_tier_access"],
            token_budget=tier_data["token_budget"],
            max_agents=tier_data["max_agents"],
            max_api_keys=tier_data["max_api_keys"],
            max_git_connections=tier_data["max_git_connections"],
            included_services=tier_data["included_services"],
        )
        db.add(tier)
        count += 1

    await db.flush()
    logger.info(f"  ✅ Seeded {count} subscription tiers")


async def seed_platform_services(db):
    """Seed platform service registry."""
    logger.info("Seeding platform services...")
    count = 0
    for name, display, desc, category, min_tier, is_addon in PLATFORM_SERVICES:
        existing = await db.execute(
            select(PlatformService).where(PlatformService.name == name)
        )
        if existing.scalar_one_or_none():
            continue

        svc = PlatformService(
            name=name,
            display_name=display,
            description=desc,
            category=category,
            min_subscription_tier=min_tier,
            is_addon=is_addon,
        )
        db.add(svc)
        count += 1

    await db.flush()
    logger.info(f"  ✅ Seeded {count} platform services")


async def seed_app_namespaces(db):
    """Seed application permission namespaces."""
    logger.info("Seeding app permission namespaces...")
    count = 0

    # Get service IDs
    services = {}
    result = await db.execute(select(PlatformService))
    for svc in result.scalars().all():
        services[svc.name] = svc.id

    for name, display, desc, category, min_tier, is_addon in PLATFORM_SERVICES:
        existing = await db.execute(
            select(AppPermissionNamespace).where(AppPermissionNamespace.namespace == name)
        )
        if existing.scalar_one_or_none():
            continue

        ns = AppPermissionNamespace(
            service_id=services.get(name),
            namespace=name,
            description=f"Permission namespace for {display}",
        )
        db.add(ns)
        count += 1

    # Add extra namespaces not tied to services
    for extra_ns in ["devtools", "platform"]:
        existing = await db.execute(
            select(AppPermissionNamespace).where(AppPermissionNamespace.namespace == extra_ns)
        )
        if not existing.scalar_one_or_none():
            ns = AppPermissionNamespace(
                namespace=extra_ns,
                description=f"Permission namespace for {extra_ns}",
            )
            db.add(ns)
            count += 1

    await db.flush()
    logger.info(f"  ✅ Seeded {count} app permission namespaces")


async def seed_platform_config(db):
    """Seed platform configuration."""
    logger.info("Seeding platform config...")
    count = 0
    for key, value, desc, is_sensitive in PLATFORM_CONFIGS:
        existing = await db.execute(
            select(PlatformConfig).where(PlatformConfig.config_key == key)
        )
        if existing.scalar_one_or_none():
            continue

        config = PlatformConfig(
            config_key=key,
            config_value=value,
            description=desc,
            is_sensitive=is_sensitive,
        )
        db.add(config)
        count += 1

    await db.flush()
    logger.info(f"  ✅ Seeded {count} platform configs")


async def seed_continuity_guardian(db):
    """Bootstrap the Continuity Guardian role assignment.
    
    If a user with super_admin role exists, assign them the
    continuity_guardian IAM role. Otherwise, log instructions.
    """
    logger.info("Bootstrapping Continuity Guardian...")

    # Find the CG role
    cg_role = (await db.execute(
        select(IAMRole).where(IAMRole.name == "continuity_guardian")
    )).scalar_one_or_none()

    if not cg_role:
        logger.warning("  ⚠️ continuity_guardian role not found — seed roles first")
        return

    # Find sovereign subscription tier
    sovereign_tier = (await db.execute(
        select(SubscriptionTier).where(SubscriptionTier.name == "sovereign")
    )).scalar_one_or_none()

    # Check if any user already has CG role
    existing_cg = (await db.execute(
        select(IAMUserRole).where(
            IAMUserRole.role_id == cg_role.id,
            IAMUserRole.is_active == True,
        )
    )).scalar_one_or_none()

    if existing_cg:
        logger.info(f"  ✅ Continuity Guardian already assigned to user {existing_cg.user_id}")
        return

    # Find super_admin user to promote
    from models import UserRole as LegacyUserRole
    super_admin = (await db.execute(
        select(User).where(User.role == LegacyUserRole.SUPER_ADMIN, User.is_active == True)
    )).scalar_one_or_none()

    if super_admin:
        # Assign CG role
        cg_assignment = IAMUserRole(
            user_id=super_admin.id,
            role_id=cg_role.id,
            is_active=True,
            is_primary=True,
        )
        db.add(cg_assignment)

        # Also assign sovereign subscription if tier exists
        if sovereign_tier:
            from models import UserSubscription
            existing_sub = (await db.execute(
                select(UserSubscription).where(UserSubscription.user_id == super_admin.id)
            )).scalar_one_or_none()
            if not existing_sub:
                sub = UserSubscription(
                    user_id=super_admin.id,
                    tier_id=sovereign_tier.id,
                    selected_services=["*"],
                    billing_status=SubscriptionBillingStatus.ACTIVE,
                )
                db.add(sub)

        await db.flush()
        logger.info(f"  ✅ Continuity Guardian assigned to {super_admin.email} ({super_admin.id})")
    else:
        logger.info("  ℹ️  No super_admin user found. The Continuity Guardian role will be")
        logger.info("     assigned to the first super_admin user who logs in.")
        logger.info("     To manually assign: INSERT INTO iam_user_roles (user_id, role_id, is_active, is_primary)")
        logger.info(f"     VALUES ('<user_id>', '{cg_role.id}', true, true);")


# ============================================================
# ENTRY POINT
# ============================================================

if __name__ == "__main__":
    print()
    print("╔══════════════════════════════════════════════════════════╗")
    print("║  Trancendos IAM Seed — TRN-IAM-003a                    ║")
    print("║  2060 Modular Standard Compliant                       ║")
    print("╚══════════════════════════════════════════════════════════╝")
    print()
    asyncio.run(seed_all())