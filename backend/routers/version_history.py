"""
Infinity OS — Version History Router
File versioning, diff, rollback, and history management.
Adapted from infinity-worker version_history.py v5.0
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone

from auth import get_current_user, require_min_role, UserRole
from version_history import (
    get_history_manager,
    ChangeType, EntityType,
)

router = APIRouter(prefix="/api/v1/versions", tags=["Version History"])


# ── Request Models ────────────────────────────────────────────────────────────

class SaveVersionRequest(BaseModel):
    entity_id: str = Field(..., description="ID of the entity being versioned")
    entity_name: str = Field(..., description="Human-readable name of the entity")
    entity_type: str = Field("file", description="file | project | config | deployment | template")
    content: Any = Field(..., description="Content to version (string or dict)")
    change_type: str = Field("update", description="create | update | delete | rename | move")
    message: str = Field("", description="Description of the change")
    tags: List[str] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class RollbackRequest(BaseModel):
    entity_id: str
    entity_type: str = Field("file")
    version_number: int = Field(..., description="Version number to roll back to")
    reason: str = Field("", description="Reason for rollback")


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/entity-types")
async def list_entity_types():
    """List supported entity types for versioning."""
    return {"entity_types": [e.value for e in EntityType]}


@router.get("/change-types")
async def list_change_types():
    """List supported change types."""
    return {"change_types": [c.value for c in ChangeType]}


@router.post("/save")
async def save_version(
    request: SaveVersionRequest,
    current_user=Depends(require_min_role(UserRole.USER)),
):
    """Save a new version of an entity."""
    try:
        entity_type = EntityType(request.entity_type)
    except ValueError:
        raise HTTPException(400, f"Invalid entity_type. Valid: {[e.value for e in EntityType]}")

    try:
        change_type = ChangeType(request.change_type)
    except ValueError:
        raise HTTPException(400, f"Invalid change_type. Valid: {[c.value for c in ChangeType]}")

    manager = get_history_manager()
    entry = manager.save_version(
        entity_type=entity_type,
        entity_id=request.entity_id,
        entity_name=request.entity_name,
        content=request.content,
        change_type=change_type,
        author=str(current_user.id),
        message=request.message,
        tags=request.tags,
        metadata={**request.metadata, "user_email": current_user.email},
    )

    return {
        "version_id": entry.id,
        "version_number": entry.version,
        "entity_id": entry.entity_id,
        "entity_type": entry.entity_type.value,
        "change_type": entry.change_type.value,
        "message": entry.message,
        "author": entry.author,
        "timestamp": entry.timestamp,
        "snapshot_id": entry.snapshot_id,
        "tags": entry.tags,
    }


@router.get("/{entity_type}/{entity_id}")
async def list_versions(
    entity_type: str,
    entity_id: str,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user=Depends(require_min_role(UserRole.USER)),
):
    """List all versions of an entity."""
    try:
        et = EntityType(entity_type)
    except ValueError:
        raise HTTPException(400, f"Invalid entity_type. Valid: {[e.value for e in EntityType]}")

    manager = get_history_manager()
    key = manager._get_timeline_key(et, entity_id)
    timeline = manager.timelines.get(key)

    if not timeline:
        return {
            "entity_id": entity_id,
            "entity_type": entity_type,
            "versions": [],
            "total": 0,
        }

    all_entries = list(reversed(timeline.entries))
    entries = all_entries[offset:offset + limit]

    return {
        "entity_id": entity_id,
        "entity_type": entity_type,
        "entity_name": timeline.entity_name,
        "current_version": timeline.current_version,
        "versions": [
            {
                "version_id": e.id,
                "version_number": e.version,
                "change_type": e.change_type.value,
                "message": e.message,
                "author": e.author,
                "timestamp": e.timestamp,
                "snapshot_id": e.snapshot_id,
                "tags": e.tags,
            }
            for e in entries
        ],
        "total": len(timeline.entries),
        "limit": limit,
        "offset": offset,
    }


@router.get("/{entity_type}/{entity_id}/latest")
async def get_latest_version(
    entity_type: str,
    entity_id: str,
    current_user=Depends(require_min_role(UserRole.USER)),
):
    """Get the latest version content of an entity."""
    try:
        et = EntityType(entity_type)
    except ValueError:
        raise HTTPException(400, f"Invalid entity_type")

    manager = get_history_manager()
    key = manager._get_timeline_key(et, entity_id)
    timeline = manager.timelines.get(key)

    if not timeline or not timeline.entries:
        raise HTTPException(404, f"No versions found for {entity_type}/{entity_id}")

    entry = timeline.entries[-1]
    snapshot = manager.snapshots.get(entry.snapshot_id)

    return {
        "version_id": entry.id,
        "version_number": entry.version,
        "entity_id": entry.entity_id,
        "entity_type": entry.entity_type.value,
        "content": snapshot.content if snapshot else None,
        "change_type": entry.change_type.value,
        "message": entry.message,
        "author": entry.author,
        "timestamp": entry.timestamp,
        "snapshot_id": entry.snapshot_id,
    }


@router.get("/{entity_type}/{entity_id}/summary-stats")
async def get_timeline_summary_inline(
    entity_type: str,
    entity_id: str,
    current_user=Depends(require_min_role(UserRole.USER)),
):
    """Get timeline summary statistics for an entity."""
    try:
        et = EntityType(entity_type)
    except ValueError:
        raise HTTPException(400, f"Invalid entity_type")

    manager = get_history_manager()
    key = manager._get_timeline_key(et, entity_id)
    timeline = manager.timelines.get(key)

    if not timeline:
        return {
            "entity_id": entity_id,
            "entity_type": entity_type,
            "total_versions": 0,
            "current_version": 0,
        }

    return manager.get_timeline_summary(et, entity_id)


@router.get("/{entity_type}/{entity_id}/{version_number}")
async def get_version(
    entity_type: str,
    entity_id: str,
    version_number: int,
    current_user=Depends(require_min_role(UserRole.USER)),
):
    """Get a specific version of an entity by version number."""
    try:
        et = EntityType(entity_type)
    except ValueError:
        raise HTTPException(400, f"Invalid entity_type")

    manager = get_history_manager()
    snapshot = manager.get_version(et, entity_id, version_number)

    if not snapshot:
        raise HTTPException(404, f"Version {version_number} not found")

    # Find the history entry for this version
    key = manager._get_timeline_key(et, entity_id)
    timeline = manager.timelines.get(key)
    entry = None
    if timeline:
        for e in timeline.entries:
            if e.version == version_number:
                entry = e
                break

    return {
        "version_number": version_number,
        "entity_id": entity_id,
        "entity_type": entity_type,
        "content": snapshot.content,
        "content_hash": snapshot.content_hash,
        "size_bytes": snapshot.size_bytes,
        "created_at": snapshot.created_at,
        "message": entry.message if entry else "",
        "author": entry.author if entry else "",
        "change_type": entry.change_type.value if entry else "",
        "tags": entry.tags if entry else [],
        "metadata": entry.metadata if entry else {},
    }


@router.post("/rollback")
async def rollback_version(
    request: RollbackRequest,
    current_user=Depends(require_min_role(UserRole.POWER_USER)),
):
    """Roll back an entity to a previous version."""
    try:
        et = EntityType(request.entity_type)
    except ValueError:
        raise HTTPException(400, f"Invalid entity_type")

    manager = get_history_manager()
    result = manager.rollback(
        entity_type=et,
        entity_id=request.entity_id,
        target_version=request.version_number,
        author=str(current_user.id),
        message=f"Rollback to v{request.version_number}: {request.reason}",
    )

    if not result:
        raise HTTPException(404, f"Version {request.version_number} not found")

    return {
        "success": True,
        "entity_id": request.entity_id,
        "entity_type": request.entity_type,
        "rolled_back_to_version": request.version_number,
        "new_version_id": result.id,
        "new_version_number": result.version,
        "reason": request.reason,
        "rolled_back_by": current_user.email,
        "rolled_back_at": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/{entity_type}/{entity_id}/summary-stats")
async def get_timeline_summary(
    entity_type: str,
    entity_id: str,
    current_user=Depends(require_min_role(UserRole.USER)),
):
    """Get timeline summary statistics for an entity."""
    try:
        et = EntityType(entity_type)
    except ValueError:
        raise HTTPException(400, f"Invalid entity_type")

    manager = get_history_manager()
    key = manager._get_timeline_key(et, entity_id)
    timeline = manager.timelines.get(key)

    if not timeline:
        return {
            "entity_id": entity_id,
            "entity_type": entity_type,
            "total_versions": 0,
            "current_version": 0,
        }

    return manager.get_timeline_summary(et, entity_id)