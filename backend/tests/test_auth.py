# tests/test_auth.py — Authentication & authorization tests
import pytest
import pytest_asyncio
from httpx import AsyncClient

from tests.conftest import get_auth_headers


@pytest.mark.asyncio
class TestRegistration:
    async def test_register_success(self, client: AsyncClient):
        res = await client.post("/api/v1/auth/register", json={
            "email": "newuser@test.com",
            "password": "SecurePass123!",
            "display_name": "New User",
        })
        assert res.status_code == 200
        data = res.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["user"]["email"] == "newuser@test.com"
        assert data["user"]["role"] == "user"

    async def test_register_weak_password(self, client: AsyncClient):
        res = await client.post("/api/v1/auth/register", json={
            "email": "weak@test.com",
            "password": "short",
        })
        assert res.status_code in (400, 422)

    async def test_register_duplicate_email(self, client: AsyncClient):
        await client.post("/api/v1/auth/register", json={
            "email": "dupe@test.com",
            "password": "SecurePass123!",
        })
        res = await client.post("/api/v1/auth/register", json={
            "email": "dupe@test.com",
            "password": "SecurePass123!",
        })
        assert res.status_code == 409

    async def test_register_invalid_email(self, client: AsyncClient):
        res = await client.post("/api/v1/auth/register", json={
            "email": "not-an-email",
            "password": "SecurePass123!",
        })
        assert res.status_code == 422


@pytest.mark.asyncio
class TestLogin:
    async def test_login_success(self, client: AsyncClient, test_user):
        res = await client.post("/api/v1/auth/login", json={
            "email": "testuser@infinity-os.dev",
            "password": "TestPassword123!",
        })
        assert res.status_code == 200
        data = res.json()
        assert "access_token" in data
        assert data["user"]["email"] == "testuser@infinity-os.dev"

    async def test_login_wrong_password(self, client: AsyncClient, test_user):
        res = await client.post("/api/v1/auth/login", json={
            "email": "testuser@infinity-os.dev",
            "password": "WrongPassword123!",
        })
        assert res.status_code == 401

    async def test_login_nonexistent_user(self, client: AsyncClient):
        res = await client.post("/api/v1/auth/login", json={
            "email": "nobody@test.com",
            "password": "SomePassword123!",
        })
        assert res.status_code == 401


@pytest.mark.asyncio
class TestTokens:
    async def test_access_protected_route(self, client: AsyncClient, test_user):
        headers = get_auth_headers(test_user)
        res = await client.get("/api/v1/auth/me", headers=headers)
        assert res.status_code == 200
        assert res.json()["email"] == "testuser@infinity-os.dev"

    async def test_access_without_token(self, client: AsyncClient):
        res = await client.get("/api/v1/auth/me")
        assert res.status_code == 403

    async def test_access_with_invalid_token(self, client: AsyncClient):
        res = await client.get("/api/v1/auth/me", headers={
            "Authorization": "Bearer invalid.token.here"
        })
        assert res.status_code == 401

    async def test_refresh_token(self, client: AsyncClient):
        # Register to get tokens
        reg_res = await client.post("/api/v1/auth/register", json={
            "email": "refresh@test.com",
            "password": "SecurePass123!",
        })
        refresh_token = reg_res.json()["refresh_token"]

        res = await client.post("/api/v1/auth/refresh", json={
            "refresh_token": refresh_token,
        })
        assert res.status_code == 200
        assert "access_token" in res.json()


@pytest.mark.asyncio
class TestRBAC:
    async def test_admin_can_list_users(self, client: AsyncClient, admin_user):
        headers = get_auth_headers(admin_user)
        res = await client.get("/api/v1/users", headers=headers)
        assert res.status_code == 200

    async def test_user_cannot_change_roles(self, client: AsyncClient, test_user, admin_user):
        headers = get_auth_headers(test_user)
        res = await client.put(
            f"/api/v1/users/{admin_user.id}/role",
            headers=headers,
            json={"role": "super_admin"},
        )
        assert res.status_code == 403

    async def test_super_admin_can_list_all_orgs(self, client: AsyncClient, super_admin):
        headers = get_auth_headers(super_admin)
        res = await client.get("/api/v1/organisations", headers=headers)
        assert res.status_code == 200