# tests/test_users.py — User management router tests
import pytest
from httpx import AsyncClient

from tests.conftest import get_auth_headers


@pytest.mark.asyncio
async def test_list_users_as_admin(client: AsyncClient, admin_user, test_user):
    """Admin can list users in their organisation"""
    headers = get_auth_headers(admin_user)
    resp = await client.get("/api/v1/users", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    # Response is a list directly (response_model=List[UserOut])
    assert isinstance(data, list)
    assert len(data) >= 2


@pytest.mark.asyncio
async def test_list_users_forbidden_for_regular_user(client: AsyncClient, test_user):
    """Regular users cannot list users"""
    headers = get_auth_headers(test_user)
    resp = await client.get("/api/v1/users", headers=headers)
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_get_user_count(client: AsyncClient, admin_user, test_user):
    """Admin can get user count"""
    headers = get_auth_headers(admin_user)
    resp = await client.get("/api/v1/users/count", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 2


@pytest.mark.asyncio
async def test_get_user_by_id(client: AsyncClient, admin_user, test_user):
    """Admin can get a specific user"""
    headers = get_auth_headers(admin_user)
    resp = await client.get(f"/api/v1/users/{test_user.id}", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["email"] == test_user.email


@pytest.mark.asyncio
async def test_update_user(client: AsyncClient, admin_user, test_user):
    """Admin can update a user's display name"""
    headers = get_auth_headers(admin_user)
    resp = await client.patch(
        f"/api/v1/users/{test_user.id}",
        json={"display_name": "Updated Name"},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["display_name"] == "Updated Name"


@pytest.mark.asyncio
async def test_change_user_role(client: AsyncClient, super_admin, test_user):
    """Super admin can change user roles"""
    headers = get_auth_headers(super_admin)
    resp = await client.patch(
        f"/api/v1/users/{test_user.id}/role",
        json={"role": "power_user"},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["new_role"] == "power_user"


@pytest.mark.asyncio
async def test_change_role_forbidden_for_regular_user(client: AsyncClient, test_user, admin_user):
    """Regular user cannot change roles"""
    headers = get_auth_headers(test_user)
    resp = await client.patch(
        f"/api/v1/users/{admin_user.id}/role",
        json={"role": "power_user"},
        headers=headers,
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_deactivate_user(client: AsyncClient, admin_user, test_user):
    """Admin can deactivate a user (soft delete)"""
    headers = get_auth_headers(admin_user)
    resp = await client.delete(f"/api/v1/users/{test_user.id}", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("status") == "deactivated" or "deactivated" in str(data).lower()


@pytest.mark.asyncio
async def test_invite_user(client: AsyncClient, admin_user):
    """Admin can invite a new user"""
    headers = get_auth_headers(admin_user)
    resp = await client.post(
        "/api/v1/users/invite",
        json={
            "email": "newuser@infinity-os.dev",
            "display_name": "New User",
            "role": "user",
        },
        headers=headers,
    )
    assert resp.status_code in (200, 201)
    data = resp.json()
    assert data["email"] == "newuser@infinity-os.dev"
    assert data["status"] == "invited"