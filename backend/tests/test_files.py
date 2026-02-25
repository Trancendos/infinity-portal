# tests/test_files.py — Virtual filesystem router tests
import pytest
from httpx import AsyncClient

from tests.conftest import get_auth_headers


@pytest.mark.asyncio
async def test_create_directory(client: AsyncClient, test_user):
    """User can create a directory"""
    headers = get_auth_headers(test_user)
    resp = await client.post(
        "/api/v1/files",
        json={
            "name": "Documents",
            "path": "/Documents",
            "type": "directory",
        },
        headers=headers,
    )
    assert resp.status_code in (200, 201)
    data = resp.json()
    assert data["name"] == "Documents"


@pytest.mark.asyncio
async def test_create_file(client: AsyncClient, test_user):
    """User can create a file"""
    headers = get_auth_headers(test_user)
    resp = await client.post(
        "/api/v1/files",
        json={
            "name": "readme.md",
            "path": "/readme.md",
            "type": "file",
            "content": "# Hello World\nThis is a test file.",
        },
        headers=headers,
    )
    assert resp.status_code in (200, 201)
    data = resp.json()
    assert data["name"] == "readme.md"


@pytest.mark.asyncio
async def test_list_files(client: AsyncClient, test_user):
    """User can list files in root"""
    headers = get_auth_headers(test_user)
    # Create a file first
    await client.post(
        "/api/v1/files",
        json={"name": "test.txt", "path": "/test.txt", "type": "file"},
        headers=headers,
    )
    resp = await client.get("/api/v1/files", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list) or "files" in data


@pytest.mark.asyncio
async def test_get_file_content(client: AsyncClient, test_user):
    """User can get file content"""
    headers = get_auth_headers(test_user)
    # Create file
    create_resp = await client.post(
        "/api/v1/files",
        json={
            "name": "content_test.md",
            "path": "/content_test.md",
            "type": "file",
            "content": "Test content here",
        },
        headers=headers,
    )
    file_id = create_resp.json()["id"]

    resp = await client.get(f"/api/v1/files/{file_id}/content", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["content"] == "Test content here"


@pytest.mark.asyncio
async def test_update_file_content(client: AsyncClient, test_user):
    """User can update file content (creates new version)"""
    headers = get_auth_headers(test_user)
    # Create file
    create_resp = await client.post(
        "/api/v1/files",
        json={
            "name": "versioned.md",
            "path": "/versioned.md",
            "type": "file",
            "content": "Version 1",
        },
        headers=headers,
    )
    file_id = create_resp.json()["id"]

    # Update content
    resp = await client.put(
        f"/api/v1/files/{file_id}/content",
        json={"content": "Version 2"},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["version"] >= 2


@pytest.mark.asyncio
async def test_delete_file(client: AsyncClient, admin_user):
    """Admin can delete a file (soft delete)"""
    headers = get_auth_headers(admin_user)
    # Create file
    create_resp = await client.post(
        "/api/v1/files",
        json={"name": "to_delete.txt", "path": "/to_delete.txt", "type": "file"},
        headers=headers,
    )
    file_id = create_resp.json()["id"]

    resp = await client.delete(f"/api/v1/files/{file_id}", headers=headers)
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_get_file_versions(client: AsyncClient, test_user):
    """User can get file version history"""
    headers = get_auth_headers(test_user)
    # Create file
    create_resp = await client.post(
        "/api/v1/files",
        json={
            "name": "history.md",
            "path": "/history.md",
            "type": "file",
            "content": "Initial",
        },
        headers=headers,
    )
    file_id = create_resp.json()["id"]

    resp = await client.get(f"/api/v1/files/{file_id}/versions", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "versions" in data