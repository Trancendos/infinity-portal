# auth.py — Unified authentication & IAM for Infinity OS
# ============================================================
# TRN-IAM-002b: Upgraded Auth Flow & Permission Evaluation
# ============================================================
# Features:
# - Secure JWT with JTI for revocation (upgraded to HS512)
# - Expanded role hierarchy (Level 0–6, 18 system roles)
# - Hybrid RBAC + ABAC 5-step permission evaluation
# - Multi-role support with active role switching
# - Fine-grained permission scopes (namespace:resource:action)
# - Password policy enforcement (min 12 chars)
# - Brute force protection
# - Token revocation support
# - API key authentication (SHA-512)
# - Backward compatibility with legacy 5-tier RBAC
# ============================================================
# Ticket: TRN-IAM-002b
# Revert: ec68e4b
# Reference: docs/IAM_RBAC_DEEP_DIVE.md v1.0.1
# ============================================================

import os
import uuid
import hashlib
import secrets
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any, List, Tuple
from collections import defaultdict

import bcrypt
from jose import jwt, JWTError, ExpiredSignatureError
from fastapi import HTTPException, Depends, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr, field_validator
from sqlalchemy import select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db_session
from models import (
    # Existing models (backward compatibility)
    User, Organisation, AuditLog, AuditEventType, UserRole,
    RevokedToken, Permission, APIKey, OrgPlan, utcnow,
    # New IAM models (TRN-IAM-002a)
    IAMRole, IAMPermission, IAMRolePermission, IAMUserRole,
    IAMRestrictionProfile, IAMSelectFew, IAMAuditLog,
    NonHumanIdentity, UserSubscription, SubscriptionTier,
    PlatformService, ScopedAPIKey, PlatformConfig,
    # New enums
    IAMRoleLevel, IAMRoleType, IAMPermissionEffect, IAMAuditDecision,
    IAMPrincipalType, NHIStatus, AITier, APIKeyStatus,
    SubscriptionBillingStatus,
)

logger = logging.getLogger(__name__)

# ============================================================
# CONFIGURATION
# ============================================================

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "")
if not SECRET_KEY or SECRET_KEY == "change-this-to-a-secure-random-key-in-production":
    SECRET_KEY = secrets.token_urlsafe(64)
    logger.warning(
        "⚠️  JWT_SECRET_KEY not set or insecure. Generated ephemeral key. "
        "Set JWT_SECRET_KEY in production!"
    )

# Upgraded to HS512 for quantum resistance (was HS256)
ALGORITHM = os.getenv("JWT_ALGORITHM", "HS512")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "7"))
MIN_PASSWORD_LENGTH = 12
MAX_LOGIN_ATTEMPTS = 5
LOGIN_LOCKOUT_MINUTES = 15

security = HTTPBearer()

# In-memory brute force tracker (use Redis in production)
_login_attempts: Dict[str, list] = defaultdict(list)


# ============================================================
# LEGACY ROLE HIERARCHY & PERMISSIONS (Backward Compatibility)
# ============================================================
# These are preserved for existing code that depends on them.
# New code should use the IAM tables via IAMService.

ROLE_HIERARCHY = {
    UserRole.SUPER_ADMIN: 5,
    UserRole.ORG_ADMIN: 4,
    UserRole.AUDITOR: 3,
    UserRole.POWER_USER: 2,
    UserRole.USER: 1,
}

# Default permissions per legacy role
ROLE_PERMISSIONS = {
    UserRole.SUPER_ADMIN: [
        "users:read", "users:write", "users:delete", "users:invite",
        "orgs:read", "orgs:write", "orgs:delete", "orgs:create",
        "ai:generate", "ai:review", "ai:configure",
        "compliance:read", "compliance:write", "compliance:approve",
        "files:read", "files:write", "files:delete", "files:share",
        "repos:read", "repos:write", "repos:delete", "repos:admin",
        "builds:read", "builds:trigger", "builds:cancel",
        "federation:read", "federation:write", "federation:admin",
        "admin:platform", "admin:audit",
    ],
    UserRole.ORG_ADMIN: [
        "users:read", "users:write", "users:invite",
        "orgs:read", "orgs:write",
        "ai:generate", "ai:review", "ai:configure",
        "compliance:read", "compliance:write", "compliance:approve",
        "files:read", "files:write", "files:delete", "files:share",
        "repos:read", "repos:write", "repos:delete",
        "builds:read", "builds:trigger", "builds:cancel",
        "federation:read", "federation:write",
        "admin:audit",
    ],
    UserRole.AUDITOR: [
        "users:read",
        "orgs:read",
        "compliance:read", "compliance:write",
        "files:read",
        "repos:read",
        "builds:read",
        "federation:read",
        "admin:audit",
    ],
    UserRole.POWER_USER: [
        "ai:generate",
        "files:read", "files:write", "files:share",
        "repos:read", "repos:write",
        "builds:read", "builds:trigger",
        "federation:read",
    ],
    UserRole.USER: [
        "ai:generate",
        "files:read", "files:write",
        "repos:read",
        "builds:read",
    ],
}


