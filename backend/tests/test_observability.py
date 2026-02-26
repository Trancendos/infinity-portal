"""Tests for the Observability router."""
import pytest
from httpx import AsyncClient
from tests.conftest import get_auth_headers


@pytest.mark.asyncio
async def test_observability_health(client: AsyncClient):
    """Observability health endpoint is accessible without auth."""
    resp = await client.get("/api/v1/observability/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "healthy"
    assert "logging" in data
    assert "analytics" in data


@pytest.mark.asyncio
async def test_get_logs_requires_auth(client: AsyncClient):
    """Logs endpoint requires authentication (403 without token)."""
    resp = await client.get("/api/v1/observability/logs")
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_get_logs_as_auditor(client: AsyncClient, test_user):
    """Auditor can retrieve logs."""
    headers = get_auth_headers(test_user)
    resp = await client.get("/api/v1/observability/logs?limit=10", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "logs" in data
    assert "count" in data
    assert isinstance(data["logs"], list)


@pytest.mark.asyncio
async def test_get_log_stats(client: AsyncClient, test_user):
    """Log stats endpoint returns distribution data."""
    headers = get_auth_headers(test_user)
    resp = await client.get("/api/v1/observability/logs/stats", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "total_logs" in data
    assert "level_distribution" in data
    assert "category_distribution" in data


@pytest.mark.asyncio
async def test_get_log_levels(client: AsyncClient):
    """Log levels endpoint is public."""
    resp = await client.get("/api/v1/observability/logs/levels")
    assert resp.status_code == 200
    data = resp.json()
    assert "levels" in data
    assert "info" in data["levels"]
    assert "error" in data["levels"]


@pytest.mark.asyncio
async def test_get_metrics_dashboard(client: AsyncClient, test_user):
    """Analytics dashboard returns summary data."""
    headers = get_auth_headers(test_user)
    resp = await client.get("/api/v1/observability/metrics/dashboard", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "summary" in data
    assert "generated_at" in data


@pytest.mark.asyncio
async def test_get_all_metrics(client: AsyncClient, test_user):
    """All metrics endpoint returns metric data."""
    headers = get_auth_headers(test_user)
    resp = await client.get("/api/v1/observability/metrics", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, dict)


@pytest.mark.asyncio
async def test_get_anomalies(client: AsyncClient, test_user):
    """Anomalies endpoint returns list."""
    headers = get_auth_headers(test_user)
    resp = await client.get("/api/v1/observability/anomalies", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "anomalies" in data


@pytest.mark.asyncio
async def test_detect_anomalies_requires_org_admin(client: AsyncClient, test_user, admin_user):
    """Anomaly detection requires org_admin role."""
    # Regular user should be denied
    headers = get_auth_headers(test_user)
    resp = await client.post("/api/v1/observability/anomalies/detect", headers=headers)
    assert resp.status_code in (403, 401)

    # Admin should succeed
    admin_headers = get_auth_headers(admin_user)
    resp = await client.post("/api/v1/observability/anomalies/detect", headers=admin_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "new_anomalies" in data


@pytest.mark.asyncio
async def test_prometheus_metrics_public(client: AsyncClient):
    """Prometheus metrics endpoint is public (scrape endpoint)."""
    resp = await client.get("/api/v1/observability/metrics/prometheus")
    assert resp.status_code == 200
    assert "text/plain" in resp.headers.get("content-type", "")