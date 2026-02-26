# routers/artifacts.py — Centralised artifact repository
import uuid
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user, require_min_role, CurrentUser
from database import get_db_session
from models import (
    ArtifactRepository, Artifact, ArtifactDownload,
    UserRole, ArtifactType, ArtifactVisibility, DataClassification, utcnow,
)

router = APIRouter(prefix="/api/v1/artifacts", tags=["Artifact Repository"])


# ============================================================
# SCHEMAS
# ============================================================

class RepoCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    artifact_type: ArtifactType
    visibility: ArtifactVisibility = ArtifactVisibility.ORG
    tags: List[str] = []


class RepoOut(BaseModel):
    id: str
    name: str
    description: Optional[str]
    artifact_type: str
    visibility: str
    tags: List[str]
    artifact_count: int
    total_downloads: int
    total_size_bytes: int
    created_at: str


class ArtifactCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    version: str = "1.0.0"
    storage_url: Optional[str] = None
    checksum_sha256: Optional[str] = None
    size_bytes: int = 0
    mime_type: Optional[str] = None
    data_classification: DataClassification = DataClassification.INTERNAL
    tags: List[str] = []
    extra_metadata: dict = {}
    preview_url: Optional[str] = None


class ArtifactOut(BaseModel):
    id: str
    repository_id: str
    name: str
    description: Optional[str]
    version: str
    artifact_type: str
    storage_url: Optional[str]
    checksum_sha256: Optional[str]
    size_bytes: int
    mime_type: Optional[str]
    data_classification: str
    tags: List[str]
    extra_metadata: dict
    preview_url: Optional[str]
    download_count: int
    is_latest: bool
    created_at: str
    updated_at: str


# ============================================================
# REPOSITORY ENDPOINTS
# ============================================================

@router.post("/repos", response_model=RepoOut, status_code=201)
async def create_repo(
    data: RepoCreate,
    user: CurrentUser = Depends(require_min_role(UserRole.POWER_USER)),
    db: AsyncSession = Depends(get_db_session),
):
    """Create a new artifact repository"""
    repo = ArtifactRepository(
        name=data.name,
        description=data.description,
        organisation_id=user.organisation_id,
        created_by=user.id,
        artifact_type=data.artifact_type,
        visibility=data.visibility,
        tags=data.tags,
    )
    db.add(repo)
    await db.commit()
    await db.refresh(repo)
    return _repo_out(repo)


