# tests/test_the_dr.py — TheDr Self-Healing Lab tests
import pytest
from httpx import AsyncClient
from tests.conftest import get_auth_headers


@pytest.mark.asyncio
async def test_heal_request(client: AsyncClient, admin_user):
    """TheDr can process a heal request."""
    headers = get_auth_headers(admin_user)
    resp = await client.post(
        "/api/v1/the-dr/heal",
        json={
            "target": "infinity-portal",
            "fault_description": "Memory usage growing unbounded in worker process",
            "severity": "high",
        },
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "heal_id" in data
    assert "remediation" in data


@pytest.mark.asyncio
async def test_health_check(client: AsyncClient, admin_user):
    """TheDr health endpoint works."""
    headers = get_auth_headers(admin_user)
    resp = await client.get("/api/v1/the-dr/health", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] in ("healthy", "degraded", "critical")


@pytest.mark.asyncio
async def test_code_analysis(client: AsyncClient, admin_user):
    """TheDr can analyze code for issues."""
    headers = get_auth_headers(admin_user)
    resp = await client.post(
        "/api/v1/the-dr/code-analysis",
        json={
            "code": "import os\nos.system('rm -rf /')\npassword = 'hardcoded123'",
            "language": "python",
            "analysis_type": "security",
        },
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "findings" in data
    assert "grade" in data or "score" in data


@pytest.mark.asyncio
async def test_diagnose(client: AsyncClient, admin_user):
    """TheDr can diagnose a service issue."""
    headers = get_auth_headers(admin_user)
    resp = await client.post(
        "/api/v1/the-dr/diagnose",
        json={
            "symptoms": ["high_latency", "timeout_errors"],
            "affected_services": ["api-gateway"],
            "timeframe_minutes": 30,
        },
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "diagnosis_id" in data
    assert "probable_causes" in data


@pytest.mark.asyncio
async def test_closed_loop_status(client: AsyncClient, admin_user):
    """Can check closed-loop healing status."""
    headers = get_auth_headers(admin_user)
    resp = await client.get("/api/v1/the-dr/closed-loop/status", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "mode" in data


@pytest.mark.asyncio
async def test_healing_history(client: AsyncClient, admin_user):
    """Can retrieve healing history."""
    headers = get_auth_headers(admin_user)
    resp = await client.get("/api/v1/the-dr/healing-history", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, (list, dict))


@pytest.mark.asyncio
async def test_metrics(client: AsyncClient, admin_user):
    """Can retrieve TheDr metrics."""
    headers = get_auth_headers(admin_user)
    resp = await client.get("/api/v1/the-dr/metrics", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, dict)