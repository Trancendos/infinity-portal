"""Tests for PRINCE2 Gates Router — Projects, Gates, Reviews"""
import pytest
from httpx import AsyncClient
from tests.conftest import get_auth_headers


@pytest.mark.asyncio
async def test_create_project(client: AsyncClient, test_user, db_session):
    headers = get_auth_headers(test_user)
    r = await client.post("/api/v1/gates/projects", json={
        "name": "Infinity OS v4.0",
        "description": "Major platform upgrade",
    }, headers=headers)
    assert r.status_code == 201
    data = r.json()
    assert data["name"] == "Infinity OS v4.0"
    assert data["key"].startswith("PRJ-")
    assert data["current_gate"] == 0


@pytest.mark.asyncio
async def test_list_projects(client: AsyncClient, test_user, db_session):
    headers = get_auth_headers(test_user)
    await client.post("/api/v1/gates/projects", json={"name": "Project Alpha"}, headers=headers)
    r = await client.get("/api/v1/gates/projects", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert data["total"] >= 1


@pytest.mark.asyncio
async def test_get_project_detail(client: AsyncClient, test_user, db_session):
    headers = get_auth_headers(test_user)
    r = await client.post("/api/v1/gates/projects", json={"name": "Detail Test"}, headers=headers)
    pid = r.json()["id"]
    r2 = await client.get(f"/api/v1/gates/projects/{pid}", headers=headers)
    assert r2.status_code == 200
    data = r2.json()
    assert data["name"] == "Detail Test"
    assert "gates" in data
    assert len(data["gates"]) == 7
    # Gate 0 should have criteria
    gate0 = data["gates"][0]
    assert gate0["gate_number"] == 0
    assert len(gate0["criteria"]) >= 3


@pytest.mark.asyncio
async def test_verify_criteria(client: AsyncClient, test_user, db_session):
    headers = get_auth_headers(test_user)
    r = await client.post("/api/v1/gates/projects", json={"name": "Criteria Test"}, headers=headers)
    pid = r.json()["id"]
    # Get project detail to find criteria IDs
    r2 = await client.get(f"/api/v1/gates/projects/{pid}", headers=headers)
    gate0 = r2.json()["gates"][0]
    criteria_id = gate0["criteria"][0]["id"]
    # Verify the criteria
    r3 = await client.post(f"/api/v1/gates/projects/{pid}/gates/0/criteria/{criteria_id}/verify", headers=headers)
    assert r3.status_code == 200
    assert r3.json()["status"] == "verified"


@pytest.mark.asyncio
async def test_submit_gate_requires_criteria(client: AsyncClient, test_user, db_session):
    headers = get_auth_headers(test_user)
    r = await client.post("/api/v1/gates/projects", json={"name": "Submit Test"}, headers=headers)
    pid = r.json()["id"]
    # Try to submit gate 0 without verifying mandatory criteria
    r2 = await client.post(f"/api/v1/gates/projects/{pid}/gates/0/submit", headers=headers)
    assert r2.status_code == 400
    assert "mandatory" in r2.json()["detail"].lower() or "criteria" in r2.json()["detail"].lower()


@pytest.mark.asyncio
async def test_full_gate_approval_flow(client: AsyncClient, test_user, admin_user, db_session):
    headers = get_auth_headers(test_user)
    admin_headers = get_auth_headers(admin_user)
    # Create project
    r = await client.post("/api/v1/gates/projects", json={"name": "Full Flow"}, headers=headers)
    pid = r.json()["id"]
    # Get and verify all mandatory criteria for gate 0
    r2 = await client.get(f"/api/v1/gates/projects/{pid}", headers=headers)
    gate0 = r2.json()["gates"][0]
    for c in gate0["criteria"]:
        if c["is_mandatory"]:
            await client.post(f"/api/v1/gates/projects/{pid}/gates/0/criteria/{c['id']}/verify", headers=headers)
    # Submit gate 0
    r3 = await client.post(f"/api/v1/gates/projects/{pid}/gates/0/submit", headers=headers)
    assert r3.status_code == 200
    # Review gate 0 (approve)
    r4 = await client.post(f"/api/v1/gates/projects/{pid}/gates/0/review", json={
        "decision": "approve", "comments": "Looks good"
    }, headers=admin_headers)
    assert r4.status_code == 200
    # Verify project advanced to gate 1
    r5 = await client.get(f"/api/v1/gates/projects/{pid}", headers=headers)
    assert r5.json()["current_gate"] == 1


@pytest.mark.asyncio
async def test_gate_velocity_report(client: AsyncClient, test_user, db_session):
    headers = get_auth_headers(test_user)
    # Create a project first so there's data
    await client.post("/api/v1/gates/projects", json={"name": "Report Test"}, headers=headers)
    r = await client.get("/api/v1/gates/reports/gate-velocity", headers=headers)
    assert r.status_code == 200