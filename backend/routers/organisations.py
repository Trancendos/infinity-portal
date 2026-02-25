# routers/organisations.py — Organisation management
import uuid
import re
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user, require_permission, require_min_role, CurrentUser
from database import get_db_session
from models import Organisation, User, AuditLog, AuditEventType, OrgPlan, UserRole, utcnow

router = APIRouter(prefix="/api/v1/organisations", tags=["Organisations"])


# --- Schemas ---

class OrgOut(BaseModel):
    id: str
    name: str
    slug: str
    logo_url: Optional[str] = None
    plan: str
    region_iso_code: str
    compliance_tier: str
    settings: dict
    is_active: bool
    member_count: int = 0
    created_at: str


class OrgCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    slug: Optional[str] = None
    plan: str = "free"
    region_iso_code: str = "GB"
    compliance_tier: str = "standard"
    settings: dict = Field(default_factory=dict)


class OrgUpdate(BaseModel):
    name: Optional[str] = None
    logo_url: Optional[str] = None
    plan: Optional[str] = None
    region_iso_code: Optional[str] = None
    compliance_tier: Optional[str] = None
    settings: Optional[dict] = None


class OrgMemberAdd(BaseModel):
    user_id: str
    role: str = "user"


# --- Helpers ---

def _slugify(name: str) -> str:
    slug = re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')
    return slug[:50]


# --- Endpoints ---

@router.get("", response_model=List[OrgOut])
async def list_organisations(
    user: CurrentUser = Depends(require_permission("orgs:read")),
    db: AsyncSession = Depends(get_db_session),
    limit: int = Query(default=50, le=200),
):
    """List organisations (super_admin sees all, others see own)"""
    if user.role == UserRole.SUPER_ADMIN.value:
        stmt = (
            select(Organisation)
            .where(Organisation.deleted_at.is_(None))
            .order_by(Organisation.created_at.desc())
            .limit(limit)
        )
    else:
        stmt = (
            select(Organisation)
            .where(
                Organisation.id == user.organisation_id,
                Organisation.deleted_at.is_(None),
            )
        )

    result = await db.execute(stmt)
    orgs = result.scalars().all()

    out = []
    for org in orgs:
        count_stmt = select(func.count(User.id)).where(
            User.organisation_id == org.id,
            User.is_active == True,
            User.deleted_at.is_(None),
        )
        count_result = await db.execute(count_stmt)
        member_count = count_result.scalar() or 0

        out.append(OrgOut(
            id=org.id,
            name=org.name,
            slug=org.slug or "",
            logo_url=org.logo_url,
            plan=org.plan.value if isinstance(org.plan, OrgPlan) else str(org.plan),
            region_iso_code=org.region_iso_code or "GB",
            compliance_tier=org.compliance_tier or "standard",
            settings=org.settings or {},
            is_active=org.is_active,
            member_count=member_count,
            created_at=org.created_at.isoformat() if org.created_at else "",
        ))

    return out


@router.get("/current", response_model=OrgOut)
async def get_current_organisation(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Get the current user's organisation"""
    stmt = select(Organisation).where(Organisation.id == user.organisation_id)
    result = await db.execute(stmt)
    org = result.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404, detail="Organisation not found")

    count_stmt = select(func.count(User.id)).where(
        User.organisation_id == org.id,
        User.is_active == True,
        User.deleted_at.is_(None),
    )
    count_result = await db.execute(count_stmt)
    member_count = count_result.scalar() or 0

    return OrgOut(
        id=org.id,
        name=org.name,
        slug=org.slug or "",
        logo_url=org.logo_url,
        plan=org.plan.value if isinstance(org.plan, OrgPlan) else str(org.plan),
        region_iso_code=org.region_iso_code or "GB",
        compliance_tier=org.compliance_tier or "standard",
        settings=org.settings or {},
        is_active=org.is_active,
        member_count=member_count,
        created_at=org.created_at.isoformat() if org.created_at else "",
    )


