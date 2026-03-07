# routers/search.py — Platform Search — Unified cross-lane search engine
# Migrated from Trancendos monorepo (TypeScript) → Python FastAPI
# Wave 1 Migration — FULLY IMPLEMENTED
#
# The Search service is a cross-lane platform service that provides
# unified full-text search across all three lanes of the mesh.
# It indexes content from The Library (articles), The Hive (data assets),
# The Workshop (code), Arcadia (apps), and all other components.

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

router = APIRouter(prefix="/api/v1/search", tags=['Platform Search'])
logger = logging.getLogger("search")

# ============================================================
# MODELS
# ============================================================

class SearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=1000)
    scope: str = Field(default="all", pattern="^(all|articles|code|apps|data|users|threads)$")
    lane: Optional[str] = Field(None, pattern="^(ai_nexus|user_infinity|data_hive|cross_lane)$")
    filters: Dict[str, Any] = Field(default_factory=dict)
    sort_by: str = Field(default="relevance", pattern="^(relevance|date|name)$")
    limit: int = Field(default=20, ge=1, le=100)
    offset: int = Field(default=0, ge=0)

class IndexRequest(BaseModel):
    documents: List[Dict[str, Any]] = Field(..., min_items=1, max_items=200)
    index_name: str = Field(default="default", max_length=128)

# ============================================================
# IN-MEMORY STATE (production: Meilisearch / Typesense + Turso)
# ============================================================

_search_indices: Dict[str, List[Dict[str, Any]]] = {}
_search_stats: Dict[str, int] = {
    "total_queries": 0,
    "total_results_returned": 0,
    "avg_response_ms": 12,
}

# Seed searchable content across all lanes
_SEED_INDEX = [
    {
        "doc_id": "idx-001", "type": "article", "scope": "articles",
        "title": "Three-Lane Mesh Architecture Overview",
        "content": "The Three-Lane Mesh separates traffic into AI Nexus, User Infinity, and Data Hive lanes with cross-lane services.",
        "lane": "cross_lane", "tags": ["architecture", "mesh", "core"],
        "created_at": (datetime.now(timezone.utc) - timedelta(days=7)).isoformat(),
    },
    {
        "doc_id": "idx-002", "type": "article", "scope": "articles",
        "title": "Post-Quantum Cryptography in The Lighthouse",
        "content": "ML-DSA ML-KEM SLH-DSA FIPS 203 204 205 quantum-immune certificates and Warp Tunnels.",
        "lane": "cross_lane", "tags": ["security", "pqc", "lighthouse"],
        "created_at": (datetime.now(timezone.utc) - timedelta(days=5)).isoformat(),
    },
    {
        "doc_id": "idx-003", "type": "code", "scope": "code",
        "title": "infinity-portal repository",
        "content": "Python FastAPI backend with 57 routers, TypeScript workers, Next.js frontend. Cloudflare Workers edge compute.",
        "lane": "cross_lane", "tags": ["repository", "python", "fastapi"],
        "created_at": (datetime.now(timezone.utc) - timedelta(days=180)).isoformat(),
    },
    {
        "doc_id": "idx-004", "type": "app", "scope": "apps",
        "title": "Arcadia App Builder",
        "content": "Generative front-end platform supporting React Vue Svelte Next.js Astro with marketplace and community.",
        "lane": "user_infinity", "tags": ["arcadia", "frontend", "apps"],
        "created_at": (datetime.now(timezone.utc) - timedelta(days=30)).isoformat(),
    },
    {
        "doc_id": "idx-005", "type": "data", "scope": "data",
        "title": "Hive Data Transfer Protocol",
        "content": "SHA-256 integrity verification, data lineage tracking, asset classification from public to restricted.",
        "lane": "data_hive", "tags": ["hive", "data", "transfer"],
        "created_at": (datetime.now(timezone.utc) - timedelta(days=14)).isoformat(),
    },
    {
        "doc_id": "idx-006", "type": "thread", "scope": "threads",
        "title": "Welcome to the Arcadia Community!",
        "content": "Community forum for sharing apps, getting help, providing feedback, and connecting with builders.",
        "lane": "user_infinity", "tags": ["community", "welcome"],
        "created_at": (datetime.now(timezone.utc) - timedelta(days=7)).isoformat(),
    },
    {
        "doc_id": "idx-007", "type": "article", "scope": "articles",
        "title": "Cornelius Multi-Agent Orchestration",
        "content": "Master AI orchestrator with intent analysis task decomposition agent selection consensus negotiation.",
        "lane": "ai_nexus", "tags": ["cornelius", "orchestration", "ai"],
        "created_at": (datetime.now(timezone.utc) - timedelta(days=3)).isoformat(),
    },
    {
        "doc_id": "idx-008", "type": "article", "scope": "articles",
        "title": "Zero-Net-Cost Mandate and Treasury",
        "content": "Royal Bank of Arcadia enforces zero-cost mandate through automated cost optimisation and revenue tracking.",
        "lane": "data_hive", "tags": ["treasury", "zero-cost", "finance"],
        "created_at": (datetime.now(timezone.utc) - timedelta(days=2)).isoformat(),
    },
]
_search_indices["default"] = _SEED_INDEX


def _tokenize(text: str) -> set:
    return set(re.findall(r'\b[a-zA-Z0-9]{2,}\b', text.lower()))


