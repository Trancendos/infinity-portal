# tests/test_sync.py — Data Sync tests
import pytest
from httpx import AsyncClient
from tests.conftest import get_auth_headers


@pytest.mark.asyncio
async def test_trigger_sync(client: AsyncClient, admin_user):
    """Can trigger a data sync."""
    headers = get_auth_headers(admin_user)
    resp = await client.post(
        "/api/v1/sync/trigger",
        json={
            "source": "turso-primary-iad",
            "target": "turso-replica-lhr",
            "sync_type": "incremental",
        },
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "job_id" in data or "sync_id" in data


@pytest.mark.asyncio
async def test_list_sync_jobs(client: AsyncClient, admin_user):
    """Can list sync jobs."""
    headers = get_auth_headers(admin_user)
    resp = await client.get("/api/v1/sync/jobs", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, (list, dict))


@pytest.mark.asyncio
async def test_list_conflicts(client: AsyncClient, admin_user):
    """Can list sync conflicts."""
    headers = get_auth_headers(admin_user)
    resp = await client.get("/api/v1/sync/conflicts", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, (list, dict))


@pytest.mark.asyncio
async def test_get_replication_topology(client: AsyncClient, admin_user):
    """Can get replication topology."""
    headers = get_auth_headers(admin_user)
    resp = await client.get("/api/v1/sync/replication", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, (list, dict))


@pytest.mark.asyncio
async def test_sync_metrics(client: AsyncClient, admin_user):
    """Can get sync metrics."""
    headers = get_auth_headers(admin_user)
    resp = await client.get("/api/v1/sync/metrics", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, dict)


@pytest.mark.asyncio
async def test_health(client: AsyncClient, admin_user):
    """Sync health endpoint works."""
    headers = get_auth_headers(admin_user)
    resp = await client.get("/api/v1/sync/health", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "healthy"