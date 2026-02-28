# routers/agent_memory.py — Agent Persistent Memory Service
# Provides long-term memory storage and retrieval for AI agents.
# Uses PostgreSQL + pgvector for semantic search (zero-cost via Supabase).
#
# Replaces the need for Milvus/Mem0 with existing infrastructure.
# Agents store context, learnings, and conversation history that
# persists across sessions.
#
# ISO 27001: A.8.11 — Data masking (memories can contain PII)

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/v1/memories", tags=["Agent Memory"])


# ── Models ──────────────────────────────────────────────────

class MemoryType(str):
    CONVERSATION = "conversation"
    LEARNING = "learning"
    CONTEXT = "context"
    PREFERENCE = "preference"
    FACT = "fact"
    TASK_RESULT = "task_result"


class MemoryAddRequest(BaseModel):
    """Store a new memory for an agent."""
    agent_id: str = Field(..., description="Agent that owns this memory")
    user_id: Optional[str] = Field(None, description="Associated user (if any)")
    memory_type: str = Field(default="context", description="Type: conversation, learning, context, preference, fact, task_result")
    content: str = Field(..., description="Memory content text")
    metadata: dict = Field(default_factory=dict, description="Additional metadata")
    importance: float = Field(default=0.5, ge=0.0, le=1.0, description="Importance score (0-1)")
    ttl_hours: Optional[int] = Field(None, description="Time-to-live in hours (null = permanent)")


class MemorySearchRequest(BaseModel):
    """Search agent memories by content similarity."""
    agent_id: str = Field(..., description="Agent whose memories to search")
    query: str = Field(..., description="Search query text")
    user_id: Optional[str] = Field(None, description="Filter by user")
    memory_type: Optional[str] = Field(None, description="Filter by memory type")
    top_k: int = Field(default=5, ge=1, le=50, description="Number of results")
    min_importance: float = Field(default=0.0, ge=0.0, le=1.0, description="Minimum importance threshold")


class MemoryUpdateRequest(BaseModel):
    """Update an existing memory."""
    content: Optional[str] = None
    metadata: Optional[dict] = None
    importance: Optional[float] = Field(None, ge=0.0, le=1.0)


# ── In-Memory Store (replace with PostgreSQL + pgvector in production) ──

_memories: dict[str, dict] = {}


# ── Endpoints ───────────────────────────────────────────────

@router.post("/", status_code=201)
async def add_memory(req: MemoryAddRequest):
    """
    Store a new memory for an agent.

    Memories persist across agent sessions, enabling agents to:
    - Remember user preferences and context
    - Learn from past interactions
    - Store task results for future reference
    - Build knowledge over time

    In production, this uses PostgreSQL + pgvector for semantic
    similarity search. The in-memory store is for development.
    """
    memory_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    memory = {
        "id": memory_id,
        "agent_id": req.agent_id,
        "user_id": req.user_id,
        "memory_type": req.memory_type,
        "content": req.content,
        "metadata": req.metadata,
        "importance": req.importance,
        "ttl_hours": req.ttl_hours,
        "created_at": now,
        "updated_at": now,
        "access_count": 0,
        "last_accessed": None,
        # In production: embedding vector stored via pgvector
        # "embedding": generate_embedding(req.content)
    }

    _memories[memory_id] = memory

    return {
        "id": memory_id,
        "status": "stored",
        "agent_id": req.agent_id,
        "memory_type": req.memory_type,
    }


