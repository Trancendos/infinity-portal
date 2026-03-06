# routers/rbac.py — RBAC — Fine-grained Role and Permission Management
# ============================================================
# TRN-IAM-002b: Real implementations replacing all stubs
# ============================================================
# Endpoints:
#   GET    /roles                    — List all IAM roles
#   GET    /roles/{role_id}          — Get role details
#   POST   /roles                    — Create custom role
#   PUT    /roles/{role_id}          — Update role
#   DELETE /roles/{role_id}          — Delete custom role
#   GET    /roles/{role_id}/permissions — Get role permissions
#   PUT    /roles/{role_id}/permissions — Update role permissions
#   GET    /users/{user_id}/roles    — Get user's assigned roles
#   POST   /users/{user_id}/roles    — Assign role to user
#   DELETE /users/{user_id}/roles/{role_id} — Revoke role from user
#   POST   /evaluate                 — Evaluate permission (5-step chain)
#   POST   /switch-role              — Switch active role
#   GET    /audit                    — Get RBAC audit log
#   GET    /restrictions             — List restriction profiles
#   POST   /restrictions             — Create restriction profile
#   GET    /select-few               — List select-few elevations
#   POST   /select-few               — Grant select-few elevation
# ============================================================
# Ticket: TRN-IAM-002b
# Revert: ec68e4b
# ============================================================

from typing import Optional, Dict, Any, List
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Path, Request
from pydantic import BaseModel, Field
from sqlalchemy import select, and_, or_, func, desc
from sqlalchemy.ext.asyncio import AsyncSession

from auth import (
    get_current_user, require_iam_level, require_iam_permission,
    require_min_role, CurrentUser, IAMService,
    PermissionEvalRequest, PermissionEvalResponse, RoleSwitchRequest,
    AuthService,
)
from database import get_db_session
from models import (
    IAMRole, IAMPermission, IAMRolePermission, IAMUserRole,
    IAMRestrictionProfile, IAMSelectFew, IAMAuditLog,
    IAMRoleType, IAMPermissionEffect, IAMAuditDecision,
    IAMPrincipalType, UserRole,
)

router = APIRouter(prefix="/api/v1/rbac", tags=["RBAC — Role-Based Access Control"])


# ============================================================
# REQUEST/RESPONSE SCHEMAS
# ============================================================

class RoleCreateRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    display_name: str = Field(..., min_length=2, max_length=200)
    description: Optional[str] = None
    level: int = Field(..., ge=0, le=6)
    role_type: str = "CUSTOM"
    is_assignable: bool = True
    max_holders: Optional[int] = None


class RoleUpdateRequest(BaseModel):
    display_name: Optional[str] = None
    description: Optional[str] = None
    is_assignable: Optional[bool] = None
    max_holders: Optional[int] = None


class PermissionAssignRequest(BaseModel):
    permission_id: str
    effect: str = "ALLOW"  # ALLOW or DENY
    conditions: Optional[Dict[str, Any]] = None
    expires_at: Optional[str] = None  # ISO datetime


class RoleAssignRequest(BaseModel):
    role_id: str
    organisation_id: Optional[str] = None
    is_primary: bool = False
    expires_at: Optional[str] = None  # ISO datetime


class RestrictionCreateRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=200)
    description: Optional[str] = None
    target_user_id: Optional[str] = None
    target_role_id: Optional[str] = None
    denied_permissions: List[str]  # Permission keys: "namespace:resource:action"
    reason: str
    expires_at: Optional[str] = None


class SelectFewGrantRequest(BaseModel):
    permission_id: str
    user_id: str
    reason: str
    expires_at: Optional[str] = None


class RoleResponse(BaseModel):
    id: str
    name: str
    display_name: str
    description: Optional[str]
    level: int
    role_type: str
    is_assignable: bool
    max_holders: Optional[int]
    created_at: str


class PaginatedResponse(BaseModel):
    items: List[Any]
    total: int
    page: int
    page_size: int
    has_more: bool


