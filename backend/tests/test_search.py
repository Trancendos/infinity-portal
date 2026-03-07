# tests/test_search.py — Platform Search tests
import pytest
from httpx import AsyncClient
from tests.conftest import get_auth_headers


@pytest.mark.asyncio
async def test_search_get(client: AsyncClient, admin_user):
    """Can search via GET."""
    headers = get_auth_headers(admin_user)
    resp = await client.get("/api/v1/search/?q=mesh", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, dict)


@pytest.mark.asyncio
async def test_search_post(client: AsyncClient, admin_user):
    """Can search via POST with advanced options."""
    headers = get_auth_headers(admin_user)
    resp = await client.post(
        "/api/v1/search/",
        json={
            "query": "security vulnerability",
            "scope": "all",
            "limit": 5,
        },
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, dict)


@pytest.mark.asyncio
async def test_index_document(client: AsyncClient, admin_user):
    """Can index documents for search."""
    headers = get_auth_headers(admin_user)
    resp = await client.post(
        "/api/v1/search/index",
        json={
            "documents": [
                {
                    "title": "Test Search Document",
                    "content": "This document tests the search indexing functionality of the platform.",
                    "tags": ["test", "search"],
                    "lane": "cross_lane",
                }
            ],
            "index_name": "default",
        },
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, dict)


@pytest.mark.asyncio
async def test_search_suggestions(client: AsyncClient, admin_user):
    """Can get search suggestions."""
    headers = get_auth_headers(admin_user)
    resp = await client.get("/api/v1/search/suggest?q=sec", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, (list, dict))


@pytest.mark.asyncio
async def test_search_stats(client: AsyncClient, admin_user):
    """Can get search index stats."""
    headers = get_auth_headers(admin_user)
    resp = await client.get("/api/v1/search/stats", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, dict)


@pytest.mark.asyncio
async def test_health(client: AsyncClient, admin_user):
    """Search health endpoint works."""
    headers = get_auth_headers(admin_user)
    resp = await client.get("/api/v1/search/health", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "healthy"