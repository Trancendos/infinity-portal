# routers/arcadian_exchange.py — Arcadian Exchange / The Porter Family — Procurement
# Ecosystem-wide procurement, vendor management, and supply chain operations.
# Manages purchase orders, vendor registry, contracts, and procurement analytics.
#
# Lane 3 (Data/Hive) — Procurement data layer
# Kernel Event Bus integration for procurement events
#
# ISO 27001: A.15.1 — Information security in supplier relationships

import uuid
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List

from fastapi import APIRouter, HTTPException, Depends, Query, Path
from pydantic import BaseModel, Field

from auth import get_current_user, CurrentUser

router = APIRouter(prefix="/api/v1/arcadian-exchange", tags=["Arcadian Exchange — Procurement"])
logger = logging.getLogger("arcadian_exchange")


# ── Models ────────────────────────────────────────────────────────

class VendorCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=256)
    category: str = Field(default="general", pattern="^(general|technology|creative|infrastructure|security|consulting)$")
    contact_email: str = Field(default="", max_length=256)
    rating: int = Field(default=3, ge=1, le=5)
    compliance_status: str = Field(default="pending", pattern="^(pending|approved|suspended|blacklisted)$")
    metadata: Dict[str, Any] = Field(default_factory=dict)

class PurchaseOrderCreate(BaseModel):
    vendor_id: str = Field(..., min_length=1)
    title: str = Field(..., min_length=1, max_length=256)
    items: List[Dict[str, Any]] = Field(default_factory=list)
    total_amount: float = Field(default=0.0, ge=0)
    currency: str = Field(default="GBP", max_length=3)
    priority: str = Field(default="normal", pattern="^(low|normal|high|urgent)$")

class ContractCreate(BaseModel):
    vendor_id: str = Field(..., min_length=1)
    title: str = Field(..., min_length=1, max_length=256)
    contract_type: str = Field(default="service", pattern="^(service|license|subscription|maintenance|consulting)$")
    start_date: str = Field(default="", max_length=32)
    end_date: str = Field(default="", max_length=32)
    value: float = Field(default=0.0, ge=0)
    terms: str = Field(default="", max_length=5000)


# ── State ────────────────────────────────────────────────────────

_vendors: Dict[str, Dict[str, Any]] = {}
_orders: Dict[str, Dict[str, Any]] = {}
_contracts: Dict[str, Dict[str, Any]] = {}
_audit: List[Dict[str, Any]] = []


def _emit(action: str, detail: str, user_id: str):
    _audit.append({"id": str(uuid.uuid4()), "ts": datetime.now(timezone.utc).isoformat(),
                    "action": action, "detail": detail, "user_id": user_id})
    logger.info("arcadian_exchange.%s | user=%s | %s", action, user_id, detail)


# ── Vendors ──────────────────────────────────────────────────────

@router.get("/vendors")
async def list_vendors(
    category: Optional[str] = Query(None), skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_user),
):
    items = list(_vendors.values())
    if category:
        items = [v for v in items if v["category"] == category]
    total = len(items)
    return {"items": items[skip:skip+limit], "total": total, "skip": skip, "limit": limit}

@router.post("/vendors", status_code=201)
async def register_vendor(body: VendorCreate, current_user: CurrentUser = Depends(get_current_user)):
    uid = getattr(current_user, "id", "anonymous")
    vid = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    rec = {"id": vid, **body.model_dump(), "registered_by": uid, "registered_at": now}
    _vendors[vid] = rec
    _emit("vendor_registered", f"vendor={vid} name={body.name}", uid)
    return rec

@router.get("/vendors/{vendor_id}")
async def get_vendor(vendor_id: str = Path(...), current_user: CurrentUser = Depends(get_current_user)):
    rec = _vendors.get(vendor_id)
    if not rec:
        raise HTTPException(404, "Vendor not found")
    return rec


# ── Purchase Orders ──────────────────────────────────────────────

@router.get("/orders")
async def list_orders(
    vendor_id: Optional[str] = Query(None), skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_user),
):
    items = list(_orders.values())
    if vendor_id:
        items = [o for o in items if o["vendor_id"] == vendor_id]
    total = len(items)
    return {"items": items[skip:skip+limit], "total": total, "skip": skip, "limit": limit}

@router.post("/orders", status_code=201)
async def create_order(body: PurchaseOrderCreate, current_user: CurrentUser = Depends(get_current_user)):
    uid = getattr(current_user, "id", "anonymous")
    if body.vendor_id not in _vendors:
        raise HTTPException(404, "Vendor not found")
    oid = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    rec = {"id": oid, **body.model_dump(), "status": "submitted",
           "created_by": uid, "created_at": now}
    _orders[oid] = rec
    _emit("order_created", f"order={oid} vendor={body.vendor_id}", uid)
    return rec

@router.get("/orders/{order_id}")
async def get_order(order_id: str = Path(...), current_user: CurrentUser = Depends(get_current_user)):
    rec = _orders.get(order_id)
    if not rec:
        raise HTTPException(404, "Order not found")
    return rec


# ── Contracts ────────────────────────────────────────────────────

@router.get("/contracts")
async def list_contracts(
    vendor_id: Optional[str] = Query(None), skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_user),
):
    items = list(_contracts.values())
    if vendor_id:
        items = [c for c in items if c["vendor_id"] == vendor_id]
    total = len(items)
    return {"items": items[skip:skip+limit], "total": total, "skip": skip, "limit": limit}

@router.post("/contracts", status_code=201)
async def create_contract(body: ContractCreate, current_user: CurrentUser = Depends(get_current_user)):
    uid = getattr(current_user, "id", "anonymous")
    if body.vendor_id not in _vendors:
        raise HTTPException(404, "Vendor not found")
    cid = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    rec = {"id": cid, **body.model_dump(), "status": "draft",
           "created_by": uid, "created_at": now}
    _contracts[cid] = rec
    _emit("contract_created", f"contract={cid} vendor={body.vendor_id}", uid)
    return rec

@router.get("/contracts/{contract_id}")
async def get_contract(contract_id: str = Path(...), current_user: CurrentUser = Depends(get_current_user)):
    rec = _contracts.get(contract_id)
    if not rec:
        raise HTTPException(404, "Contract not found")
    return rec


# ── Overview ─────────────────────────────────────────────────────

@router.get("/overview")
async def exchange_overview(current_user: CurrentUser = Depends(get_current_user)):
    return {
        "total_vendors": len(_vendors),
        "total_orders": len(_orders),
        "total_contracts": len(_contracts),
        "vendors_approved": sum(1 for v in _vendors.values() if v.get("compliance_status") == "approved"),
        "orders_value": sum(o.get("total_amount", 0) for o in _orders.values()),
    }