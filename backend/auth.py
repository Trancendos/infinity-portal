# auth.py — Unified authentication & IAM for Infinity OS
# Features:
# - Secure JWT with JTI for revocation
# - 5-tier RBAC (super_admin, org_admin, auditor, power_user, user)
# - Fine-grained permission scopes
# - Password policy enforcement (min 12 chars)
# - Brute force protection
# - Token revocation support
# - API key authentication

import os
import uuid
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any, List
from collections import defaultdict

import bcrypt
from jose import jwt, JWTError, ExpiredSignatureError
from fastapi import HTTPException, Depends, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db_session
from models import (
    User, Organisation, AuditLog, AuditEventType, UserRole,
    RevokedToken, Permission, APIKey, OrgPlan, utcnow,
)

# ============================================================
# CONFIGURATION
# ============================================================

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "")
if not SECRET_KEY or SECRET_KEY == "change-this-to-a-secure-random-key-in-production":
    SECRET_KEY = secrets.token_urlsafe(64)
    import logging
    logging.getLogger(__name__).warning(
        "⚠️  JWT_SECRET_KEY not set or insecure. Generated ephemeral key. "
        "Set JWT_SECRET_KEY in production!"
    )

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "7"))
MIN_PASSWORD_LENGTH = 12
MAX_LOGIN_ATTEMPTS = 5
LOGIN_LOCKOUT_MINUTES = 15

security = HTTPBearer()

# In-memory brute force tracker (use Redis in production)
_login_attempts: Dict[str, list] = defaultdict(list)


# ============================================================
# ROLE HIERARCHY & PERMISSIONS
# ============================================================

ROLE_HIERARCHY = {
    UserRole.SUPER_ADMIN: 5,
    UserRole.ORG_ADMIN: 4,
    UserRole.AUDITOR: 3,
    UserRole.POWER_USER: 2,
    UserRole.USER: 1,
}

# Default permissions per role
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
    id: str
    email: str
    display_name: str
    organisation_id: str
    role: str
    is_active: bool
    permissions: List[str] = []


class RefreshRequest(BaseModel):
    refresh_token: str


# ============================================================
# AUTH SERVICE
# ============================================================

class AuthService:
    """Complete authentication service with IAM"""

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
        """Check if login attempts exceed threshold"""
        now = datetime.now(timezone.utc)
        cutoff = now - timedelta(minutes=LOGIN_LOCKOUT_MINUTES)
        # Clean old attempts
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
    def generate_api_key() -> tuple:
        """Generate an API key. Returns (raw_key, key_hash, key_prefix)"""
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
    async def authenticate_user(email: str, password: str, db: AsyncSession, request: Optional[Request] = None) -> Optional[User]:
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
        try:
            return ROLE_PERMISSIONS.get(UserRole(role), ROLE_PERMISSIONS[UserRole.USER])
        except (ValueError, KeyError):
            return ROLE_PERMISSIONS[UserRole.USER]


# ============================================================
# FASTAPI DEPENDENCIES
# ============================================================

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db_session),
) -> CurrentUser:
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

    permissions = AuthService.get_user_permissions(user.role)

    return CurrentUser(
        id=user.id,
        email=user.email,
        display_name=user.display_name or "",
        organisation_id=user.organisation_id,
        role=user.role.value if isinstance(user.role, UserRole) else user.role,
        is_active=user.is_active,
        permissions=permissions,
    )


def require_role(*roles: UserRole):
    """Dependency factory: require user to have one of the specified roles"""
    async def _check(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        user_role = UserRole(user.role)
        if user_role not in roles:
            raise HTTPException(status_code=403, detail="Insufficient role privileges")
        return user
    return _check


def require_permission(*scopes: str):
    """Dependency factory: require user to have specific permission scopes"""
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
    """Dependency factory: require user role level >= min_role"""
    async def _check(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        user_level = ROLE_HIERARCHY.get(UserRole(user.role), 0)
        required_level = ROLE_HIERARCHY.get(min_role, 0)
        if user_level < required_level:
            raise HTTPException(status_code=403, detail="Insufficient role level")
        return user
    return _check


# Legacy compatibility
async def require_admin_role(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    admin_roles = {UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.AUDITOR}
    if UserRole(user.role) not in admin_roles:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user