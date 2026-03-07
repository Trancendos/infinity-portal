# tests/test_library.py — Knowledge Library tests
import pytest
from httpx import AsyncClient
from tests.conftest import get_auth_headers


@pytest.mark.asyncio
async def test_list_articles(client: AsyncClient, admin_user):
    """Can list articles in the library."""
    headers = get_auth_headers(admin_user)
    resp = await client.get("/api/v1/library/articles", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, (list, dict))


@pytest.mark.asyncio
async def test_generate_article(client: AsyncClient, admin_user):
    """Can generate an article via AI."""
    headers = get_auth_headers(admin_user)
    resp = await client.post(
        "/api/v1/library/articles/generate",
        json={
            "title": "Introduction to Three-Lane Mesh",
            "topic": "architecture",
            "style": "technical",
            "tags": ["mesh", "architecture", "lanes"],
            "target_length": "medium",
        },
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "article_id" in data
    assert data["title"] == "Introduction to Three-Lane Mesh"
    assert data["topic"] == "architecture"
    assert "content" in data


@pytest.mark.asyncio
async def test_get_article(client: AsyncClient, admin_user):
    """Can retrieve a specific article."""
    headers = get_auth_headers(admin_user)
    gen_resp = await client.post(
        "/api/v1/library/articles/generate",
        json={
            "title": "Test Article",
            "topic": "security",
            "style": "tutorial",
            "tags": ["test"],
        },
        headers=headers,
    )
    article_id = gen_resp.json()["article_id"]

    resp = await client.get(f"/api/v1/library/articles/{article_id}", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["article_id"] == article_id


@pytest.mark.asyncio
async def test_extract_knowledge(client: AsyncClient, admin_user):
    """Can extract knowledge from text."""
    headers = get_auth_headers(admin_user)
    resp = await client.post(
        "/api/v1/library/articles/extract",
        json={
            "source_text": "The Three-Lane Mesh architecture separates concerns into AI, User, and Data lanes. "
                           "Each lane operates independently with cross-lane communication via the Kernel Event Bus. "
                           "This provides fault isolation and allows independent scaling of each lane.",
            "source_type": "document",
            "extract_entities": True,
            "extract_summary": True,
            "extract_key_points": True,
        },
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, dict)


@pytest.mark.asyncio
async def test_list_topics(client: AsyncClient, admin_user):
    """Can list topic taxonomy."""
    headers = get_auth_headers(admin_user)
    resp = await client.get("/api/v1/library/topics", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, (list, dict))


@pytest.mark.asyncio
async def test_search_library(client: AsyncClient, admin_user):
    """Can search the library."""
    headers = get_auth_headers(admin_user)
    resp = await client.get("/api/v1/library/search?q=mesh", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, (list, dict))


@pytest.mark.asyncio
async def test_health(client: AsyncClient, admin_user):
    """Library health endpoint works."""
    headers = get_auth_headers(admin_user)
    resp = await client.get("/api/v1/library/health", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "healthy"