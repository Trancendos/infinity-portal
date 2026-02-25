# routers/files.py — File system API with virtual filesystem
import uuid
import hashlib
import os
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File as FastAPIFile
from pydantic import BaseModel, Field
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user, require_permission, CurrentUser
from database import get_db_session
from models import FileNode, FileVersion, AuditLog, AuditEventType, FileType, utcnow

router = APIRouter(prefix="/api/v1/files", tags=["File System"])

# Storage directory (configurable via env)
STORAGE_ROOT = os.getenv("FILE_STORAGE_ROOT", "/data/files")


# --- Schemas ---

class FileOut(BaseModel):
    id: str
    name: str
    path: str
    type: str
    mime_type: Optional[str] = None
    size: int
    owner_id: str
    version: int
    parent_id: Optional[str] = None
    created_at: str
    updated_at: str


class FileCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    path: str = Field(..., min_length=1)
    type: str = "file"
    mime_type: Optional[str] = None
    parent_id: Optional[str] = None
    content: Optional[str] = None  # For text files


class FileMove(BaseModel):
    new_path: str
    new_name: Optional[str] = None


class FileShare(BaseModel):
    user_id: str
    permissions: List[str] = ["read"]


class DirectoryCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    path: str = Field(..., min_length=1)
    parent_id: Optional[str] = None


# --- Helpers ---

def _file_to_out(f: FileNode) -> FileOut:
    return FileOut(
        id=f.id,
        name=f.name,
        path=f.path,
        type=f.type.value if isinstance(f.type, FileType) else f.type,
        mime_type=f.mime_type,
        size=f.size or 0,
        owner_id=f.owner_id,
        version=f.version or 1,
        parent_id=f.parent_id,
        created_at=f.created_at.isoformat() if f.created_at else "",
        updated_at=f.updated_at.isoformat() if f.updated_at else "",
    )


# --- Endpoints ---

@router.get("")
async def list_files(
    user: CurrentUser = Depends(require_permission("files:read")),
    db: AsyncSession = Depends(get_db_session),
    path: Optional[str] = Query(default="/", description="Directory path to list"),
    parent_id: Optional[str] = None,
    limit: int = Query(default=100, le=500),
    offset: int = Query(default=0, ge=0),
):
    """List files and directories"""
    stmt = (
        select(FileNode)
        .where(
            FileNode.organisation_id == user.organisation_id,
            FileNode.deleted_at.is_(None),
        )
        .order_by(FileNode.type.desc(), FileNode.name.asc())  # Directories first
        .offset(offset)
        .limit(limit)
    )

    if parent_id:
        stmt = stmt.where(FileNode.parent_id == parent_id)
    elif path:
        # List contents of a directory by path
        if path == "/":
            stmt = stmt.where(FileNode.parent_id.is_(None))
        else:
            # Find the directory first
            dir_stmt = select(FileNode).where(
                FileNode.organisation_id == user.organisation_id,
                FileNode.path == path,
                FileNode.type == FileType.DIRECTORY,
                FileNode.deleted_at.is_(None),
            )
            dir_result = await db.execute(dir_stmt)
            directory = dir_result.scalar_one_or_none()
            if directory:
                stmt = stmt.where(FileNode.parent_id == directory.id)
            else:
                return {"files": [], "path": path, "count": 0}

    result = await db.execute(stmt)
    files = result.scalars().all()

    # Count total
    count_stmt = (
        select(func.count(FileNode.id))
        .where(
            FileNode.organisation_id == user.organisation_id,
            FileNode.deleted_at.is_(None),
        )
    )
    count_result = await db.execute(count_stmt)
    total = count_result.scalar() or 0

    return {
        "files": [_file_to_out(f) for f in files],
        "path": path,
        "count": len(files),
        "total": total,
    }