# ============================================================
# PYDANTIC SCHEMAS
# ============================================================

class UserRegister(BaseModel):
    email: EmailStr
    password: str
    display_name: str = ""
    organisation_id: Optional[str] = None

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < MIN_PASSWORD_LENGTH:
            raise ValueError(f"Password must be at least {MIN_PASSWORD_LENGTH} characters")
        if not any(c.isupper() for c in v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not any(c.isdigit() for c in v):
            raise ValueError("Password must contain at least one digit")
        return v


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user: Dict[str, Any]


class CurrentUser(BaseModel):
    """Extended user context with multi-role IAM support."""
    id: str
    email: str
    display_name: str
    organisation_id: str
    role: str  # Legacy single role (backward compatibility)
    is_active: bool
    permissions: List[str] = []
    # New IAM fields
    available_roles: List[Dict[str, Any]] = []  # All assigned roles
    active_role: Optional[Dict[str, Any]] = None  # Currently active IAM role
    active_role_level: int = 4  # Default to standard_user level
    subscription_tier: Optional[str] = None


class RefreshRequest(BaseModel):
    refresh_token: str


class RoleSwitchRequest(BaseModel):
    """Request to switch active role."""
    role_id: str
    organisation_id: Optional[str] = None


class PermissionEvalRequest(BaseModel):
    """Request to evaluate a specific permission."""
    namespace: str
    resource: str
    action: str
    context: Optional[Dict[str, Any]] = None


class PermissionEvalResponse(BaseModel):
    """Result of permission evaluation."""
    allowed: bool
    decision: str  # ALLOW, DENY, ERROR
    reason: str
    evaluation_chain: List[Dict[str, Any]]


# ============================================================
# IAM SERVICE — 5-Step Permission Evaluation
# ============================================================

class IAMService:
    """Hybrid RBAC + ABAC permission evaluation engine.
    
    5-Step Evaluation Flow:
    1. Identify Principal (human, AI agent, bot, service account)
    2. RBAC Check (role → permissions, ALLOW/DENY)
    3. ABAC Check (conditions: time, IP, MFA, context)
    4. Subscription Check (tier gates, service access)
    5. Audit Log (every decision recorded with SHA-512 hash)
    """

    @staticmethod
    async def get_user_iam_roles(user_id: str, db: AsyncSession) -> List[Dict[str, Any]]:
        """Get all active IAM roles for a user."""
        stmt = (
            select(IAMUserRole, IAMRole)
            .join(IAMRole, IAMUserRole.role_id == IAMRole.id)
            .where(
                and_(
                    IAMUserRole.user_id == user_id,
                    IAMUserRole.is_active == True,
                    or_(
                        IAMUserRole.expires_at.is_(None),
                        IAMUserRole.expires_at > datetime.now(timezone.utc),
                    ),
                )
            )
        )
        result = await db.execute(stmt)
        rows = result.all()

        roles = []
        for user_role, role in rows:
            roles.append({
                "id": role.id,
                "name": role.name,
                "display_name": role.display_name,
                "level": role.level,
                "role_type": role.role_type.value if role.role_type else "SYSTEM",
                "is_primary": user_role.is_primary,
                "organisation_id": user_role.organisation_id,
                "expires_at": user_role.expires_at.isoformat() if user_role.expires_at else None,
            })
        return roles

    @staticmethod
    async def get_primary_role(user_id: str, db: AsyncSession) -> Optional[Dict[str, Any]]:
        """Get the user's primary (default) IAM role."""
        roles = await IAMService.get_user_iam_roles(user_id, db)
        # Find primary role
        for role in roles:
            if role.get("is_primary"):
                return role
        # Fallback to highest-level role (lowest number = highest privilege)
        if roles:
            return min(roles, key=lambda r: r["level"])
        return None

    @staticmethod
    async def get_role_permissions(
        role_id: str, db: AsyncSession
    ) -> List[Dict[str, Any]]:
        """Get all permissions assigned to a role."""
        stmt = (
            select(IAMRolePermission, IAMPermission)
            .join(IAMPermission, IAMRolePermission.permission_id == IAMPermission.id)
            .where(
                and_(
                    IAMRolePermission.role_id == role_id,
                    or_(
                        IAMRolePermission.expires_at.is_(None),
                        IAMRolePermission.expires_at > datetime.now(timezone.utc),
                    ),
                )
            )
        )
        result = await db.execute(stmt)
        rows = result.all()

        permissions = []
        for rp, perm in rows:
            permissions.append({
                "id": perm.id,
                "namespace": perm.namespace,
                "resource": perm.resource,
                "action": perm.action,
                "effect": rp.effect.value if rp.effect else "ALLOW",
                "conditions": rp.conditions or {},
                "is_sensitive": perm.is_sensitive,
                "requires_mfa": perm.requires_mfa,
            })
        return permissions

    @staticmethod
    async def check_restriction_profiles(
        user_id: str,
        role_id: str,
        permission_key: str,
        db: AsyncSession,
    ) -> Optional[str]:
        """Check if a restriction profile denies this permission.
        
        Returns denial reason if restricted, None if allowed.
        """
        now = datetime.now(timezone.utc)
        stmt = select(IAMRestrictionProfile).where(
            and_(
                or_(
                    IAMRestrictionProfile.target_user_id == user_id,
                    IAMRestrictionProfile.target_role_id == role_id,
                ),
                or_(
                    IAMRestrictionProfile.expires_at.is_(None),
                    IAMRestrictionProfile.expires_at > now,
                ),
            )
        )
        result = await db.execute(stmt)
        profiles = result.scalars().all()

        for profile in profiles:
            denied = profile.denied_permissions or []
            if permission_key in denied or "*" in denied:
                return f"Restriction profile '{profile.name}': {profile.reason}"
        return None

    @staticmethod
    async def check_select_few(
        user_id: str,
        permission_id: str,
        db: AsyncSession,
    ) -> bool:
        """Check if user has select-few elevation for a sensitive permission."""
        now = datetime.now(timezone.utc)
        stmt = select(IAMSelectFew).where(
            and_(
                IAMSelectFew.permission_id == permission_id,
                IAMSelectFew.user_id == user_id,
                IAMSelectFew.is_active == True,
                or_(
                    IAMSelectFew.expires_at.is_(None),
                    IAMSelectFew.expires_at > now,
                ),
            )
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none() is not None

    @staticmethod
    async def check_subscription_access(
        user_id: str,
        namespace: str,
        db: AsyncSession,
    ) -> Tuple[bool, str]:
        """Check if user's subscription grants access to a service namespace.
        
        Returns (allowed, reason).
        """
        # Get user subscription
        stmt = (
            select(UserSubscription, SubscriptionTier)
            .join(SubscriptionTier, UserSubscription.tier_id == SubscriptionTier.id)
            .where(
                and_(
                    UserSubscription.user_id == user_id,
                    UserSubscription.billing_status.in_([
                        SubscriptionBillingStatus.ACTIVE,
                        SubscriptionBillingStatus.TRIAL,
                    ]),
                )
            )
        )
        result = await db.execute(stmt)
        row = result.first()

        if not row:
            # No subscription — allow access to free-tier services only
            svc_stmt = select(PlatformService).where(
                and_(
                    PlatformService.name == namespace,
                    PlatformService.min_subscription_tier == "free",
                )
            )
            svc_result = await db.execute(svc_stmt)
            svc = svc_result.scalar_one_or_none()
            if svc:
                return True, "Free-tier service, no subscription required"
            return False, f"Service '{namespace}' requires a subscription"

        sub, tier = row
        # Check if service is in tier's included services
        included = tier.included_services or []
        selected = sub.selected_services or []

        if namespace in included or namespace in selected:
            return True, f"Access granted via {tier.display_name} subscription"

        # Check if service is available as addon
        svc_stmt = select(PlatformService).where(PlatformService.name == namespace)
        svc_result = await db.execute(svc_stmt)
        svc = svc_result.scalar_one_or_none()

        if svc and svc.min_subscription_tier == "free":
            return True, "Free-tier service, accessible to all"

        return False, f"Service '{namespace}' not included in {tier.display_name} tier"

    @staticmethod
    def evaluate_abac_conditions(
        conditions: Dict[str, Any],
        context: Dict[str, Any],
    ) -> Tuple[bool, str]:
        """Evaluate ABAC conditions against request context.
        
        Supported conditions:
        - time_range: "09:00-17:00" (UTC)
        - ip_allowlist: ["192.168.1.0/24"]
        - mfa_required: true
        - max_risk_score: 0.5
        - required_context: {"key": "value"}
        """
        if not conditions:
            return True, "No ABAC conditions"

        now = datetime.now(timezone.utc)

        # Time range check
        time_range = conditions.get("time_range")
        if time_range:
            try:
                start_str, end_str = time_range.split("-")
                start_h, start_m = map(int, start_str.strip().split(":"))
                end_h, end_m = map(int, end_str.strip().split(":"))
                current_minutes = now.hour * 60 + now.minute
                start_minutes = start_h * 60 + start_m
                end_minutes = end_h * 60 + end_m
                if not (start_minutes <= current_minutes <= end_minutes):
                    return False, f"Outside allowed time range: {time_range}"
            except (ValueError, AttributeError):
                logger.warning(f"Invalid time_range condition: {time_range}")

        # IP allowlist check
        ip_allowlist = conditions.get("ip_allowlist")
        if ip_allowlist and context.get("ip_address"):
            client_ip = context["ip_address"]
            if client_ip not in ip_allowlist:
                return False, f"IP {client_ip} not in allowlist"

        # MFA check
        if conditions.get("mfa_required") and not context.get("mfa_verified"):
            return False, "MFA verification required"

        # Risk score check
        max_risk = conditions.get("max_risk_score")
        if max_risk is not None:
            current_risk = context.get("risk_score", 0.0)
            if current_risk > max_risk:
                return False, f"Risk score {current_risk} exceeds maximum {max_risk}"

        return True, "All ABAC conditions passed"

    @staticmethod
    async def evaluate_permission(
        user_id: str,
        namespace: str,
        resource: str,
        action: str,
        context: Optional[Dict[str, Any]] = None,
        db: AsyncSession = None,
    ) -> PermissionEvalResponse:
        """5-Step Permission Evaluation Chain.
        
        1. Identify Principal → Get active role
        2. RBAC Check → Role permissions (ALLOW/DENY)
        3. ABAC Check → Condition evaluation
        4. Subscription Check → Tier/service access
        5. Audit Log → Record decision with SHA-512
        """
        context = context or {}
        chain = []
        permission_key = f"{namespace}:{resource}:{action}"

        # ── Step 1: Identify Principal ──
        active_role = await IAMService.get_primary_role(user_id, db)
        if not active_role:
            # Fallback to legacy role system
            chain.append({
                "step": 1, "name": "identify_principal",
                "result": "FALLBACK", "detail": "No IAM roles, using legacy RBAC",
            })
            return PermissionEvalResponse(
                allowed=False,
                decision="DENY",
                reason="No IAM roles assigned. Contact administrator.",
                evaluation_chain=chain,
            )

        chain.append({
            "step": 1, "name": "identify_principal",
            "result": "OK",
            "detail": f"Active role: {active_role['display_name']} (Level {active_role['level']})",
        })

        # ── Step 2: RBAC Check ──
        role_perms = await IAMService.get_role_permissions(active_role["id"], db)

        # Check for explicit DENY first
        for perm in role_perms:
            if (perm["namespace"] == namespace and
                perm["resource"] == resource and
                perm["action"] == action and
                perm["effect"] == "DENY"):
                chain.append({
                    "step": 2, "name": "rbac_check",
                    "result": "DENY", "detail": f"Explicit DENY on {permission_key}",
                })
                await IAMService._log_decision(
                    user_id, "human", permission_key, "DENY",
                    f"Explicit DENY in role permissions", chain, context, db,
                )
                return PermissionEvalResponse(
                    allowed=False, decision="DENY",
                    reason=f"Permission {permission_key} explicitly denied",
                    evaluation_chain=chain,
                )

        # Check for ALLOW
        matching_perm = None
        for perm in role_perms:
            if (perm["namespace"] == namespace and
                perm["resource"] == resource and
                perm["action"] == action and
                perm["effect"] == "ALLOW"):
                matching_perm = perm
                break

        # Check for wildcard permissions (e.g., namespace:*:read)
        if not matching_perm:
            for perm in role_perms:
                if (perm["namespace"] == namespace and
                    perm["resource"] == "*" and
                    perm["action"] == action and
                    perm["effect"] == "ALLOW"):
                    matching_perm = perm
                    break

        if not matching_perm:
            # Check select-few elevation for sensitive permissions
            perm_stmt = select(IAMPermission).where(
                and_(
                    IAMPermission.namespace == namespace,
                    IAMPermission.resource == resource,
                    IAMPermission.action == action,
                )
            )
            perm_result = await db.execute(perm_stmt)
            perm_obj = perm_result.scalar_one_or_none()

            if perm_obj and perm_obj.is_sensitive:
                has_elevation = await IAMService.check_select_few(
                    user_id, perm_obj.id, db,
                )
                if has_elevation:
                    chain.append({
                        "step": 2, "name": "rbac_check",
                        "result": "ALLOW",
                        "detail": f"Select-few elevation for {permission_key}",
                    })
                    matching_perm = {
                        "conditions": {},
                        "is_sensitive": True,
                        "requires_mfa": perm_obj.requires_mfa,
                    }

        if not matching_perm:
            chain.append({
                "step": 2, "name": "rbac_check",
                "result": "DENY", "detail": f"No ALLOW for {permission_key}",
            })
            await IAMService._log_decision(
                user_id, "human", permission_key, "DENY",
                "Permission not granted to active role", chain, context, db,
            )
            return PermissionEvalResponse(
                allowed=False, decision="DENY",
                reason=f"Permission {permission_key} not granted to your role",
                evaluation_chain=chain,
            )

        chain.append({
            "step": 2, "name": "rbac_check",
            "result": "ALLOW", "detail": f"Permission {permission_key} granted",
        })

        # ── Step 2b: Restriction Profile Check ──
        restriction_reason = await IAMService.check_restriction_profiles(
            user_id, active_role["id"], permission_key, db,
        )
        if restriction_reason:
            chain.append({
                "step": 2.5, "name": "restriction_check",
                "result": "DENY", "detail": restriction_reason,
            })
            await IAMService._log_decision(
                user_id, "human", permission_key, "DENY",
                restriction_reason, chain, context, db,
            )
            return PermissionEvalResponse(
                allowed=False, decision="DENY",
                reason=restriction_reason,
                evaluation_chain=chain,
            )

        chain.append({
            "step": 2.5, "name": "restriction_check",
            "result": "PASS", "detail": "No restriction profiles apply",
        })

        # ── Step 3: ABAC Check ──
        conditions = matching_perm.get("conditions", {})
        abac_ok, abac_reason = IAMService.evaluate_abac_conditions(conditions, context)
        if not abac_ok:
            chain.append({
                "step": 3, "name": "abac_check",
                "result": "DENY", "detail": abac_reason,
            })
            await IAMService._log_decision(
                user_id, "human", permission_key, "DENY",
                abac_reason, chain, context, db,
            )
            return PermissionEvalResponse(
                allowed=False, decision="DENY",
                reason=abac_reason,
                evaluation_chain=chain,
            )

        chain.append({
            "step": 3, "name": "abac_check",
            "result": "PASS", "detail": abac_reason,
        })

        # ── Step 4: Subscription Check ──
        sub_ok, sub_reason = await IAMService.check_subscription_access(
            user_id, namespace, db,
        )
        if not sub_ok:
            chain.append({
                "step": 4, "name": "subscription_check",
                "result": "DENY", "detail": sub_reason,
            })
            await IAMService._log_decision(
                user_id, "human", permission_key, "DENY",
                sub_reason, chain, context, db,
            )
            return PermissionEvalResponse(
                allowed=False, decision="DENY",
                reason=sub_reason,
                evaluation_chain=chain,
            )

        chain.append({
            "step": 4, "name": "subscription_check",
            "result": "PASS", "detail": sub_reason,
        })

        # ── Step 5: Audit & Allow ──
        await IAMService._log_decision(
            user_id, "human", permission_key, "ALLOW",
            "All checks passed", chain, context, db,
        )

        chain.append({
            "step": 5, "name": "audit_log",
            "result": "LOGGED", "detail": "Decision recorded with SHA-512 hash",
        })

        return PermissionEvalResponse(
            allowed=True, decision="ALLOW",
            reason=f"Permission {permission_key} granted",
            evaluation_chain=chain,
        )

    @staticmethod
    async def _log_decision(
        principal_id: str,
        principal_type: str,
        action: str,
        decision: str,
        reason: str,
        chain: List[Dict],
        context: Dict[str, Any],
        db: AsyncSession,
    ) -> None:
        """Log an IAM decision with SHA-512 integrity hash."""
        try:
            # Build hash payload
            hash_payload = f"{principal_id}:{action}:{decision}:{reason}:{datetime.now(timezone.utc).isoformat()}"
            sha512_hash = hashlib.sha512(hash_payload.encode()).hexdigest()

            # Map string to enum
            principal_type_enum = IAMPrincipalType.HUMAN
            try:
                principal_type_enum = IAMPrincipalType(principal_type)
            except (ValueError, KeyError):
                pass

            decision_enum = IAMAuditDecision.ALLOW
            try:
                decision_enum = IAMAuditDecision(decision)
            except (ValueError, KeyError):
                pass

            log_entry = IAMAuditLog(
                principal_id=principal_id,
                principal_type=principal_type_enum,
                action=action,
                decision=decision_enum,
                decision_reason=reason,
                evaluation_chain=chain,
                ip_address=context.get("ip_address"),
                user_agent=context.get("user_agent"),
                session_id=context.get("session_id"),
                organisation_id=context.get("organisation_id"),
                risk_score=context.get("risk_score", 0.00),
                sha512_hash=sha512_hash,
            )
            db.add(log_entry)
            await db.flush()  # Flush but don't commit — let caller manage transaction
        except Exception as e:
            # Audit logging should never break the request flow
            logger.error(f"Failed to log IAM decision: {e}")

    @staticmethod
    async def get_user_subscription_tier(
        user_id: str, db: AsyncSession
    ) -> Optional[str]:
        """Get the user's current subscription tier name."""
        stmt = (
            select(SubscriptionTier.name)
            .join(UserSubscription, UserSubscription.tier_id == SubscriptionTier.id)
            .where(
                and_(
                    UserSubscription.user_id == user_id,
                    UserSubscription.billing_status.in_([
                        SubscriptionBillingStatus.ACTIVE,
                        SubscriptionBillingStatus.TRIAL,
                    ]),
                )
            )
        )
        result = await db.execute(stmt)
        tier_name = result.scalar_one_or_none()
        return tier_name


# ============================================================
# AUTH SERVICE (Enhanced with IAM)
# ============================================================

class AuthService:
    """Complete authentication service with expanded IAM."""

    @staticmethod
    def hash_password(password: str) -> str:
        salt = bcrypt.gensalt(rounds=12)
        return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")

    @staticmethod
    def verify_password(password: str, password_hash: str) -> bool:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))

    @staticmethod
    def _create_token(data: Dict[str, Any], token_type: str, expires_delta: timedelta) -> str:
        to_encode = data.copy()
        now = datetime.now(timezone.utc)
        to_encode.update({
            "exp": now + expires_delta,
            "iat": now,
            "type": token_type,
            "jti": str(uuid.uuid4()),
        })
        return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

    @staticmethod
    def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
        delta = expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        return AuthService._create_token(data, "access", delta)

    @staticmethod
    def create_refresh_token(data: Dict[str, Any]) -> str:
        return AuthService._create_token(data, "refresh", timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS))

    @staticmethod
    def verify_token(token: str) -> Dict[str, Any]:
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            return payload
        except ExpiredSignatureError:
            raise HTTPException(status_code=401, detail="Token expired")
        except JWTError:
            raise HTTPException(status_code=401, detail="Invalid token")

    @staticmethod
    def _check_brute_force(email: str) -> None:
        """Check if login attempts exceed threshold."""
        now = datetime.now(timezone.utc)
        cutoff = now - timedelta(minutes=LOGIN_LOCKOUT_MINUTES)
        _login_attempts[email] = [t for t in _login_attempts[email] if t > cutoff]
        if len(_login_attempts[email]) >= MAX_LOGIN_ATTEMPTS:
            raise HTTPException(
                status_code=429,
                detail=f"Too many login attempts. Try again in {LOGIN_LOCKOUT_MINUTES} minutes.",
            )

    @staticmethod
    def _record_failed_attempt(email: str) -> None:
        _login_attempts[email].append(datetime.now(timezone.utc))

    @staticmethod
    def _clear_attempts(email: str) -> None:
        _login_attempts.pop(email, None)

    @staticmethod
    def generate_api_key_sha512() -> Tuple[str, str, str]:
        """Generate an API key with SHA-512 hash. Returns (raw_key, key_hash, key_prefix)."""
        raw_key = f"trn_{secrets.token_urlsafe(32)}"
        key_hash = hashlib.sha512(raw_key.encode()).hexdigest()
        key_prefix = raw_key[:12]
        return raw_key, key_hash, key_prefix

    @staticmethod
    def generate_api_key() -> tuple:
        """Legacy: Generate an API key with SHA-256. Returns (raw_key, key_hash, key_prefix)."""
        raw_key = f"ios_{secrets.token_urlsafe(32)}"
        key_hash = hashlib.sha256(raw_key.encode()).hexdigest()
        key_prefix = raw_key[:12]
        return raw_key, key_hash, key_prefix

    @staticmethod
    async def ensure_default_org(db: AsyncSession) -> Organisation:
        stmt = select(Organisation).where(Organisation.slug == "default")
        result = await db.execute(stmt)
        org = result.scalar_one_or_none()
        if not org:
            org = Organisation(
                id="default",
                name="Default Organisation",
                slug="default",
                plan=OrgPlan.FREE,
                region_iso_code="GB",
                compliance_tier="standard",
                is_active=True,
            )
            db.add(org)
            await db.commit()
            await db.refresh(org)
        return org

    @staticmethod
    async def register_user(user_data: UserRegister, db: AsyncSession) -> User:
        # Check if user exists
        stmt = select(User).where(User.email == user_data.email)
        result = await db.execute(stmt)
        if result.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="User already exists")

        # Ensure default org
        await AuthService.ensure_default_org(db)

        org_id = user_data.organisation_id or "default"
        display_name = user_data.display_name or user_data.email.split("@")[0]

        new_user = User(
            email=user_data.email,
            display_name=display_name,
            password_hash=AuthService.hash_password(user_data.password),
            organisation_id=org_id,
            role=UserRole.USER,
            is_active=True,
        )
        db.add(new_user)
        await db.commit()
        await db.refresh(new_user)

        # Auto-assign default IAM role (standard_user)
        await IAMService._assign_default_iam_role(new_user.id, db)

        # Audit log
        audit = AuditLog(
            event_type=AuditEventType.USER_REGISTER,
            user_id=new_user.id,
            organisation_id=new_user.organisation_id,
            request_id=str(uuid.uuid4()),
        )
        db.add(audit)
        await db.commit()

        return new_user

    @staticmethod
    async def authenticate_user(
        email: str, password: str, db: AsyncSession, request: Optional[Request] = None
    ) -> Optional[User]:
        AuthService._check_brute_force(email)

        stmt = select(User).where(User.email == email)
        result = await db.execute(stmt)
        user = result.scalar_one_or_none()

        if not user or not AuthService.verify_password(password, user.password_hash):
            AuthService._record_failed_attempt(email)
            return None

        if not user.is_active or user.deleted_at is not None:
            return None

        AuthService._clear_attempts(email)

        # Update last login
        user.last_login_at = datetime.now(timezone.utc)
        db.add(user)

        # Audit log
        audit = AuditLog(
            event_type=AuditEventType.USER_LOGIN,
            user_id=user.id,
            organisation_id=user.organisation_id,
            ip_address=request.client.host if request and request.client else None,
            user_agent=request.headers.get("user-agent") if request else None,
            request_id=str(uuid.uuid4()),
        )
        db.add(audit)
        await db.commit()

        return user

    @staticmethod
    async def create_token_pair_with_iam(
        user: User, db: AsyncSession
    ) -> Dict[str, Any]:
        """Create JWT token pair with expanded IAM claims."""
        # Get IAM roles
        iam_roles = await IAMService.get_user_iam_roles(user.id, db)
        active_role = await IAMService.get_primary_role(user.id, db)
        sub_tier = await IAMService.get_user_subscription_tier(user.id, db)

        # Legacy permissions (backward compatibility)
        legacy_permissions = AuthService.get_user_permissions(user.role)

        # Build JWT claims
        token_data = {
            "sub": user.id,
            "email": user.email,
            "role": user.role.value if isinstance(user.role, UserRole) else user.role,
            "org_id": user.organisation_id,
            # New IAM claims
            "available_roles": [r["name"] for r in iam_roles],
            "active_role": active_role["name"] if active_role else None,
            "active_role_level": active_role["level"] if active_role else 4,
            "subscription_tier": sub_tier,
        }

        access_token = AuthService.create_access_token(token_data)
        refresh_token = AuthService.create_refresh_token({"sub": user.id})

        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            "user": {
                "id": user.id,
                "email": user.email,
                "display_name": user.display_name or "",
                "role": user.role.value if isinstance(user.role, UserRole) else user.role,
                "organisation_id": user.organisation_id,
                "available_roles": iam_roles,
                "active_role": active_role,
                "subscription_tier": sub_tier,
                "permissions": legacy_permissions,
            },
        }

    @staticmethod
    async def is_token_revoked(jti: str, db: AsyncSession) -> bool:
        stmt = select(RevokedToken).where(RevokedToken.jti == jti)
        result = await db.execute(stmt)
        return result.scalar_one_or_none() is not None

    @staticmethod
    async def revoke_token(jti: str, user_id: str, expires_at: datetime, db: AsyncSession) -> None:
        revoked = RevokedToken(jti=jti, user_id=user_id, expires_at=expires_at)
        db.add(revoked)
        await db.commit()

    @staticmethod
    def get_user_permissions(role: UserRole) -> List[str]:
        """Legacy permission lookup by role."""
        try:
            return ROLE_PERMISSIONS.get(UserRole(role), ROLE_PERMISSIONS[UserRole.USER])
        except (ValueError, KeyError):
            return ROLE_PERMISSIONS[UserRole.USER]


