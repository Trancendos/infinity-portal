"""Tests for Document Management Router"""
import pytest
from httpx import AsyncClient
from tests.conftest import get_auth_headers


@pytest.mark.asyncio
async def test_create_document(client: AsyncClient, test_user, db_session):
    headers = get_auth_headers(test_user)
    r = await client.post("/api/v1/documents/", json={
        "title": "Architecture Design.pdf",
        "mime_type": "application/pdf",
        "size": 1024000,
        "tags": ["architecture", "design"],
    }, headers=headers)
    assert r.status_code == 201
    data = r.json()
    assert data["title"] == "Architecture Design.pdf"
    assert "tags" in data
    tag_names = [t["name"] if isinstance(t, dict) else t for t in data["tags"]]
    assert "document" in tag_names  # Should auto-tag as "document"


@pytest.mark.asyncio
async def test_list_documents(client: AsyncClient, test_user, db_session):
    headers = get_auth_headers(test_user)
    await client.post("/api/v1/documents/", json={"title": "Doc A.txt", "mime_type": "text/plain"}, headers=headers)
    await client.post("/api/v1/documents/", json={"title": "Doc B.csv", "mime_type": "text/csv"}, headers=headers)
    r = await client.get("/api/v1/documents/", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert data["total"] >= 2


@pytest.mark.asyncio
async def test_search_documents(client: AsyncClient, test_user, db_session):
    headers = get_auth_headers(test_user)
    await client.post("/api/v1/documents/", json={"title": "Invoice Q1 2026.pdf"}, headers=headers)
    r = await client.get("/api/v1/documents/?search=invoice", headers=headers)
    assert r.status_code == 200
    assert r.json()["total"] >= 1


@pytest.mark.asyncio
async def test_smart_tagging(client: AsyncClient, test_user, db_session):
    headers = get_auth_headers(test_user)
    r = await client.post("/api/v1/documents/", json={
        "title": "Security Audit Report 2026.pdf",
        "mime_type": "application/pdf",
    }, headers=headers)
    assert r.status_code == 201
    tags = r.json()["tags"]
    tag_names = [t["name"] if isinstance(t, dict) else t for t in tags]
    assert "document" in tag_names  # from MIME
    assert "security" in tag_names or "report" in tag_names  # from filename


@pytest.mark.asyncio
async def test_create_category(client: AsyncClient, test_user, db_session):
    headers = get_auth_headers(test_user)
    r = await client.post("/api/v1/documents/categories", json={
        "name": "Engineering", "slug": "engineering", "icon": "⚙️",
    }, headers=headers)
    assert r.status_code == 201
    assert r.json()["name"] == "Engineering"


@pytest.mark.asyncio
async def test_duplicate_groups_via_creation(client: AsyncClient, test_user, db_session):
    headers = get_auth_headers(test_user)
    # Create two docs with same hash to trigger duplicate detection
    await client.post("/api/v1/documents/", json={
        "title": "Dup A.pdf", "hash_sha256": "abc123", "size": 100,
    }, headers=headers)
    await client.post("/api/v1/documents/", json={
        "title": "Dup B.pdf", "hash_sha256": "abc123", "size": 100,
    }, headers=headers)
    # Verify both were created
    r = await client.get("/api/v1/documents/", headers=headers)
    assert r.status_code == 200
    assert r.json()["total"] >= 2


@pytest.mark.asyncio
async def test_library_stats(client: AsyncClient, test_user, db_session):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/documents/library/stats", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert "total_documents" in data
    assert "by_source" in data


@pytest.mark.asyncio
async def test_cloud_sync_setup(client: AsyncClient, admin_user, db_session):
    headers = get_auth_headers(admin_user)
    r = await client.post("/api/v1/documents/sync/configure", json={
        "provider": "google_drive",
        "root_folder_path": "/shared/docs",
        "sync_direction": "pull",
        "sync_frequency_mins": 30,
    }, headers=headers)
    assert r.status_code == 201
    assert r.json()["provider"] == "google_drive"


@pytest.mark.asyncio
async def test_get_all_tags(client: AsyncClient, test_user, db_session):
    headers = get_auth_headers(test_user)
    await client.post("/api/v1/documents/", json={"title": "Tagged doc", "tags": ["test-tag"]}, headers=headers)
    r = await client.get("/api/v1/documents/tags/all", headers=headers)
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_delete_document(client: AsyncClient, test_user, db_session):
    headers = get_auth_headers(test_user)
    r = await client.post("/api/v1/documents/", json={"title": "To Delete"}, headers=headers)
    doc_id = r.json()["id"]
    r2 = await client.delete(f"/api/v1/documents/{doc_id}", headers=headers)
    assert r2.status_code == 200