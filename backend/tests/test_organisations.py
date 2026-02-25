# tests/test_organisations.py — Organisation management router tests
import pytest
from httpx import AsyncClient

from tests.conftest import get_auth_headers


@pytest.mark.asyncio
async def test_get_current_organisation(client: AsyncClient, admin_user):
    """Admin can get their current organisation"""
    headers = get_auth_headers(admin_user)
    resp = await client.get("/api/v1/organisations/current", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Test Organisation"
    assert data["slug"] == "test-org"


@pytest.mark.asyncio
async def test_list_organisations_super_admin(client: AsyncClient, super_admin):
    """Super admin can list all organisations"""
    headers = get_auth_headers(super_admin)
    resp = await client.get("/api/v1/organisations", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    # Response is a list directly (response_model=List[OrgOut])
    assert isinstance(data, list)
    assert len(data) >= 1


@pytest.mark.asyncio
async def test_list_organisations_forbidden_for_regular(client: AsyncClient, test_user):
    """Regular users cannot list all organisations"""
    headers = get_auth_headers(test_user)
    resp = await client.get("/api/v1/organisations", headers=headers)
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_update_organisation(client: AsyncClient, admin_user, test_org):
    """Org admin can update their organisation"""
    headers = get_auth_headers(admin_user)
    resp = await client.patch(
        f"/api/v1/organisations/{test_org.id}",
        json={"name": "Updated Organisation"},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Updated Organisation"


@pytest.mark.asyncio
async def test_list_members(client: AsyncClient, admin_user, test_org, test_user):
    """Admin can list organisation members"""
    headers = get_auth_headers(admin_user)
    resp = await client.get(f"/api/v1/organisations/{test_org.id}/members", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "members" in data
    assert len(data["members"]) >= 2