@router.post("/search")
async def search_memories(req: MemorySearchRequest):
    """
    Search agent memories by content similarity.

    In production, this performs vector similarity search using
    pgvector. The development implementation uses simple text matching.

    Returns memories ranked by relevance, filtered by agent, user,
    type, and importance threshold.
    """
    # Filter memories by agent
    agent_memories = [
        m for m in _memories.values()
        if m["agent_id"] == req.agent_id
    ]

    # Apply filters
    if req.user_id:
        agent_memories = [m for m in agent_memories if m.get("user_id") == req.user_id]
    if req.memory_type:
        agent_memories = [m for m in agent_memories if m.get("memory_type") == req.memory_type]
    if req.min_importance > 0:
        agent_memories = [m for m in agent_memories if m.get("importance", 0) >= req.min_importance]

    # Simple text matching (replace with pgvector cosine similarity in production)
    query_lower = req.query.lower()
    scored = []
    for mem in agent_memories:
        content_lower = mem["content"].lower()
        # Basic relevance: word overlap ratio
        query_words = set(query_lower.split())
        content_words = set(content_lower.split())
        overlap = len(query_words & content_words)
        score = overlap / max(len(query_words), 1)
        # Boost by importance
        score *= (0.5 + mem.get("importance", 0.5))
        scored.append((score, mem))

    # Sort by score descending, take top_k
    scored.sort(key=lambda x: x[0], reverse=True)
    results = scored[:req.top_k]

    # Update access counts
    for score, mem in results:
        mem["access_count"] = mem.get("access_count", 0) + 1
        mem["last_accessed"] = datetime.now(timezone.utc).isoformat()

    return {
        "query": req.query,
        "agent_id": req.agent_id,
        "total_searched": len(agent_memories),
        "results": [
            {
                "id": mem["id"],
                "content": mem["content"],
                "memory_type": mem["memory_type"],
                "importance": mem["importance"],
                "relevance_score": round(score, 4),
                "created_at": mem["created_at"],
                "metadata": mem["metadata"],
            }
            for score, mem in results
            if score > 0
        ],
    }


@router.get("/{agent_id}")
async def list_agent_memories(
    agent_id: str,
    memory_type: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """List all memories for a specific agent."""
    agent_memories = [
        m for m in _memories.values()
        if m["agent_id"] == agent_id
    ]

    if memory_type:
        agent_memories = [m for m in agent_memories if m.get("memory_type") == memory_type]

    # Sort by creation date descending
    agent_memories.sort(key=lambda m: m.get("created_at", ""), reverse=True)

    return {
        "agent_id": agent_id,
        "total": len(agent_memories),
        "limit": limit,
        "offset": offset,
        "memories": agent_memories[offset:offset + limit],
    }


@router.get("/detail/{memory_id}")
async def get_memory(memory_id: str):
    """Get a specific memory by ID."""
    if memory_id not in _memories:
        raise HTTPException(404, f"Memory '{memory_id}' not found")

    memory = _memories[memory_id]
    memory["access_count"] = memory.get("access_count", 0) + 1
    memory["last_accessed"] = datetime.now(timezone.utc).isoformat()

    return memory


@router.patch("/detail/{memory_id}")
async def update_memory(memory_id: str, req: MemoryUpdateRequest):
    """Update an existing memory's content, metadata, or importance."""
    if memory_id not in _memories:
        raise HTTPException(404, f"Memory '{memory_id}' not found")

    memory = _memories[memory_id]

    if req.content is not None:
        memory["content"] = req.content
    if req.metadata is not None:
        memory["metadata"] = {**memory.get("metadata", {}), **req.metadata}
    if req.importance is not None:
        memory["importance"] = req.importance

    memory["updated_at"] = datetime.now(timezone.utc).isoformat()

    return {"status": "updated", "id": memory_id}


@router.delete("/detail/{memory_id}")
async def delete_memory(memory_id: str):
    """Delete a specific memory (GDPR right to erasure)."""
    if memory_id not in _memories:
        raise HTTPException(404, f"Memory '{memory_id}' not found")

    deleted = _memories.pop(memory_id)
    return {
        "status": "deleted",
        "id": memory_id,
        "agent_id": deleted["agent_id"],
    }


@router.delete("/{agent_id}")
async def purge_agent_memories(agent_id: str):
    """
    Purge all memories for an agent.
    Used for GDPR compliance or agent reset.
    """
    global _memories
    count = sum(1 for m in _memories.values() if m["agent_id"] == agent_id)
    _memories = {k: v for k, v in _memories.items() if v["agent_id"] != agent_id}

    return {
        "status": "purged",
        "agent_id": agent_id,
        "memories_deleted": count,
    }


@router.get("/{agent_id}/stats")
async def memory_stats(agent_id: str):
    """Get memory statistics for an agent."""
    agent_memories = [m for m in _memories.values() if m["agent_id"] == agent_id]

    type_counts = {}
    total_importance = 0
    for mem in agent_memories:
        t = mem.get("memory_type", "unknown")
        type_counts[t] = type_counts.get(t, 0) + 1
        total_importance += mem.get("importance", 0)

    return {
        "agent_id": agent_id,
        "total_memories": len(agent_memories),
        "type_breakdown": type_counts,
        "average_importance": round(total_importance / max(len(agent_memories), 1), 3),
        "most_accessed": sorted(
            agent_memories,
            key=lambda m: m.get("access_count", 0),
            reverse=True
        )[:5] if agent_memories else [],
    }