@router.get("/repos", response_model=List[RepoOut])
async def list_repos(
    artifact_type: Optional[str] = None,
    limit: int = Query(default=50, le=200),
    offset: int = 0,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """List artifact repositories"""
    stmt = select(ArtifactRepository).where(
        ArtifactRepository.organisation_id == user.organisation_id,
        ArtifactRepository.deleted_at == None,  # noqa: E711
    )
    if artifact_type:
        stmt = stmt.where(ArtifactRepository.artifact_type == artifact_type)
    stmt = stmt.order_by(ArtifactRepository.created_at.desc()).offset(offset).limit(limit)
    result = await db.execute(stmt)
    return [_repo_out(r) for r in result.scalars().all()]


@router.get("/repos/{repo_id}", response_model=RepoOut)
async def get_repo(
    repo_id: str,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Get a repository by ID"""
    repo = await _get_repo_or_404(repo_id, user.organisation_id, db)
    return _repo_out(repo)


@router.delete("/repos/{repo_id}", status_code=204)
async def delete_repo(
    repo_id: str,
    user: CurrentUser = Depends(require_min_role(UserRole.ORG_ADMIN)),
    db: AsyncSession = Depends(get_db_session),
):
    """Soft-delete a repository"""
    repo = await _get_repo_or_404(repo_id, user.organisation_id, db)
    repo.deleted_at = utcnow()
    await db.commit()


# ============================================================
# ARTIFACT ENDPOINTS
# ============================================================

@router.post("/repos/{repo_id}/artifacts", response_model=ArtifactOut, status_code=201)
async def upload_artifact(
    repo_id: str,
    data: ArtifactCreate,
    user: CurrentUser = Depends(require_min_role(UserRole.POWER_USER)),
    db: AsyncSession = Depends(get_db_session),
):
    """Upload/register an artifact in a repository"""
    repo = await _get_repo_or_404(repo_id, user.organisation_id, db)

    # Mark previous versions as not latest
    prev_stmt = select(Artifact).where(
        Artifact.repository_id == repo_id,
        Artifact.name == data.name,
        Artifact.is_latest == True,  # noqa: E712
    )
    prev_result = await db.execute(prev_stmt)
    for prev in prev_result.scalars().all():
        prev.is_latest = False

    artifact = Artifact(
        repository_id=repo_id,
        organisation_id=user.organisation_id,
        uploaded_by=user.id,
        name=data.name,
        description=data.description,
        version=data.version,
        artifact_type=repo.artifact_type,
        storage_url=data.storage_url,
        checksum_sha256=data.checksum_sha256,
        size_bytes=data.size_bytes,
        mime_type=data.mime_type,
        data_classification=data.data_classification,
        tags=data.tags,
        extra_metadata=data.extra_metadata,
        preview_url=data.preview_url,
        is_latest=True,
    )
    db.add(artifact)

    # Update repo stats
    repo.artifact_count = (repo.artifact_count or 0) + 1
    repo.total_size_bytes = (repo.total_size_bytes or 0) + data.size_bytes

    await db.commit()
    await db.refresh(artifact)
    return _artifact_out(artifact)


@router.get("/repos/{repo_id}/artifacts", response_model=List[ArtifactOut])
async def list_artifacts(
    repo_id: str,
    latest_only: bool = True,
    search: Optional[str] = None,
    limit: int = Query(default=50, le=200),
    offset: int = 0,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """List artifacts in a repository"""
    await _get_repo_or_404(repo_id, user.organisation_id, db)

    stmt = select(Artifact).where(
        Artifact.repository_id == repo_id,
        Artifact.deleted_at == None,  # noqa: E711
    )
    if latest_only:
        stmt = stmt.where(Artifact.is_latest == True)  # noqa: E712
    if search:
        stmt = stmt.where(Artifact.name.ilike(f"%{search}%"))
    stmt = stmt.order_by(Artifact.created_at.desc()).offset(offset).limit(limit)
    result = await db.execute(stmt)
    return [_artifact_out(a) for a in result.scalars().all()]


@router.get("/repos/{repo_id}/artifacts/{artifact_id}", response_model=ArtifactOut)
async def get_artifact(
    repo_id: str,
    artifact_id: str,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Get an artifact by ID"""
    artifact = await _get_artifact_or_404(artifact_id, repo_id, user.organisation_id, db)
    return _artifact_out(artifact)


@router.post("/repos/{repo_id}/artifacts/{artifact_id}/download")
async def record_download(
    repo_id: str,
    artifact_id: str,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Record a download and return the storage URL"""
    artifact = await _get_artifact_or_404(artifact_id, repo_id, user.organisation_id, db)

    # Record download
    download = ArtifactDownload(
        artifact_id=artifact_id,
        user_id=user.id,
        organisation_id=user.organisation_id,
    )
    db.add(download)

    artifact.download_count = (artifact.download_count or 0) + 1
    artifact.last_downloaded_at = utcnow()

    # Update repo stats
    repo = await _get_repo_or_404(repo_id, user.organisation_id, db)
    repo.total_downloads = (repo.total_downloads or 0) + 1

    await db.commit()

    return {
        "artifact_id": artifact_id,
        "storage_url": artifact.storage_url,
        "checksum_sha256": artifact.checksum_sha256,
        "size_bytes": artifact.size_bytes,
    }


@router.delete("/repos/{repo_id}/artifacts/{artifact_id}", status_code=204)
async def delete_artifact(
    repo_id: str,
    artifact_id: str,
    user: CurrentUser = Depends(require_min_role(UserRole.POWER_USER)),
    db: AsyncSession = Depends(get_db_session),
):
    """Soft-delete an artifact"""
    artifact = await _get_artifact_or_404(artifact_id, repo_id, user.organisation_id, db)
    artifact.deleted_at = utcnow()
    await db.commit()


@router.get("/search")
async def search_artifacts(
    q: str = Query(..., min_length=1),
    artifact_type: Optional[str] = None,
    limit: int = Query(default=20, le=100),
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Search across all artifact repositories"""
    stmt = select(Artifact, ArtifactRepository).join(
        ArtifactRepository, Artifact.repository_id == ArtifactRepository.id
    ).where(
        Artifact.organisation_id == user.organisation_id,
        Artifact.deleted_at == None,  # noqa: E711
        Artifact.is_latest == True,  # noqa: E712
        Artifact.name.ilike(f"%{q}%"),
    )
    if artifact_type:
        stmt = stmt.where(Artifact.artifact_type == artifact_type)
    stmt = stmt.limit(limit)
    result = await db.execute(stmt)

    items = []
    for artifact, repo in result.all():
        item = _artifact_out(artifact)
        items.append({**item.model_dump(), "repository_name": repo.name})
    return {"results": items, "count": len(items), "query": q}


# ============================================================
# STATS
# ============================================================

@router.get("/stats")
async def get_artifact_stats(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Get artifact repository statistics"""
    stmt = select(
        func.count(ArtifactRepository.id).label("repo_count"),
        func.sum(ArtifactRepository.artifact_count).label("total_artifacts"),
        func.sum(ArtifactRepository.total_downloads).label("total_downloads"),
        func.sum(ArtifactRepository.total_size_bytes).label("total_size_bytes"),
    ).where(
        ArtifactRepository.organisation_id == user.organisation_id,
        ArtifactRepository.deleted_at == None,  # noqa: E711
    )
    result = await db.execute(stmt)
    row = result.one()

    return {
        "repositories": row.repo_count or 0,
        "total_artifacts": row.total_artifacts or 0,
        "total_downloads": row.total_downloads or 0,
        "total_size_bytes": row.total_size_bytes or 0,
        "total_size_mb": round((row.total_size_bytes or 0) / (1024 * 1024), 2),
    }


# ============================================================
# HELPERS
# ============================================================

async def _get_repo_or_404(repo_id: str, org_id: str, db: AsyncSession) -> ArtifactRepository:
    stmt = select(ArtifactRepository).where(
        ArtifactRepository.id == repo_id,
        ArtifactRepository.organisation_id == org_id,
        ArtifactRepository.deleted_at == None,  # noqa: E711
    )
    result = await db.execute(stmt)
    repo = result.scalar_one_or_none()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")
    return repo


async def _get_artifact_or_404(artifact_id: str, repo_id: str, org_id: str, db: AsyncSession) -> Artifact:
    stmt = select(Artifact).where(
        Artifact.id == artifact_id,
        Artifact.repository_id == repo_id,
        Artifact.organisation_id == org_id,
        Artifact.deleted_at == None,  # noqa: E711
    )
    result = await db.execute(stmt)
    artifact = result.scalar_one_or_none()
    if not artifact:
        raise HTTPException(status_code=404, detail="Artifact not found")
    return artifact


def _repo_out(r: ArtifactRepository) -> RepoOut:
    return RepoOut(
        id=r.id,
        name=r.name,
        description=r.description,
        artifact_type=r.artifact_type.value if r.artifact_type else "other",
        visibility=r.visibility.value if r.visibility else "org",
        tags=r.tags or [],
        artifact_count=r.artifact_count or 0,
        total_downloads=r.total_downloads or 0,
        total_size_bytes=r.total_size_bytes or 0,
        created_at=r.created_at.isoformat() if r.created_at else "",
    )


def _artifact_out(a: Artifact) -> ArtifactOut:
    return ArtifactOut(
        id=a.id,
        repository_id=a.repository_id,
        name=a.name,
        description=a.description,
        version=a.version or "1.0.0",
        artifact_type=a.artifact_type.value if a.artifact_type else "other",
        storage_url=a.storage_url,
        checksum_sha256=a.checksum_sha256,
        size_bytes=a.size_bytes or 0,
        mime_type=a.mime_type,
        data_classification=a.data_classification.value if a.data_classification else "internal",
        tags=a.tags or [],
        extra_metadata=a.extra_metadata or {},
        preview_url=a.preview_url,
        download_count=a.download_count or 0,
        is_latest=a.is_latest if a.is_latest is not None else True,
        created_at=a.created_at.isoformat() if a.created_at else "",
        updated_at=a.updated_at.isoformat() if a.updated_at else "",
    )