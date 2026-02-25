# auth.py - Complete JWT authentication with multi-tenancy
import os
import uuid
from datetime import datetime, timedelta
from typing import Optional, Dict, Any

import bcrypt
from jose import jwt, JWTError, ExpiredSignatureError
from fastapi import HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db_session
from models import User, Organisation, AuditLog, AuditEventType

# Security configuration
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "change-this-to-a-secure-random-key-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
REFRESH_TOKEN_EXPIRE_DAYS = 7

security = HTTPBearer()


# --- Pydantic Schemas ---

class UserRegister(BaseModel):
    email: EmailStr
    password: str
    organisation_id: Optional[str] = None

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
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
    organisation_id: str
    role: str
    is_active: bool


# --- Auth Service ---

class AuthService:
    """Complete authentication service"""

    @staticmethod
    def hash_password(password: str) -> str:
        """Hash password using bcrypt"""
        salt = bcrypt.gensalt(rounds=12)
        return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")

    @staticmethod
    def verify_password(password: str, password_hash: str) -> bool:
        """Verify password against hash"""
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))

    @staticmethod
    def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
        """Create JWT access token"""
        to_encode = data.copy()
        expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
        to_encode.update({"exp": expire, "iat": datetime.utcnow(), "type": "access"})
        return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

    @staticmethod
    def create_refresh_token(data: Dict[str, Any]) -> str:
        """Create JWT refresh token"""
        to_encode = data.copy()
        expire = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
        to_encode.update({"exp": expire, "iat": datetime.utcnow(), "type": "refresh"})
        return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

    @staticmethod
    def verify_token(token: str) -> Dict[str, Any]:
        """Verify and decode JWT token"""
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            return payload
        except ExpiredSignatureError:
            raise HTTPException(status_code=401, detail="Token expired")
        except JWTError:
            raise HTTPException(status_code=401, detail="Invalid token")

    @staticmethod
    async def ensure_default_org(db: AsyncSession) -> None:
        """Ensure the default organisation exists"""
        stmt = select(Organisation).where(Organisation.id == "default")
        result = await db.execute(stmt)
        organisation = result.scalar_one_or_none()
        if not organisation:
            default_org = Organisation(
                id="default",
                name="Default Organisation",
                region_iso_code="US",
                compliance_tier="standard",
                is_active=True,
            )
            db.add(default_org)
            await db.commit()

    @staticmethod
    async def register_user(user_data: UserRegister, db: AsyncSession) -> User:
        """Register new user"""
        # Check if user exists
        stmt = select(User).where(User.email == user_data.email)
        result = await db.execute(stmt)
        existing_user = result.scalar_one_or_none()

        if existing_user:
            raise HTTPException(status_code=400, detail="User already exists")

        # Ensure default organisation exists
        await AuthService.ensure_default_org(db)

        # Create new user
        hashed_password = AuthService.hash_password(user_data.password)
        new_user = User(
            email=user_data.email,
            password_hash=hashed_password,
            organisation_id=user_data.organisation_id or "default",
            role="user",
            is_active=True,
        )

        db.add(new_user)
        await db.commit()
        await db.refresh(new_user)

        # Log registration
        audit_log = AuditLog(
            event_type=AuditEventType.USER_REGISTER,
            user_id=new_user.id,
            organisation_id=new_user.organisation_id,
            request_id=str(uuid.uuid4()),
        )
        db.add(audit_log)
        await db.commit()

        return new_user

    @staticmethod
    async def authenticate_user(email: str, password: str, db: AsyncSession) -> Optional[User]:
        """Authenticate user credentials"""
        stmt = select(User).where(User.email == email)
        result = await db.execute(stmt)
        user = result.scalar_one_or_none()

        if not user:
            return None

        if not AuthService.verify_password(password, user.password_hash):
            return None

        if not user.is_active:
            return None

        # Update last login
        user.last_login = datetime.utcnow()
        db.add(user)
        await db.commit()

        # Log login
        audit_log = AuditLog(
            event_type=AuditEventType.USER_LOGIN,
            user_id=user.id,
            organisation_id=user.organisation_id,
            request_id=str(uuid.uuid4()),
        )
        db.add(audit_log)
        await db.commit()

        return user


# --- FastAPI Dependencies ---

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db_session),
) -> CurrentUser:
    """Get current authenticated user"""
    payload = AuthService.verify_token(credentials.credentials)

    if payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="Invalid token type")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")

    stmt = select(User).where(User.id == user_id)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")

    return CurrentUser(
        id=user.id,
        email=user.email,
        organisation_id=user.organisation_id,
        role=user.role,
        is_active=user.is_active,
    )


async def require_admin_role(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    """Require admin role"""
    if user.role not in ("admin", "auditor"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


async def require_organisation_access(
    organisation_id: str,
    user: CurrentUser = Depends(get_current_user),
) -> CurrentUser:
    """Ensure user has access to organisation"""
    if user.organisation_id != organisation_id and user.role != "admin":
        raise HTTPException(status_code=403, detail="Access denied")
    return user
