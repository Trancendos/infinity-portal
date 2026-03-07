# tests/test_treasury.py — Royal Bank of Arcadia tests
import pytest
from httpx import AsyncClient
from tests.conftest import get_auth_headers


@pytest.mark.asyncio
async def test_current_costs(client: AsyncClient, admin_user):
    """Can retrieve current cost breakdown."""
    headers = get_auth_headers(admin_user)
    resp = await client.get("/api/v1/treasury/costs/current", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "total_monthly_cost" in data or "total_monthly" in data or "categories" in data


@pytest.mark.asyncio
async def test_cost_forecast(client: AsyncClient, admin_user):
    """Can get cost forecast."""
    headers = get_auth_headers(admin_user)
    resp = await client.get("/api/v1/treasury/costs/forecast", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, dict)


@pytest.mark.asyncio
async def test_cost_breakdown(client: AsyncClient, admin_user):
    """Can get detailed cost breakdown."""
    headers = get_auth_headers(admin_user)
    resp = await client.get("/api/v1/treasury/costs/breakdown", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, dict)


@pytest.mark.asyncio
async def test_cost_optimise(client: AsyncClient, admin_user):
    """Can request cost optimisation analysis."""
    headers = get_auth_headers(admin_user)
    resp = await client.post(
        "/api/v1/treasury/costs/optimise",
        json={"target_reduction_pct": 15.0, "scope": "all", "dry_run": True},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, dict)


@pytest.mark.asyncio
async def test_zero_cost_status(client: AsyncClient, admin_user):
    """Can check zero-net-cost compliance."""
    headers = get_auth_headers(admin_user)
    resp = await client.get("/api/v1/treasury/zero-cost/status", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, dict)


@pytest.mark.asyncio
async def test_revenue_streams(client: AsyncClient, admin_user):
    """Can list revenue streams."""
    headers = get_auth_headers(admin_user)
    resp = await client.get("/api/v1/treasury/revenue/streams", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, (list, dict))


@pytest.mark.asyncio
async def test_revenue_total(client: AsyncClient, admin_user):
    """Can get total revenue."""
    headers = get_auth_headers(admin_user)
    resp = await client.get("/api/v1/treasury/revenue/total", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, dict)


@pytest.mark.asyncio
async def test_process_payment(client: AsyncClient, admin_user):
    """Can process a payment."""
    headers = get_auth_headers(admin_user)
    resp = await client.post(
        "/api/v1/treasury/payments/process",
        json={
            "amount": 99.99,
            "currency": "GBP",
            "description": "Pro plan subscription",
            "recipient": "trancendos-platform",
            "payment_method": "platform_credit",
        },
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "payment_id" in data or "transaction_id" in data


@pytest.mark.asyncio
async def test_health(client: AsyncClient, admin_user):
    """Treasury health endpoint works."""
    headers = get_auth_headers(admin_user)
    resp = await client.get("/api/v1/treasury/health", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "healthy"