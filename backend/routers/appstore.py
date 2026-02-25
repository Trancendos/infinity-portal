# routers/appstore.py — App Store / Marketplace
import uuid
import math
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, func, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user, require_min_role, CurrentUser
from database import get_db_session
from models import (
    ModuleManifest, AppStoreListing, ModuleInstallation,
    AuditLog, AuditEventType, ModuleStatus, UserRole,
    utcnow, new_uuid,
)

router = APIRouter(prefix="/api/v1/appstore", tags=["App Store"])


# --- Schemas ---

class ModuleSubmit(BaseModel):
    module_id: str = Field(..., min_length=3, max_length=100, pattern=r'^[a-z0-9][a-z0-9._-]*$')
    name: str = Field(..., min_length=1, max_length=200)
    version: str = Field(..., pattern=r'^\d+\.\d+\.\d+')
    description: str = Field(..., min_length=10, max_length=5000)
    author: str = Field(..., min_length=1, max_length=200)
    author_url: Optional[str] = None
    icon_url: str = Field(default="https://cdn.simpleicons.org/windowsterminal")
    entry_point: str = Field(...)
    category: str = Field(...)
    permissions: List[str] = Field(default_factory=list)
    min_kernel_version: str = Field(default="0.1.0")
    dependencies: Dict[str, str] = Field(default_factory=dict)
    keywords: List[str] = Field(default_factory=list)
    screenshots: List[str] = Field(default_factory=list)
    privacy_policy_url: Optional[str] = None
    support_url: Optional[str] = None
    container_image: Optional[str] = None
    container_port: Optional[int] = None
    container_env: Optional[Dict[str, str]] = Field(default_factory=dict)
    container_resources: Optional[Dict[str, Any]] = Field(default_factory=dict)
    is_sandboxed: bool = Field(default=True)


class ReviewAction(BaseModel):
    action: str = Field(..., pattern=r'^(approve|reject)$')
    reason: Optional[str] = None


class InstallRequest(BaseModel):
    granted_permissions: List[str] = Field(default_factory=list)
    settings: Dict[str, Any] = Field(default_factory=dict)


class ListingOut(BaseModel):
    id: str
    module_id: str
    name: str
    version: str
    description: str
    author: str
    author_url: Optional[str] = None
    icon_url: str
    category: str
    entry_point: str
    permissions: list
    keywords: list
    screenshots: list
    is_sandboxed: bool
    is_containerised: bool
    container_image: Optional[str] = None
    downloads: int
    rating: str
    review_count: int
    is_featured: bool
    is_verified: bool
    status: str
    published_at: Optional[str] = None
    is_installed: bool = False
    created_at: str


# --- Categories ---

CATEGORIES = [
    {"slug": "productivity", "name": "Productivity", "icon": "📊", "description": "Tools to boost your workflow"},
    {"slug": "developer", "name": "Developer Tools", "icon": "🛠️", "description": "IDEs, debuggers, and dev utilities"},
    {"slug": "communication", "name": "Communication", "icon": "💬", "description": "Chat, email, and messaging"},
    {"slug": "ai", "name": "AI & ML", "icon": "🤖", "description": "AI assistants and ML tools"},
    {"slug": "media", "name": "Media", "icon": "🎨", "description": "Image, video, and audio tools"},
    {"slug": "utilities", "name": "Utilities", "icon": "🔧", "description": "System tools and utilities"},
    {"slug": "games", "name": "Games", "icon": "🎮", "description": "Games and entertainment"},
    {"slug": "education", "name": "Education", "icon": "📚", "description": "Learning and training tools"},
]


def _listing_out(manifest, listing, is_installed: bool = False) -> dict:
    return ListingOut(
        id=listing.id, module_id=manifest.module_id, name=manifest.name,
        version=manifest.version, description=manifest.description,
        author=manifest.author, author_url=manifest.author_url,
        icon_url=manifest.icon_url, category=manifest.category,
        entry_point=manifest.entry_point, permissions=manifest.permissions or [],
        keywords=manifest.keywords or [], screenshots=manifest.screenshots or [],
        is_sandboxed=manifest.is_sandboxed,
        is_containerised=bool(manifest.dependencies and manifest.dependencies.get("container_image")),
        container_image=manifest.dependencies.get("container_image") if manifest.dependencies else None,
        downloads=listing.downloads or 0, rating=listing.rating or "0.00",
        review_count=listing.review_count or 0,
        is_featured=listing.is_featured, is_verified=listing.is_verified,
        status=listing.status.value if hasattr(listing.status, 'value') else str(listing.status),
        published_at=listing.published_at.isoformat() if listing.published_at else None,
        is_installed=is_installed,
        created_at=listing.created_at.isoformat(),
    ).model_dump()


