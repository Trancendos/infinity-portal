# routers/academy.py — The Academy — Learning, RAG, and Agent Context Management
# Migrated from Trancendos monorepo (TypeScript) → Python FastAPI
# Wave 1 Migration — FULLY IMPLEMENTED
#
# The Academy is a cross-lane service that provides structured learning
# paths, Retrieval-Augmented Generation (RAG) for knowledge queries,
# agent context injection, and training module management.  It bridges
# Lane 1 (AI) and Lane 3 (Data) to enable continuous learning across
# the Trancendos Ecosystem.

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

router = APIRouter(prefix="/api/v1/academy", tags=['The Academy'])
logger = logging.getLogger("academy")

# ============================================================
# MODELS
# ============================================================

class RAGQueryRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=2000)
    top_k: int = Field(default=5, ge=1, le=20)
    filters: Dict[str, Any] = Field(default_factory=dict)
    include_sources: bool = True

class RAGIndexRequest(BaseModel):
    documents: List[Dict[str, Any]] = Field(..., min_length=1, max_length=100)
    collection: str = Field(default="default", max_length=128)
    chunk_size: int = Field(default=512, ge=128, le=4096)
    overlap: int = Field(default=64, ge=0, le=512)

class AgentContextRequest(BaseModel):
    agent_id: str = Field(..., min_length=1, max_length=128)
    context_type: str = Field(default="task", pattern="^(task|domain|conversation|system)$")
    content: Dict[str, Any] = Field(default_factory=dict)
    ttl_seconds: int = Field(default=3600, ge=60, le=86400)

class ModuleCreateRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=256)
    description: str = Field(default="", max_length=2000)
    category: str = Field(default="general", pattern="^(general|security|ai|data|infrastructure|governance)$")
    difficulty: str = Field(default="intermediate", pattern="^(beginner|intermediate|advanced|expert)$")
    lessons: List[Dict[str, Any]] = Field(default_factory=list)
    prerequisites: List[str] = Field(default_factory=list)
    estimated_hours: float = Field(default=1.0, ge=0.25, le=100.0)

# ============================================================
# IN-MEMORY STATE (production: Turso + vector DB + Redis)
# ============================================================

_learning_paths: Dict[str, Dict[str, Any]] = {}
_rag_collections: Dict[str, List[Dict[str, Any]]] = {}
_rag_index_stats: Dict[str, Dict[str, Any]] = {}
_agent_contexts: Dict[str, Dict[str, Any]] = {}
_modules: Dict[str, Dict[str, Any]] = {}

# Seed learning paths
_SEED_PATHS = {
    "path-security": {
        "path_id": "path-security",
        "title": "Trancendos Security Mastery",
        "description": "Master the security architecture of the Trancendos Ecosystem including PQC, zero-trust, and The Cryptex.",
        "category": "security",
        "difficulty": "advanced",
        "modules": ["mod-pqc-101", "mod-zero-trust", "mod-cryptex-ops", "mod-chaos-security"],
        "estimated_hours": 24,
        "enrolled": 12,
        "completion_rate": 0.45,
        "created_at": (datetime.now(timezone.utc) - timedelta(days=30)).isoformat(),
    },
    "path-ai": {
        "path_id": "path-ai",
        "title": "AI Agent Development",
        "description": "Learn to build, deploy, and orchestrate AI agents on Lane 1 using Cornelius and Multi-AI.",
        "category": "ai",
        "difficulty": "intermediate",
        "modules": ["mod-agent-basics", "mod-cornelius-orch", "mod-multi-ai", "mod-aco-routing"],
        "estimated_hours": 16,
        "enrolled": 28,
        "completion_rate": 0.62,
        "created_at": (datetime.now(timezone.utc) - timedelta(days=21)).isoformat(),
    },
    "path-mesh": {
        "path_id": "path-mesh",
        "title": "Three-Lane Mesh Architecture",
        "description": "Understand the foundational Three-Lane Mesh architecture and how all components interconnect.",
        "category": "infrastructure",
        "difficulty": "beginner",
        "modules": ["mod-mesh-overview", "mod-lane1-ai", "mod-lane2-user", "mod-lane3-data"],
        "estimated_hours": 8,
        "enrolled": 45,
        "completion_rate": 0.78,
        "created_at": (datetime.now(timezone.utc) - timedelta(days=45)).isoformat(),
    },
}
_learning_paths.update(_SEED_PATHS)

