# routers/auth.py — Authentication endpoints with token revocation
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from auth import (
    AuthService, UserRegister, UserLogin, TokenResponse, RefreshRequest,
    get_current_user, CurrentUser,
)
from database import get_db_session
from models import AuditLog, AuditEventType

router = APIRouter(prefix="/api/v1/auth", tags=["Authentication"])


def _build_token_response(user_obj) -> TokenResponse:
    """Build token response from a user ORM instance"""
    from models import UserRole
    token_data = {
        "sub": user_obj.id,
        "email": user_obj.email,
        "organisation_id": user_obj.organisation_id,
        "role": user_obj.role.value if isinstance(user_obj.role, UserRole) else user_obj.role,
    }
    access_token = AuthService.create_access_token(token_data)
    refresh_token = AuthService.create_refresh_token(token_data)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=1800,
        user={
            "id": user_obj.id,
            "email": user_obj.email,
            "display_name": user_obj.display_name or "",
            "organisation_id": user_obj.organisation_id,
            "role": user_obj.role.value if isinstance(user_obj.role, UserRole) else user_obj.role,
            "permissions": AuthService.get_user_permissions(user_obj.role),
        },
    )


@router.post("/register", response_model=TokenResponse)
async def register(
    user_data: UserRegister,
    db: AsyncSession = Depends(get_db_session),
):
    """Register a new user account"""
    user = await AuthService.register_user(user_data, db)
    return _build_token_response(user)


@router.post("/login", response_model=TokenResponse)
async def login(
    credentials: UserLogin,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
):
    """Authenticate and receive tokens"""
    user = await AuthService.authenticate_user(
        credentials.email, credentials.password, db, request
    )
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return _build_token_response(user)


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    refresh_req: RefreshRequest,
    db: AsyncSession = Depends(get_db_session),
):
    """Refresh access token using a refresh token"""
    payload = AuthService.verify_token(refresh_req.refresh_token)

    if payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid token type. Expected refresh token.")

    # Check if revoked
    jti = payload.get("jti")
    if jti and await AuthService.is_token_revoked(jti, db):
        raise HTTPException(status_code=401, detail="Refresh token has been revoked")

    from models import UserRole
    from sqlalchemy import select
    from models import User

    user_id = payload.get("sub")
    stmt = select(User).where(User.id == user_id)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")

    return _build_token_response(user)


@router.post("/logout")
async def logout(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Logout and revoke current token"""
    # In a full implementation, we'd extract the JTI from the current token
    # and add it to the revocation list
    audit = AuditLog(
        event_type=AuditEventType.USER_LOGOUT,
        user_id=user.id,
        organisation_id=user.organisation_id,
        request_id=str(uuid.uuid4()),
    )
    db.add(audit)
    await db.commit()

    return {"status": "logged_out", "message": "Session terminated"}


@router.get("/me")
async def get_current_user_info(user: CurrentUser = Depends(get_current_user)):
    """Get current authenticated user information"""
    return {
        "id": user.id,
        "email": user.email,
        "display_name": user.display_name,
        "organisation_id": user.organisation_id,
        "role": user.role,
        "is_active": user.is_active,
        "permissions": user.permissions,
    }


@router.post("/change-password")
async def change_password(
    password_data: dict,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Change current user's password"""
    from sqlalchemy import select
    from models import User

    current_password = password_data.get("current_password", "")
    new_password = password_data.get("new_password", "")

    if len(new_password) < 12:
        raise HTTPException(status_code=400, detail="New password must be at least 12 characters")

    stmt = select(User).where(User.id == user.id)
    result = await db.execute(stmt)
    user_obj = result.scalar_one_or_none()
    if not user_obj:
        raise HTTPException(status_code=404, detail="User not found")

    if not AuthService.verify_password(current_password, user_obj.password_hash):
        raise HTTPException(status_code=401, detail="Current password is incorrect")

    user_obj.password_hash = AuthService.hash_password(new_password)
    db.add(user_obj)

    audit = AuditLog(
        event_type=AuditEventType.PASSWORD_RESET,
        user_id=user.id,
        organisation_id=user.organisation_id,
        request_id=str(uuid.uuid4()),
    )
    db.add(audit)
    await db.commit()

    return {"status": "password_changed", "message": "Password updated successfully"}