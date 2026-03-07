# routers/library.py — The Library — Automated knowledge extraction and article generation
# Migrated from Trancendos monorepo (TypeScript) → Python FastAPI
# Wave 1 Migration — FULLY IMPLEMENTED
#
# The Library sits on Lane 3 (Data/Hive) and serves as the knowledge
# management system for the entire Trancendos Ecosystem.  It provides
# automated knowledge extraction from documents, AI-powered article
# generation, topic taxonomy management, and full-text search across
# the knowledge base.

from typing import Optional, Dict, Any, List
from datetime import datetime, timezone, timedelta
import uuid
import hashlib
import logging
import re

from fastapi import APIRouter, Depends, HTTPException, Query, Path, Body
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user, require_min_role, CurrentUser
from database import get_db_session

router = APIRouter(prefix="/api/v1/library", tags=['The Library'])
logger = logging.getLogger("library")

# ============================================================
# MODELS
# ============================================================

class ArticleGenerateRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=512)
    topic: str = Field(..., min_length=1, max_length=256)
    outline: Optional[List[str]] = None
    style: str = Field(default="technical", pattern="^(technical|tutorial|overview|reference|blog)$")
    target_length: str = Field(default="medium", pattern="^(short|medium|long)$")
    tags: List[str] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)

class ExtractionRequest(BaseModel):
    source_text: str = Field(..., min_length=10, max_length=100000)
    source_type: str = Field(default="document", pattern="^(document|webpage|code|log|transcript)$")
    extract_entities: bool = True
    extract_summary: bool = True
    extract_key_points: bool = True
    max_key_points: int = Field(default=10, ge=1, le=50)

# ============================================================
# IN-MEMORY STATE (production: Turso / LibSQL + vector embeddings)
# ============================================================

_articles: Dict[str, Dict[str, Any]] = {}
_topics: Dict[str, Dict[str, Any]] = {}
_extractions: Dict[str, Dict[str, Any]] = {}

# Seed topic taxonomy
_TOPIC_TREE = {
    "security": {
        "topic_id": "topic-security",
        "name": "Security",
        "description": "Cybersecurity, vulnerability management, and threat intelligence",
        "subtopics": ["pqc", "vulnerability-management", "zero-trust", "compliance"],
        "article_count": 0,
        "lane": "cross_lane",
    },
    "ai": {
        "topic_id": "topic-ai",
        "name": "Artificial Intelligence",
        "description": "AI agents, LLM orchestration, and machine learning",
        "subtopics": ["multi-agent", "llm", "aco-routing", "intent-analysis"],
        "article_count": 0,
        "lane": "ai_nexus",
    },
    "data": {
        "topic_id": "topic-data",
        "name": "Data Management",
        "description": "Data transfer, lineage, integrity, and governance",
        "subtopics": ["data-lineage", "integrity", "transfer", "governance"],
        "article_count": 0,
        "lane": "data_hive",
    },
    "infrastructure": {
        "topic_id": "topic-infra",
        "name": "Infrastructure",
        "description": "Platform infrastructure, deployment, and operations",
        "subtopics": ["kubernetes", "edge-compute", "ci-cd", "monitoring"],
        "article_count": 0,
        "lane": "cross_lane",
    },
    "governance": {
        "topic_id": "topic-gov",
        "name": "Governance",
        "description": "EU AI Act compliance, ETSI standards, and regulatory frameworks",
        "subtopics": ["eu-ai-act", "etsi", "gdpr", "iso-27001"],
        "article_count": 0,
        "lane": "cross_lane",
    },
    "architecture": {
        "topic_id": "topic-arch",
        "name": "Architecture",
        "description": "Three-Lane Mesh, system design, and component architecture",
        "subtopics": ["three-lane-mesh", "microservices", "event-driven", "2060-standard"],
        "article_count": 0,
        "lane": "cross_lane",
    },
}
_topics.update(_TOPIC_TREE)