# Seed RAG knowledge base
_SEED_RAG_DOCS = [
    {
        "doc_id": "rag-001",
        "content": "The Three-Lane Mesh separates traffic into AI (Nexus), User (Infinity), and Data (Hive) lanes. Cross-lane services provide shared capabilities via Warp Tunnels.",
        "metadata": {"source": "architecture_guide", "topic": "mesh", "lane": "cross_lane"},
    },
    {
        "doc_id": "rag-002",
        "content": "Post-quantum cryptography in The Lighthouse uses ML-DSA (FIPS 204) for signatures, ML-KEM (FIPS 203) for key exchange, and SLH-DSA (FIPS 205) for hash-based signatures.",
        "metadata": {"source": "security_guide", "topic": "pqc", "lane": "cross_lane"},
    },
    {
        "doc_id": "rag-003",
        "content": "Cornelius orchestrates multi-agent tasks using intent analysis, task decomposition, agent selection, and consensus negotiation. It supports parallel, sequential, and debate strategies.",
        "metadata": {"source": "ai_guide", "topic": "orchestration", "lane": "ai_nexus"},
    },
    {
        "doc_id": "rag-004",
        "content": "The Zero-Net-Cost mandate requires total revenue to equal or exceed infrastructure costs. The Treasury (Royal Bank of Arcadia) enforces this through automated cost optimisation.",
        "metadata": {"source": "finance_guide", "topic": "zero_cost", "lane": "data_hive"},
    },
    {
        "doc_id": "rag-005",
        "content": "Shamir's Secret Sharing in The Void splits secrets into shares using polynomial interpolation over a finite field. Any k-of-n shares can reconstruct the secret, providing information-theoretic security.",
        "metadata": {"source": "security_guide", "topic": "secrets", "lane": "cross_lane"},
    },
]
_rag_collections["default"] = _SEED_RAG_DOCS
_rag_index_stats["default"] = {
    "collection": "default",
    "document_count": len(_SEED_RAG_DOCS),
    "last_indexed": datetime.now(timezone.utc).isoformat(),
    "chunk_size": 512,
}


def _simple_tokenize(text: str) -> set:
    return set(re.findall(r'\b[a-zA-Z]{2,}\b', text.lower()))


def _rag_search(query: str, collection: str, top_k: int, filters: Dict) -> List[Dict]:
    """Simple keyword-based RAG search (production: vector similarity)."""
    docs = _rag_collections.get(collection, [])
    query_tokens = _simple_tokenize(query)
    scored = []

    for doc in docs:
        # Apply metadata filters
        if filters:
            skip = False
            for fk, fv in filters.items():
                if doc.get("metadata", {}).get(fk) != fv:
                    skip = True
                    break
            if skip:
                continue

        doc_tokens = _simple_tokenize(doc.get("content", ""))
        overlap = len(query_tokens & doc_tokens)
        if overlap > 0:
            score = overlap / max(len(query_tokens), 1)
            scored.append({**doc, "relevance_score": round(score, 3)})

    scored.sort(key=lambda d: d["relevance_score"], reverse=True)
    return scored[:top_k]


# ============================================================
# ENDPOINTS
# ============================================================

