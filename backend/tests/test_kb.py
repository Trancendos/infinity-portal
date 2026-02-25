"""Tests for Knowledge Base Router"""
import pytest
from httpx import AsyncClient
from tests.conftest import get_auth_headers


@pytest.mark.asyncio
async def test_create_article(client: AsyncClient, test_user, db_session):
    headers = get_auth_headers(test_user)
    r = await client.post("/api/v1/kb/articles", json={
        "title": "How to Deploy Infinity OS",
        "content_markdown": "# Deployment Guide\n\nFollow these steps...",
        "summary": "Step-by-step deployment guide",
        "tags": ["deployment", "guide"],
    }, headers=headers)
    assert r.status_code == 201
    data = r.json()
    assert data["title"] == "How to Deploy Infinity OS"
    assert data["slug"] == "how-to-deploy-infinity-os"
    assert data["version"] == 1


@pytest.mark.asyncio
async def test_list_articles(client: AsyncClient, test_user, db_session):
    headers = get_auth_headers(test_user)
    await client.post("/api/v1/kb/articles", json={"title": "Article A"}, headers=headers)
    await client.post("/api/v1/kb/articles", json={"title": "Article B"}, headers=headers)
    r = await client.get("/api/v1/kb/articles", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert data["total"] >= 2


@pytest.mark.asyncio
async def test_get_article_by_slug(client: AsyncClient, test_user, db_session):
    headers = get_auth_headers(test_user)
    await client.post("/api/v1/kb/articles", json={"title": "Slug Test Article"}, headers=headers)
    r = await client.get("/api/v1/kb/articles/slug-test-article", headers=headers)
    assert r.status_code == 200
    assert r.json()["title"] == "Slug Test Article"
    assert r.json()["view_count"] >= 1  # View count incremented


@pytest.mark.asyncio
async def test_update_article_creates_version(client: AsyncClient, test_user, db_session):
    headers = get_auth_headers(test_user)
    r = await client.post("/api/v1/kb/articles", json={
        "title": "Versioned Article",
        "content_markdown": "Version 1 content",
    }, headers=headers)
    article_id = r.json()["id"]
    # Update the article
    r2 = await client.patch(f"/api/v1/kb/articles/{article_id}", json={
        "content_markdown": "Version 2 content",
        "change_summary": "Updated content",
    }, headers=headers)
    assert r2.status_code == 200


@pytest.mark.asyncio
async def test_article_versions(client: AsyncClient, test_user, db_session):
    headers = get_auth_headers(test_user)
    r = await client.post("/api/v1/kb/articles", json={
        "title": "Version History Test",
        "content_markdown": "Initial",
    }, headers=headers)
    article_id = r.json()["id"]
    await client.patch(f"/api/v1/kb/articles/{article_id}", json={"content_markdown": "Updated"}, headers=headers)
    r2 = await client.get(f"/api/v1/kb/articles/{article_id}/versions", headers=headers)
    assert r2.status_code == 200
    versions = r2.json()
    assert len(versions) >= 1


@pytest.mark.asyncio
async def test_mark_helpful(client: AsyncClient, test_user, db_session):
    headers = get_auth_headers(test_user)
    r = await client.post("/api/v1/kb/articles", json={"title": "Helpful Article"}, headers=headers)
    article_id = r.json()["id"]
    r2 = await client.post(f"/api/v1/kb/articles/{article_id}/helpful", headers=headers)
    assert r2.status_code == 200
    assert r2.json()["helpful_count"] >= 1


@pytest.mark.asyncio
async def test_create_category(client: AsyncClient, test_user, db_session):
    headers = get_auth_headers(test_user)
    r = await client.post("/api/v1/kb/categories", json={
        "name": "DevOps", "description": "DevOps knowledge",
    }, headers=headers)
    assert r.status_code == 201
    assert r.json()["name"] == "DevOps"
    assert r.json()["slug"] == "devops"


@pytest.mark.asyncio
async def test_create_learning_path(client: AsyncClient, test_user, db_session):
    headers = get_auth_headers(test_user)
    r = await client.post("/api/v1/kb/learning-paths", json={
        "name": "Onboarding Path",
        "description": "New developer onboarding",
        "estimated_duration_mins": 120,
        "difficulty": "beginner",
    }, headers=headers)
    assert r.status_code == 201
    assert r.json()["name"] == "Onboarding Path"


@pytest.mark.asyncio
async def test_search_articles(client: AsyncClient, test_user, db_session):
    headers = get_auth_headers(test_user)
    await client.post("/api/v1/kb/articles", json={"title": "PostgreSQL Tuning Guide"}, headers=headers)
    r = await client.get("/api/v1/kb/articles?search=postgresql", headers=headers)
    assert r.status_code == 200
    assert r.json()["total"] >= 1


@pytest.mark.asyncio
async def test_kb_stats(client: AsyncClient, test_user, db_session):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/kb/stats", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert "total_articles" in data
    assert "learning_paths" in data