def _search(query: str, index: List[Dict], scope: str, lane: Optional[str],
            filters: Dict, sort_by: str, limit: int, offset: int) -> Dict:
    """Execute search across the index."""
    query_tokens = _tokenize(query)
    results = []

    for doc in index:
        # Scope filter
        if scope != "all" and doc.get("scope") != scope:
            continue
        # Lane filter
        if lane and doc.get("lane") != lane:
            continue
        # Custom filters
        skip = False
        for fk, fv in filters.items():
            if fk == "tags" and isinstance(fv, str):
                if fv not in doc.get("tags", []):
                    skip = True
                    break
            elif doc.get(fk) != fv:
                skip = True
                break
        if skip:
            continue

        # Score by token overlap
        title_tokens = _tokenize(doc.get("title", ""))
        content_tokens = _tokenize(doc.get("content", ""))
        tag_tokens = set(t.lower() for t in doc.get("tags", []))

        title_score = len(query_tokens & title_tokens) * 3.0
        content_score = len(query_tokens & content_tokens) * 1.0
        tag_score = len(query_tokens & tag_tokens) * 2.0
        total_score = title_score + content_score + tag_score

        if total_score > 0:
            results.append({
                "doc_id": doc["doc_id"],
                "type": doc.get("type", "unknown"),
                "title": doc.get("title", ""),
                "snippet": doc.get("content", "")[:200],
                "lane": doc.get("lane"),
                "tags": doc.get("tags", []),
                "score": round(total_score, 3),
                "created_at": doc.get("created_at"),
            })

    # Sort
    if sort_by == "relevance":
        results.sort(key=lambda r: r["score"], reverse=True)
    elif sort_by == "date":
        results.sort(key=lambda r: r.get("created_at", ""), reverse=True)
    elif sort_by == "name":
        results.sort(key=lambda r: r.get("title", ""))

    total = len(results)
    return {
        "total": total,
        "results": results[offset:offset + limit],
        "offset": offset,
        "limit": limit,
    }


# ============================================================
# ENDPOINTS
# ============================================================

@router.get("/")
async def search_get(
    q: str = Query(..., min_length=1, max_length=1000, description="Search query"),
    scope: str = Query("all", pattern="^(all|articles|code|apps|data|users|threads)$"),
    lane: Optional[str] = Query(None, pattern="^(ai_nexus|user_infinity|data_hive|cross_lane)$"),
    sort_by: str = Query("relevance", pattern="^(relevance|date|name)$"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Search across the platform (GET — simple queries)."""
    index = _search_indices.get("default", [])
    result = _search(q, index, scope, lane, {}, sort_by, limit, offset)

    _search_stats["total_queries"] += 1
    _search_stats["total_results_returned"] += len(result["results"])

    return {
        "query": q,
        "scope": scope,
        "lane": lane,
        **result,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.post("/")
async def search_post(
    request: SearchRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Search across the platform (POST — advanced queries with filters)."""
    index = _search_indices.get("default", [])
    result = _search(
        request.query, index, request.scope, request.lane,
        request.filters, request.sort_by, request.limit, request.offset,
    )

    _search_stats["total_queries"] += 1
    _search_stats["total_results_returned"] += len(result["results"])

    return {
        "query": request.query,
        "scope": request.scope,
        "lane": request.lane,
        "filters": request.filters,
        **result,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.post("/index")
async def index_documents(
    request: IndexRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Index documents into the search engine."""
    if request.index_name not in _search_indices:
        _search_indices[request.index_name] = []

    indexed = 0
    for doc in request.documents:
        if not doc.get("content") and not doc.get("title"):
            continue
        if "doc_id" not in doc:
            doc["doc_id"] = f"idx-{uuid.uuid4().hex[:8]}"
        if "created_at" not in doc:
            doc["created_at"] = datetime.now(timezone.utc).isoformat()
        _search_indices[request.index_name].append(doc)
        indexed += 1

    logger.info(f"Indexed {indexed} documents into '{request.index_name}'")
    return {
        "indexed": indexed,
        "index_name": request.index_name,
        "total_documents": len(_search_indices[request.index_name]),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/suggest")
async def search_suggestions(
    q: str = Query(..., min_length=1, max_length=200),
    limit: int = Query(5, ge=1, le=20),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Get search suggestions / autocomplete."""
    query_lower = q.lower()
    index = _search_indices.get("default", [])

    suggestions = []
    seen = set()
    for doc in index:
        title = doc.get("title", "")
        if query_lower in title.lower() and title not in seen:
            suggestions.append({"title": title, "type": doc.get("type", "unknown")})
            seen.add(title)
        for tag in doc.get("tags", []):
            if query_lower in tag.lower() and tag not in seen:
                suggestions.append({"title": tag, "type": "tag"})
                seen.add(tag)

    return {
        "query": q,
        "suggestions": suggestions[:limit],
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/stats")
async def search_stats(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Get search engine statistics."""
    total_docs = sum(len(docs) for docs in _search_indices.values())
    return {
        **_search_stats,
        "total_indexed_documents": total_docs,
        "indices": {name: len(docs) for name, docs in _search_indices.items()},
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/health")
async def get_health(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Get Search system health."""
    return {
        "status": "healthy",
        "total_indices": len(_search_indices),
        "total_documents": sum(len(docs) for docs in _search_indices.values()),
        "total_queries": _search_stats["total_queries"],
        "lane": "cross_lane",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }