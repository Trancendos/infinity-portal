"""Tests for ITSM Router — Incidents, Problems, Changes, SLAs, CMDB"""
import pytest
from httpx import AsyncClient, ASGITransport
from tests.conftest import get_auth_headers


@pytest.mark.asyncio
async def test_create_incident(client: AsyncClient, test_user, db_session):
    headers = get_auth_headers(test_user)
    r = await client.post("/api/v1/itsm/incidents", json={
        "title": "Server down in prod",
        "severity": "P1",
        "description": "Main API server unresponsive",
        "category": "infrastructure",
    }, headers=headers)
    assert r.status_code == 201
    data = r.json()
    assert data["title"] == "Server down in prod"
    assert data["severity"] == "P1"
    assert "key" in data
    assert data["key"].startswith("INC-")


@pytest.mark.asyncio
async def test_list_incidents(client: AsyncClient, test_user, db_session):
    headers = get_auth_headers(test_user)
    # Create two incidents
    await client.post("/api/v1/itsm/incidents", json={"title": "Incident A", "severity": "P2"}, headers=headers)
    await client.post("/api/v1/itsm/incidents", json={"title": "Incident B", "severity": "P3"}, headers=headers)
    r = await client.get("/api/v1/itsm/incidents", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert data["total"] >= 2
    assert len(data["items"]) >= 2


@pytest.mark.asyncio
async def test_update_incident_status(client: AsyncClient, test_user, db_session):
    headers = get_auth_headers(test_user)
    r = await client.post("/api/v1/itsm/incidents", json={"title": "Needs update"}, headers=headers)
    inc_id = r.json()["id"]
    r2 = await client.patch(f"/api/v1/itsm/incidents/{inc_id}", json={"status": "acknowledged"}, headers=headers)
    assert r2.status_code == 200


@pytest.mark.asyncio
async def test_resolve_incident(client: AsyncClient, test_user, db_session):
    headers = get_auth_headers(test_user)
    r = await client.post("/api/v1/itsm/incidents", json={"title": "To resolve"}, headers=headers)
    inc_id = r.json()["id"]
    r2 = await client.post(f"/api/v1/itsm/incidents/{inc_id}/resolve", json={"resolution": "Fixed the config"}, headers=headers)
    assert r2.status_code == 200


@pytest.mark.asyncio
async def test_get_incident_detail(client: AsyncClient, test_user, db_session):
    headers = get_auth_headers(test_user)
    r = await client.post("/api/v1/itsm/incidents", json={"title": "Detail test", "severity": "P2"}, headers=headers)
    inc_id = r.json()["id"]
    r2 = await client.get(f"/api/v1/itsm/incidents/{inc_id}", headers=headers)
    assert r2.status_code == 200
    assert r2.json()["title"] == "Detail test"


@pytest.mark.asyncio
async def test_create_problem(client: AsyncClient, test_user, db_session):
    headers = get_auth_headers(test_user)
    r = await client.post("/api/v1/itsm/problems", json={"title": "Recurring DB timeout"}, headers=headers)
    assert r.status_code == 201
    assert r.json()["title"] == "Recurring DB timeout"


@pytest.mark.asyncio
async def test_create_change(client: AsyncClient, test_user, db_session):
    headers = get_auth_headers(test_user)
    r = await client.post("/api/v1/itsm/changes", json={
        "title": "Upgrade PostgreSQL to 16",
        "change_type": "normal",
        "risk_level": "medium",
    }, headers=headers)
    assert r.status_code == 201
    assert r.json()["status"] == "draft"


@pytest.mark.asyncio
async def test_create_sla(client: AsyncClient, admin_user, db_session):
    headers = get_auth_headers(admin_user)
    r = await client.post("/api/v1/itsm/sla-definitions", json={
        "name": "P1 SLA", "priority": "P1",
        "response_time_mins": 15, "resolution_time_mins": 60,
    }, headers=headers)
    assert r.status_code == 201


@pytest.mark.asyncio
async def test_create_cmdb_item(client: AsyncClient, test_user, db_session):
    headers = get_auth_headers(test_user)
    r = await client.post("/api/v1/itsm/cmdb", json={
        "name": "API Gateway", "ci_type": "service", "environment": "production",
    }, headers=headers)
    assert r.status_code == 201
    assert r.json()["name"] == "API Gateway"