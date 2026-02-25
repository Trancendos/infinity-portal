"""Tests for the App Store / Marketplace router."""
import pytest
from tests.conftest import get_auth_headers


@pytest.mark.asyncio
async def test_list_categories(client, test_user):
    headers = get_auth_headers(test_user)
    resp = await client.get("/api/v1/appstore/categories", headers=headers)
    assert resp.status_code == 200
    categories = resp.json()
    assert isinstance(categories, list)
    assert len(categories) >= 5
    slugs = [c["slug"] for c in categories]
    assert "productivity" in slugs
    assert "developer" in slugs
    assert "ai" in slugs


@pytest.mark.asyncio
async def test_submit_module(client, admin_user):
    headers = get_auth_headers(admin_user)
    data = {
        "module_id": "com.test.calculator",
        "name": "Calculator",
        "version": "1.0.0",
        "description": "A simple calculator app for Infinity OS with basic arithmetic operations.",
        "author": "Test Author",
        "icon_url": "https://cdn.simpleicons.org/calculator",
        "entry_point": "/modules/calculator/index.js",
        "category": "utilities",
        "permissions": ["clipboard"],
        "keywords": ["math", "calculator"],
    }
    resp = await client.post("/api/v1/appstore/submit", json=data, headers=headers)
    assert resp.status_code == 201
    body = resp.json()
    assert body["module_id"] == "com.test.calculator"
    assert body["status"] == "pending"


@pytest.mark.asyncio
async def test_submit_duplicate_module(client, admin_user):
    headers = get_auth_headers(admin_user)
    data = {
        "module_id": "com.test.duplicate",
        "name": "Duplicate Test",
        "version": "1.0.0",
        "description": "Testing duplicate submission prevention in the app store.",
        "author": "Test",
        "entry_point": "/modules/dup/index.js",
        "category": "utilities",
    }
    resp1 = await client.post("/api/v1/appstore/submit", json=data, headers=headers)
    assert resp1.status_code == 201

    resp2 = await client.post("/api/v1/appstore/submit", json=data, headers=headers)
    assert resp2.status_code == 409


@pytest.mark.asyncio
async def test_list_listings(client, test_user):
    headers = get_auth_headers(test_user)
    resp = await client.get("/api/v1/appstore/listings", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert "listings" in body
    assert "total" in body
    assert "page" in body
    assert "total_pages" in body


@pytest.mark.asyncio
async def test_list_listings_with_category_filter(client, test_user):
    headers = get_auth_headers(test_user)
    resp = await client.get("/api/v1/appstore/listings?category=utilities", headers=headers)
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_list_listings_with_search(client, test_user):
    headers = get_auth_headers(test_user)
    resp = await client.get("/api/v1/appstore/listings?search=calculator", headers=headers)
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_install_module(client, admin_user):
    headers = get_auth_headers(admin_user)
    data = {
        "module_id": "com.test.installable",
        "name": "Installable App",
        "version": "1.0.0",
        "description": "An app specifically created for testing the install flow.",
        "author": "Test",
        "entry_point": "/modules/installable/index.js",
        "category": "productivity",
    }
    submit_resp = await client.post("/api/v1/appstore/submit", json=data, headers=headers)
    assert submit_resp.status_code == 201

    install_resp = await client.post(
        "/api/v1/appstore/install/com.test.installable",
        json={"granted_permissions": []},
        headers=headers,
    )
    assert install_resp.status_code in [200, 201]


@pytest.mark.asyncio
async def test_get_installed_modules(client, test_user):
    headers = get_auth_headers(test_user)
    resp = await client.get("/api/v1/appstore/installed", headers=headers)
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


@pytest.mark.asyncio
async def test_submit_containerised_module(client, admin_user):
    headers = get_auth_headers(admin_user)
    data = {
        "module_id": "com.test.docker-app",
        "name": "Docker App",
        "version": "1.0.0",
        "description": "A containerised application running in Docker with resource limits.",
        "author": "Test",
        "entry_point": "iframe:http://localhost:8080",
        "category": "developer",
        "container_image": "ghcr.io/test/docker-app:latest",
        "container_port": 8080,
        "container_env": {"NODE_ENV": "production"},
        "container_resources": {"cpu": "0.5", "memory": "256Mi"},
    }
    resp = await client.post("/api/v1/appstore/submit", json=data, headers=headers)
    assert resp.status_code == 201
    body = resp.json()
    assert body["is_containerised"] is True


@pytest.mark.asyncio
async def test_appstore_stats(client, admin_user):
    headers = get_auth_headers(admin_user)
    resp = await client.get("/api/v1/appstore/stats", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert "total_modules" in body
    assert "total_installations" in body


@pytest.mark.asyncio
async def test_review_module_forbidden_for_user(client, test_user):
    headers = get_auth_headers(test_user)
    resp = await client.post(
        "/api/v1/appstore/review/com.test.something",
        json={"action": "approve"},
        headers=headers,
    )
    assert resp.status_code == 403