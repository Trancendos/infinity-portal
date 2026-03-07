# tests/test_workshop.py — Code Repository / Workshop tests
import pytest
from httpx import AsyncClient
from tests.conftest import get_auth_headers


@pytest.mark.asyncio
async def test_list_repos(client: AsyncClient, admin_user):
    """Can list repositories."""
    headers = get_auth_headers(admin_user)
    resp = await client.get("/api/v1/workshop/repos", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, (list, dict))


@pytest.mark.asyncio
async def test_create_repo(client: AsyncClient, admin_user):
    """Can create a repository."""
    headers = get_auth_headers(admin_user)
    resp = await client.post(
        "/api/v1/workshop/repos",
        json={
            "name": "test-service",
            "description": "A test microservice",
            "template": "fastapi",
            "visibility": "private",
        },
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "repo_id" in data
    assert data["name"] == "test-service"


@pytest.mark.asyncio
async def test_get_repo(client: AsyncClient, admin_user):
    """Can retrieve a specific repository."""
    headers = get_auth_headers(admin_user)
    create_resp = await client.post(
        "/api/v1/workshop/repos",
        json={"name": "get-test-repo", "template": "blank"},
        headers=headers,
    )
    repo_id = create_resp.json()["repo_id"]

    resp = await client.get(f"/api/v1/workshop/repos/{repo_id}", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["repo_id"] == repo_id


@pytest.mark.asyncio
async def test_code_review(client: AsyncClient, admin_user):
    """Can request a code review."""
    headers = get_auth_headers(admin_user)
    create_resp = await client.post(
        "/api/v1/workshop/repos",
        json={"name": "review-repo", "template": "blank"},
        headers=headers,
    )
    repo_id = create_resp.json()["repo_id"]

    resp = await client.post(
        f"/api/v1/workshop/repos/{repo_id}/review",
        json={
            "branch": "feature/auth",
            "files": ["auth.py", "models.py"],
        },
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "review_id" in data or isinstance(data, dict)


@pytest.mark.asyncio
async def test_list_pipelines(client: AsyncClient, admin_user):
    """Can list CI/CD pipelines."""
    headers = get_auth_headers(admin_user)
    resp = await client.get("/api/v1/workshop/ci/pipelines", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, (list, dict))


@pytest.mark.asyncio
async def test_security_audit(client: AsyncClient, admin_user):
    """Can request a security audit."""
    headers = get_auth_headers(admin_user)
    create_resp = await client.post(
        "/api/v1/workshop/repos",
        json={"name": "audit-repo", "template": "blank"},
        headers=headers,
    )
    repo_id = create_resp.json()["repo_id"]

    resp = await client.get(f"/api/v1/workshop/security/audit/{repo_id}", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, dict)


@pytest.mark.asyncio
async def test_health(client: AsyncClient, admin_user):
    """Workshop health endpoint works."""
    headers = get_auth_headers(admin_user)
    resp = await client.get("/api/v1/workshop/health", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "healthy"