"""
Asset Management Router — Full Asset Registry & CMDB
Assets, relationships, lifecycle tracking, maintenance scheduling
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime

import uuid
from database import get_db_session
from auth import get_current_user, require_min_role
from models import (
    User, UserRole, utcnow,
    Asset, AssetRelationship, AssetLifecycleEvent, AssetMaintenance,
    AssetType, AssetStatus, AuditLog,
)

router = APIRouter(prefix="/api/v1/assets", tags=["assets"])


# ── Schemas ──────────────────────────────────────────────────

class AssetCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=300)
    asset_type: str
    description: Optional[str] = None
    location: Optional[str] = None
    vendor: Optional[str] = None
    serial_number: Optional[str] = None
    model_number: Optional[str] = None
    purchase_date: Optional[str] = None
    warranty_expiry: Optional[str] = None
    cost: Optional[str] = None
    attributes: dict = {}
    tags: List[str] = []

class AssetUpdate(BaseModel):
    name: Optional[str] = None
    status: Optional[str] = None
    description: Optional[str] = None
    location: Optional[str] = None
    owner_id: Optional[str] = None
    vendor: Optional[str] = None
    cost: Optional[str] = None
    attributes: Optional[dict] = None
    tags: Optional[List[str]] = None

class RelationshipCreate(BaseModel):
    parent_id: str
    child_id: str
    relationship_type: str = Field(..., pattern="^(contains|depends_on|connects_to|runs_on|licensed_for)$")

class MaintenanceCreate(BaseModel):
    asset_id: str
    maintenance_type: str = Field(..., pattern="^(preventive|corrective|inspection)$")
    description: Optional[str] = None
    scheduled_date: str
    technician: Optional[str] = None
    cost: Optional[str] = None
    notes: Optional[str] = None

class LifecycleEventCreate(BaseModel):
    event_type: str
    details: dict = {}
    notes: Optional[str] = None


# ── Tag Generation ───────────────────────────────────────────

_asset_counter = 0

async def _next_asset_tag(db: AsyncSession, asset_type: str) -> str:
    prefix_map = {
        "hardware": "HW", "software": "SW", "service": "SVC",
        "license": "LIC", "cloud_resource": "CLD", "network": "NET", "data": "DAT",
    }
    prefix = prefix_map.get(asset_type, "AST")
    result = await db.execute(select(func.count(Asset.id)))
    count = result.scalar() or 0
    return f"{prefix}-{count + 1:05d}"


# ── Assets ───────────────────────────────────────────────────

@router.post("/", status_code=201)
async def create_asset(
    body: AssetCreate,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    tag = await _next_asset_tag(db, body.asset_type)
    asset = Asset(
        asset_tag=tag,
        name=body.name,
        asset_type=body.asset_type,
        description=body.description,
        owner_id=user.id,
        organisation_id=user.organisation_id,
        location=body.location,
        vendor=body.vendor,
        serial_number=body.serial_number,
        model_number=body.model_number,
        cost=body.cost,
        attributes=body.attributes,
        tags=body.tags,
    )
    db.add(asset)
    await db.flush()

    # Record lifecycle event
    db.add(AssetLifecycleEvent(
        asset_id=asset.id,
        event_type="created",
        actor_id=user.id,
        details={"asset_type": body.asset_type, "name": body.name},
    ))

    db.add(AuditLog(
            request_id=str(uuid.uuid4()),
        user_id=user.id,
        organisation_id=user.organisation_id,
        event_type="asset.created",
        resource_type="asset",
        resource_id=asset.id,
        governance_metadata={"asset_tag": tag, "name": body.name},
    ))

    await db.commit()
    await db.refresh(asset)
    return {
        "id": asset.id, "asset_tag": asset.asset_tag, "name": asset.name,
        "asset_type": asset.asset_type, "status": asset.status,
        "created_at": str(asset.created_at),
    }


@router.get("/")
async def list_assets(
    asset_type: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    owner_id: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    query = select(Asset).where(
        and_(Asset.organisation_id == user.organisation_id, Asset.deleted_at.is_(None))
    )
    if asset_type:
        query = query.where(Asset.asset_type == asset_type)
    if status:
        query = query.where(Asset.status == status)
    if owner_id:
        query = query.where(Asset.owner_id == owner_id)
    if search:
        query = query.where(
            or_(Asset.name.ilike(f"%{search}%"), Asset.asset_tag.ilike(f"%{search}%"),
                Asset.serial_number.ilike(f"%{search}%"))
        )

    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    query = query.order_by(Asset.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    assets = result.scalars().all()

    return {
        "total": total,
        "items": [
            {"id": a.id, "asset_tag": a.asset_tag, "name": a.name,
             "asset_type": a.asset_type, "status": a.status,
             "location": a.location, "vendor": a.vendor, "owner_id": a.owner_id,
             "tags": a.tags, "created_at": str(a.created_at)}
            for a in assets
        ],
    }


@router.get("/dashboard")
async def asset_dashboard(
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    org_filter = and_(Asset.organisation_id == user.organisation_id, Asset.deleted_at.is_(None))

    total_q = await db.execute(select(func.count(Asset.id)).where(org_filter))
    total = total_q.scalar() or 0

    by_type_q = await db.execute(
        select(Asset.asset_type, func.count(Asset.id)).where(org_filter).group_by(Asset.asset_type)
    )
    by_type = {row[0]: row[1] for row in by_type_q.all()}

    by_status_q = await db.execute(
        select(Asset.status, func.count(Asset.id)).where(org_filter).group_by(Asset.status)
    )
    by_status = {row[0]: row[1] for row in by_status_q.all()}

    # Expiring warranties (next 90 days)
    now = utcnow()
    from datetime import timedelta
    expiring_q = await db.execute(
        select(func.count(Asset.id)).where(
            and_(org_filter, Asset.warranty_expiry.isnot(None),
                 Asset.warranty_expiry <= now + timedelta(days=90),
                 Asset.warranty_expiry >= now)
        )
    )
    expiring_warranties = expiring_q.scalar() or 0

    # Upcoming maintenance
    maint_q = await db.execute(
        select(func.count(AssetMaintenance.id)).where(
            and_(AssetMaintenance.organisation_id == user.organisation_id,
                 AssetMaintenance.completed_date.is_(None),
                 AssetMaintenance.scheduled_date >= now)
        )
    )
    upcoming_maintenance = maint_q.scalar() or 0

    return {
        "total_assets": total,
        "by_type": by_type,
        "by_status": by_status,
        "expiring_warranties": expiring_warranties,
        "upcoming_maintenance": upcoming_maintenance,
    }


@router.get("/{asset_id}")
async def get_asset(
    asset_id: str,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Asset).where(
            and_(Asset.id == asset_id, Asset.organisation_id == user.organisation_id,
                 Asset.deleted_at.is_(None))
        )
    )
    asset = result.scalars().first()
    if not asset:
        raise HTTPException(404, "Asset not found")

    # Get relationships
    rels_q = await db.execute(
        select(AssetRelationship).where(
            or_(AssetRelationship.parent_id == asset_id, AssetRelationship.child_id == asset_id)
        )
    )
    relationships = rels_q.scalars().all()

    # Get recent lifecycle events
    events_q = await db.execute(
        select(AssetLifecycleEvent).where(AssetLifecycleEvent.asset_id == asset_id)
        .order_by(AssetLifecycleEvent.occurred_at.desc()).limit(20)
    )
    events = events_q.scalars().all()

    return {
        "id": asset.id, "asset_tag": asset.asset_tag, "name": asset.name,
        "asset_type": asset.asset_type, "status": asset.status,
        "description": asset.description, "owner_id": asset.owner_id,
        "location": asset.location, "vendor": asset.vendor,
        "serial_number": asset.serial_number, "model_number": asset.model_number,
        "purchase_date": str(asset.purchase_date) if asset.purchase_date else None,
        "warranty_expiry": str(asset.warranty_expiry) if asset.warranty_expiry else None,
        "cost": asset.cost, "attributes": asset.attributes, "tags": asset.tags,
        "relationships": [
            {"id": r.id, "parent_id": r.parent_id, "child_id": r.child_id,
             "type": r.relationship_type}
            for r in relationships
        ],
        "lifecycle_events": [
            {"id": e.id, "event_type": e.event_type, "actor_id": e.actor_id,
             "details": e.details, "notes": e.notes, "occurred_at": str(e.occurred_at)}
            for e in events
        ],
        "created_at": str(asset.created_at), "updated_at": str(asset.updated_at),
    }


@router.patch("/{asset_id}")
async def update_asset(
    asset_id: str,
    body: AssetUpdate,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Asset).where(
            and_(Asset.id == asset_id, Asset.organisation_id == user.organisation_id)
        )
    )
    asset = result.scalars().first()
    if not asset:
        raise HTTPException(404, "Asset not found")

    changes = {}
    for field, value in body.model_dump(exclude_unset=True).items():
        if value is not None:
            old_val = getattr(asset, field)
            setattr(asset, field, value)
            changes[field] = {"old": str(old_val), "new": str(value)}

    if changes:
        db.add(AssetLifecycleEvent(
            asset_id=asset.id,
            event_type="updated",
            actor_id=user.id,
            details=changes,
        ))

    await db.commit()
    return {"status": "updated", "id": asset.id}


@router.post("/{asset_id}/lifecycle")
async def record_lifecycle_event(
    asset_id: str,
    body: LifecycleEventCreate,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Asset).where(
            and_(Asset.id == asset_id, Asset.organisation_id == user.organisation_id)
        )
    )
    asset = result.scalars().first()
    if not asset:
        raise HTTPException(404, "Asset not found")

    event = AssetLifecycleEvent(
        asset_id=asset.id,
        event_type=body.event_type,
        actor_id=user.id,
        details=body.details,
        notes=body.notes,
    )
    db.add(event)
    await db.commit()
    await db.refresh(event)
    return {"id": event.id, "event_type": event.event_type, "occurred_at": str(event.occurred_at)}


@router.get("/{asset_id}/history")
async def asset_history(
    asset_id: str,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(AssetLifecycleEvent).where(AssetLifecycleEvent.asset_id == asset_id)
        .order_by(AssetLifecycleEvent.occurred_at.desc())
    )
    events = result.scalars().all()
    return [
        {"id": e.id, "event_type": e.event_type, "actor_id": e.actor_id,
         "details": e.details, "notes": e.notes, "occurred_at": str(e.occurred_at)}
        for e in events
    ]


# ── Relationships ────────────────────────────────────────────

@router.post("/relationships", status_code=201)
async def create_relationship(
    body: RelationshipCreate,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    rel = AssetRelationship(
        parent_id=body.parent_id,
        child_id=body.child_id,
        relationship_type=body.relationship_type,
    )
    db.add(rel)
    await db.commit()
    await db.refresh(rel)
    return {"id": rel.id, "parent_id": rel.parent_id, "child_id": rel.child_id, "type": rel.relationship_type}


@router.get("/{asset_id}/dependencies")
async def asset_dependencies(
    asset_id: str,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    # Downstream (this asset depends on)
    down_q = await db.execute(
        select(AssetRelationship, Asset).join(Asset, AssetRelationship.child_id == Asset.id)
        .where(AssetRelationship.parent_id == asset_id)
    )
    downstream = [
        {"id": a.id, "asset_tag": a.asset_tag, "name": a.name, "type": r.relationship_type}
        for r, a in down_q.all()
    ]

    # Upstream (depends on this asset)
    up_q = await db.execute(
        select(AssetRelationship, Asset).join(Asset, AssetRelationship.parent_id == Asset.id)
        .where(AssetRelationship.child_id == asset_id)
    )
    upstream = [
        {"id": a.id, "asset_tag": a.asset_tag, "name": a.name, "type": r.relationship_type}
        for r, a in up_q.all()
    ]

    return {"asset_id": asset_id, "depends_on": downstream, "depended_by": upstream}


# ── Maintenance ──────────────────────────────────────────────

@router.post("/maintenance", status_code=201)
async def schedule_maintenance(
    body: MaintenanceCreate,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    maint = AssetMaintenance(
        asset_id=body.asset_id,
        maintenance_type=body.maintenance_type,
        description=body.description,
        scheduled_date=datetime.fromisoformat(body.scheduled_date) if body.scheduled_date else None,
        technician=body.technician,
        cost=body.cost,
        notes=body.notes,
        organisation_id=user.organisation_id,
    )
    db.add(maint)
    await db.commit()
    await db.refresh(maint)
    return {"id": maint.id, "asset_id": maint.asset_id, "scheduled_date": str(maint.scheduled_date)}


@router.get("/maintenance/upcoming")
async def upcoming_maintenance(
    days: int = Query(30, ge=1, le=365),
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    from datetime import timedelta
    now = utcnow()
    result = await db.execute(
        select(AssetMaintenance, Asset).join(Asset, AssetMaintenance.asset_id == Asset.id)
        .where(
            and_(
                AssetMaintenance.organisation_id == user.organisation_id,
                AssetMaintenance.completed_date.is_(None),
                AssetMaintenance.scheduled_date >= now,
                AssetMaintenance.scheduled_date <= now + timedelta(days=days),
            )
        )
        .order_by(AssetMaintenance.scheduled_date)
    )
    items = result.all()
    return [
        {"id": m.id, "asset_id": m.asset_id, "asset_name": a.name,
         "asset_tag": a.asset_tag, "maintenance_type": m.maintenance_type,
         "description": m.description, "scheduled_date": str(m.scheduled_date),
         "technician": m.technician}
        for m, a in items
    ]


# ── Audit ────────────────────────────────────────────────────

@router.get("/audit")
async def asset_audit(
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(require_min_role(UserRole.AUDITOR)),
):
    org_filter = and_(Asset.organisation_id == user.organisation_id, Asset.deleted_at.is_(None))

    # Missing owners
    no_owner_q = await db.execute(
        select(func.count(Asset.id)).where(and_(org_filter, Asset.owner_id.is_(None)))
    )
    no_owner = no_owner_q.scalar() or 0

    # Expired warranties
    now = utcnow()
    expired_q = await db.execute(
        select(func.count(Asset.id)).where(
            and_(org_filter, Asset.warranty_expiry.isnot(None), Asset.warranty_expiry < now)
        )
    )
    expired_warranties = expired_q.scalar() or 0

    # Retired but not disposed
    retired_q = await db.execute(
        select(func.count(Asset.id)).where(and_(org_filter, Asset.status == "retired"))
    )
    retired_not_disposed = retired_q.scalar() or 0

    return {
        "missing_owners": no_owner,
        "expired_warranties": expired_warranties,
        "retired_not_disposed": retired_not_disposed,
    }