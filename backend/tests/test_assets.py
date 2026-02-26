"""Tests for Asset Management Router"""
import pytest
from httpx import AsyncClient
from tests.conftest import get_auth_headers


@pytest.mark.asyncio
async def test_create_asset(client: AsyncClient, test_user, db_session):
    headers = get_auth_headers(test_user)
    r = await client.post("/api/v1/assets/", json={
        "name": "Production API Server",
        "asset_type": "hardware",
        "vendor": "Dell",
        "location": "DC-1 Rack 42",
    }, headers=headers)
    assert r.status_code == 201
    data = r.json()
    assert data["name"] == "Production API Server"
    assert data["asset_tag"].startswith("HW-")


@pytest.mark.asyncio
async def test_list_assets(client: AsyncClient, test_user, db_session):
    headers = get_auth_headers(test_user)
    await client.post("/api/v1/assets/", json={"name": "Server A", "asset_type": "hardware"}, headers=headers)
    await client.post("/api/v1/assets/", json={"name": "License B", "asset_type": "license"}, headers=headers)
    r = await client.get("/api/v1/assets/", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert data["total"] >= 2


@pytest.mark.asyncio
async def test_filter_by_type(client: AsyncClient, test_user, db_session):
    headers = get_auth_headers(test_user)
    await client.post("/api/v1/assets/", json={"name": "Cloud VM", "asset_type": "cloud_resource"}, headers=headers)
    r = await client.get("/api/v1/assets/?asset_type=cloud_resource", headers=headers)
    assert r.status_code == 200
    for item in r.json()["items"]:
        assert item["asset_type"] == "cloud_resource"


@pytest.mark.asyncio
async def test_update_asset(client: AsyncClient, test_user, db_session):
    headers = get_auth_headers(test_user)
    r = await client.post("/api/v1/assets/", json={"name": "Old Name", "asset_type": "software"}, headers=headers)
    asset_id = r.json()["id"]
    r2 = await client.patch(f"/api/v1/assets/{asset_id}", json={"name": "New Name", "status": "maintenance"}, headers=headers)
    assert r2.status_code == 200
    assert r2.json()["status"] == "updated"


@pytest.mark.asyncio
async def test_create_relationship(client: AsyncClient, test_user, db_session):
    headers = get_auth_headers(test_user)
    r1 = await client.post("/api/v1/assets/", json={"name": "Server", "asset_type": "hardware"}, headers=headers)
    r2 = await client.post("/api/v1/assets/", json={"name": "App", "asset_type": "software"}, headers=headers)
    r3 = await client.post("/api/v1/assets/relationships", json={
        "parent_id": r1.json()["id"],
        "child_id": r2.json()["id"],
        "relationship_type": "runs_on",
    }, headers=headers)
    assert r3.status_code == 201


@pytest.mark.asyncio
async def test_lifecycle_events(client: AsyncClient, test_user, db_session):
    headers = get_auth_headers(test_user)
    r = await client.post("/api/v1/assets/", json={"name": "Lifecycle Test", "asset_type": "hardware"}, headers=headers)
    asset_id = r.json()["id"]
    # Get asset detail which includes lifecycle_events
    r2 = await client.get(f"/api/v1/assets/{asset_id}", headers=headers)
    assert r2.status_code == 200
    events = r2.json()["lifecycle_events"]
    assert len(events) >= 1  # At least the "created" event
    assert events[0]["event_type"] == "created"


@pytest.mark.asyncio
async def test_schedule_maintenance(client: AsyncClient, test_user, db_session):
    headers = get_auth_headers(test_user)
    r = await client.post("/api/v1/assets/", json={"name": "Maint Target", "asset_type": "hardware"}, headers=headers)
    asset_id = r.json()["id"]
    r2 = await client.post("/api/v1/assets/maintenance", json={
        "asset_id": asset_id,
        "maintenance_type": "preventive",
        "description": "Quarterly check",
        "scheduled_date": "2026-04-01",
    }, headers=headers)
    assert r2.status_code == 201


@pytest.mark.asyncio
async def test_dashboard(client: AsyncClient, test_user, db_session):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/assets/dashboard", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert "total_assets" in data
    assert "by_type" in data
    assert "by_status" in data