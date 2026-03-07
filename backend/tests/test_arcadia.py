# tests/test_arcadia.py — Arcadia Generative Front-End tests
import pytest
from httpx import AsyncClient
from tests.conftest import get_auth_headers


@pytest.mark.asyncio
async def test_create_app(client: AsyncClient, admin_user):
    """Can create an app scaffold."""
    headers = get_auth_headers(admin_user)
    resp = await client.post(
        "/api/v1/arcadia/apps/create",
        json={
            "name": "test-dashboard",
            "display_name": "Test Dashboard",
            "framework": "react",
            "description": "A test dashboard app",
        },
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "app_id" in data
    assert data["name"] == "test-dashboard"


@pytest.mark.asyncio
async def test_list_apps(client: AsyncClient, admin_user):
    """Can list created apps."""
    headers = get_auth_headers(admin_user)
    await client.post(
        "/api/v1/arcadia/apps/create",
        json={"name": "list-test-app", "display_name": "List Test App", "framework": "vue"},
        headers=headers,
    )
    resp = await client.get("/api/v1/arcadia/apps", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, (list, dict))


@pytest.mark.asyncio
async def test_get_app(client: AsyncClient, admin_user):
    """Can retrieve a specific app."""
    headers = get_auth_headers(admin_user)
    create_resp = await client.post(
        "/api/v1/arcadia/apps/create",
        json={"name": "get-test-app", "display_name": "Get Test App", "framework": "svelte"},
        headers=headers,
    )
    app_id = create_resp.json()["app_id"]

    resp = await client.get(f"/api/v1/arcadia/apps/{app_id}", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["app_id"] == app_id


@pytest.mark.asyncio
async def test_process_mailbox(client: AsyncClient, admin_user):
    """Can process intelligent mailbox messages."""
    headers = get_auth_headers(admin_user)
    resp = await client.post(
        "/api/v1/arcadia/mailbox/process",
        json={
            "messages": [
                {"subject": "Bug: Login fails on mobile", "body": "Cannot login on iOS Safari", "from": "user@test.com"}
            ],
            "auto_categorise": True,
        },
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, dict)


@pytest.mark.asyncio
async def test_mailbox_summary(client: AsyncClient, admin_user):
    """Can get mailbox summary."""
    headers = get_auth_headers(admin_user)
    resp = await client.get("/api/v1/arcadia/mailbox/summary", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, dict)


@pytest.mark.asyncio
async def test_create_thread(client: AsyncClient, admin_user):
    """Can create a community forum thread."""
    headers = get_auth_headers(admin_user)
    resp = await client.post(
        "/api/v1/arcadia/community/threads",
        json={
            "title": "How to use the Three-Lane Mesh?",
            "body": "I'm trying to understand the architecture and how the lanes communicate...",
            "category": "help",
            "tags": ["architecture", "help"],
        },
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "thread_id" in data
    assert data["title"] == "How to use the Three-Lane Mesh?"


@pytest.mark.asyncio
async def test_list_threads(client: AsyncClient, admin_user):
    """Can list community threads."""
    headers = get_auth_headers(admin_user)
    resp = await client.get("/api/v1/arcadia/community/threads", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, (list, dict))


@pytest.mark.asyncio
async def test_marketplace_listings(client: AsyncClient, admin_user):
    """Can list marketplace items."""
    headers = get_auth_headers(admin_user)
    resp = await client.get("/api/v1/arcadia/marketplace/listings", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, (list, dict))


@pytest.mark.asyncio
async def test_health(client: AsyncClient, admin_user):
    """Arcadia health endpoint works."""
    headers = get_auth_headers(admin_user)
    resp = await client.get("/api/v1/arcadia/health", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "healthy"