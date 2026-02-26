"""
Knowledge Base Router — Wiki, Learning Paths, AI Knowledge Extraction
Articles with versioning, categories, adaptive learning, AI insights
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_
from pydantic import BaseModel, Field
from typing import Optional, List
import re

import uuid
from database import get_db_session
from auth import get_current_user, require_min_role
from models import (
    User, UserRole, utcnow,
    KBArticle, KBCategory, KBArticleVersion, LearningPath, LearningProgress,
    AIKnowledgeExtraction, KBArticleStatus, AuditLog,
)

router = APIRouter(prefix="/api/v1/kb", tags=["knowledge-base"])


# ── Schemas ──────────────────────────────────────────────────

class ArticleCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    content_markdown: Optional[str] = None
    summary: Optional[str] = None
    category_id: Optional[str] = None
    tags: List[str] = []
    status: str = "draft"
    related_incident_ids: List[str] = []

class ArticleUpdate(BaseModel):
    title: Optional[str] = None
    content_markdown: Optional[str] = None
    summary: Optional[str] = None
    category_id: Optional[str] = None
    tags: Optional[List[str]] = None
    status: Optional[str] = None
    change_summary: Optional[str] = None

class CategoryCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    slug: Optional[str] = None
    parent_id: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    position: int = 0

class LearningPathCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=300)
    description: Optional[str] = None
    article_ids: List[str] = []
    estimated_duration_mins: Optional[int] = None
    difficulty: Optional[str] = None


# ── Helpers ──────────────────────────────────────────────────

def _slugify(text: str) -> str:
    slug = text.lower().strip()
    slug = re.sub(r'[^\w\s-]', '', slug)
    slug = re.sub(r'[\s_]+', '-', slug)
    slug = re.sub(r'-+', '-', slug)
    return slug[:200]


def _md_to_html(markdown_text: str) -> str:
    """Basic markdown to HTML conversion"""
    if not markdown_text:
        return ""
    html = markdown_text
    # Headers
    html = re.sub(r'^### (.+)$', r'<h3>\1</h3>', html, flags=re.MULTILINE)
    html = re.sub(r'^## (.+)$', r'<h2>\1</h2>', html, flags=re.MULTILINE)
    html = re.sub(r'^# (.+)$', r'<h1>\1</h1>', html, flags=re.MULTILINE)
    # Bold and italic
    html = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', html)
    html = re.sub(r'\*(.+?)\*', r'<em>\1</em>', html)
    # Code blocks
    html = re.sub(r'```(\w*)\n(.*?)```', r'<pre><code class="\1">\2</code></pre>', html, flags=re.DOTALL)
    html = re.sub(r'`(.+?)`', r'<code>\1</code>', html)
    # Line breaks
    html = re.sub(r'\n\n', '</p><p>', html)
    html = f'<p>{html}</p>'
    return html


# ── Articles ─────────────────────────────────────────────────

@router.post("/articles", status_code=201)
async def create_article(
    body: ArticleCreate,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    slug = _slugify(body.title)

    # Ensure unique slug
    existing = await db.execute(
        select(KBArticle).where(
            and_(KBArticle.organisation_id == user.organisation_id, KBArticle.slug == slug)
        )
    )
    if existing.scalars().first():
        slug = f"{slug}-{str(utcnow().timestamp())[-6:]}"

    article = KBArticle(
        title=body.title,
        slug=slug,
        content_markdown=body.content_markdown,
        content_html=_md_to_html(body.content_markdown) if body.content_markdown else None,
        summary=body.summary,
        category_id=body.category_id,
        author_id=user.id,
        organisation_id=user.organisation_id,
        status=body.status,
        tags=body.tags,
        related_incident_ids=body.related_incident_ids,
    )

    if body.status == "published":
        article.published_at = utcnow()

    db.add(article)
    await db.flush()

    # Create initial version
    db.add(KBArticleVersion(
        article_id=article.id,
        version=1,
        content_markdown=body.content_markdown,
        changed_by=user.id,
        change_summary="Initial version",
    ))

    db.add(AuditLog(
            request_id=str(uuid.uuid4()),
        user_id=user.id,
        organisation_id=user.organisation_id,
        event_type="kb.article.created",
        resource_type="kb_article",
        resource_id=article.id,
        governance_metadata={"title": body.title, "slug": slug},
    ))

    await db.commit()
    await db.refresh(article)
    return {
        "id": article.id, "title": article.title, "slug": article.slug,
        "status": article.status, "version": article.version,
        "created_at": str(article.created_at),
    }


@router.get("/articles")
async def list_articles(
    search: Optional[str] = None,
    category_id: Optional[str] = None,
    status: Optional[str] = None,
    tag: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    query = select(KBArticle).where(
        and_(KBArticle.organisation_id == user.organisation_id, KBArticle.deleted_at.is_(None))
    )
    if search:
        query = query.where(
            or_(
                KBArticle.title.ilike(f"%{search}%"),
                KBArticle.content_markdown.ilike(f"%{search}%"),
                KBArticle.summary.ilike(f"%{search}%"),
            )
        )
    if category_id:
        query = query.where(KBArticle.category_id == category_id)
    if status:
        query = query.where(KBArticle.status == status)

    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    query = query.order_by(KBArticle.updated_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    articles = result.scalars().all()

    return {
        "total": total,
        "items": [
            {"id": a.id, "title": a.title, "slug": a.slug, "summary": a.summary,
             "status": a.status, "version": a.version, "category_id": a.category_id,
             "author_id": a.author_id, "view_count": a.view_count,
             "helpful_count": a.helpful_count, "tags": a.tags,
             "created_at": str(a.created_at), "updated_at": str(a.updated_at)}
            for a in articles
        ],
    }


@router.get("/articles/{slug}")
async def get_article(
    slug: str,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(KBArticle).where(
            and_(KBArticle.organisation_id == user.organisation_id,
                 or_(KBArticle.slug == slug, KBArticle.id == slug),
                 KBArticle.deleted_at.is_(None))
        )
    )
    article = result.scalars().first()
    if not article:
        raise HTTPException(404, "Article not found")

    # Increment view count
    article.view_count = (article.view_count or 0) + 1
    await db.commit()

    return {
        "id": article.id, "title": article.title, "slug": article.slug,
        "content_markdown": article.content_markdown, "content_html": article.content_html,
        "summary": article.summary, "status": article.status, "version": article.version,
        "category_id": article.category_id, "author_id": article.author_id,
        "view_count": article.view_count, "helpful_count": article.helpful_count,
        "tags": article.tags, "related_incident_ids": article.related_incident_ids,
        "published_at": str(article.published_at) if article.published_at else None,
        "created_at": str(article.created_at), "updated_at": str(article.updated_at),
    }


@router.patch("/articles/{article_id}")
async def update_article(
    article_id: str,
    body: ArticleUpdate,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(KBArticle).where(
            and_(KBArticle.id == article_id, KBArticle.organisation_id == user.organisation_id)
        )
    )
    article = result.scalars().first()
    if not article:
        raise HTTPException(404, "Article not found")

    content_changed = False
    for field, value in body.model_dump(exclude_unset=True).items():
        if field == "change_summary":
            continue
        if value is not None:
            if field == "content_markdown":
                content_changed = True
                article.content_html = _md_to_html(value)
            setattr(article, field, value)

    if body.status == "published" and not article.published_at:
        article.published_at = utcnow()

    # Create new version if content changed
    if content_changed:
        article.version = (article.version or 1) + 1
        db.add(KBArticleVersion(
            article_id=article.id,
            version=article.version,
            content_markdown=article.content_markdown,
            changed_by=user.id,
            change_summary=body.change_summary or "Updated",
        ))

    await db.commit()
    return {"status": "updated", "id": article.id, "version": article.version}


@router.delete("/articles/{article_id}")
async def archive_article(
    article_id: str,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(KBArticle).where(
            and_(KBArticle.id == article_id, KBArticle.organisation_id == user.organisation_id)
        )
    )
    article = result.scalars().first()
    if not article:
        raise HTTPException(404, "Article not found")
    article.status = KBArticleStatus.ARCHIVED.value
    article.deleted_at = utcnow()
    await db.commit()
    return {"status": "archived"}


@router.get("/articles/{article_id}/versions")
async def article_versions(
    article_id: str,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(KBArticleVersion).where(KBArticleVersion.article_id == article_id)
        .order_by(KBArticleVersion.version.desc())
    )
    versions = result.scalars().all()
    return [
        {"id": v.id, "version": v.version, "changed_by": v.changed_by,
         "change_summary": v.change_summary, "created_at": str(v.created_at)}
        for v in versions
    ]


@router.get("/articles/{article_id}/versions/{version}")
async def get_article_version(
    article_id: str,
    version: int,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(KBArticleVersion).where(
            and_(KBArticleVersion.article_id == article_id, KBArticleVersion.version == version)
        )
    )
    v = result.scalars().first()
    if not v:
        raise HTTPException(404, "Version not found")
    return {
        "id": v.id, "version": v.version, "content_markdown": v.content_markdown,
        "changed_by": v.changed_by, "change_summary": v.change_summary,
        "created_at": str(v.created_at),
    }


@router.post("/articles/{article_id}/helpful")
async def mark_helpful(
    article_id: str,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(KBArticle).where(KBArticle.id == article_id)
    )
    article = result.scalars().first()
    if not article:
        raise HTTPException(404, "Article not found")
    article.helpful_count = (article.helpful_count or 0) + 1
    await db.commit()
    return {"helpful_count": article.helpful_count}


# ── Categories ───────────────────────────────────────────────

@router.get("/categories")
async def list_categories(
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(KBCategory).where(KBCategory.organisation_id == user.organisation_id)
        .order_by(KBCategory.position, KBCategory.name)
    )
    cats = result.scalars().all()
    return [
        {"id": c.id, "name": c.name, "slug": c.slug, "parent_id": c.parent_id,
         "description": c.description, "icon": c.icon, "position": c.position}
        for c in cats
    ]


@router.post("/categories", status_code=201)
async def create_category(
    body: CategoryCreate,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    slug = body.slug or _slugify(body.name)
    cat = KBCategory(
        name=body.name,
        slug=slug,
        parent_id=body.parent_id,
        description=body.description,
        icon=body.icon,
        position=body.position,
        organisation_id=user.organisation_id,
    )
    db.add(cat)
    await db.commit()
    await db.refresh(cat)
    return {"id": cat.id, "name": cat.name, "slug": cat.slug}


# ── Learning Paths ───────────────────────────────────────────

@router.post("/learning-paths", status_code=201)
async def create_learning_path(
    body: LearningPathCreate,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    path = LearningPath(
        name=body.name,
        description=body.description,
        article_ids=body.article_ids,
        estimated_duration_mins=body.estimated_duration_mins,
        difficulty=body.difficulty,
        organisation_id=user.organisation_id,
        created_by=user.id,
    )
    db.add(path)
    await db.commit()
    await db.refresh(path)
    return {"id": path.id, "name": path.name, "article_count": len(body.article_ids)}


@router.get("/learning-paths")
async def list_learning_paths(
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(LearningPath).where(LearningPath.organisation_id == user.organisation_id)
    )
    paths = result.scalars().all()
    return [
        {"id": p.id, "name": p.name, "description": p.description,
         "article_count": len(p.article_ids or []),
         "estimated_duration_mins": p.estimated_duration_mins,
         "difficulty": p.difficulty}
        for p in paths
    ]


@router.get("/learning-paths/{path_id}")
async def get_learning_path(
    path_id: str,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(LearningPath).where(
            and_(LearningPath.id == path_id, LearningPath.organisation_id == user.organisation_id)
        )
    )
    path = result.scalars().first()
    if not path:
        raise HTTPException(404, "Learning path not found")

    # Get articles
    articles = []
    for aid in (path.article_ids or []):
        a_result = await db.execute(select(KBArticle).where(KBArticle.id == aid))
        a = a_result.scalars().first()
        if a:
            articles.append({"id": a.id, "title": a.title, "slug": a.slug, "summary": a.summary})

    # Get user progress
    progress_result = await db.execute(
        select(LearningProgress).where(
            and_(LearningProgress.path_id == path_id, LearningProgress.user_id == user.id)
        )
    )
    progress = progress_result.scalars().first()

    return {
        "id": path.id, "name": path.name, "description": path.description,
        "articles": articles, "estimated_duration_mins": path.estimated_duration_mins,
        "difficulty": path.difficulty,
        "progress": {
            "current_index": progress.current_article_index if progress else 0,
            "completed": progress.completed_articles if progress else [],
            "started_at": str(progress.started_at) if progress else None,
            "completed_at": str(progress.completed_at) if progress and progress.completed_at else None,
        } if progress else None,
    }


@router.post("/learning-paths/{path_id}/start")
async def start_learning_path(
    path_id: str,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    existing = await db.execute(
        select(LearningProgress).where(
            and_(LearningProgress.path_id == path_id, LearningProgress.user_id == user.id)
        )
    )
    if existing.scalars().first():
        return {"status": "already_started"}

    progress = LearningProgress(
        user_id=user.id,
        path_id=path_id,
    )
    db.add(progress)
    await db.commit()
    return {"status": "started"}


@router.patch("/learning-paths/{path_id}/progress")
async def update_progress(
    path_id: str,
    body: dict,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(LearningProgress).where(
            and_(LearningProgress.path_id == path_id, LearningProgress.user_id == user.id)
        )
    )
    progress = result.scalars().first()
    if not progress:
        raise HTTPException(404, "Not enrolled in this path")

    if "completed_article_id" in body:
        completed = progress.completed_articles or []
        if body["completed_article_id"] not in completed:
            completed.append(body["completed_article_id"])
            progress.completed_articles = completed
            progress.current_article_index = len(completed)

    # Check if path complete
    path_result = await db.execute(select(LearningPath).where(LearningPath.id == path_id))
    path = path_result.scalars().first()
    if path and len(progress.completed_articles or []) >= len(path.article_ids or []):
        progress.completed_at = utcnow()

    await db.commit()
    return {"current_index": progress.current_article_index, "completed": progress.completed_articles}


@router.get("/my-learning")
async def my_learning(
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(LearningProgress, LearningPath)
        .join(LearningPath, LearningProgress.path_id == LearningPath.id)
        .where(LearningProgress.user_id == user.id)
    )
    items = result.all()
    return [
        {
            "path_id": path.id, "path_name": path.name,
            "total_articles": len(path.article_ids or []),
            "completed_articles": len(progress.completed_articles or []),
            "current_index": progress.current_article_index,
            "started_at": str(progress.started_at),
            "completed_at": str(progress.completed_at) if progress.completed_at else None,
        }
        for progress, path in items
    ]


# ── AI Knowledge Extraction ─────────────────────────────────

@router.post("/ai/extract")
async def ai_extract_knowledge(
    body: dict,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(require_min_role(UserRole.POWER_USER)),
):
    """Extract knowledge from a source (incident, change, document, audit log)"""
    source_type = body.get("source_type", "manual")
    source_id = body.get("source_id", "")
    text = body.get("text", "")

    if not text:
        raise HTTPException(400, "text is required")

    # Simple extraction — in production, this would call the LLM
    extraction = AIKnowledgeExtraction(
        source_type=source_type,
        source_id=source_id,
        extracted_knowledge=text,
        confidence=body.get("confidence", 70),
        tags=body.get("tags", []),
        organisation_id=user.organisation_id,
    )
    db.add(extraction)
    await db.commit()
    await db.refresh(extraction)
    return {"id": extraction.id, "source_type": source_type, "created_at": str(extraction.created_at)}


@router.get("/ai/insights")
async def ai_insights(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(AIKnowledgeExtraction)
        .where(AIKnowledgeExtraction.organisation_id == user.organisation_id)
        .order_by(AIKnowledgeExtraction.created_at.desc())
        .offset(skip).limit(limit)
    )
    extractions = result.scalars().all()
    return [
        {"id": e.id, "source_type": e.source_type, "source_id": e.source_id,
         "knowledge": e.extracted_knowledge, "confidence": e.confidence,
         "tags": e.tags, "validated_by": e.validated_by,
         "created_at": str(e.created_at)}
        for e in extractions
    ]


# ── Stats ────────────────────────────────────────────────────

@router.get("/stats")
async def kb_stats(
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    org_filter = and_(KBArticle.organisation_id == user.organisation_id, KBArticle.deleted_at.is_(None))

    total_q = await db.execute(select(func.count(KBArticle.id)).where(org_filter))
    total = total_q.scalar() or 0

    published_q = await db.execute(
        select(func.count(KBArticle.id)).where(and_(org_filter, KBArticle.status == "published"))
    )
    published = published_q.scalar() or 0

    views_q = await db.execute(select(func.sum(KBArticle.view_count)).where(org_filter))
    total_views = views_q.scalar() or 0

    helpful_q = await db.execute(select(func.sum(KBArticle.helpful_count)).where(org_filter))
    total_helpful = helpful_q.scalar() or 0

    paths_q = await db.execute(
        select(func.count(LearningPath.id)).where(LearningPath.organisation_id == user.organisation_id)
    )
    total_paths = paths_q.scalar() or 0

    return {
        "total_articles": total,
        "published_articles": published,
        "total_views": total_views,
        "total_helpful": total_helpful,
        "learning_paths": total_paths,
    }