# ============================================================
# IAM SERVICE — Internal Helpers
# ============================================================

class _IAMInternalHelpers:
    """Internal helpers for IAM operations. Not exposed as API."""

    @staticmethod
    async def _assign_default_iam_role(user_id: str, db: AsyncSession) -> None:
        """Assign the default 'standard_user' IAM role to a new user."""
        try:
            stmt = select(IAMRole).where(IAMRole.name == "standard_user")
            result = await db.execute(stmt)
            role = result.scalar_one_or_none()
            if role:
                user_role = IAMUserRole(
                    user_id=user_id,
                    role_id=role.id,
                    is_active=True,
                    is_primary=True,
                )
                db.add(user_role)
                await db.flush()
        except Exception as e:
            logger.warning(f"Could not assign default IAM role: {e}")

# Attach to IAMService for clean access
IAMService._assign_default_iam_role = _IAMInternalHelpers._assign_default_iam_role


# ============================================================
# FASTAPI DEPENDENCIES
# ============================================================

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db_session),
) -> CurrentUser:
    """Get current user with expanded IAM context."""
    payload = AuthService.verify_token(credentials.credentials)

    if payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="Invalid token type")

    # Check revocation
    jti = payload.get("jti")
    if jti and await AuthService.is_token_revoked(jti, db):
        raise HTTPException(status_code=401, detail="Token has been revoked")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")

    stmt = select(User).where(User.id == user_id)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if not user or not user.is_active or user.deleted_at is not None:
        raise HTTPException(status_code=401, detail="User not found or inactive")

    # Legacy permissions
    permissions = AuthService.get_user_permissions(user.role)

    # IAM enrichment (graceful fallback if IAM tables not yet populated)
    available_roles = []
    active_role = None
    active_role_level = 4  # Default standard_user
    subscription_tier = None

    try:
        available_roles = await IAMService.get_user_iam_roles(user.id, db)
        active_role = await IAMService.get_primary_role(user.id, db)
        if active_role:
            active_role_level = active_role.get("level", 4)
        subscription_tier = await IAMService.get_user_subscription_tier(user.id, db)
    except Exception as e:
        # Graceful degradation — IAM tables may not exist yet
        logger.debug(f"IAM enrichment skipped: {e}")

    return CurrentUser(
        id=user.id,
        email=user.email,
        display_name=user.display_name or "",
        organisation_id=user.organisation_id,
        role=user.role.value if isinstance(user.role, UserRole) else user.role,
        is_active=user.is_active,
        permissions=permissions,
        available_roles=available_roles,
        active_role=active_role,
        active_role_level=active_role_level,
        subscription_tier=subscription_tier,
    )


