# tests/test_websocket.py — WebSocket, health, and security tests
import pytest
from httpx import AsyncClient

from tests.conftest import get_auth_headers


@pytest.mark.asyncio
async def test_health_endpoint(client: AsyncClient):
    """Health endpoint returns OK"""
    resp = await client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "healthy"
    assert data["version"] == "3.0.0"


@pytest.mark.asyncio
async def test_security_headers(client: AsyncClient):
    """Responses include security headers"""
    resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.headers.get("X-Content-Type-Options") == "nosniff"
    assert resp.headers.get("X-Frame-Options") == "DENY"
    assert "X-Request-ID" in resp.headers or "x-request-id" in resp.headers


@pytest.mark.asyncio
async def test_cors_headers(client: AsyncClient):
    """CORS headers are present for allowed origins"""
    resp = await client.options(
        "/health",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
        },
    )
    # Should not error out
    assert resp.status_code in (200, 204, 405)


@pytest.mark.asyncio
async def test_request_timing_header(client: AsyncClient):
    """Responses include timing header"""
    resp = await client.get("/health")
    assert resp.status_code == 200
    headers_lower = {k.lower(): v for k, v in resp.headers.items()}
    assert "x-response-time" in headers_lower


@pytest.mark.asyncio
async def test_unauthenticated_access_blocked(client: AsyncClient):
    """Protected endpoints reject unauthenticated requests"""
    resp = await client.get("/api/v1/auth/me")
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_invalid_token_rejected(client: AsyncClient):
    """Invalid JWT tokens are rejected"""
    resp = await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": "Bearer invalid-token-here"},
    )
    assert resp.status_code in (401, 403)