# tests/test_federation.py — Federation router tests
import pytest
from httpx import AsyncClient

from tests.conftest import get_auth_headers


@pytest.mark.asyncio
async def test_register_service(client: AsyncClient, admin_user):
    """Admin can register a federated service"""
    headers = get_auth_headers(admin_user)
    resp = await client.post(
        "/api/v1/federation/services",
        json={
            "name": "Norman AI",
            "service_type": "agent",
            "endpoint_url": "https://norman-ai.trancendos.dev",
            "capabilities": ["governance", "compliance-check"],
            "auth_method": "bearer",
            "metadata": {"version": "1.0.0"},
        },
        headers=headers,
    )
    assert resp.status_code in (200, 201)
    data = resp.json()
    assert data["name"] == "Norman AI"
    assert data["service_type"] == "agent"


@pytest.mark.asyncio
async def test_list_services(client: AsyncClient, admin_user):
    """Admin can list federated services"""
    headers = get_auth_headers(admin_user)
    # Register a service first
    await client.post(
        "/api/v1/federation/services",
        json={
            "name": "Guardian AI",
            "service_type": "agent",
            "endpoint_url": "https://guardian-ai.trancendos.dev",
            "capabilities": ["threat-detection"],
        },
        headers=headers,
    )
    resp = await client.get("/api/v1/federation/services", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    services = data.get("services", data) if isinstance(data, dict) else data
    assert len(services) >= 1


@pytest.mark.asyncio
async def test_update_service(client: AsyncClient, admin_user):
    """Admin can update a federated service"""
    headers = get_auth_headers(admin_user)
    create_resp = await client.post(
        "/api/v1/federation/services",
        json={
            "name": "Mercury",
            "service_type": "agent",
            "endpoint_url": "https://mercury.trancendos.dev",
            "capabilities": ["notifications"],
        },
        headers=headers,
    )
    svc_id = create_resp.json()["id"]

    resp = await client.patch(
        f"/api/v1/federation/services/{svc_id}",
        json={"status": "degraded"},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "degraded"


@pytest.mark.asyncio
async def test_delete_service(client: AsyncClient, admin_user):
    """Admin can delete a federated service"""
    headers = get_auth_headers(admin_user)
    create_resp = await client.post(
        "/api/v1/federation/services",
        json={
            "name": "Temp Service",
            "service_type": "external",
            "endpoint_url": "https://temp.trancendos.dev",
            "capabilities": [],
        },
        headers=headers,
    )
    svc_id = create_resp.json()["id"]

    resp = await client.delete(f"/api/v1/federation/services/{svc_id}", headers=headers)
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_ecosystem_map(client: AsyncClient, admin_user):
    """Admin can view the ecosystem map"""
    headers = get_auth_headers(admin_user)
    resp = await client.get("/api/v1/federation/ecosystem", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "services" in data


@pytest.mark.asyncio
async def test_register_service_forbidden_for_regular_user(client: AsyncClient, test_user):
    """Regular users cannot register services"""
    headers = get_auth_headers(test_user)
    resp = await client.post(
        "/api/v1/federation/services",
        json={
            "name": "Forbidden Service",
            "service_type": "agent",
            "endpoint_url": "https://forbidden.dev",
            "capabilities": [],
        },
        headers=headers,
    )
    assert resp.status_code == 403