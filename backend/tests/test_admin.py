# tests/test_admin.py — Platform Admin tests
import pytest
from httpx import AsyncClient
from tests.conftest import get_auth_headers


@pytest.mark.asyncio
async def test_platform_status(client: AsyncClient, admin_user):
    """Can get platform status."""
    headers = get_auth_headers(admin_user)
    resp = await client.get("/api/v1/admin/platform/status", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "status" in data or "platform" in data


@pytest.mark.asyncio
async def test_get_platform_config(client: AsyncClient, admin_user):
    """Can get platform configuration."""
    headers = get_auth_headers(admin_user)
    resp = await client.get("/api/v1/admin/platform/config", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, dict)


@pytest.mark.asyncio
async def test_patch_platform_config(client: AsyncClient, admin_user):
    """Can patch platform configuration."""
    headers = get_auth_headers(admin_user)
    resp = await client.patch(
        "/api/v1/admin/platform/config",
        json={
            "updates": {"features.ai_generation": True},
            "reason": "Enable AI generation for testing",
        },
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, dict)


@pytest.mark.asyncio
async def test_list_all_users(client: AsyncClient, admin_user):
    """Can list all users."""
    headers = get_auth_headers(admin_user)
    resp = await client.get("/api/v1/admin/users/all", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, (list, dict))


@pytest.mark.asyncio
async def test_list_organisations(client: AsyncClient, admin_user):
    """Can list all organisations."""
    headers = get_auth_headers(admin_user)
    resp = await client.get("/api/v1/admin/organisations/all", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, (list, dict))


@pytest.mark.asyncio
async def test_platform_audit(client: AsyncClient, admin_user):
    """Can get platform audit log."""
    headers = get_auth_headers(admin_user)
    resp = await client.get("/api/v1/admin/audit/platform", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, (list, dict))


@pytest.mark.asyncio
async def test_health_all(client: AsyncClient, admin_user):
    """Can check all service health."""
    headers = get_auth_headers(admin_user)
    resp = await client.get("/api/v1/admin/health/all", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, dict)


@pytest.mark.asyncio
async def test_maintenance_mode(client: AsyncClient, admin_user):
    """Can toggle maintenance mode."""
    headers = get_auth_headers(admin_user)
    resp = await client.post(
        "/api/v1/admin/maintenance/mode",
        json={
            "enabled": False,
            "reason": "Testing maintenance toggle",
            "estimated_duration_minutes": 15,
        },
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, dict)