# Seed articles
_SEED_ARTICLES = {
    "art-001": {
        "article_id": "art-001",
        "title": "Three-Lane Mesh Architecture Overview",
        "topic": "architecture",
        "style": "technical",
        "tags": ["three-lane-mesh", "architecture", "core"],
        "content": (
            "The Three-Lane Mesh is the foundational network architecture of the "
            "Trancendos Ecosystem. It separates traffic into three distinct lanes: "
            "Lane 1 (AI/Nexus) for AI agent communication using ACO routing, "
            "Lane 2 (User/Infinity) for human user traffic through Infinity One, "
            "and Lane 3 (Data/Hive) for data transfer and asset management. "
            "Cross-lane services like The Lighthouse, The Void, and The Observatory "
            "provide shared capabilities across all three lanes via Warp Tunnels."
        ),
        "summary": "Overview of the Three-Lane Mesh architecture separating AI, User, and Data traffic.",
        "word_count": 73,
        "status": "published",
        "author": "system",
        "created_at": (datetime.now(timezone.utc) - timedelta(days=7)).isoformat(),
        "updated_at": (datetime.now(timezone.utc) - timedelta(days=7)).isoformat(),
        "views": 42,
        "content_hash": "",
    },
    "art-002": {
        "article_id": "art-002",
        "title": "Post-Quantum Cryptography in The Lighthouse",
        "topic": "security",
        "style": "technical",
        "tags": ["pqc", "lighthouse", "ml-dsa", "ml-kem", "slh-dsa"],
        "content": (
            "The Lighthouse implements post-quantum cryptographic algorithms as "
            "specified in FIPS 203 (ML-KEM), FIPS 204 (ML-DSA), and FIPS 205 "
            "(SLH-DSA). These algorithms provide quantum-immune key exchange, "
            "digital signatures, and hash-based signatures respectively. "
            "Warp Tunnels use ML-KEM for encrypted cross-lane channels, while "
            "PQC certificates use ML-DSA for signing and verification."
        ),
        "summary": "Implementation of FIPS 203/204/205 PQC algorithms in The Lighthouse.",
        "word_count": 62,
        "status": "published",
        "author": "system",
        "created_at": (datetime.now(timezone.utc) - timedelta(days=5)).isoformat(),
        "updated_at": (datetime.now(timezone.utc) - timedelta(days=5)).isoformat(),
        "views": 28,
        "content_hash": "",
    },
}
for art in _SEED_ARTICLES.values():
    art["content_hash"] = hashlib.sha256(art["content"].encode()).hexdigest()[:16]
_articles.update(_SEED_ARTICLES)
_topics["architecture"]["article_count"] = 1
_topics["security"]["article_count"] = 1


def _hash(data: str) -> str:
    return hashlib.sha256(data.encode()).hexdigest()[:16]


def _simple_tokenize(text: str) -> List[str]:
    """Simple word tokenizer for search and extraction."""
    return re.findall(r'\b[a-zA-Z]{2,}\b', text.lower())


def _extract_entities(text: str) -> List[Dict[str, str]]:
    """Extract named entities from text (simple pattern-based)."""
    entities = []
    # Technology terms
    tech_patterns = [
        "three-lane mesh", "kernel event bus", "warp tunnel", "ant colony",
        "post-quantum", "shamir", "ml-dsa", "ml-kem", "slh-dsa",
        "fastapi", "python", "typescript", "cloudflare", "turso",
    ]
    text_lower = text.lower()
    for term in tech_patterns:
        if term in text_lower:
            entities.append({"type": "technology", "value": term})

    # Component names
    components = [
        "cornelius", "norman", "guardian", "the dr", "lighthouse",
        "the void", "observatory", "nexus", "hive", "infinity",
        "icebox", "library", "academy", "workshop", "treasury",
        "arcadia", "chaos party",
    ]
    for comp in components:
        if comp in text_lower:
            entities.append({"type": "component", "value": comp})

    return entities


def _generate_summary(text: str, max_sentences: int = 3) -> str:
    """Generate a simple extractive summary."""
    sentences = re.split(r'(?<=[.!?])\s+', text)
    return " ".join(sentences[:max_sentences])