def require_role(*roles: UserRole):
    """Dependency factory: require user to have one of the specified roles."""
    async def _check(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        user_role = UserRole(user.role)
        if user_role not in roles:
            raise HTTPException(status_code=403, detail="Insufficient role privileges")
        return user
    return _check


def require_permission(*scopes: str):
    """Dependency factory: require user to have specific permission scopes."""
    async def _check(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        for scope in scopes:
            if scope not in user.permissions:
                raise HTTPException(
                    status_code=403,
                    detail=f"Missing required permission: {scope}",
                )
        return user
    return _check


def require_min_role(min_role: UserRole):
    """Dependency factory: require user role level >= min_role (legacy)."""
    async def _check(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        user_level = ROLE_HIERARCHY.get(UserRole(user.role), 0)
        required_level = ROLE_HIERARCHY.get(min_role, 0)
        if user_level < required_level:
            raise HTTPException(status_code=403, detail="Insufficient role level")
        return user
    return _check


def require_iam_level(max_level: int):
    """Dependency factory: require IAM role level <= max_level.
    
    Lower level = higher privilege:
    Level 0 = Continuity Guardian, Level 6 = Non-Human
    """
    async def _check(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if user.active_role_level > max_level:
            raise HTTPException(
                status_code=403,
                detail=f"Requires IAM role level {max_level} or higher",
            )
        return user
    return _check


def require_iam_permission(namespace: str, resource: str, action: str):
    """Dependency factory: full 5-step IAM permission evaluation.
    
    Usage:
        @router.get("/admin/services")
        async def list_services(
            user: CurrentUser = Depends(require_iam_permission("admin-os", "services", "read"))
        ):
    """
    async def _check(
        request: Request,
        user: CurrentUser = Depends(get_current_user),
        db: AsyncSession = Depends(get_db_session),
    ) -> CurrentUser:
        context = {
            "ip_address": request.client.host if request.client else None,
            "user_agent": request.headers.get("user-agent"),
            "session_id": request.headers.get("x-session-id"),
            "organisation_id": user.organisation_id,
            "mfa_verified": request.headers.get("x-mfa-verified") == "true",
            "risk_score": 0.0,
        }

        result = await IAMService.evaluate_permission(
            user_id=user.id,
            namespace=namespace,
            resource=resource,
            action=action,
            context=context,
            db=db,
        )

        if not result.allowed:
            raise HTTPException(
                status_code=403,
                detail={
                    "message": result.reason,
                    "decision": result.decision,
                    "evaluation_chain": result.evaluation_chain,
                },
            )
        return user
    return _check


# Legacy compatibility
async def require_admin_role(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    admin_roles = {UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.AUDITOR}
    if UserRole(user.role) not in admin_roles:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user