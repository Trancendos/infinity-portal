# routers/auth.py - Authentication endpoints
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from auth import (
    AuthService, UserRegister, UserLogin, TokenResponse,
    get_current_user, CurrentUser,
)
from database import get_db_session

router = APIRouter(prefix="/api/v1/auth", tags=["Authentication"])


def _build_token_response(user_obj) -> TokenResponse:
    """Build token response from a user ORM instance"""
    token_data = {
        "sub": user_obj.id,
        "email": user_obj.email,
        "organisation_id": user_obj.organisation_id,
        "role": user_obj.role,
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
            "organisation_id": user_obj.organisation_id,
            "role": user_obj.role,
        },
    )


@router.post("/register", response_model=TokenResponse)
async def register(
    user_data: UserRegister,
    db: AsyncSession = Depends(get_db_session),
):
    """Register new user"""
    user = await AuthService.register_user(user_data, db)
    return _build_token_response(user)


@router.post("/login", response_model=TokenResponse)
async def login(
    credentials: UserLogin,
    db: AsyncSession = Depends(get_db_session),
):
    """Login user"""
    user = await AuthService.authenticate_user(
        credentials.email, credentials.password, db
    )
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return _build_token_response(user)


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(user: CurrentUser = Depends(get_current_user)):
    """Refresh access token"""
    token_data = {
        "sub": user.id,
        "email": user.email,
        "organisation_id": user.organisation_id,
        "role": user.role,
    }
    access_token = AuthService.create_access_token(token_data)
    refresh_tkn = AuthService.create_refresh_token(token_data)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_tkn,
        expires_in=1800,
        user={
            "id": user.id,
            "email": user.email,
            "organisation_id": user.organisation_id,
            "role": user.role,
        },
    )


@router.get("/me")
async def get_current_user_info(user: CurrentUser = Depends(get_current_user)):
    """Get current user information"""
    return user
