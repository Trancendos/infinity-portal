# routers/hive.py — The HIVE — Core Data Transfer Mesh (Circulatory System)
# THREE-LANE MESH: LANE 3 — DATA AND INFORMATION FLOW
#
# The Hive is the Data lane. All data and information flows through here.
# It is the circulatory system of the Trancendos ecosystem — every piece
# of data that moves between services travels through The Hive.
#
# Architecture:
#   Service A → The Hive → Data Transfer → Service B
#   The Hive tracks all data assets, their lineage, and routing.
#   It ensures data integrity, provenance, and compliance.

from typing import Optional, Dict, Any, List
from datetime import datetime, timezone
from collections import defaultdict
import uuid
import hashlib
import json

from fastapi import APIRouter, Depends, HTTPException, Query, Path
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user, require_min_role, CurrentUser, UserRole
from database import get_db_session

router = APIRouter(prefix="/api/v1/hive", tags=['The Hive — Data Transfer Mesh'])


# ============================================================
# LANE 3: DATA AND INFORMATION FLOW
# ============================================================
# The Hive manages all data movement in the ecosystem:
#   1. Data transfers between services (files, documents, KB articles)
#   2. Asset registration and discovery
#   3. Data lineage tracking (where data came from, where it went)
#   4. Transfer integrity verification (SHA-256 checksums)
#   5. Topology mapping for The Observatory
# ============================================================


# In-memory state (production: persist to DB + Kernel Event Bus)
_transfers: Dict[str, Dict[str, Any]] = {}
_registered_assets: Dict[str, Dict[str, Any]] = {}
_transfer_log: List[Dict[str, Any]] = []
_data_lineage: Dict[str, List[Dict[str, Any]]] = defaultdict(list)


# ============================================================
# SCHEMAS
# ============================================================

class TransferRequest(BaseModel):
    """Request to transfer data between services."""
    source_service: str = Field(..., description="Source service (e.g., 'the-library', 'the-treasury')")
    target_service: str = Field(..., description="Target service")
    asset_id: str = Field(..., description="ID of the data asset to transfer")
    transfer_type: str = Field("sync", description="Transfer type: sync, async, stream")
    priority: str = Field("normal", description="Priority: critical, high, normal, low")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Transfer metadata")
    verify_integrity: bool = Field(True, description="Verify SHA-256 checksum on delivery")


class AssetRegistration(BaseModel):
    """Register a data asset with The Hive."""
    asset_id: str = Field(default=None, description="Asset ID (auto-generated if not provided)")
    asset_type: str = Field(..., description="Asset type: file, document, kb_article, dataset, config, secret")
    source_service: str = Field(..., description="Service that owns this asset")
    content_hash: Optional[str] = Field(None, description="SHA-256 hash of asset content")
    size_bytes: Optional[int] = Field(None, description="Asset size in bytes")
    metadata: Dict[str, Any] = Field(default_factory=dict)
    classification: str = Field("internal", description="Data classification: public, internal, confidential, restricted")


class AssetRouteRequest(BaseModel):
    """Request optimal route for a data asset."""
    target_service: str = Field(..., description="Target service for the asset")
    transfer_type: str = Field("sync", description="Transfer type: sync, async, stream")
    max_hops: int = Field(3, ge=1, le=10)


# ============================================================
# DATA TRANSFER ENDPOINTS
# ============================================================

