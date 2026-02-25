# tests/test_repositories.py — Repository management router tests
import pytest
from httpx import AsyncClient

from tests.conftest import get_auth_headers


@pytest.mark.asyncio
async def test_create_repository(client: AsyncClient, admin_user):
    """Admin can create a repository"""
    headers = get_auth_headers(admin_user)
    resp = await client.post(
        "/api/v1/repos",
        json={
            "name": "test-repo",
            "description": "A test repository",
            "visibility": "private",
            "default_branch": "main",
        },
        headers=headers,
    )
    assert resp.status_code in (200, 201)
    data = resp.json()
    assert data["name"] == "test-repo"
    assert data["visibility"] == "private"


@pytest.mark.asyncio
async def test_list_repositories(client: AsyncClient, admin_user):
    """User can list repositories"""
    headers = get_auth_headers(admin_user)
    # Create a repo first
    await client.post(
        "/api/v1/repos",
        json={"name": "list-repo", "description": "For listing"},
        headers=headers,
    )
    resp = await client.get("/api/v1/repos", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "repositories" in data
    assert len(data["repositories"]) >= 1


@pytest.mark.asyncio
async def test_get_repository(client: AsyncClient, admin_user):
    """User can get a specific repository"""
    headers = get_auth_headers(admin_user)
    create_resp = await client.post(
        "/api/v1/repos",
        json={"name": "get-repo", "description": "For getting"},
        headers=headers,
    )
    repo_id = create_resp.json()["id"]

    resp = await client.get(f"/api/v1/repos/{repo_id}", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "get-repo"


@pytest.mark.asyncio
async def test_update_repository(client: AsyncClient, admin_user):
    """Admin can update a repository"""
    headers = get_auth_headers(admin_user)
    create_resp = await client.post(
        "/api/v1/repos",
        json={"name": "update-repo", "description": "Before update"},
        headers=headers,
    )
    repo_id = create_resp.json()["id"]

    resp = await client.patch(
        f"/api/v1/repos/{repo_id}",
        json={"description": "After update"},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["description"] == "After update"


@pytest.mark.asyncio
async def test_delete_repository(client: AsyncClient, admin_user):
    """Admin can delete a repository"""
    headers = get_auth_headers(admin_user)
    create_resp = await client.post(
        "/api/v1/repos",
        json={"name": "delete-repo", "description": "To be deleted"},
        headers=headers,
    )
    repo_id = create_resp.json()["id"]

    resp = await client.delete(f"/api/v1/repos/{repo_id}", headers=headers)
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_create_repo_forbidden_for_regular_user(client: AsyncClient, test_user):
    """Regular users cannot create repositories"""
    headers = get_auth_headers(test_user)
    resp = await client.post(
        "/api/v1/repos",
        json={"name": "forbidden-repo"},
        headers=headers,
    )
    assert resp.status_code == 403