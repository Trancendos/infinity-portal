# routers/fabulousa.py — Fabulousa / Baron Von Hilton — Fashion & Lifestyle
# Fashion, lifestyle, and brand management module within The Studio.
# Manages collections, lookbooks, brand campaigns, and trend analysis.
#
# Lane 2 (User/Infinity) — Fashion & brand layer
# Kernel Event Bus integration for fashion events

import uuid
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List

from fastapi import APIRouter, HTTPException, Depends, Query, Path
from pydantic import BaseModel, Field

from auth import get_current_user, CurrentUser

router = APIRouter(prefix="/api/v1/fabulousa", tags=["Fabulousa — Fashion & Lifestyle"])
logger = logging.getLogger("fabulousa")


# ── Models ────────────────────────────────────────────────────────

class CollectionCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=256)
    season: str = Field(default="ss25", max_length=32)
    theme: str = Field(default="", max_length=256)
    description: str = Field(default="", max_length=5000)
    pieces_count: int = Field(default=0, ge=0)
    tags: List[str] = Field(default_factory=list)

class LookbookCreate(BaseModel):
    collection_id: str = Field(..., min_length=1)
    title: str = Field(..., min_length=1, max_length=256)
    looks: int = Field(default=1, ge=1, le=200)
    photographer: str = Field(default="", max_length=128)
    mood: str = Field(default="editorial", pattern="^(editorial|street|avant_garde|minimalist|maximalist|vintage)$")

class CampaignCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=256)
    brand: str = Field(default="trancendos", max_length=128)
    campaign_type: str = Field(default="digital", pattern="^(digital|print|social|experiential|hybrid)$")
    budget: float = Field(default=0.0, ge=0)
    target_audience: str = Field(default="", max_length=256)
    channels: List[str] = Field(default_factory=list)


# ── State ────────────────────────────────────────────────────────

_collections: Dict[str, Dict[str, Any]] = {}
_lookbooks: Dict[str, Dict[str, Any]] = {}
_campaigns: Dict[str, Dict[str, Any]] = {}
_audit: List[Dict[str, Any]] = []


def _emit(action: str, detail: str, user_id: str):
    _audit.append({"id": str(uuid.uuid4()), "ts": datetime.now(timezone.utc).isoformat(),
                    "action": action, "detail": detail, "user_id": user_id})
    logger.info("fabulousa.%s | user=%s | %s", action, user_id, detail)


# ── Collections ──────────────────────────────────────────────────

@router.get("/collections")
async def list_collections(
    season: Optional[str] = Query(None), skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_user),
):
    items = list(_collections.values())
    if season:
        items = [c for c in items if c["season"] == season]
    total = len(items)
    return {"items": items[skip:skip+limit], "total": total, "skip": skip, "limit": limit}

@router.post("/collections", status_code=201)
async def create_collection(body: CollectionCreate, current_user: CurrentUser = Depends(get_current_user)):
    uid = getattr(current_user, "id", "anonymous")
    cid = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    rec = {"id": cid, **body.model_dump(), "status": "concept",
           "created_by": uid, "created_at": now}
    _collections[cid] = rec
    _emit("collection_created", f"collection={cid} season={body.season}", uid)
    return rec

@router.get("/collections/{collection_id}")
async def get_collection(collection_id: str = Path(...), current_user: CurrentUser = Depends(get_current_user)):
    rec = _collections.get(collection_id)
    if not rec:
        raise HTTPException(404, "Collection not found")
    return rec


# ── Lookbooks ────────────────────────────────────────────────────

@router.get("/lookbooks")
async def list_lookbooks(
    collection_id: Optional[str] = Query(None), skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_user),
):
    items = list(_lookbooks.values())
    if collection_id:
        items = [l for l in items if l["collection_id"] == collection_id]
    total = len(items)
    return {"items": items[skip:skip+limit], "total": total, "skip": skip, "limit": limit}

@router.post("/lookbooks", status_code=201)
async def create_lookbook(body: LookbookCreate, current_user: CurrentUser = Depends(get_current_user)):
    uid = getattr(current_user, "id", "anonymous")
    if body.collection_id not in _collections:
        raise HTTPException(404, "Collection not found")
    lid = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    rec = {"id": lid, **body.model_dump(), "status": "shooting",
           "created_by": uid, "created_at": now}
    _lookbooks[lid] = rec
    _emit("lookbook_created", f"lookbook={lid} collection={body.collection_id}", uid)
    return rec

@router.get("/lookbooks/{lookbook_id}")
async def get_lookbook(lookbook_id: str = Path(...), current_user: CurrentUser = Depends(get_current_user)):
    rec = _lookbooks.get(lookbook_id)
    if not rec:
        raise HTTPException(404, "Lookbook not found")
    return rec


# ── Campaigns ────────────────────────────────────────────────────

@router.get("/campaigns")
async def list_campaigns(
    campaign_type: Optional[str] = Query(None), skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_user),
):
    items = list(_campaigns.values())
    if campaign_type:
        items = [c for c in items if c["campaign_type"] == campaign_type]
    total = len(items)
    return {"items": items[skip:skip+limit], "total": total, "skip": skip, "limit": limit}

@router.post("/campaigns", status_code=201)
async def create_campaign(body: CampaignCreate, current_user: CurrentUser = Depends(get_current_user)):
    uid = getattr(current_user, "id", "anonymous")
    cid = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    rec = {"id": cid, **body.model_dump(), "status": "planning",
           "created_by": uid, "created_at": now}
    _campaigns[cid] = rec
    _emit("campaign_created", f"campaign={cid} type={body.campaign_type}", uid)
    return rec

@router.get("/campaigns/{campaign_id}")
async def get_campaign(campaign_id: str = Path(...), current_user: CurrentUser = Depends(get_current_user)):
    rec = _campaigns.get(campaign_id)
    if not rec:
        raise HTTPException(404, "Campaign not found")
    return rec


# ── Overview ─────────────────────────────────────────────────────

@router.get("/overview")
async def fabulousa_overview(current_user: CurrentUser = Depends(get_current_user)):
    return {
        "total_collections": len(_collections),
        "total_lookbooks": len(_lookbooks),
        "total_campaigns": len(_campaigns),
        "collections_by_season": _count_by(_collections, "season"),
    }

def _count_by(store: Dict, field: str) -> Dict[str, int]:
    counts: Dict[str, int] = {}
    for item in store.values():
        val = item.get(field, "unknown")
        counts[val] = counts.get(val, 0) + 1
    return counts