"""
Document Management Router — Comprehensive Document Library
CRUD, cloud sync (Google Drive/OneDrive/Dropbox), smart tagging,
duplicate detection, full-text search, bulk operations
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_
from pydantic import BaseModel, Field
from typing import Optional, List
import hashlib

import uuid
from database import get_db_session
from auth import get_current_user, require_min_role
from models import (
    User, UserRole, utcnow,
    Document, DocumentTag, DocumentCategory, CloudSyncConfig, CloudSyncItem,
    DuplicateGroup, DocumentSource, SyncDirection, SyncStatus, AuditLog,
)

router = APIRouter(prefix="/api/v1/documents", tags=["documents"])


# ── Schemas ──────────────────────────────────────────────────

class DocumentCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    description: Optional[str] = None
    mime_type: Optional[str] = None
    size: int = 0
    source: str = "local"
    source_id: Optional[str] = None
    source_path: Optional[str] = None
    hash_sha256: Optional[str] = None
    category_id: Optional[str] = None
    file_node_id: Optional[str] = None
    tags: List[str] = []
    content_text: Optional[str] = None

class DocumentUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    category_id: Optional[str] = None
    tags: Optional[List[str]] = None

class CategoryCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    slug: str = Field(..., min_length=1, max_length=200)
    parent_id: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    auto_rules: dict = {}

class CloudSyncSetup(BaseModel):
    provider: str = Field(..., pattern="^(google_drive|onedrive|dropbox)$")
    connector_id: Optional[str] = None
    root_folder_path: Optional[str] = None
    sync_direction: str = "pull"
    sync_frequency_mins: int = 60


# ── Smart Tagging Engine ─────────────────────────────────────

MIME_TAG_MAP = {
    "application/pdf": "document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "spreadsheet",
    "application/vnd.ms-excel": "spreadsheet",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "document",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "presentation",
    "text/plain": "text",
    "text/markdown": "markdown",
    "text/csv": "data",
    "application/json": "data",
    "image/png": "image",
    "image/jpeg": "image",
    "image/gif": "image",
    "image/svg+xml": "image",
    "application/zip": "archive",
    "application/x-tar": "archive",
    "application/gzip": "archive",
}

FILENAME_TAG_RULES = [
    (["invoice", "receipt", "billing"], "finance/invoice"),
    (["contract", "agreement", "nda"], "legal/contract"),
    (["policy", "procedure", "guideline"], "governance/policy"),
    (["report", "analysis", "summary"], "report"),
    (["spec", "requirement", "design"], "engineering/specification"),
    (["readme", "changelog", "license"], "documentation"),
    (["test", "qa", "quality"], "testing"),
    (["deploy", "release", "build"], "devops"),
    (["security", "vulnerability", "audit"], "security"),
    (["meeting", "minutes", "agenda"], "meeting"),
]


def _auto_tag(title: str, mime_type: Optional[str], content_text: Optional[str] = None) -> List[dict]:
    """Generate automatic tags based on filename, MIME type, and content"""
    tags = []
    title_lower = title.lower()

    # MIME-based tags
    if mime_type and mime_type in MIME_TAG_MAP:
        tags.append({"name": MIME_TAG_MAP[mime_type], "type": "rule", "confidence": 100, "source": "rule"})

    # Filename pattern tags
    for keywords, tag_name in FILENAME_TAG_RULES:
        if any(kw in title_lower for kw in keywords):
            tags.append({"name": tag_name, "type": "rule", "confidence": 85, "source": "rule"})

    # Extension-based
    if "." in title:
        ext = title.rsplit(".", 1)[-1].lower()
        ext_tags = {
            "py": "code/python", "js": "code/javascript", "ts": "code/typescript",
            "rs": "code/rust", "go": "code/go", "java": "code/java",
            "sql": "database", "yml": "config", "yaml": "config", "toml": "config",
            "env": "config", "dockerfile": "devops", "tf": "infrastructure",
        }
        if ext in ext_tags:
            tags.append({"name": ext_tags[ext], "type": "rule", "confidence": 90, "source": "rule"})

    return tags


# ── Documents ────────────────────────────────────────────────

@router.post("/", status_code=201)
async def create_document(
    body: DocumentCreate,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    doc = Document(
        title=body.title,
        description=body.description,
        mime_type=body.mime_type,
        size=body.size,
        source=body.source,
        source_id=body.source_id,
        source_path=body.source_path,
        hash_sha256=body.hash_sha256,
        category_id=body.category_id,
        file_node_id=body.file_node_id,
        uploaded_by=user.id,
        organisation_id=user.organisation_id,
        tags=body.tags,
    )

    # Extract text if provided
    if body.content_text:
        doc.extracted_text = body.content_text
        doc.is_extracted = True

    db.add(doc)
    await db.flush()

    # Auto-tag
    auto_tags = _auto_tag(body.title, body.mime_type, body.content_text)
    for tag_info in auto_tags:
        tag = DocumentTag(
            document_id=doc.id,
            tag_name=tag_info["name"],
            tag_type=tag_info["type"],
            confidence=tag_info["confidence"],
            source=tag_info["source"],
        )
        db.add(tag)

    # Manual tags
    for tag_name in body.tags:
        tag = DocumentTag(
            document_id=doc.id,
            tag_name=tag_name,
            tag_type="manual",
            confidence=100,
            source="user",
        )
        db.add(tag)

    # Check for duplicates by hash
    if body.hash_sha256:
        dup_result = await db.execute(
            select(Document).where(
                and_(
                    Document.hash_sha256 == body.hash_sha256,
                    Document.organisation_id == user.organisation_id,
                    Document.id != doc.id,
                    Document.deleted_at.is_(None),
                )
            )
        )
        duplicates = dup_result.scalars().all()
        if duplicates:
            dup_ids = [d.id for d in duplicates] + [doc.id]
            dup_group = DuplicateGroup(
                organisation_id=user.organisation_id,
                hash_sha256=body.hash_sha256,
                match_type="hash",
                file_count=len(dup_ids),
                primary_document_id=duplicates[0].id,
                document_ids=dup_ids,
            )
            db.add(dup_group)

    db.add(AuditLog(
            request_id=str(uuid.uuid4()),
        user_id=user.id,
        organisation_id=user.organisation_id,
        event_type="document.created",
        resource_type="document",
        resource_id=doc.id,
        governance_metadata={"title": body.title, "source": body.source},
    ))

    await db.commit()
    await db.refresh(doc)

    # Fetch tags
    tags_result = await db.execute(
        select(DocumentTag).where(DocumentTag.document_id == doc.id)
    )
    all_tags = tags_result.scalars().all()

    return {
        "id": doc.id, "title": doc.title, "mime_type": doc.mime_type,
        "size": doc.size, "source": doc.source,
        "tags": [{"name": t.tag_name, "type": t.tag_type, "confidence": t.confidence} for t in all_tags],
        "created_at": str(doc.created_at),
    }


@router.get("/")
async def list_documents(
    search: Optional[str] = None,
    category_id: Optional[str] = None,
    source: Optional[str] = None,
    tag: Optional[str] = None,
    mime_type: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    query = select(Document).where(
        and_(Document.organisation_id == user.organisation_id, Document.deleted_at.is_(None))
    )
    if search:
        query = query.where(
            or_(
                Document.title.ilike(f"%{search}%"),
                Document.description.ilike(f"%{search}%"),
                Document.extracted_text.ilike(f"%{search}%"),
            )
        )
    if category_id:
        query = query.where(Document.category_id == category_id)
    if source:
        query = query.where(Document.source == source)
    if mime_type:
        query = query.where(Document.mime_type == mime_type)
    if tag:
        query = query.where(
            Document.id.in_(
                select(DocumentTag.document_id).where(DocumentTag.tag_name == tag)
            )
        )

    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    query = query.order_by(Document.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    docs = result.scalars().all()

    items = []
    for doc in docs:
        tags_result = await db.execute(
            select(DocumentTag.tag_name).where(DocumentTag.document_id == doc.id)
        )
        tag_names = [r[0] for r in tags_result.all()]
        items.append({
            "id": doc.id, "title": doc.title, "description": doc.description,
            "mime_type": doc.mime_type, "size": doc.size, "source": doc.source,
            "category_id": doc.category_id, "tags": tag_names,
            "is_extracted": doc.is_extracted,
            "created_at": str(doc.created_at),
        })

    return {"total": total, "items": items}


@router.get("/{doc_id}")
async def get_document(
    doc_id: str,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Document).where(
            and_(Document.id == doc_id, Document.organisation_id == user.organisation_id,
                 Document.deleted_at.is_(None))
        )
    )
    doc = result.scalars().first()
    if not doc:
        raise HTTPException(404, "Document not found")

    tags_result = await db.execute(
        select(DocumentTag).where(DocumentTag.document_id == doc.id)
    )
    tags = tags_result.scalars().all()

    return {
        "id": doc.id, "title": doc.title, "description": doc.description,
        "mime_type": doc.mime_type, "size": doc.size, "source": doc.source,
        "source_path": doc.source_path, "hash_sha256": doc.hash_sha256,
        "category_id": doc.category_id, "file_node_id": doc.file_node_id,
        "is_extracted": doc.is_extracted, "extracted_text": doc.extracted_text,
        "extracted_entities": doc.extracted_entities, "page_count": doc.page_count,
        "language": doc.language,
        "tags": [{"name": t.tag_name, "type": t.tag_type, "confidence": t.confidence, "source": t.source} for t in tags],
        "created_at": str(doc.created_at), "updated_at": str(doc.updated_at),
    }


@router.patch("/{doc_id}")
async def update_document(
    doc_id: str,
    body: DocumentUpdate,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Document).where(
            and_(Document.id == doc_id, Document.organisation_id == user.organisation_id)
        )
    )
    doc = result.scalars().first()
    if not doc:
        raise HTTPException(404, "Document not found")

    for field, value in body.dict(exclude_unset=True).items():
        if field != "tags" and value is not None:
            setattr(doc, field, value)

    if body.tags is not None:
        doc.tags = body.tags

    await db.commit()
    return {"status": "updated", "id": doc.id}


@router.delete("/{doc_id}")
async def delete_document(
    doc_id: str,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Document).where(
            and_(Document.id == doc_id, Document.organisation_id == user.organisation_id)
        )
    )
    doc = result.scalars().first()
    if not doc:
        raise HTTPException(404, "Document not found")
    doc.deleted_at = utcnow()
    await db.commit()
    return {"status": "deleted"}


@router.post("/bulk-upload", status_code=201)
async def bulk_upload(
    body: dict,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    """Bulk upload documents from a list of file metadata"""
    files = body.get("files", [])
    created = []
    for f in files:
        doc = Document(
            title=f.get("title", "Untitled"),
            mime_type=f.get("mime_type"),
            size=f.get("size", 0),
            source=f.get("source", "local"),
            hash_sha256=f.get("hash_sha256"),
            uploaded_by=user.id,
            organisation_id=user.organisation_id,
        )
        db.add(doc)
        await db.flush()

        # Auto-tag each
        auto_tags = _auto_tag(doc.title, doc.mime_type)
        for tag_info in auto_tags:
            db.add(DocumentTag(
                document_id=doc.id,
                tag_name=tag_info["name"],
                tag_type=tag_info["type"],
                confidence=tag_info["confidence"],
                source=tag_info["source"],
            ))
        created.append({"id": doc.id, "title": doc.title})

    await db.commit()
    return {"created": len(created), "documents": created}


# ── Tags ─────────────────────────────────────────────────────

@router.get("/tags/all")
async def list_all_tags(
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(DocumentTag.tag_name, func.count(DocumentTag.id).label("count"))
        .where(DocumentTag.document_id.in_(
            select(Document.id).where(
                and_(Document.organisation_id == user.organisation_id, Document.deleted_at.is_(None))
            )
        ))
        .group_by(DocumentTag.tag_name)
        .order_by(func.count(DocumentTag.id).desc())
    )
    return [{"tag": row[0], "count": row[1]} for row in result.all()]


@router.post("/tags/auto-tag/{doc_id}")
async def auto_tag_document(
    doc_id: str,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Document).where(
            and_(Document.id == doc_id, Document.organisation_id == user.organisation_id)
        )
    )
    doc = result.scalars().first()
    if not doc:
        raise HTTPException(404, "Document not found")

    auto_tags = _auto_tag(doc.title, doc.mime_type, doc.extracted_text)
    added = []
    for tag_info in auto_tags:
        existing = await db.execute(
            select(DocumentTag).where(
                and_(DocumentTag.document_id == doc.id, DocumentTag.tag_name == tag_info["name"])
            )
        )
        if not existing.scalars().first():
            db.add(DocumentTag(
                document_id=doc.id,
                tag_name=tag_info["name"],
                tag_type=tag_info["type"],
                confidence=tag_info["confidence"],
                source=tag_info["source"],
            ))
            added.append(tag_info["name"])

    await db.commit()
    return {"added_tags": added, "total_new": len(added)}


# ── Categories ───────────────────────────────────────────────

@router.get("/categories/all")
async def list_categories(
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(DocumentCategory).where(DocumentCategory.organisation_id == user.organisation_id)
        .order_by(DocumentCategory.name)
    )
    cats = result.scalars().all()
    return [
        {"id": c.id, "name": c.name, "slug": c.slug, "parent_id": c.parent_id,
         "description": c.description, "icon": c.icon}
        for c in cats
    ]


@router.post("/categories", status_code=201)
async def create_category(
    body: CategoryCreate,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    cat = DocumentCategory(
        name=body.name,
        slug=body.slug,
        parent_id=body.parent_id,
        description=body.description,
        icon=body.icon,
        auto_rules=body.auto_rules,
        organisation_id=user.organisation_id,
    )
    db.add(cat)
    await db.commit()
    await db.refresh(cat)
    return {"id": cat.id, "name": cat.name, "slug": cat.slug}


# ── Cloud Sync ───────────────────────────────────────────────

@router.post("/sync/configure", status_code=201)
async def configure_cloud_sync(
    body: CloudSyncSetup,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(require_min_role(UserRole.ORG_ADMIN)),
):
    config = CloudSyncConfig(
        organisation_id=user.organisation_id,
        provider=body.provider,
        connector_id=body.connector_id,
        root_folder_path=body.root_folder_path,
        sync_direction=body.sync_direction,
        sync_frequency_mins=body.sync_frequency_mins,
    )
    db.add(config)
    await db.commit()
    await db.refresh(config)
    return {"id": config.id, "provider": config.provider, "status": config.status}


@router.get("/sync/configs")
async def list_sync_configs(
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(CloudSyncConfig).where(CloudSyncConfig.organisation_id == user.organisation_id)
    )
    configs = result.scalars().all()
    return [
        {"id": c.id, "provider": c.provider, "root_folder_path": c.root_folder_path,
         "sync_direction": c.sync_direction, "status": c.status,
         "last_sync": str(c.last_sync) if c.last_sync else None,
         "items_synced": c.items_synced}
        for c in configs
    ]


@router.post("/sync/configs/{config_id}/trigger")
async def trigger_sync(
    config_id: str,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(CloudSyncConfig).where(
            and_(CloudSyncConfig.id == config_id, CloudSyncConfig.organisation_id == user.organisation_id)
        )
    )
    config = result.scalars().first()
    if not config:
        raise HTTPException(404, "Sync config not found")

    config.status = SyncStatus.SYNCING.value
    config.last_sync = utcnow()
    await db.commit()
    return {"status": "sync_triggered", "provider": config.provider}


@router.get("/sync/configs/{config_id}/status")
async def sync_status(
    config_id: str,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(CloudSyncConfig).where(
            and_(CloudSyncConfig.id == config_id, CloudSyncConfig.organisation_id == user.organisation_id)
        )
    )
    config = result.scalars().first()
    if not config:
        raise HTTPException(404, "Sync config not found")

    items_q = await db.execute(
        select(func.count(CloudSyncItem.id)).where(CloudSyncItem.config_id == config.id)
    )
    item_count = items_q.scalar() or 0

    return {
        "id": config.id, "provider": config.provider, "status": config.status,
        "last_sync": str(config.last_sync) if config.last_sync else None,
        "items_synced": item_count, "last_error": config.last_error,
    }


# ── Duplicates ───────────────────────────────────────────────

@router.get("/duplicates")
async def list_duplicates(
    status: Optional[str] = "pending",
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    query = select(DuplicateGroup).where(
        DuplicateGroup.organisation_id == user.organisation_id
    )
    if status:
        query = query.where(DuplicateGroup.status == status)
    result = await db.execute(query.order_by(DuplicateGroup.detected_at.desc()))
    groups = result.scalars().all()
    return [
        {"id": g.id, "match_type": g.match_type, "file_count": g.file_count,
         "document_ids": g.document_ids, "status": g.status,
         "detected_at": str(g.detected_at)}
        for g in groups
    ]


@router.post("/duplicates/{group_id}/resolve")
async def resolve_duplicates(
    group_id: str,
    body: dict,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(DuplicateGroup).where(
            and_(DuplicateGroup.id == group_id, DuplicateGroup.organisation_id == user.organisation_id)
        )
    )
    group = result.scalars().first()
    if not group:
        raise HTTPException(404, "Duplicate group not found")

    keep_id = body.get("keep_id", group.primary_document_id)
    group.primary_document_id = keep_id
    group.status = "resolved"
    group.resolved_at = utcnow()

    # Soft-delete others
    for doc_id in (group.document_ids or []):
        if doc_id != keep_id:
            doc_result = await db.execute(select(Document).where(Document.id == doc_id))
            doc = doc_result.scalars().first()
            if doc:
                doc.deleted_at = utcnow()

    await db.commit()
    return {"status": "resolved", "kept": keep_id}


@router.post("/duplicates/{group_id}/ignore")
async def ignore_duplicates(
    group_id: str,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(DuplicateGroup).where(
            and_(DuplicateGroup.id == group_id, DuplicateGroup.organisation_id == user.organisation_id)
        )
    )
    group = result.scalars().first()
    if not group:
        raise HTTPException(404, "Duplicate group not found")
    group.status = "ignored"
    await db.commit()
    return {"status": "ignored"}


# ── Library Stats ────────────────────────────────────────────

@router.get("/library/stats")
async def library_stats(
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    org_filter = and_(
        Document.organisation_id == user.organisation_id,
        Document.deleted_at.is_(None),
    )

    total_q = await db.execute(select(func.count(Document.id)).where(org_filter))
    total = total_q.scalar() or 0

    size_q = await db.execute(select(func.sum(Document.size)).where(org_filter))
    total_size = size_q.scalar() or 0

    by_source_q = await db.execute(
        select(Document.source, func.count(Document.id)).where(org_filter).group_by(Document.source)
    )
    by_source = {row[0]: row[1] for row in by_source_q.all()}

    by_type_q = await db.execute(
        select(Document.mime_type, func.count(Document.id)).where(
            and_(org_filter, Document.mime_type.isnot(None))
        ).group_by(Document.mime_type).order_by(func.count(Document.id).desc()).limit(10)
    )
    by_type = {row[0]: row[1] for row in by_type_q.all()}

    dup_q = await db.execute(
        select(func.count(DuplicateGroup.id)).where(
            and_(DuplicateGroup.organisation_id == user.organisation_id, DuplicateGroup.status == "pending")
        )
    )
    pending_dups = dup_q.scalar() or 0

    return {
        "total_documents": total,
        "total_size_bytes": total_size,
        "by_source": by_source,
        "by_type": by_type,
        "pending_duplicates": pending_dups,
    }