@router.post("", response_model=OrgOut)
async def create_organisation(
    org_data: OrgCreate,
    user: CurrentUser = Depends(require_permission("orgs:create")),
    db: AsyncSession = Depends(get_db_session),
):
    """Create a new organisation (super_admin only)"""
    slug = org_data.slug or _slugify(org_data.name)

    # Check slug uniqueness
    stmt = select(Organisation).where(Organisation.slug == slug)
    result = await db.execute(stmt)
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"Organisation slug '{slug}' already exists")

    try:
        plan = OrgPlan(org_data.plan)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid plan: {org_data.plan}")

    org = Organisation(
        name=org_data.name,
        slug=slug,
        plan=plan,
        region_iso_code=org_data.region_iso_code,
        compliance_tier=org_data.compliance_tier,
        settings=org_data.settings,
        is_active=True,
    )
    db.add(org)

    audit = AuditLog(
        event_type=AuditEventType.ORG_CREATED,
        user_id=user.id,
        organisation_id=org.id,
        resource_type="organisation",
        resource_id=org.id,
        request_id=str(uuid.uuid4()),
    )
    db.add(audit)
    await db.commit()
    await db.refresh(org)

    return OrgOut(
        id=org.id,
        name=org.name,
        slug=org.slug,
        logo_url=org.logo_url,
        plan=org.plan.value if isinstance(org.plan, OrgPlan) else str(org.plan),
        region_iso_code=org.region_iso_code or "GB",
        compliance_tier=org.compliance_tier or "standard",
        settings=org.settings or {},
        is_active=org.is_active,
        member_count=0,
        created_at=org.created_at.isoformat() if org.created_at else "",
    )


@router.patch("/{org_id}", response_model=OrgOut)
async def update_organisation(
    org_id: str,
    update: OrgUpdate,
    user: CurrentUser = Depends(require_permission("orgs:write")),
    db: AsyncSession = Depends(get_db_session),
):
    """Update organisation settings"""
    if user.role != UserRole.SUPER_ADMIN.value and user.organisation_id != org_id:
        raise HTTPException(status_code=403, detail="Cannot update other organisations")

    stmt = select(Organisation).where(Organisation.id == org_id, Organisation.deleted_at.is_(None))
    result = await db.execute(stmt)
    org = result.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404, detail="Organisation not found")

    if update.name is not None:
        org.name = update.name
    if update.logo_url is not None:
        org.logo_url = update.logo_url
    if update.plan is not None:
        try:
            org.plan = OrgPlan(update.plan)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid plan: {update.plan}")
    if update.region_iso_code is not None:
        org.region_iso_code = update.region_iso_code
    if update.compliance_tier is not None:
        org.compliance_tier = update.compliance_tier
    if update.settings is not None:
        org.settings = {**(org.settings or {}), **update.settings}

    db.add(org)

    audit = AuditLog(
        event_type=AuditEventType.ORG_UPDATED,
        user_id=user.id,
        organisation_id=org_id,
        resource_type="organisation",
        resource_id=org_id,
        request_id=str(uuid.uuid4()),
    )
    db.add(audit)
    await db.commit()
    await db.refresh(org)

    count_stmt = select(func.count(User.id)).where(
        User.organisation_id == org.id, User.is_active == True, User.deleted_at.is_(None)
    )
    count_result = await db.execute(count_stmt)
    member_count = count_result.scalar() or 0

    return OrgOut(
        id=org.id,
        name=org.name,
        slug=org.slug or "",
        logo_url=org.logo_url,
        plan=org.plan.value if isinstance(org.plan, OrgPlan) else str(org.plan),
        region_iso_code=org.region_iso_code or "GB",
        compliance_tier=org.compliance_tier or "standard",
        settings=org.settings or {},
        is_active=org.is_active,
        member_count=member_count,
        created_at=org.created_at.isoformat() if org.created_at else "",
    )


@router.get("/{org_id}/members")
async def list_org_members(
    org_id: str,
    user: CurrentUser = Depends(require_permission("users:read")),
    db: AsyncSession = Depends(get_db_session),
    limit: int = Query(default=50, le=200),
):
    """List members of an organisation"""
    if user.role != UserRole.SUPER_ADMIN.value and user.organisation_id != org_id:
        raise HTTPException(status_code=403, detail="Cannot view other organisation members")

    stmt = (
        select(User)
        .where(User.organisation_id == org_id, User.deleted_at.is_(None), User.is_active == True)
        .order_by(User.created_at.desc())
        .limit(limit)
    )
    result = await db.execute(stmt)
    members = result.scalars().all()

    return {
        "organisation_id": org_id,
        "members": [
            {
                "id": m.id,
                "email": m.email,
                "display_name": m.display_name or "",
                "role": m.role.value if isinstance(m.role, UserRole) else m.role,
                "is_active": m.is_active,
                "last_login_at": m.last_login_at.isoformat() if m.last_login_at else None,
            }
            for m in members
        ],
        "count": len(members),
    }