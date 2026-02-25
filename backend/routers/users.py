# routers/users.py — User management with full CRUD + invitation
import uuid
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from auth import (
    get_current_user, require_permission, require_min_role,
    AuthService, CurrentUser,
)
from database import get_db_session
from models import User, AuditLog, AuditEventType, UserRole, utcnow

router = APIRouter(prefix="/api/v1/users", tags=["Users"])


# --- Schemas ---

class UserOut(BaseModel):
    id: str
    email: str
    display_name: str
    avatar_url: Optional[str] = None
    role: str
    organisation_id: str
    is_active: bool
    mfa_enabled: bool
    last_login_at: Optional[str] = None
    created_at: str


class UserUpdate(BaseModel):
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    preferences: Optional[dict] = None


class RoleUpdate(BaseModel):
    role: str = Field(..., description="One of: super_admin, org_admin, auditor, power_user, user")


class UserInvite(BaseModel):
    email: EmailStr
    role: str = "user"
    display_name: Optional[str] = None


class PasswordReset(BaseModel):
    new_password: str = Field(..., min_length=12)


# --- Helpers ---

def _user_to_out(u: User) -> UserOut:
    return UserOut(
        id=u.id,
        email=u.email,
        display_name=u.display_name or "",
        avatar_url=u.avatar_url,
        role=u.role.value if isinstance(u.role, UserRole) else u.role,
        organisation_id=u.organisation_id,
        is_active=u.is_active,
        mfa_enabled=u.mfa_enabled or False,
        last_login_at=u.last_login_at.isoformat() if u.last_login_at else None,
        created_at=u.created_at.isoformat() if u.created_at else "",
    )


# --- Endpoints ---

