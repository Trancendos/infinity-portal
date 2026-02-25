# tests/test_build.py — Build system router tests
import pytest
from httpx import AsyncClient

from tests.conftest import get_auth_headers


@pytest.mark.asyncio
async def test_trigger_pwa_build(client: AsyncClient, admin_user):
    """Admin can trigger a PWA build"""
    headers = get_auth_headers(admin_user)
    # Create a repo first
    repo_resp = await client.post(
        "/api/v1/repos",
        json={"name": "build-test-repo", "description": "For build testing"},
        headers=headers,
    )
    repo_id = repo_resp.json()["id"]

    resp = await client.post(
        "/api/v1/builds",
        json={
            "repository_id": repo_id,
            "target": "pwa",
            "config": {"app_name": "Test App", "short_name": "TestApp"},
        },
        headers=headers,
    )
    assert resp.status_code in (200, 201)
    data = resp.json()
    assert data["target"] == "pwa"
    assert data["status"] in ("queued", "running", "completed")


@pytest.mark.asyncio
async def test_list_builds(client: AsyncClient, admin_user):
    """User can list builds"""
    headers = get_auth_headers(admin_user)
    resp = await client.get("/api/v1/builds", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list) or "builds" in data


@pytest.mark.asyncio
async def test_get_build(client: AsyncClient, admin_user):
    """User can get a specific build"""
    headers = get_auth_headers(admin_user)
    # Create repo and trigger build
    repo_resp = await client.post(
        "/api/v1/repos",
        json={"name": "get-build-repo"},
        headers=headers,
    )
    repo_id = repo_resp.json()["id"]
    build_resp = await client.post(
        "/api/v1/builds",
        json={"repository_id": repo_id, "target": "docker"},
        headers=headers,
    )
    build_id = build_resp.json()["id"]

    resp = await client.get(f"/api/v1/builds/{build_id}", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == build_id


@pytest.mark.asyncio
async def test_build_forbidden_for_regular_user(client: AsyncClient, test_user):
    """Regular users cannot trigger builds"""
    headers = get_auth_headers(test_user)
    resp = await client.post(
        "/api/v1/builds",
        json={"repository_id": "fake-id", "target": "pwa"},
        headers=headers,
    )
    assert resp.status_code == 403