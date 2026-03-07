# tests/test_academy.py — Learning Academy tests
import pytest
from httpx import AsyncClient
from tests.conftest import get_auth_headers


@pytest.mark.asyncio
async def test_list_learning_paths(client: AsyncClient, admin_user):
    """Can list learning paths."""
    headers = get_auth_headers(admin_user)
    resp = await client.get("/api/v1/academy/learning-paths", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, (list, dict))


@pytest.mark.asyncio
async def test_rag_query(client: AsyncClient, admin_user):
    """Can query the RAG system."""
    headers = get_auth_headers(admin_user)
    resp = await client.post(
        "/api/v1/academy/rag/query",
        json={
            "query": "How does the Three-Lane Mesh architecture work?",
            "top_k": 3,
        },
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, dict)


@pytest.mark.asyncio
async def test_rag_index(client: AsyncClient, admin_user):
    """Can index documents into RAG."""
    headers = get_auth_headers(admin_user)
    resp = await client.post(
        "/api/v1/academy/rag/index",
        json={
            "documents": [
                {
                    "title": "Test Document",
                    "content": "This is a test document about the Trancendos ecosystem and its architecture.",
                    "source": "test",
                }
            ],
            "collection": "default",
            "chunk_size": 512,
        },
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, dict)


@pytest.mark.asyncio
async def test_rag_status(client: AsyncClient, admin_user):
    """Can check RAG system status."""
    headers = get_auth_headers(admin_user)
    resp = await client.get("/api/v1/academy/rag/status", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, dict)


@pytest.mark.asyncio
async def test_agent_context(client: AsyncClient, admin_user):
    """Can set agent learning context."""
    headers = get_auth_headers(admin_user)
    resp = await client.post(
        "/api/v1/academy/agents/context",
        json={
            "agent_id": "norman",
            "context_type": "domain",
            "content": {"specialisation": "security", "knowledge_areas": ["CVE", "SAST"]},
        },
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, dict)


@pytest.mark.asyncio
async def test_list_modules(client: AsyncClient, admin_user):
    """Can list training modules."""
    headers = get_auth_headers(admin_user)
    resp = await client.get("/api/v1/academy/modules", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, (list, dict))


@pytest.mark.asyncio
async def test_create_module(client: AsyncClient, admin_user):
    """Can create a training module."""
    headers = get_auth_headers(admin_user)
    resp = await client.post(
        "/api/v1/academy/modules",
        json={
            "title": "Security Fundamentals",
            "description": "Learn the basics of platform security",
            "category": "security",
            "difficulty": "beginner",
            "estimated_hours": 2.0,
        },
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "module_id" in data or "title" in data


@pytest.mark.asyncio
async def test_health(client: AsyncClient, admin_user):
    """Academy health endpoint works."""
    headers = get_auth_headers(admin_user)
    resp = await client.get("/api/v1/academy/health", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "healthy"