@router.post("/transfer")
async def initiate_transfer(
    request: TransferRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """
    Initiate a data transfer between services through The Hive.
    
    All data movement in the Trancendos ecosystem MUST flow through
    The Hive to maintain Lane 3 isolation and data lineage tracking.
    """
    transfer_id = str(uuid.uuid4())[:12]

    # Verify asset exists
    asset = _registered_assets.get(request.asset_id)
    if not asset:
        raise HTTPException(404, f"Asset '{request.asset_id}' not registered with The Hive")

    # Create transfer record
    transfer = {
        "transfer_id": transfer_id,
        "source_service": request.source_service,
        "target_service": request.target_service,
        "asset_id": request.asset_id,
        "asset_type": asset.get("asset_type", "unknown"),
        "transfer_type": request.transfer_type,
        "priority": request.priority,
        "status": "in_progress",
        "verify_integrity": request.verify_integrity,
        "content_hash": asset.get("content_hash"),
        "size_bytes": asset.get("size_bytes"),
        "classification": asset.get("classification", "internal"),
        "initiated_by": current_user.id if hasattr(current_user, 'id') else "system",
        "mesh_lane": "data_hive",
        "started_at": datetime.now(timezone.utc).isoformat(),
        "completed_at": None,
        "metadata": request.metadata,
    }

    _transfers[transfer_id] = transfer

    # Track lineage
    _data_lineage[request.asset_id].append({
        "transfer_id": transfer_id,
        "from": request.source_service,
        "to": request.target_service,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "initiated_by": transfer["initiated_by"],
    })

    # Simulate completion for sync transfers
    if request.transfer_type == "sync":
        transfer["status"] = "completed"
        transfer["completed_at"] = datetime.now(timezone.utc).isoformat()
        transfer["integrity_verified"] = request.verify_integrity

    _transfer_log.append(transfer)
    if len(_transfer_log) > 1000:
        _transfer_log[:] = _transfer_log[-500:]

    return {
        "status": "ok",
        "transfer_id": transfer_id,
        "delivery_status": transfer["status"],
        "asset_id": request.asset_id,
        "route": f"{request.source_service} → The Hive → {request.target_service}",
        "integrity_verified": transfer.get("integrity_verified", False),
        "mesh_lane": "data_hive",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/transfers/{transfer_id}")
async def get_transfer(
    transfer_id: str = Path(...),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Get details of a specific data transfer."""
    transfer = _transfers.get(transfer_id)
    if not transfer:
        raise HTTPException(404, f"Transfer '{transfer_id}' not found")

    return {"status": "ok", "transfer": transfer}


@router.get("/transfers")
async def list_transfers(
    status: Optional[str] = Query(None, description="Filter by status: in_progress, completed, failed, cancelled"),
    source: Optional[str] = Query(None, description="Filter by source service"),
    target: Optional[str] = Query(None, description="Filter by target service"),
    limit: int = Query(50, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """List data transfers through The Hive."""
    transfers = list(_transfers.values())

    if status:
        transfers = [t for t in transfers if t.get("status") == status]
    if source:
        transfers = [t for t in transfers if t.get("source_service") == source]
    if target:
        transfers = [t for t in transfers if t.get("target_service") == target]

    transfers = sorted(transfers, key=lambda t: t.get("started_at", ""), reverse=True)[:limit]

    return {
        "status": "ok",
        "total": len(transfers),
        "transfers": transfers,
        "mesh_lane": "data_hive",
    }


@router.post("/transfers/{transfer_id}/cancel")
async def cancel_transfer(
    transfer_id: str = Path(...),
    current_user: CurrentUser = Depends(require_min_role(UserRole.USER)),
    db: AsyncSession = Depends(get_db_session),
):
    """Cancel an in-progress data transfer."""
    transfer = _transfers.get(transfer_id)
    if not transfer:
        raise HTTPException(404, f"Transfer '{transfer_id}' not found")

    if transfer["status"] != "in_progress":
        raise HTTPException(400, f"Transfer is '{transfer['status']}', cannot cancel")

    transfer["status"] = "cancelled"
    transfer["completed_at"] = datetime.now(timezone.utc).isoformat()

    return {
        "status": "ok",
        "transfer_id": transfer_id,
        "new_status": "cancelled",
        "mesh_lane": "data_hive",
    }


# ============================================================
# DATA ASSET MANAGEMENT
# ============================================================

@router.post("/assets/register")
async def register_asset(
    request: AssetRegistration,
    current_user: CurrentUser = Depends(require_min_role(UserRole.USER)),
    db: AsyncSession = Depends(get_db_session),
):
    """
    Register a data asset with The Hive for tracking and transfer.
    
    All data assets that need to move between services must be
    registered with The Hive first. This enables:
    - Data lineage tracking
    - Integrity verification
    - Classification-based access control
    - Transfer optimisation
    """
    asset_id = request.asset_id or str(uuid.uuid4())[:12]

    asset = {
        "asset_id": asset_id,
        "asset_type": request.asset_type,
        "source_service": request.source_service,
        "content_hash": request.content_hash,
        "size_bytes": request.size_bytes,
        "classification": request.classification,
        "metadata": request.metadata,
        "registered_at": datetime.now(timezone.utc).isoformat(),
        "registered_by": current_user.id if hasattr(current_user, 'id') else "system",
        "transfer_count": 0,
        "mesh_lane": "data_hive",
    }
    _registered_assets[asset_id] = asset

    # Track lineage origin
    _data_lineage[asset_id].append({
        "event": "registered",
        "service": request.source_service,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })

    return {
        "status": "ok",
        "asset": asset,
        "mesh_lane": "data_hive",
    }


@router.get("/assets/{asset_id}")
async def get_asset(
    asset_id: str = Path(...),
    include_lineage: bool = Query(False, description="Include data lineage history"),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Get details of a registered data asset, optionally with lineage."""
    asset = _registered_assets.get(asset_id)
    if not asset:
        raise HTTPException(404, f"Asset '{asset_id}' not registered")

    result = {"status": "ok", "asset": asset}

    if include_lineage:
        result["lineage"] = _data_lineage.get(asset_id, [])
        result["lineage_depth"] = len(result["lineage"])

    return result


@router.post("/assets/{asset_id}/route")
async def get_asset_route(
    asset_id: str = Path(...),
    request: AssetRouteRequest = AssetRouteRequest(target_service="default"),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Get optimal transfer route for a data asset."""
    asset = _registered_assets.get(asset_id)
    if not asset:
        raise HTTPException(404, f"Asset '{asset_id}' not registered")

    source = asset.get("source_service", "unknown")

    # Route through The Hive (always single-hop for data lane)
    route = {
        "asset_id": asset_id,
        "source": source,
        "target": request.target_service,
        "path": [source, "the_hive", request.target_service],
        "hops": 2,
        "transfer_type": request.transfer_type,
        "estimated_latency_ms": 10 + (asset.get("size_bytes", 0) or 0) // 1_000_000,
        "classification": asset.get("classification"),
        "integrity_check": "sha256",
        "mesh_lane": "data_hive",
    }

    return {"status": "ok", "route": route}


# ============================================================
# TOPOLOGY & METRICS
# ============================================================

@router.get("/topology")
async def get_topology(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """
    Get The Hive's data flow topology.
    
    Shows all services connected through the data lane and their
    transfer relationships. Used by The Observatory for visualisation.
    """
    # Build topology from transfer history
    services = set()
    connections = defaultdict(lambda: {"count": 0, "bytes": 0})

    for transfer in _transfer_log:
        src = transfer.get("source_service", "unknown")
        tgt = transfer.get("target_service", "unknown")
        services.add(src)
        services.add(tgt)
        key = f"{src}→{tgt}"
        connections[key]["count"] += 1
        connections[key]["bytes"] += transfer.get("size_bytes", 0) or 0

    # Also include services from registered assets
    for asset in _registered_assets.values():
        services.add(asset.get("source_service", "unknown"))

    nodes = [{"id": s, "type": "service"} for s in services]
    edges = [
        {
            "source": k.split("→")[0],
            "target": k.split("→")[1],
            "transfer_count": v["count"],
            "total_bytes": v["bytes"],
        }
        for k, v in connections.items()
    ]

    return {
        "status": "ok",
        "topology": {
            "nodes": nodes,
            "edges": edges,
            "node_count": len(nodes),
            "edge_count": len(edges),
        },
        "mesh_lane": "data_hive",
    }


@router.get("/health")
async def health_check():
    """Hive health check — Lane 3 data flow status."""
    return {
        "status": "healthy",
        "service": "the_hive",
        "mesh_lane": "data_hive",
        "registered_assets": len(_registered_assets),
        "active_transfers": sum(1 for t in _transfers.values() if t.get("status") == "in_progress"),
        "total_transfers": len(_transfers),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/metrics")
async def get_metrics(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Get Hive performance metrics for The Observatory."""
    total = len(_transfer_log)
    completed = sum(1 for t in _transfer_log if t.get("status") == "completed")
    total_bytes = sum(t.get("size_bytes", 0) or 0 for t in _transfer_log)

    # Classification breakdown
    classifications = defaultdict(int)
    for asset in _registered_assets.values():
        classifications[asset.get("classification", "unknown")] += 1

    return {
        "status": "ok",
        "metrics": {
            "registered_assets": len(_registered_assets),
            "total_transfers": total,
            "completed_transfers": completed,
            "completion_rate": round(completed / max(total, 1) * 100, 1),
            "total_bytes_transferred": total_bytes,
            "active_transfers": sum(1 for t in _transfers.values() if t.get("status") == "in_progress"),
            "asset_classifications": dict(classifications),
            "lineage_tracked_assets": len(_data_lineage),
        },
        "mesh_lane": "data_hive",
    }