# ============================================================
# CATEGORIES
# ============================================================

@router.get("/categories")
async def list_categories(user: CurrentUser = Depends(get_current_user)):
    return CATEGORIES


# ============================================================
# SUBMIT MODULE
# ============================================================

@router.post("/submit", status_code=201)
async def submit_module(
    data: ModuleSubmit,
    db: AsyncSession = Depends(get_db_session),
    user: CurrentUser = Depends(require_min_role(UserRole.POWER_USER)),
):
    existing = await db.execute(
        select(ModuleManifest).where(ModuleManifest.module_id == data.module_id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(409, f"Module '{data.module_id}' already exists")

    # Store container info in dependencies field
    deps = dict(data.dependencies)
    if data.container_image:
        deps["container_image"] = data.container_image
        if data.container_port:
            deps["container_port"] = str(data.container_port)
        if data.container_env:
            deps["container_env"] = data.container_env
        if data.container_resources:
            deps["container_resources"] = data.container_resources

    manifest = ModuleManifest(
        id=new_uuid(), module_id=data.module_id, name=data.name,
        version=data.version, description=data.description,
        author=data.author, author_url=data.author_url,
        icon_url=data.icon_url, entry_point=data.entry_point,
        category=data.category, permissions=data.permissions,
        min_kernel_version=data.min_kernel_version,
        dependencies=deps, keywords=data.keywords,
        screenshots=data.screenshots, is_sandboxed=data.is_sandboxed,
        privacy_policy_url=data.privacy_policy_url,
        support_url=data.support_url,
    )
    db.add(manifest)
    await db.flush()

    listing = AppStoreListing(
        id=new_uuid(), manifest_id=manifest.id,
        status=ModuleStatus.PENDING,
    )
    db.add(listing)
    await db.commit()
    await db.refresh(manifest)
    await db.refresh(listing)

    return _listing_out(manifest, listing)


# ============================================================
# BROWSE / SEARCH
# ============================================================

@router.get("/listings")
async def list_listings(
    category: Optional[str] = None,
    search: Optional[str] = None,
    sort: str = Query(default="popular", pattern=r'^(popular|newest|rating|name)$'),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=24, ge=1, le=100),
    db: AsyncSession = Depends(get_db_session),
    user: CurrentUser = Depends(get_current_user),
):
    query = select(ModuleManifest, AppStoreListing).join(
        AppStoreListing, AppStoreListing.manifest_id == ModuleManifest.id
    )

    if category:
        query = query.where(ModuleManifest.category == category)
    if search:
        pattern = f"%{search}%"
        query = query.where(
            or_(
                ModuleManifest.name.ilike(pattern),
                ModuleManifest.description.ilike(pattern),
                ModuleManifest.module_id.ilike(pattern),
            )
        )

    # Count
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar() or 0
    total_pages = max(1, math.ceil(total / per_page))

    # Sort
    if sort == "popular":
        query = query.order_by(AppStoreListing.downloads.desc())
    elif sort == "newest":
        query = query.order_by(AppStoreListing.created_at.desc())
    elif sort == "rating":
        query = query.order_by(AppStoreListing.rating.desc())
    else:
        query = query.order_by(ModuleManifest.name)

    query = query.offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(query)
    rows = result.all()

    # Check installed
    installed_ids = set()
    if rows:
        manifest_ids = [r[0].id for r in rows]
        inst_result = await db.execute(
            select(ModuleInstallation.manifest_id).where(
                ModuleInstallation.organisation_id == user.organisation_id,
                ModuleInstallation.manifest_id.in_(manifest_ids),
                ModuleInstallation.is_enabled == True,
            )
        )
        installed_ids = {r[0] for r in inst_result.all()}

    listings = [_listing_out(m, l, m.id in installed_ids) for m, l in rows]

    return {"listings": listings, "total": total, "page": page, "total_pages": total_pages, "per_page": per_page}


# ============================================================
# INSTALL / UNINSTALL
# ============================================================

@router.post("/install/{module_id}", status_code=201)
async def install_module(
    module_id: str,
    data: InstallRequest,
    db: AsyncSession = Depends(get_db_session),
    user: CurrentUser = Depends(get_current_user),
):
    result = await db.execute(
        select(ModuleManifest).where(ModuleManifest.module_id == module_id)
    )
    manifest = result.scalar_one_or_none()
    if not manifest:
        raise HTTPException(404, f"Module '{module_id}' not found")

    # Check already installed
    existing = await db.execute(
        select(ModuleInstallation).where(
            ModuleInstallation.manifest_id == manifest.id,
            ModuleInstallation.organisation_id == user.organisation_id,
            ModuleInstallation.is_enabled == True,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(409, "Module already installed")

    installation = ModuleInstallation(
        id=new_uuid(), manifest_id=manifest.id,
        organisation_id=user.organisation_id, installed_by=user.id,
        user_id=user.id, granted_permissions=data.granted_permissions,
        settings=data.settings,
    )
    db.add(installation)

    # Increment download count
    listing_result = await db.execute(
        select(AppStoreListing).where(AppStoreListing.manifest_id == manifest.id)
    )
    listing = listing_result.scalar_one_or_none()
    if listing:
        listing.downloads = (listing.downloads or 0) + 1

    await db.commit()
    return {"status": "installed", "module_id": module_id}


@router.delete("/uninstall/{module_id}")
async def uninstall_module(
    module_id: str,
    db: AsyncSession = Depends(get_db_session),
    user: CurrentUser = Depends(get_current_user),
):
    result = await db.execute(
        select(ModuleManifest).where(ModuleManifest.module_id == module_id)
    )
    manifest = result.scalar_one_or_none()
    if not manifest:
        raise HTTPException(404, f"Module '{module_id}' not found")

    inst_result = await db.execute(
        select(ModuleInstallation).where(
            ModuleInstallation.manifest_id == manifest.id,
            ModuleInstallation.organisation_id == user.organisation_id,
            ModuleInstallation.is_enabled == True,
        )
    )
    installation = inst_result.scalar_one_or_none()
    if not installation:
        raise HTTPException(404, "Module not installed")

    installation.is_enabled = False
    await db.commit()
    return {"status": "uninstalled", "module_id": module_id}


@router.get("/installed")
async def get_installed(
    db: AsyncSession = Depends(get_db_session),
    user: CurrentUser = Depends(get_current_user),
):
    result = await db.execute(
        select(ModuleManifest, AppStoreListing, ModuleInstallation).join(
            ModuleInstallation, ModuleInstallation.manifest_id == ModuleManifest.id
        ).outerjoin(
            AppStoreListing, AppStoreListing.manifest_id == ModuleManifest.id
        ).where(
            ModuleInstallation.organisation_id == user.organisation_id,
            ModuleInstallation.is_enabled == True,
        )
    )
    rows = result.all()
    return [_listing_out(m, l, True) for m, l, _ in rows if l]


# ============================================================
# REVIEW (Admin)
# ============================================================

@router.post("/review/{module_id}")
async def review_module(
    module_id: str,
    data: ReviewAction,
    db: AsyncSession = Depends(get_db_session),
    user: CurrentUser = Depends(require_min_role(UserRole.ORG_ADMIN)),
):
    result = await db.execute(
        select(ModuleManifest).where(ModuleManifest.module_id == module_id)
    )
    manifest = result.scalar_one_or_none()
    if not manifest:
        raise HTTPException(404, f"Module '{module_id}' not found")

    listing_result = await db.execute(
        select(AppStoreListing).where(AppStoreListing.manifest_id == manifest.id)
    )
    listing = listing_result.scalar_one_or_none()
    if not listing:
        raise HTTPException(404, "Listing not found")

    if data.action == "approve":
        listing.status = ModuleStatus.APPROVED
        listing.published_at = utcnow()
        listing.is_verified = True
    else:
        listing.status = ModuleStatus.REJECTED
        listing.rejection_reason = data.reason

    await db.commit()
    return {"status": listing.status.value, "module_id": module_id}


# ============================================================
# STATS
# ============================================================

@router.get("/stats")
async def appstore_stats(
    db: AsyncSession = Depends(get_db_session),
    user: CurrentUser = Depends(require_min_role(UserRole.ORG_ADMIN)),
):
    total_modules = (await db.execute(select(func.count(ModuleManifest.id)))).scalar() or 0
    total_installations = (await db.execute(
        select(func.count(ModuleInstallation.id)).where(ModuleInstallation.is_enabled == True)
    )).scalar() or 0
    pending = (await db.execute(
        select(func.count(AppStoreListing.id)).where(AppStoreListing.status == ModuleStatus.PENDING)
    )).scalar() or 0

    return {
        "total_modules": total_modules,
        "total_installations": total_installations,
        "pending_review": pending,
    }