@router.post("", response_model=FileOut)
async def create_file(
    file_data: FileCreate,
    user: CurrentUser = Depends(require_permission("files:write")),
    db: AsyncSession = Depends(get_db_session),
):
    """Create a new file or directory"""
    try:
        file_type = FileType(file_data.type)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid type: {file_data.type}")

    # Check path uniqueness
    existing_stmt = select(FileNode).where(
        FileNode.organisation_id == user.organisation_id,
        FileNode.path == file_data.path,
        FileNode.deleted_at.is_(None),
    )
    existing_result = await db.execute(existing_stmt)
    if existing_result.scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"Path already exists: {file_data.path}")

    size = len(file_data.content.encode()) if file_data.content else 0
    storage_key = None

    # Store content if provided
    if file_data.content and file_type == FileType.FILE:
        content_hash = hashlib.sha256(file_data.content.encode()).hexdigest()
        storage_key = f"{user.organisation_id}/{content_hash}"
        # In production, write to R2/MinIO. For now, store reference.

    node = FileNode(
        name=file_data.name,
        path=file_data.path,
        type=file_type,
        mime_type=file_data.mime_type,
        size=size,
        owner_id=user.id,
        organisation_id=user.organisation_id,
        parent_id=file_data.parent_id,
        storage_key=storage_key,
        content_text=file_data.content if file_type == FileType.FILE else None,
        version=1,
    )
    db.add(node)

    # Audit
    audit = AuditLog(
        event_type=AuditEventType.FILE_CREATED,
        user_id=user.id,
        organisation_id=user.organisation_id,
        resource_type="file",
        resource_id=node.id,
        governance_metadata={"path": file_data.path, "type": file_data.type},
        request_id=str(uuid.uuid4()),
    )
    db.add(audit)
    await db.commit()
    await db.refresh(node)

    return _file_to_out(node)


@router.post("/directory", response_model=FileOut)
async def create_directory(
    dir_data: DirectoryCreate,
    user: CurrentUser = Depends(require_permission("files:write")),
    db: AsyncSession = Depends(get_db_session),
):
    """Create a new directory"""
    existing_stmt = select(FileNode).where(
        FileNode.organisation_id == user.organisation_id,
        FileNode.path == dir_data.path,
        FileNode.deleted_at.is_(None),
    )
    existing_result = await db.execute(existing_stmt)
    if existing_result.scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"Path already exists: {dir_data.path}")

    node = FileNode(
        name=dir_data.name,
        path=dir_data.path,
        type=FileType.DIRECTORY,
        size=0,
        owner_id=user.id,
        organisation_id=user.organisation_id,
        parent_id=dir_data.parent_id,
        version=1,
    )
    db.add(node)
    await db.commit()
    await db.refresh(node)

    return _file_to_out(node)


@router.get("/{file_id}", response_model=FileOut)
async def get_file(
    file_id: str,
    user: CurrentUser = Depends(require_permission("files:read")),
    db: AsyncSession = Depends(get_db_session),
):
    """Get file metadata"""
    stmt = select(FileNode).where(
        FileNode.id == file_id,
        FileNode.organisation_id == user.organisation_id,
        FileNode.deleted_at.is_(None),
    )
    result = await db.execute(stmt)
    node = result.scalar_one_or_none()
    if not node:
        raise HTTPException(status_code=404, detail="File not found")
    return _file_to_out(node)


@router.get("/{file_id}/content")
async def get_file_content(
    file_id: str,
    user: CurrentUser = Depends(require_permission("files:read")),
    db: AsyncSession = Depends(get_db_session),
):
    """Get file content (text files only)"""
    stmt = select(FileNode).where(
        FileNode.id == file_id,
        FileNode.organisation_id == user.organisation_id,
        FileNode.deleted_at.is_(None),
    )
    result = await db.execute(stmt)
    node = result.scalar_one_or_none()
    if not node:
        raise HTTPException(status_code=404, detail="File not found")
    if node.type == FileType.DIRECTORY:
        raise HTTPException(status_code=400, detail="Cannot get content of a directory")

    return {
        "file_id": node.id,
        "name": node.name,
        "content": node.content_text or "",
        "mime_type": node.mime_type,
        "size": node.size,
        "version": node.version,
    }


@router.put("/{file_id}/content")
async def update_file_content(
    file_id: str,
    content_data: dict,
    user: CurrentUser = Depends(require_permission("files:write")),
    db: AsyncSession = Depends(get_db_session),
):
    """Update file content"""
    stmt = select(FileNode).where(
        FileNode.id == file_id,
        FileNode.organisation_id == user.organisation_id,
        FileNode.deleted_at.is_(None),
    )
    result = await db.execute(stmt)
    node = result.scalar_one_or_none()
    if not node:
        raise HTTPException(status_code=404, detail="File not found")

    content = content_data.get("content", "")
    node.content_text = content
    node.size = len(content.encode())
    node.version += 1

    # Create version record
    version = FileVersion(
        file_id=node.id,
        version=node.version,
        size=node.size,
        storage_key=node.storage_key or f"{user.organisation_id}/{node.id}/v{node.version}",
        created_by=user.id,
        change_description=content_data.get("description", ""),
    )
    db.add(version)
    db.add(node)

    audit = AuditLog(
        event_type=AuditEventType.FILE_UPDATED,
        user_id=user.id,
        organisation_id=user.organisation_id,
        resource_type="file",
        resource_id=file_id,
        request_id=str(uuid.uuid4()),
    )
    db.add(audit)
    await db.commit()

    return {"file_id": file_id, "version": node.version, "size": node.size}


