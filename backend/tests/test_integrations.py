"""Tests for the API Integration Hub router."""
import pytest
from tests.conftest import get_auth_headers


@pytest.mark.asyncio
async def test_list_connectors_empty(client, test_user):
    headers = get_auth_headers(test_user)
    resp = await client.get("/api/v1/integrations/connectors", headers=headers)
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


@pytest.mark.asyncio
async def test_create_connector(client, admin_user):
    headers = get_auth_headers(admin_user)
    data = {
        "name": "Test Slack",
        "slug": "test-slack",
        "description": "Test Slack integration",
        "category": "comms",
        "base_url": "https://slack.com/api",
        "auth_type": "bearer",
        "capabilities": ["send_message", "list_channels"],
    }
    resp = await client.post("/api/v1/integrations/connectors", json=data, headers=headers)
    assert resp.status_code == 201
    body = resp.json()
    assert body["name"] == "Test Slack"
    assert body["slug"] == "test-slack"
    assert body["status"] == "inactive"
    assert "send_message" in body["capabilities"]


@pytest.mark.asyncio
async def test_create_connector_forbidden_for_user(client, test_user):
    headers = get_auth_headers(test_user)
    data = {
        "name": "Forbidden",
        "slug": "forbidden",
        "base_url": "https://example.com",
    }
    resp = await client.post("/api/v1/integrations/connectors", json=data, headers=headers)
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_get_connector(client, admin_user):
    headers = get_auth_headers(admin_user)
    data = {
        "name": "GitHub",
        "slug": "github-test",
        "base_url": "https://api.github.com",
        "category": "devops",
    }
    create_resp = await client.post("/api/v1/integrations/connectors", json=data, headers=headers)
    assert create_resp.status_code == 201
    connector_id = create_resp.json()["id"]

    resp = await client.get(f"/api/v1/integrations/connectors/{connector_id}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["slug"] == "github-test"


@pytest.mark.asyncio
async def test_update_connector(client, admin_user):
    headers = get_auth_headers(admin_user)
    data = {
        "name": "Stripe",
        "slug": "stripe-test",
        "base_url": "https://api.stripe.com",
        "category": "payments",
    }
    create_resp = await client.post("/api/v1/integrations/connectors", json=data, headers=headers)
    connector_id = create_resp.json()["id"]

    resp = await client.patch(
        f"/api/v1/integrations/connectors/{connector_id}",
        json={"status": "active", "rate_limit_rpm": 120},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "active"


@pytest.mark.asyncio
async def test_delete_connector(client, admin_user):
    headers = get_auth_headers(admin_user)
    data = {
        "name": "Temp",
        "slug": "temp-delete",
        "base_url": "https://example.com",
    }
    create_resp = await client.post("/api/v1/integrations/connectors", json=data, headers=headers)
    connector_id = create_resp.json()["id"]

    resp = await client.delete(f"/api/v1/integrations/connectors/{connector_id}", headers=headers)
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_list_templates(client, test_user):
    headers = get_auth_headers(test_user)
    resp = await client.get("/api/v1/integrations/templates", headers=headers)
    assert resp.status_code == 200
    templates = resp.json()
    assert isinstance(templates, list)
    assert len(templates) >= 5
    slugs = [t["slug"] for t in templates]
    assert "slack" in slugs
    assert "github" in slugs


@pytest.mark.asyncio
async def test_install_from_template(client, admin_user):
    headers = get_auth_headers(admin_user)
    resp = await client.post(
        "/api/v1/integrations/connectors/from-template/slack",
        json={},
        headers=headers,
    )
    assert resp.status_code == 201
    assert resp.json()["slug"] == "slack"
    assert resp.json()["is_built_in"] is True


@pytest.mark.asyncio
async def test_connector_health_check(client, admin_user):
    headers = get_auth_headers(admin_user)
    data = {
        "name": "Health Test",
        "slug": "health-test",
        "base_url": "https://httpbin.org",
    }
    create_resp = await client.post("/api/v1/integrations/connectors", json=data, headers=headers)
    connector_id = create_resp.json()["id"]

    resp = await client.post(f"/api/v1/integrations/connectors/{connector_id}/health", headers=headers)
    assert resp.status_code == 200