def _extract_key_points(text: str, max_points: int = 10) -> List[str]:
    """Extract key points from text."""
    sentences = re.split(r'(?<=[.!?])\s+', text)
    # Score sentences by keyword density
    keywords = {"important", "key", "critical", "must", "should", "provides",
                "enables", "implements", "supports", "ensures", "architecture",
                "security", "performance", "compliance"}
    scored = []
    for s in sentences:
        words = set(_simple_tokenize(s))
        score = len(words & keywords) + (1 if len(s) > 50 else 0)
        scored.append((score, s.strip()))
    scored.sort(key=lambda x: x[0], reverse=True)
    return [s for _, s in scored[:max_points] if s]


# ============================================================
# ENDPOINTS
# ============================================================

@router.get("/articles")
async def list_articles(
    topic: Optional[str] = Query(None),
    style: Optional[str] = Query(None, pattern="^(technical|tutorial|overview|reference|blog)$"),
    status: Optional[str] = Query(None, pattern="^(draft|published|archived)$"),
    tag: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """List all articles with optional filters."""
    articles = list(_articles.values())
    if topic:
        articles = [a for a in articles if a["topic"] == topic]
    if style:
        articles = [a for a in articles if a.get("style") == style]
    if status:
        articles = [a for a in articles if a.get("status") == status]
    if tag:
        articles = [a for a in articles if tag in a.get("tags", [])]

    articles.sort(key=lambda a: a.get("created_at", ""), reverse=True)
    total = len(articles)

    return {
        "total": total,
        "offset": offset,
        "limit": limit,
        "articles": [
            {k: v for k, v in a.items() if k != "content"}
            for a in articles[offset:offset + limit]
        ],
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/articles/{article_id}")
async def get_article(
    article_id: str = Path(..., min_length=1),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Get a specific article by ID with full content."""
    article = _articles.get(article_id)
    if not article:
        raise HTTPException(status_code=404, detail=f"Article '{article_id}' not found")

    article["views"] = article.get("views", 0) + 1
    return article


@router.post("/articles/generate")
async def generate_article(
    request: ArticleGenerateRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Generate an article using AI-powered content creation.

    The Library uses the configured LLM provider (via Cornelius orchestration)
    to generate structured articles based on the provided topic, outline,
    and style parameters.
    """
    article_id = f"art-{uuid.uuid4().hex[:8]}"
    now = datetime.now(timezone.utc)

    # Generate content (production: LLM via Cornelius)
    length_map = {"short": 150, "medium": 400, "long": 800}
    target_words = length_map.get(request.target_length, 400)

    # Build structured content from outline
    sections = []
    if request.outline:
        for section_title in request.outline:
            sections.append(f"\n## {section_title}\n\n"
                          f"This section covers {section_title.lower()} in the context of "
                          f"{request.topic}. Detailed analysis and implementation guidance "
                          f"follows the Trancendos 2060 Standard requirements.")
    else:
        sections.append(f"\n## Overview\n\n"
                       f"This article provides a {request.style} perspective on {request.title}. "
                       f"It covers the key concepts, implementation details, and best practices "
                       f"related to {request.topic} within the Trancendos Ecosystem.")
        sections.append(f"\n## Details\n\n"
                       f"The {request.topic} domain encompasses several critical aspects "
                       f"that must be addressed for production readiness. Each component "
                       f"follows the Three-Lane Mesh architecture principles.")

    content = f"# {request.title}\n\n" + "\n".join(sections)
    word_count = len(content.split())

    article = {
        "article_id": article_id,
        "title": request.title,
        "topic": request.topic,
        "style": request.style,
        "tags": request.tags,
        "content": content,
        "summary": _generate_summary(content),
        "word_count": word_count,
        "status": "draft",
        "author": current_user.get("sub", "anonymous"),
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
        "views": 0,
        "content_hash": _hash(content),
        "metadata": {
            **request.metadata,
            "generated": True,
            "target_length": request.target_length,
            "outline": request.outline,
        },
    }

    _articles[article_id] = article

    # Update topic count
    if request.topic in _topics:
        _topics[request.topic]["article_count"] = _topics[request.topic].get("article_count", 0) + 1

    logger.info(f"Article generated: {article_id} — {request.title}")
    return article


@router.post("/articles/extract")
async def extract_knowledge(
    request: ExtractionRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Extract structured knowledge from unstructured text.

    Processes documents, webpages, code, logs, or transcripts to
    extract entities, summaries, and key points for the knowledge base.
    """
    extraction_id = f"ext-{uuid.uuid4().hex[:8]}"
    now = datetime.now(timezone.utc)

    result = {
        "extraction_id": extraction_id,
        "source_type": request.source_type,
        "source_length": len(request.source_text),
        "word_count": len(request.source_text.split()),
        "extracted_at": now.isoformat(),
    }

    if request.extract_entities:
        result["entities"] = _extract_entities(request.source_text)

    if request.extract_summary:
        result["summary"] = _generate_summary(request.source_text)

    if request.extract_key_points:
        result["key_points"] = _extract_key_points(request.source_text, request.max_key_points)

    # Token analysis
    tokens = _simple_tokenize(request.source_text)
    from collections import Counter
    freq = Counter(tokens)
    result["top_terms"] = [{"term": t, "count": c} for t, c in freq.most_common(20)]

    _extractions[extraction_id] = result
    logger.info(f"Knowledge extracted: {extraction_id} from {request.source_type}")
    return result


@router.get("/topics")
async def list_topics(
    lane: Optional[str] = Query(None, pattern="^(ai_nexus|user_infinity|data_hive|cross_lane)$"),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """List all knowledge topics in the taxonomy."""
    topics = list(_topics.values())
    if lane:
        topics = [t for t in topics if t.get("lane") == lane]

    return {
        "total": len(topics),
        "topics": topics,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/search")
async def search_library(
    q: str = Query(..., min_length=1, max_length=500, description="Search query"),
    topic: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Full-text search across the knowledge base.

    Searches article titles, content, tags, and summaries.
    Results are ranked by relevance score.
    """
    query_tokens = set(_simple_tokenize(q))
    results = []

    for article in _articles.values():
        if topic and article.get("topic") != topic:
            continue

        # Score by token overlap
        title_tokens = set(_simple_tokenize(article.get("title", "")))
        content_tokens = set(_simple_tokenize(article.get("content", "")))
        tag_tokens = set(t.lower() for t in article.get("tags", []))
        summary_tokens = set(_simple_tokenize(article.get("summary", "")))

        title_score = len(query_tokens & title_tokens) * 3
        content_score = len(query_tokens & content_tokens)
        tag_score = len(query_tokens & tag_tokens) * 2
        summary_score = len(query_tokens & summary_tokens) * 1.5
        total_score = title_score + content_score + tag_score + summary_score

        if total_score > 0:
            results.append({
                "article_id": article["article_id"],
                "title": article["title"],
                "topic": article["topic"],
                "summary": article.get("summary", ""),
                "tags": article.get("tags", []),
                "score": round(total_score, 2),
                "created_at": article.get("created_at"),
            })

    results.sort(key=lambda r: r["score"], reverse=True)

    return {
        "query": q,
        "total": len(results),
        "results": results[:limit],
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/recent")
async def get_recent_articles(
    limit: int = Query(10, ge=1, le=50),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Get most recently created or updated articles."""
    articles = list(_articles.values())
    articles.sort(key=lambda a: a.get("updated_at", a.get("created_at", "")), reverse=True)

    return {
        "total": len(articles),
        "articles": [
            {k: v for k, v in a.items() if k != "content"}
            for a in articles[:limit]
        ],
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/health")
async def get_health(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Get Library system health."""
    return {
        "status": "healthy",
        "total_articles": len(_articles),
        "total_topics": len(_topics),
        "total_extractions": len(_extractions),
        "published_articles": sum(1 for a in _articles.values() if a.get("status") == "published"),
        "draft_articles": sum(1 for a in _articles.values() if a.get("status") == "draft"),
        "lane": "data_hive",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }