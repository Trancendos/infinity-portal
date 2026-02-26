"""Tests for the Version History router."""
import pytest
from httpx import AsyncClient
from tests.conftest import get_auth_headers


@pytest.mark.asyncio
async def test_list_entity_types(client: AsyncClient):
    """Entity types endpoint is public."""
    resp = await client.get("/api/v1/versions/entity-types")
    assert resp.status_code == 200
    data = resp.json()
    assert "entity_types" in data
    assert "file" in data["entity_types"]
    assert "project" in data["entity_types"]
    assert "config" in data["entity_types"]


@pytest.mark.asyncio
async def test_list_change_types(client: AsyncClient):
    """Change types endpoint is public."""
    resp = await client.get("/api/v1/versions/change-types")
    assert resp.status_code == 200
    data = resp.json()
    assert "change_types" in data
    assert "create" in data["change_types"]
    assert "update" in data["change_types"]
    assert "delete" in data["change_types"]


@pytest.mark.asyncio
async def test_save_version_requires_auth(client: AsyncClient):
    """Save version requires authentication."""
    payload = {
        "entity_id": "file-123",
        "entity_name": "test.py",
        "entity_type": "file",
        "content": "print('hello')",
        "change_type": "create",
    }
    resp = await client.post("/api/v1/versions/save", json=payload)
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_save_version(client: AsyncClient, test_user):
    """Save a new version of a file."""
    headers = get_auth_headers(test_user)
    payload = {
        "entity_id": "file-abc123",
        "entity_name": "main.py",
        "entity_type": "file",
        "content": "def hello():\n    return 'world'",
        "change_type": "create",
        "message": "Initial version",
        "tags": ["python", "core"],
    }
    resp = await client.post("/api/v1/versions/save", json=payload, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "version_id" in data
    assert "version_number" in data
    assert data["version_number"] == 1
    assert data["entity_id"] == "file-abc123"
    assert data["entity_type"] == "file"
    assert data["change_type"] == "create"
    assert data["message"] == "Initial version"
    assert "python" in data["tags"]


@pytest.mark.asyncio
async def test_save_multiple_versions(client: AsyncClient, test_user):
    """Save multiple versions and verify version numbers increment."""
    headers = get_auth_headers(test_user)
    entity_id = "file-multi-test"

    for i in range(3):
        payload = {
            "entity_id": entity_id,
            "entity_name": "config.json",
            "entity_type": "config",
            "content": f'{{"version": {i + 1}}}',
            "change_type": "update",
            "message": f"Update {i + 1}",
        }
        resp = await client.post("/api/v1/versions/save", json=payload, headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["version_number"] == i + 1


@pytest.mark.asyncio
async def test_list_versions(client: AsyncClient, test_user):
    """List versions of an entity."""
    headers = get_auth_headers(test_user)
    entity_id = "file-list-test"

    # Create 2 versions
    for i in range(2):
        payload = {
            "entity_id": entity_id,
            "entity_name": "app.py",
            "entity_type": "file",
            "content": f"# Version {i + 1}",
            "change_type": "create" if i == 0 else "update",
            "message": f"Version {i + 1}",
        }
        await client.post("/api/v1/versions/save", json=payload, headers=headers)

    # List them
    resp = await client.get(f"/api/v1/versions/file/{entity_id}", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["entity_id"] == entity_id
    assert data["total"] == 2
    assert len(data["versions"]) == 2


@pytest.mark.asyncio
async def test_get_latest_version(client: AsyncClient, test_user):
    """Get the latest version of an entity."""
    headers = get_auth_headers(test_user)
    entity_id = "file-latest-test"

    # Save 2 versions
    for i in range(2):
        payload = {
            "entity_id": entity_id,
            "entity_name": "latest.py",
            "entity_type": "file",
            "content": f"# Content v{i + 1}",
            "change_type": "create" if i == 0 else "update",
            "message": f"v{i + 1}",
        }
        await client.post("/api/v1/versions/save", json=payload, headers=headers)

    # Get latest
    resp = await client.get(f"/api/v1/versions/file/{entity_id}/latest", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["version_number"] == 2
    assert "# Content v2" in str(data["content"])


@pytest.mark.asyncio
async def test_get_specific_version(client: AsyncClient, test_user):
    """Get a specific version by version number."""
    headers = get_auth_headers(test_user)
    entity_id = "file-specific-test"

    # Save 2 versions
    for i in range(2):
        payload = {
            "entity_id": entity_id,
            "entity_name": "specific.py",
            "entity_type": "file",
            "content": f"# Version {i + 1} content",
            "change_type": "create" if i == 0 else "update",
        }
        await client.post("/api/v1/versions/save", json=payload, headers=headers)

    # Get version 1
    resp = await client.get(f"/api/v1/versions/file/{entity_id}/1", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["version_number"] == 1
    assert "Version 1 content" in str(data["content"])


@pytest.mark.asyncio
async def test_rollback_requires_power_user(client: AsyncClient, test_user):
    """Rollback requires power_user role."""
    headers = get_auth_headers(test_user)
    payload = {
        "entity_id": "file-rollback-test",
        "entity_type": "file",
        "version_number": 1,
        "reason": "Testing rollback",
    }
    resp = await client.post("/api/v1/versions/rollback", json=payload, headers=headers)
    assert resp.status_code in (403, 401)


@pytest.mark.asyncio
async def test_rollback_as_admin(client: AsyncClient, admin_user):
    """Admin can rollback to a previous version."""
    headers = get_auth_headers(admin_user)
    entity_id = "file-rollback-admin-test"

    # Save 2 versions
    for i in range(2):
        payload = {
            "entity_id": entity_id,
            "entity_name": "rollback.py",
            "entity_type": "file",
            "content": f"# Version {i + 1}",
            "change_type": "create" if i == 0 else "update",
        }
        await client.post("/api/v1/versions/save", json=payload, headers=headers)

    # Rollback to version 1
    rollback_payload = {
        "entity_id": entity_id,
        "entity_type": "file",
        "version_number": 1,
        "reason": "Reverting bad change",
    }
    resp = await client.post("/api/v1/versions/rollback", json=rollback_payload, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert data["rolled_back_to_version"] == 1
    assert "new_version_number" in data
    assert data["new_version_number"] == 3  # Creates a new version


@pytest.mark.asyncio
async def test_get_timeline_summary(client: AsyncClient, test_user):
    """Get timeline summary for an entity."""
    headers = get_auth_headers(test_user)
    entity_id = "file-summary-test"

    # Save a version first
    payload = {
        "entity_id": entity_id,
        "entity_name": "summary.py",
        "entity_type": "file",
        "content": "# Summary test",
        "change_type": "create",
    }
    await client.post("/api/v1/versions/save", json=payload, headers=headers)

    # Get summary
    resp = await client.get(f"/api/v1/versions/file/{entity_id}/summary-stats", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "entity_id" in data or "total_versions" in data