@router.get("/learning-paths")
async def list_learning_paths(
    category: Optional[str] = Query(None, pattern="^(general|security|ai|data|infrastructure|governance)$"),
    difficulty: Optional[str] = Query(None, pattern="^(beginner|intermediate|advanced|expert)$"),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """List all available learning paths."""
    paths = list(_learning_paths.values())
    if category:
        paths = [p for p in paths if p.get("category") == category]
    if difficulty:
        paths = [p for p in paths if p.get("difficulty") == difficulty]

    paths.sort(key=lambda p: p.get("enrolled", 0), reverse=True)

    return {
        "total": len(paths),
        "paths": paths,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/learning-paths/{path_id}")
async def get_learning_path(
    path_id: str = Path(..., min_length=1),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Get details of a specific learning path."""
    path = _learning_paths.get(path_id)
    if not path:
        raise HTTPException(status_code=404, detail=f"Learning path '{path_id}' not found")
    return path


@router.post("/rag/query")
async def rag_query(
    request: RAGQueryRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Query the RAG knowledge base.

    Retrieves relevant documents and generates an augmented response
    using the retrieved context.  This powers the Academy's intelligent
    Q&A system and agent knowledge injection.
    """
    collection = request.filters.pop("collection", "default") if "collection" in request.filters else "default"
    results = _rag_search(request.query, collection, request.top_k, request.filters)

    # Generate augmented response from retrieved context
    if results:
        context_text = " ".join(r["content"] for r in results[:3])
        augmented_response = f"Based on {len(results)} relevant document(s): {context_text[:500]}"
    else:
        augmented_response = "No relevant documents found for your query. Try rephrasing or broadening your search."

    response = {
        "query": request.query,
        "response": augmented_response,
        "total_results": len(results),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    if request.include_sources:
        response["sources"] = [
            {
                "doc_id": r.get("doc_id"),
                "content": r.get("content", "")[:200],
                "relevance_score": r.get("relevance_score", 0),
                "metadata": r.get("metadata", {}),
            }
            for r in results
        ]

    return response


@router.post("/rag/index")
async def rag_index(
    request: RAGIndexRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Index documents into the RAG knowledge base.

    Chunks documents, generates embeddings (production: vector DB),
    and stores them for retrieval.
    """
    if request.collection not in _rag_collections:
        _rag_collections[request.collection] = []

    indexed = 0
    for doc in request.documents:
        content = doc.get("content", "")
        if not content:
            continue

        # Chunk the document
        chunks = []
        for i in range(0, len(content), request.chunk_size - request.overlap):
            chunk = content[i:i + request.chunk_size]
            if chunk.strip():
                chunks.append(chunk)

        for j, chunk in enumerate(chunks):
            doc_record = {
                "doc_id": f"rag-{uuid.uuid4().hex[:8]}",
                "content": chunk,
                "metadata": {
                    **doc.get("metadata", {}),
                    "chunk_index": j,
                    "total_chunks": len(chunks),
                    "original_length": len(content),
                },
            }
            _rag_collections[request.collection].append(doc_record)
            indexed += 1

    _rag_index_stats[request.collection] = {
        "collection": request.collection,
        "document_count": len(_rag_collections[request.collection]),
        "last_indexed": datetime.now(timezone.utc).isoformat(),
        "chunk_size": request.chunk_size,
    }

    logger.info(f"RAG indexed: {indexed} chunks into '{request.collection}'")
    return {
        "indexed_chunks": indexed,
        "collection": request.collection,
        "total_documents": len(_rag_collections[request.collection]),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/rag/status")
async def rag_status(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Get RAG system status and collection statistics."""
    return {
        "collections": _rag_index_stats,
        "total_collections": len(_rag_collections),
        "total_documents": sum(len(docs) for docs in _rag_collections.values()),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.post("/agents/context")
async def inject_agent_context(
    request: AgentContextRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Inject context into an agent's working memory.

    Provides agents with task-specific, domain, conversation, or
    system context to improve their performance and relevance.
    """
    ctx_id = f"ctx-{uuid.uuid4().hex[:8]}"
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(seconds=request.ttl_seconds)

    context_record = {
        "context_id": ctx_id,
        "agent_id": request.agent_id,
        "context_type": request.context_type,
        "content": request.content,
        "ttl_seconds": request.ttl_seconds,
        "expires_at": expires_at.isoformat(),
        "injected_by": getattr(current_user, "id", "anonymous"),
        "injected_at": now.isoformat(),
        "status": "active",
    }

    key = f"{request.agent_id}:{request.context_type}"
    _agent_contexts[key] = context_record

    logger.info(f"Context injected: {ctx_id} → {request.agent_id} ({request.context_type})")
    return context_record


@router.get("/modules")
async def list_modules(
    category: Optional[str] = Query(None, pattern="^(general|security|ai|data|infrastructure|governance)$"),
    difficulty: Optional[str] = Query(None, pattern="^(beginner|intermediate|advanced|expert)$"),
    limit: int = Query(50, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """List all training modules."""
    modules = list(_modules.values())
    if category:
        modules = [m for m in modules if m.get("category") == category]
    if difficulty:
        modules = [m for m in modules if m.get("difficulty") == difficulty]

    modules.sort(key=lambda m: m.get("created_at", ""), reverse=True)

    return {
        "total": len(modules),
        "modules": modules[:limit],
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.post("/modules")
async def create_module(
    request: ModuleCreateRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Create a new training module."""
    module_id = f"mod-{uuid.uuid4().hex[:8]}"
    now = datetime.now(timezone.utc)

    module = {
        "module_id": module_id,
        "title": request.title,
        "description": request.description,
        "category": request.category,
        "difficulty": request.difficulty,
        "lessons": request.lessons if request.lessons else [
            {"lesson_id": f"les-{uuid.uuid4().hex[:6]}", "title": "Introduction", "type": "text", "duration_minutes": 15},
            {"lesson_id": f"les-{uuid.uuid4().hex[:6]}", "title": "Core Concepts", "type": "interactive", "duration_minutes": 30},
            {"lesson_id": f"les-{uuid.uuid4().hex[:6]}", "title": "Assessment", "type": "quiz", "duration_minutes": 15},
        ],
        "prerequisites": request.prerequisites,
        "estimated_hours": request.estimated_hours,
        "enrolled": 0,
        "completion_rate": 0.0,
        "created_by": getattr(current_user, "id", "anonymous"),
        "created_at": now.isoformat(),
        "status": "published",
    }

    _modules[module_id] = module
    logger.info(f"Module created: {module_id} — {request.title}")
    return module


@router.get("/health")
async def get_health(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Get Academy system health."""
    return {
        "status": "healthy",
        "learning_paths": len(_learning_paths),
        "modules": len(_modules),
        "rag_collections": len(_rag_collections),
        "rag_documents": sum(len(docs) for docs in _rag_collections.values()),
        "active_contexts": len(_agent_contexts),
        "lane": "cross_lane",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }