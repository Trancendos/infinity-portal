# routers/notifications.py — Real-time Notification System
from typing import Optional, List
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, func, and_, update
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user, CurrentUser
from database import get_db_session
from models import Notification, NotificationPriority, utcnow, new_uuid

router = APIRouter(prefix="/api/v1/notifications", tags=["Notifications"])


# --- Schemas ---

class NotificationOut(BaseModel):
    id: str
    title: str
    body: str
    icon_url: Optional[str] = None
    action_url: Optional[str] = None
    priority: str
    source_module: Optional[str] = None
    read_at: Optional[str] = None
    is_read: bool
    created_at: str


class NotificationCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    body: str = Field(..., min_length=1, max_length=2000)
    icon_url: Optional[str] = None
    action_url: Optional[str] = None
    priority: str = Field(default="normal", pattern=r'^(low|normal|high|urgent)$')
    source_module: Optional[str] = None
    channels: List[str] = Field(default_factory=lambda: ["in-app"])


def _notif_out(n) -> dict:
    return NotificationOut(
        id=n.id, title=n.title, body=n.body,
        icon_url=n.icon_url, action_url=n.action_url,
        priority=n.priority.value if hasattr(n.priority, 'value') else str(n.priority),
        source_module=n.source_module,
        read_at=n.read_at.isoformat() if n.read_at else None,
        is_read=n.read_at is not None,
        created_at=n.created_at.isoformat(),
    ).model_dump()


# ============================================================
# LIST
# ============================================================

@router.get("")
async def list_notifications(
    unread_only: bool = Query(default=False),
    priority: Optional[str] = Query(None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db_session),
    user: CurrentUser = Depends(get_current_user),
):
    query = select(Notification).where(Notification.user_id == user.id)
    if unread_only:
        query = query.where(Notification.read_at.is_(None))
    if priority:
        query = query.where(Notification.priority == priority)
    query = query.where(
        (Notification.expires_at.is_(None)) | (Notification.expires_at > utcnow())
    )
    query = query.order_by(Notification.created_at.desc()).offset(offset).limit(limit)
    result = await db.execute(query)
    return [_notif_out(n) for n in result.scalars().all()]


# ============================================================
# COUNT
# ============================================================

@router.get("/count")
async def notification_count(
    db: AsyncSession = Depends(get_db_session),
    user: CurrentUser = Depends(get_current_user),
):
    unread = (await db.execute(
        select(func.count(Notification.id)).where(
            Notification.user_id == user.id,
            Notification.read_at.is_(None),
            (Notification.expires_at.is_(None)) | (Notification.expires_at > utcnow()),
        )
    )).scalar() or 0

    urgent = (await db.execute(
        select(func.count(Notification.id)).where(
            Notification.user_id == user.id,
            Notification.read_at.is_(None),
            Notification.priority == NotificationPriority.URGENT,
        )
    )).scalar() or 0

    return {"unread": unread, "urgent": urgent}


# ============================================================
# CREATE
# ============================================================

@router.post("", status_code=201)
async def create_notification(
    data: NotificationCreate,
    db: AsyncSession = Depends(get_db_session),
    user: CurrentUser = Depends(get_current_user),
):
    notif = Notification(
        id=new_uuid(), user_id=user.id,
        title=data.title, body=data.body,
        icon_url=data.icon_url, action_url=data.action_url,
        priority=data.priority, source_module=data.source_module,
        channels=data.channels,
    )
    db.add(notif)
    await db.commit()
    await db.refresh(notif)
    return _notif_out(notif)


# ============================================================
# MARK READ
# ============================================================

@router.post("/{notification_id}/read")
async def mark_read(
    notification_id: str,
    db: AsyncSession = Depends(get_db_session),
    user: CurrentUser = Depends(get_current_user),
):
    result = await db.execute(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.user_id == user.id,
        )
    )
    notif = result.scalar_one_or_none()
    if not notif:
        raise HTTPException(404, "Notification not found")
    notif.read_at = utcnow()
    await db.commit()
    return {"status": "read"}


@router.post("/read-all")
async def mark_all_read(
    db: AsyncSession = Depends(get_db_session),
    user: CurrentUser = Depends(get_current_user),
):
    result = await db.execute(
        select(Notification).where(
            Notification.user_id == user.id,
            Notification.read_at.is_(None),
        )
    )
    notifications = result.scalars().all()
    count = 0
    for n in notifications:
        n.read_at = utcnow()
        count += 1
    await db.commit()
    return {"marked": count}


# ============================================================
# DELETE
# ============================================================

@router.delete("/{notification_id}")
async def delete_notification(
    notification_id: str,
    db: AsyncSession = Depends(get_db_session),
    user: CurrentUser = Depends(get_current_user),
):
    result = await db.execute(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.user_id == user.id,
        )
    )
    notif = result.scalar_one_or_none()
    if not notif:
        raise HTTPException(404, "Notification not found")
    await db.delete(notif)
    await db.commit()
    return {"status": "deleted"}


@router.delete("")
async def clear_read_notifications(
    db: AsyncSession = Depends(get_db_session),
    user: CurrentUser = Depends(get_current_user),
):
    result = await db.execute(
        select(Notification).where(
            Notification.user_id == user.id,
            Notification.read_at.isnot(None),
        )
    )
    notifications = result.scalars().all()
    count = len(notifications)
    for n in notifications:
        await db.delete(n)
    await db.commit()
    return {"deleted": count}