# ============================================================
# ROLE MANAGEMENT
# ============================================================

@router.get("/roles")
async def list_roles(
    level: Optional[int] = Query(None, ge=0, le=6, description="Filter by role level"),
    role_type: Optional[str] = Query(None, description="Filter by role type"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """List all available IAM roles with optional filtering."""
    stmt = select(IAMRole)

    if level is not None:
        stmt = stmt.where(IAMRole.level == level)
    if role_type:
        stmt = stmt.where(IAMRole.role_type == IAMRoleType(role_type))

    # Count total
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar() or 0

    # Paginate
    stmt = stmt.order_by(IAMRole.level, IAMRole.name)
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(stmt)
    roles = result.scalars().all()

    return {
        "items": [
            {
                "id": r.id,
                "name": r.name,
                "display_name": r.display_name,
                "description": r.description,
                "level": r.level,
                "role_type": r.role_type.value if r.role_type else "SYSTEM",
                "is_assignable": r.is_assignable,
                "max_holders": r.max_holders,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in roles
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
        "has_more": (page * page_size) < total,
    }


@router.get("/roles/{role_id}")
async def get_role(
    role_id: str = Path(...),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Get detailed information about a specific role."""
    stmt = select(IAMRole).where(IAMRole.id == role_id)
    result = await db.execute(stmt)
    role = result.scalar_one_or_none()

    if not role:
        raise HTTPException(status_code=404, detail="Role not found")

    # Get permission count
    perm_count_stmt = select(func.count()).where(IAMRolePermission.role_id == role_id)
    perm_count = (await db.execute(perm_count_stmt)).scalar() or 0

    # Get holder count
    holder_count_stmt = select(func.count()).where(
        and_(IAMUserRole.role_id == role_id, IAMUserRole.is_active == True)
    )
    holder_count = (await db.execute(holder_count_stmt)).scalar() or 0

    return {
        "id": role.id,
        "name": role.name,
        "display_name": role.display_name,
        "description": role.description,
        "level": role.level,
        "role_type": role.role_type.value if role.role_type else "SYSTEM",
        "is_assignable": role.is_assignable,
        "max_holders": role.max_holders,
        "permission_count": perm_count,
        "holder_count": holder_count,
        "created_at": role.created_at.isoformat() if role.created_at else None,
        "updated_at": role.updated_at.isoformat() if role.updated_at else None,
    }


@router.post("/roles", status_code=201)
async def create_role(
    body: RoleCreateRequest,
    current_user: CurrentUser = Depends(require_iam_level(1)),
    db: AsyncSession = Depends(get_db_session),
):
    """Create a custom role. Requires Level 1 (Platform Admin) or higher."""
    # Check name uniqueness
    existing = await db.execute(select(IAMRole).where(IAMRole.name == body.name))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"Role '{body.name}' already exists")

    # Only Level 0 can create Level 0/1 roles
    if body.level <= 1 and current_user.active_role_level > 0:
        raise HTTPException(
            status_code=403,
            detail="Only the Continuity Guardian can create Level 0/1 roles",
        )

    try:
        role_type = IAMRoleType(body.role_type)
    except ValueError:
        role_type = IAMRoleType.CUSTOM

    role = IAMRole(
        name=body.name,
        display_name=body.display_name,
        description=body.description,
        level=body.level,
        role_type=role_type,
        is_assignable=body.is_assignable,
        max_holders=body.max_holders,
    )
    db.add(role)
    await db.commit()
    await db.refresh(role)

    return {
        "id": role.id,
        "name": role.name,
        "display_name": role.display_name,
        "level": role.level,
        "role_type": role.role_type.value,
        "message": f"Role '{role.display_name}' created successfully",
    }


@router.put("/roles/{role_id}")
async def update_role(
    body: RoleUpdateRequest,
    role_id: str = Path(...),
    current_user: CurrentUser = Depends(require_iam_level(1)),
    db: AsyncSession = Depends(get_db_session),
):
    """Update a role. Requires Level 1 or higher."""
    stmt = select(IAMRole).where(IAMRole.id == role_id)
    result = await db.execute(stmt)
    role = result.scalar_one_or_none()

    if not role:
        raise HTTPException(status_code=404, detail="Role not found")

    # Protect system roles from modification
    if role.role_type == IAMRoleType.SYSTEM and role.level <= 1:
        if current_user.active_role_level > 0:
            raise HTTPException(
                status_code=403,
                detail="Only the Continuity Guardian can modify Level 0/1 system roles",
            )

    if body.display_name is not None:
        role.display_name = body.display_name
    if body.description is not None:
        role.description = body.description
    if body.is_assignable is not None:
        role.is_assignable = body.is_assignable
    if body.max_holders is not None:
        role.max_holders = body.max_holders

    await db.commit()
    await db.refresh(role)

    return {
        "id": role.id,
        "name": role.name,
        "display_name": role.display_name,
        "message": "Role updated successfully",
    }


@router.delete("/roles/{role_id}")
async def delete_role(
    role_id: str = Path(...),
    current_user: CurrentUser = Depends(require_iam_level(1)),
    db: AsyncSession = Depends(get_db_session),
):
    """Delete a custom role. System roles cannot be deleted."""
    stmt = select(IAMRole).where(IAMRole.id == role_id)
    result = await db.execute(stmt)
    role = result.scalar_one_or_none()

    if not role:
        raise HTTPException(status_code=404, detail="Role not found")

    if role.role_type == IAMRoleType.SYSTEM:
        raise HTTPException(status_code=403, detail="System roles cannot be deleted")

    # Check if role has active holders
    holder_stmt = select(func.count()).where(
        and_(IAMUserRole.role_id == role_id, IAMUserRole.is_active == True)
    )
    holder_count = (await db.execute(holder_stmt)).scalar() or 0
    if holder_count > 0:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot delete role with {holder_count} active holder(s). Revoke assignments first.",
        )

    await db.delete(role)
    await db.commit()

    return {"message": f"Role '{role.name}' deleted successfully"}


# ============================================================
# ROLE PERMISSIONS
# ============================================================

@router.get("/roles/{role_id}/permissions")
async def get_role_permissions(
    role_id: str = Path(...),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Get all permissions assigned to a role."""
    # Verify role exists
    role_stmt = select(IAMRole).where(IAMRole.id == role_id)
    role = (await db.execute(role_stmt)).scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")

    permissions = await IAMService.get_role_permissions(role_id, db)

    return {
        "role_id": role_id,
        "role_name": role.name,
        "role_level": role.level,
        "permissions": permissions,
        "total": len(permissions),
    }


@router.put("/roles/{role_id}/permissions")
async def update_role_permissions(
    body: List[PermissionAssignRequest],
    role_id: str = Path(...),
    current_user: CurrentUser = Depends(require_iam_level(1)),
    db: AsyncSession = Depends(get_db_session),
):
    """Set permissions for a role. Replaces existing assignments."""
    # Verify role exists
    role_stmt = select(IAMRole).where(IAMRole.id == role_id)
    role = (await db.execute(role_stmt)).scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")

    # Only Level 0 can modify Level 0/1 role permissions
    if role.level <= 1 and current_user.active_role_level > 0:
        raise HTTPException(
            status_code=403,
            detail="Only the Continuity Guardian can modify Level 0/1 role permissions",
        )

    # Clear existing permissions
    existing_stmt = select(IAMRolePermission).where(IAMRolePermission.role_id == role_id)
    existing = (await db.execute(existing_stmt)).scalars().all()
    for rp in existing:
        await db.delete(rp)

    # Assign new permissions
    assigned = []
    for perm_req in body:
        # Verify permission exists
        perm_stmt = select(IAMPermission).where(IAMPermission.id == perm_req.permission_id)
        perm = (await db.execute(perm_stmt)).scalar_one_or_none()
        if not perm:
            continue  # Skip invalid permissions

        try:
            effect = IAMPermissionEffect(perm_req.effect)
        except ValueError:
            effect = IAMPermissionEffect.ALLOW

        expires_at = None
        if perm_req.expires_at:
            try:
                expires_at = datetime.fromisoformat(perm_req.expires_at)
            except ValueError:
                pass

        rp = IAMRolePermission(
            role_id=role_id,
            permission_id=perm_req.permission_id,
            effect=effect,
            conditions=perm_req.conditions or {},
            granted_by=current_user.id,
            expires_at=expires_at,
        )
        db.add(rp)
        assigned.append({
            "permission_id": perm_req.permission_id,
            "effect": effect.value,
        })

    await db.commit()

    return {
        "role_id": role_id,
        "assigned": assigned,
        "total": len(assigned),
        "message": f"Permissions updated for role '{role.name}'",
    }


# ============================================================
# USER ROLE ASSIGNMENTS
# ============================================================

@router.get("/users/{user_id}/roles")
async def get_user_roles(
    user_id: str = Path(...),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Get all roles assigned to a user."""
    # Users can view their own roles; admins can view anyone's
    if user_id != current_user.id and current_user.active_role_level > 2:
        raise HTTPException(status_code=403, detail="Cannot view other users' roles")

    roles = await IAMService.get_user_iam_roles(user_id, db)

    return {
        "user_id": user_id,
        "roles": roles,
        "total": len(roles),
        "primary_role": next((r for r in roles if r.get("is_primary")), None),
    }


@router.post("/users/{user_id}/roles", status_code=201)
async def assign_role(
    body: RoleAssignRequest,
    user_id: str = Path(...),
    current_user: CurrentUser = Depends(require_iam_level(1)),
    db: AsyncSession = Depends(get_db_session),
):
    """Assign a role to a user. Requires Level 1 or higher."""
    # Verify role exists and is assignable
    role_stmt = select(IAMRole).where(IAMRole.id == body.role_id)
    role = (await db.execute(role_stmt)).scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    if not role.is_assignable:
        raise HTTPException(status_code=403, detail=f"Role '{role.name}' is not assignable")

    # Only Level 0 can assign Level 0/1 roles
    if role.level <= 1 and current_user.active_role_level > 0:
        raise HTTPException(
            status_code=403,
            detail="Only the Continuity Guardian can assign Level 0/1 roles",
        )

    # Check max holders
    if role.max_holders is not None:
        holder_count_stmt = select(func.count()).where(
            and_(IAMUserRole.role_id == body.role_id, IAMUserRole.is_active == True)
        )
        holder_count = (await db.execute(holder_count_stmt)).scalar() or 0
        if holder_count >= role.max_holders:
            raise HTTPException(
                status_code=409,
                detail=f"Role '{role.name}' has reached maximum holders ({role.max_holders})",
            )

    # Check for existing assignment
    existing_stmt = select(IAMUserRole).where(
        and_(
            IAMUserRole.user_id == user_id,
            IAMUserRole.role_id == body.role_id,
            IAMUserRole.organisation_id == body.organisation_id,
        )
    )
    existing = (await db.execute(existing_stmt)).scalar_one_or_none()
    if existing:
        if existing.is_active:
            raise HTTPException(status_code=409, detail="Role already assigned to user")
        # Reactivate
        existing.is_active = True
        existing.is_primary = body.is_primary
        existing.granted_by = current_user.id
        existing.granted_at = datetime.now(timezone.utc)
        if body.expires_at:
            try:
                existing.expires_at = datetime.fromisoformat(body.expires_at)
            except ValueError:
                pass
        await db.commit()
        return {"message": f"Role '{role.name}' reactivated for user", "user_id": user_id}

    # If setting as primary, unset other primaries
    if body.is_primary:
        primary_stmt = select(IAMUserRole).where(
            and_(IAMUserRole.user_id == user_id, IAMUserRole.is_primary == True)
        )
        primaries = (await db.execute(primary_stmt)).scalars().all()
        for p in primaries:
            p.is_primary = False

    expires_at = None
    if body.expires_at:
        try:
            expires_at = datetime.fromisoformat(body.expires_at)
        except ValueError:
            pass

    user_role = IAMUserRole(
        user_id=user_id,
        role_id=body.role_id,
        organisation_id=body.organisation_id,
        is_active=True,
        is_primary=body.is_primary,
        granted_by=current_user.id,
        expires_at=expires_at,
    )
    db.add(user_role)
    await db.commit()

    return {
        "message": f"Role '{role.name}' assigned to user",
        "user_id": user_id,
        "role_id": body.role_id,
        "is_primary": body.is_primary,
    }


@router.delete("/users/{user_id}/roles/{role_id}")
async def revoke_role(
    user_id: str = Path(...),
    role_id: str = Path(...),
    current_user: CurrentUser = Depends(require_iam_level(1)),
    db: AsyncSession = Depends(get_db_session),
):
    """Revoke a role from a user."""
    # Cannot revoke Continuity Guardian role
    role_stmt = select(IAMRole).where(IAMRole.id == role_id)
    role = (await db.execute(role_stmt)).scalar_one_or_none()
    if role and role.name == "continuity_guardian":
        raise HTTPException(
            status_code=403,
            detail="The Continuity Guardian role is irrevocable",
        )

    stmt = select(IAMUserRole).where(
        and_(IAMUserRole.user_id == user_id, IAMUserRole.role_id == role_id)
    )
    user_role = (await db.execute(stmt)).scalar_one_or_none()
    if not user_role:
        raise HTTPException(status_code=404, detail="Role assignment not found")

    user_role.is_active = False
    await db.commit()

    return {"message": f"Role revoked from user", "user_id": user_id, "role_id": role_id}


# ============================================================
# PERMISSION EVALUATION
# ============================================================

@router.post("/evaluate")
async def evaluate_permission(
    body: PermissionEvalRequest,
    request: Request,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Evaluate if the current user has a specific permission.
    
    Runs the full 5-step evaluation chain:
    1. Identify Principal
    2. RBAC Check (role permissions, ALLOW/DENY)
    3. ABAC Check (conditions: time, IP, MFA)
    4. Subscription Check (tier/service access)
    5. Audit Log (SHA-512 integrity hash)
    """
    context = {
        "ip_address": request.client.host if request.client else None,
        "user_agent": request.headers.get("user-agent"),
        "session_id": request.headers.get("x-session-id"),
        "organisation_id": current_user.organisation_id,
        "mfa_verified": request.headers.get("x-mfa-verified") == "true",
        "risk_score": 0.0,
    }

    if body.context:
        context.update(body.context)

    result = await IAMService.evaluate_permission(
        user_id=current_user.id,
        namespace=body.namespace,
        resource=body.resource,
        action=body.action,
        context=context,
        db=db,
    )

    return {
        "allowed": result.allowed,
        "decision": result.decision,
        "reason": result.reason,
        "evaluation_chain": result.evaluation_chain,
        "principal": {
            "id": current_user.id,
            "role": current_user.role,
            "active_role": current_user.active_role,
            "active_role_level": current_user.active_role_level,
        },
        "permission": f"{body.namespace}:{body.resource}:{body.action}",
    }


# ============================================================
# ROLE SWITCHING
# ============================================================

@router.post("/switch-role")
async def switch_role(
    body: RoleSwitchRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Switch the user's active role.
    
    The user must have the target role assigned and active.
    Returns new token pair with updated role claims.
    """
    # Verify user has this role
    roles = await IAMService.get_user_iam_roles(current_user.id, db)
    target_role = None
    for r in roles:
        if r["id"] == body.role_id:
            target_role = r
            break

    if not target_role:
        raise HTTPException(
            status_code=403,
            detail="You do not have this role assigned",
        )

    # Update primary role
    # First, unset all primaries
    all_ur_stmt = select(IAMUserRole).where(
        and_(IAMUserRole.user_id == current_user.id, IAMUserRole.is_primary == True)
    )
    all_primaries = (await db.execute(all_ur_stmt)).scalars().all()
    for p in all_primaries:
        p.is_primary = False

    # Set new primary
    target_ur_stmt = select(IAMUserRole).where(
        and_(
            IAMUserRole.user_id == current_user.id,
            IAMUserRole.role_id == body.role_id,
        )
    )
    target_ur = (await db.execute(target_ur_stmt)).scalar_one_or_none()
    if target_ur:
        target_ur.is_primary = True

    await db.commit()

    # Generate new token pair with updated role
    from models import User
    user_stmt = select(User).where(User.id == current_user.id)
    user = (await db.execute(user_stmt)).scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    token_pair = await AuthService.create_token_pair_with_iam(user, db)

    return {
        "message": f"Switched to role: {target_role['display_name']}",
        "active_role": target_role,
        **token_pair,
    }


# ============================================================
# RESTRICTION PROFILES
# ============================================================

@router.get("/restrictions")
async def list_restrictions(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    current_user: CurrentUser = Depends(require_iam_level(1)),
    db: AsyncSession = Depends(get_db_session),
):
    """List all restriction profiles. Requires Level 1 or higher."""
    stmt = select(IAMRestrictionProfile).order_by(IAMRestrictionProfile.created_at.desc())

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar() or 0

    stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(stmt)
    profiles = result.scalars().all()

    return {
        "items": [
            {
                "id": p.id,
                "name": p.name,
                "description": p.description,
                "target_user_id": p.target_user_id,
                "target_role_id": p.target_role_id,
                "denied_permissions": p.denied_permissions,
                "reason": p.reason,
                "enforced_by": p.enforced_by,
                "created_at": p.created_at.isoformat() if p.created_at else None,
                "expires_at": p.expires_at.isoformat() if p.expires_at else None,
            }
            for p in profiles
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.post("/restrictions", status_code=201)
async def create_restriction(
    body: RestrictionCreateRequest,
    current_user: CurrentUser = Depends(require_iam_level(1)),
    db: AsyncSession = Depends(get_db_session),
):
    """Create a restriction profile. Requires Level 1 or higher."""
    if not body.target_user_id and not body.target_role_id:
        raise HTTPException(
            status_code=400,
            detail="Must specify either target_user_id or target_role_id",
        )

    expires_at = None
    if body.expires_at:
        try:
            expires_at = datetime.fromisoformat(body.expires_at)
        except ValueError:
            pass

    profile = IAMRestrictionProfile(
        name=body.name,
        description=body.description,
        target_user_id=body.target_user_id,
        target_role_id=body.target_role_id,
        denied_permissions=body.denied_permissions,
        reason=body.reason,
        enforced_by=current_user.id,
        expires_at=expires_at,
    )
    db.add(profile)
    await db.commit()
    await db.refresh(profile)

    return {
        "id": profile.id,
        "name": profile.name,
        "message": f"Restriction profile '{profile.name}' created",
    }


# ============================================================
# SELECT-FEW ELEVATIONS
# ============================================================

@router.get("/select-few")
async def list_select_few(
    current_user: CurrentUser = Depends(require_iam_level(0)),
    db: AsyncSession = Depends(get_db_session),
):
    """List all select-few elevations. Requires Level 0 (Continuity Guardian)."""
    stmt = (
        select(IAMSelectFew, IAMPermission)
        .join(IAMPermission, IAMSelectFew.permission_id == IAMPermission.id)
        .where(IAMSelectFew.is_active == True)
        .order_by(IAMSelectFew.approved_at.desc())
    )
    result = await db.execute(stmt)
    rows = result.all()

    return {
        "items": [
            {
                "id": sf.id,
                "permission_id": sf.permission_id,
                "permission_key": f"{perm.namespace}:{perm.resource}:{perm.action}",
                "user_id": sf.user_id,
                "reason": sf.reason,
                "approved_by": sf.approved_by,
                "approved_at": sf.approved_at.isoformat() if sf.approved_at else None,
                "expires_at": sf.expires_at.isoformat() if sf.expires_at else None,
            }
            for sf, perm in rows
        ],
        "total": len(rows),
    }


@router.post("/select-few", status_code=201)
async def grant_select_few(
    body: SelectFewGrantRequest,
    current_user: CurrentUser = Depends(require_iam_level(0)),
    db: AsyncSession = Depends(get_db_session),
):
    """Grant select-few elevation. Requires Level 0 (Continuity Guardian) ONLY."""
    # Verify permission exists and is sensitive
    perm_stmt = select(IAMPermission).where(IAMPermission.id == body.permission_id)
    perm = (await db.execute(perm_stmt)).scalar_one_or_none()
    if not perm:
        raise HTTPException(status_code=404, detail="Permission not found")
    if not perm.is_sensitive:
        raise HTTPException(
            status_code=400,
            detail="Select-few elevation only applies to sensitive permissions",
        )

    # Check max holders
    if perm.max_holders is not None:
        holder_count_stmt = select(func.count()).where(
            and_(
                IAMSelectFew.permission_id == body.permission_id,
                IAMSelectFew.is_active == True,
            )
        )
        holder_count = (await db.execute(holder_count_stmt)).scalar() or 0
        if holder_count >= perm.max_holders:
            raise HTTPException(
                status_code=409,
                detail=f"Permission has reached maximum select-few holders ({perm.max_holders})",
            )

    expires_at = None
    if body.expires_at:
        try:
            expires_at = datetime.fromisoformat(body.expires_at)
        except ValueError:
            pass

    sf = IAMSelectFew(
        permission_id=body.permission_id,
        user_id=body.user_id,
        reason=body.reason,
        approved_by=current_user.id,
        expires_at=expires_at,
    )
    db.add(sf)
    await db.commit()
    await db.refresh(sf)

    return {
        "id": sf.id,
        "permission_key": f"{perm.namespace}:{perm.resource}:{perm.action}",
        "user_id": body.user_id,
        "message": "Select-few elevation granted",
    }


# ============================================================
# AUDIT LOG
# ============================================================

@router.get("/audit")
async def get_rbac_audit_log(
    principal_id: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    decision: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    current_user: CurrentUser = Depends(require_iam_level(2)),
    db: AsyncSession = Depends(get_db_session),
):
    """Get IAM audit log. Requires Level 2 (Org Admin) or higher."""
    stmt = select(IAMAuditLog)

    if principal_id:
        stmt = stmt.where(IAMAuditLog.principal_id == principal_id)
    if action:
        stmt = stmt.where(IAMAuditLog.action.contains(action))
    if decision:
        try:
            stmt = stmt.where(IAMAuditLog.decision == IAMAuditDecision(decision))
        except ValueError:
            pass

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar() or 0

    stmt = stmt.order_by(desc(IAMAuditLog.timestamp))
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(stmt)
    logs = result.scalars().all()

    return {
        "items": [
            {
                "id": log.id,
                "timestamp": log.timestamp.isoformat() if log.timestamp else None,
                "principal_id": log.principal_id,
                "principal_type": log.principal_type.value if log.principal_type else None,
                "action": log.action,
                "decision": log.decision.value if log.decision else None,
                "decision_reason": log.decision_reason,
                "evaluation_chain": log.evaluation_chain,
                "ip_address": log.ip_address,
                "risk_score": float(log.risk_score) if log.risk_score else 0.0,
                "sha512_hash": log.sha512_hash,
            }
            for log in logs
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
        "has_more": (page * page_size) < total,
    }