@router.get("", response_model=List[UserOut])
async def list_users(
    user: CurrentUser = Depends(require_permission("users:read")),
    db: AsyncSession = Depends(get_db_session),
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
    role: Optional[str] = None,
    active_only: bool = True,
):
    """List users in the current organisation"""
    stmt = (
        select(User)
        .where(User.organisation_id == user.organisation_id)
        .where(User.deleted_at.is_(None))
        .order_by(User.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    if active_only:
        stmt = stmt.where(User.is_active == True)
    if role:
        try:
            stmt = stmt.where(User.role == UserRole(role))
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid role: {role}")

    result = await db.execute(stmt)
    users = result.scalars().all()
    return [_user_to_out(u) for u in users]


@router.get("/count")
async def count_users(
    user: CurrentUser = Depends(require_permission("users:read")),
    db: AsyncSession = Depends(get_db_session),
):
    """Count users in the current organisation"""
    stmt = (
        select(func.count(User.id))
        .where(User.organisation_id == user.organisation_id)
        .where(User.deleted_at.is_(None))
        .where(User.is_active == True)
    )
    result = await db.execute(stmt)
    total = result.scalar() or 0

    # Count by role
    role_stmt = (
        select(User.role, func.count(User.id))
        .where(User.organisation_id == user.organisation_id)
        .where(User.deleted_at.is_(None))
        .where(User.is_active == True)
        .group_by(User.role)
    )
    role_result = await db.execute(role_stmt)
    by_role = {
        (r.value if isinstance(r, UserRole) else r): c
        for r, c in role_result.all()
    }

    return {"total": total, "by_role": by_role}


@router.get("/{user_id}", response_model=UserOut)
async def get_user(
    user_id: str,
    current_user: CurrentUser = Depends(require_permission("users:read")),
    db: AsyncSession = Depends(get_db_session),
):
    """Get a specific user"""
    stmt = select(User).where(
        User.id == user_id,
        User.organisation_id == current_user.organisation_id,
        User.deleted_at.is_(None),
    )
    result = await db.execute(stmt)
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    return _user_to_out(target)


@router.patch("/{user_id}", response_model=UserOut)
async def update_user(
    user_id: str,
    update: UserUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Update user profile (own profile or admin)"""
    if user_id != current_user.id and "users:write" not in current_user.permissions:
        raise HTTPException(status_code=403, detail="Cannot update other users")

    stmt = select(User).where(User.id == user_id, User.deleted_at.is_(None))
    result = await db.execute(stmt)
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    if update.display_name is not None:
        target.display_name = update.display_name
    if update.avatar_url is not None:
        target.avatar_url = update.avatar_url
    if update.preferences is not None:
        target.preferences = update.preferences

    db.add(target)
    await db.commit()
    await db.refresh(target)
    return _user_to_out(target)


@router.patch("/{user_id}/role")
async def update_user_role(
    user_id: str,
    role_update: RoleUpdate,
    current_user: CurrentUser = Depends(require_permission("users:write")),
    db: AsyncSession = Depends(get_db_session),
):
    """Change a user's role (org_admin+ only)"""
    try:
        new_role = UserRole(role_update.role)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid role: {role_update.role}")

    # Cannot assign super_admin unless you are super_admin
    if new_role == UserRole.SUPER_ADMIN and current_user.role != UserRole.SUPER_ADMIN.value:
        raise HTTPException(status_code=403, detail="Only super_admin can assign super_admin role")

    stmt = select(User).where(
        User.id == user_id,
        User.organisation_id == current_user.organisation_id,
        User.deleted_at.is_(None),
    )
    result = await db.execute(stmt)
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    old_role = target.role
    target.role = new_role
    db.add(target)

    # Audit
    audit = AuditLog(
        event_type=AuditEventType.USER_ROLE_CHANGED,
        user_id=current_user.id,
        organisation_id=current_user.organisation_id,
        resource_type="user",
        resource_id=user_id,
        governance_metadata={"old_role": str(old_role), "new_role": role_update.role},
        request_id=str(uuid.uuid4()),
    )
    db.add(audit)
    await db.commit()

    return {"user_id": user_id, "old_role": str(old_role), "new_role": role_update.role}


@router.delete("/{user_id}")
async def deactivate_user(
    user_id: str,
    current_user: CurrentUser = Depends(require_permission("users:write")),
    db: AsyncSession = Depends(get_db_session),
):
    """Soft-delete / deactivate a user"""
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot deactivate yourself")

    stmt = select(User).where(
        User.id == user_id,
        User.organisation_id == current_user.organisation_id,
        User.deleted_at.is_(None),
    )
    result = await db.execute(stmt)
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    target.is_active = False
    target.deleted_at = datetime.now(timezone.utc)
    db.add(target)

    audit = AuditLog(
        event_type=AuditEventType.USER_DEACTIVATED,
        user_id=current_user.id,
        organisation_id=current_user.organisation_id,
        resource_type="user",
        resource_id=user_id,
        request_id=str(uuid.uuid4()),
    )
    db.add(audit)
    await db.commit()

    return {"user_id": user_id, "status": "deactivated"}


@router.post("/invite")
async def invite_user(
    invite: UserInvite,
    current_user: CurrentUser = Depends(require_permission("users:invite")),
    db: AsyncSession = Depends(get_db_session),
):
    """Invite a new user to the organisation"""
    # Check if user already exists
    stmt = select(User).where(User.email == invite.email)
    result = await db.execute(stmt)
    existing = result.scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="User with this email already exists")

    try:
        role = UserRole(invite.role)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid role: {invite.role}")

    # Create user with temporary password (they'll need to reset)
    import secrets
    temp_password = secrets.token_urlsafe(16) + "A1!"  # Meets password policy

    new_user = User(
        email=invite.email,
        display_name=invite.display_name or invite.email.split("@")[0],
        password_hash=AuthService.hash_password(temp_password),
        organisation_id=current_user.organisation_id,
        role=role,
        is_active=True,
    )
    db.add(new_user)

    audit = AuditLog(
        event_type=AuditEventType.USER_INVITED,
        user_id=current_user.id,
        organisation_id=current_user.organisation_id,
        resource_type="user",
        resource_id=new_user.id,
        governance_metadata={"invited_email": invite.email, "role": invite.role},
        request_id=str(uuid.uuid4()),
    )
    db.add(audit)
    await db.commit()

    return {
        "user_id": new_user.id,
        "email": invite.email,
        "role": invite.role,
        "status": "invited",
        "message": "User created. Password reset required on first login.",
    }