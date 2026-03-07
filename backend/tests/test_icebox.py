# tests/test_icebox.py — IceBox Cold Storage tests
import pytest
from httpx import AsyncClient
from tests.conftest import get_auth_headers


@pytest.mark.asyncio
async def test_archive_data(client: AsyncClient, admin_user):
    """Can archive data to cold storage."""
    headers = get_auth_headers(admin_user)
    resp = await client.post(
        "/api/v1/icebox/archive",
        json={
            "name": "audit_logs_2024_q1",
            "source": "/data/audit/2024-q1",
            "data_type": "audit_log",
            "encryption": "aes256",
            "compression": "zstd",
            "retention_days": 2555,
        },
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "archive_id" in data


@pytest.mark.asyncio
async def test_list_archives(client: AsyncClient, admin_user):
    """Can list archives."""
    headers = get_auth_headers(admin_user)
    resp = await client.get("/api/v1/icebox/archives", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, (list, dict))


@pytest.mark.asyncio
async def test_get_archive(client: AsyncClient, admin_user):
    """Can get a specific archive."""
    headers = get_auth_headers(admin_user)
    create_resp = await client.post(
        "/api/v1/icebox/archive",
        json={
            "name": "test_data_archive",
            "source": "/data/test",
            "data_type": "user_data",
            "encryption": "aes256",
            "compression": "gzip",
        },
        headers=headers,
    )
    archive_id = create_resp.json()["archive_id"]

    resp = await client.get(f"/api/v1/icebox/archives/{archive_id}", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["archive_id"] == archive_id


@pytest.mark.asyncio
async def test_restore_archive(client: AsyncClient, admin_user):
    """Can restore an archive."""
    headers = get_auth_headers(admin_user)
    create_resp = await client.post(
        "/api/v1/icebox/archive",
        json={
            "name": "restore_test_archive",
            "source": "/data/restore-test",
            "data_type": "compliance",
            "encryption": "chacha20",
            "compression": "lz4",
        },
        headers=headers,
    )
    archive_id = create_resp.json()["archive_id"]

    resp = await client.post(
        f"/api/v1/icebox/archives/{archive_id}/restore",
        json={"target": "hot_storage", "verify_integrity": True},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "restore_id" in data or "status" in data


@pytest.mark.asyncio
async def test_list_retention_policies(client: AsyncClient, admin_user):
    """Can list retention policies."""
    headers = get_auth_headers(admin_user)
    resp = await client.get("/api/v1/icebox/policies", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, (list, dict))


@pytest.mark.asyncio
async def test_create_retention_policy(client: AsyncClient, admin_user):
    """Can create a retention policy."""
    headers = get_auth_headers(admin_user)
    resp = await client.post(
        "/api/v1/icebox/policies",
        json={
            "name": "test_log_policy",
            "data_type": "audit_log",
            "retention_days": 730,
            "action_on_expiry": "delete",
            "gdpr_compliant": True,
            "description": "Test retention policy for logs",
        },
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "policy_id" in data or "name" in data


@pytest.mark.asyncio
async def test_archive_metrics(client: AsyncClient, admin_user):
    """Can get archive metrics."""
    headers = get_auth_headers(admin_user)
    resp = await client.get("/api/v1/icebox/metrics", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, dict)


@pytest.mark.asyncio
async def test_health(client: AsyncClient, admin_user):
    """IceBox health endpoint works."""
    headers = get_auth_headers(admin_user)
    resp = await client.get("/api/v1/icebox/health", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "healthy"