@router.delete("/{file_id}")
async def delete_file(
    file_id: str,
    user: CurrentUser = Depends(require_permission("files:delete")),
    db: AsyncSession = Depends(get_db_session),
):
    """Soft-delete a file"""
    stmt = select(FileNode).where(
        FileNode.id == file_id,
        FileNode.organisation_id == user.organisation_id,
        FileNode.deleted_at.is_(None),
    )
    result = await db.execute(stmt)
    node = result.scalar_one_or_none()
    if not node:
        raise HTTPException(status_code=404, detail="File not found")

    # Check ownership or admin
    if node.owner_id != user.id and "files:delete" not in user.permissions:
        raise HTTPException(status_code=403, detail="Cannot delete files you don't own")

    node.deleted_at = datetime.now(timezone.utc)
    db.add(node)

    audit = AuditLog(
        event_type=AuditEventType.FILE_DELETED,
        user_id=user.id,
        organisation_id=user.organisation_id,
        resource_type="file",
        resource_id=file_id,
        governance_metadata={"path": node.path},
        request_id=str(uuid.uuid4()),
    )
    db.add(audit)
    await db.commit()

    return {"file_id": file_id, "status": "deleted"}


@router.post("/{file_id}/share")
async def share_file(
    file_id: str,
    share: FileShare,
    user: CurrentUser = Depends(require_permission("files:share")),
    db: AsyncSession = Depends(get_db_session),
):
    """Share a file with another user"""
    stmt = select(FileNode).where(
        FileNode.id == file_id,
        FileNode.organisation_id == user.organisation_id,
        FileNode.deleted_at.is_(None),
    )
    result = await db.execute(stmt)
    node = result.scalar_one_or_none()
    if not node:
        raise HTTPException(status_code=404, detail="File not found")

    # Add to ACL
    acl = node.acl or []
    acl.append({
        "principalId": share.user_id,
        "principalType": "user",
        "permissions": share.permissions,
        "granted_by": user.id,
        "granted_at": datetime.now(timezone.utc).isoformat(),
    })
    node.acl = acl
    db.add(node)

    audit = AuditLog(
        event_type=AuditEventType.FILE_SHARED,
        user_id=user.id,
        organisation_id=user.organisation_id,
        resource_type="file",
        resource_id=file_id,
        governance_metadata={"shared_with": share.user_id, "permissions": share.permissions},
        request_id=str(uuid.uuid4()),
    )
    db.add(audit)
    await db.commit()

    return {"file_id": file_id, "shared_with": share.user_id, "permissions": share.permissions}


@router.get("/{file_id}/versions")
async def list_file_versions(
    file_id: str,
    user: CurrentUser = Depends(require_permission("files:read")),
    db: AsyncSession = Depends(get_db_session),
):
    """List all versions of a file"""
    stmt = (
        select(FileVersion)
        .where(FileVersion.file_id == file_id)
        .order_by(FileVersion.version.desc())
    )
    result = await db.execute(stmt)
    versions = result.scalars().all()

    return {
        "file_id": file_id,
        "versions": [
            {
                "id": v.id,
                "version": v.version,
                "size": v.size,
                "created_by": v.created_by,
                "change_description": v.change_description,
                "created_at": v.created_at.isoformat() if v.created_at else "",
            }
            for v in versions
        ],
    }


@router.get("/search")
async def search_files(
    q: str = Query(..., min_length=1, description="Search query"),
    user: CurrentUser = Depends(require_permission("files:read")),
    db: AsyncSession = Depends(get_db_session),
    limit: int = Query(default=20, le=100),
):
    """Search files by name or content"""
    stmt = (
        select(FileNode)
        .where(
            FileNode.organisation_id == user.organisation_id,
            FileNode.deleted_at.is_(None),
            FileNode.name.ilike(f"%{q}%"),
        )
        .order_by(FileNode.updated_at.desc())
        .limit(limit)
    )
    result = await db.execute(stmt)
    files = result.scalars().all()

    return {
        "query": q,
        "results": [_file_to_out(f) for f in files],
        "count": len(files),
    }