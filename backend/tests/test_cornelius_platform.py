"""Tests for Cornelius Intelligent Platform Orchestrator — Phase 22"""
import pytest
from httpx import AsyncClient
from tests.conftest import get_auth_headers


@pytest.mark.asyncio
async def test_manage_platform_health(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    resp = await client.post("/api/v1/cornelius/manage-platform", json={
        "command": "Check platform health and status",
    }, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "completed"
    assert data["primary_agent"] == "the_dr"
    assert data["total_subtasks"] >= 1
    assert "command_id" in data
    assert data["routing_confidence"] > 0


@pytest.mark.asyncio
async def test_manage_platform_security(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    resp = await client.post("/api/v1/cornelius/manage-platform", json={
        "command": "Run a security scan and vulnerability audit",
        "urgency": "high",
    }, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "completed"
    assert any(st["agent"] == "norman" for st in data["subtasks"])


@pytest.mark.asyncio
async def test_manage_platform_deploy(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    resp = await client.post("/api/v1/cornelius/manage-platform", json={
        "command": "Build and deploy the latest release",
    }, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert any(st["agent"] == "devocity" for st in data["subtasks"])


@pytest.mark.asyncio
async def test_manage_platform_maintenance(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    resp = await client.post("/api/v1/cornelius/manage-platform", json={
        "command": "Clean up temp files and optimize the database",
    }, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_subtasks"] >= 1


@pytest.mark.asyncio
async def test_delegate_repair(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    resp = await client.post("/api/v1/cornelius/delegate-repair", json={
        "target": "cache_service",
        "issue_description": "Cache is returning stale data",
    }, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["delegated_to"] == "the_dr"
    assert data["status"] == "delegated"
    assert "risk_level" in data
    assert "safety_constraints" in data
    assert "delegation_id" in data


@pytest.mark.asyncio
async def test_delegate_repair_high_risk(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    resp = await client.post("/api/v1/cornelius/delegate-repair", json={
        "target": "database",
        "issue_description": "Database connection pool exhausted in production",
        "auto_apply": True,
    }, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["risk_level"] == "high"
    assert data["safety_constraints"]["require_approval"] is True
    assert data["auto_apply"] is False


@pytest.mark.asyncio
async def test_delegate_build(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    resp = await client.post("/api/v1/cornelius/delegate-build", json={
        "build_target": "production",
    }, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["delegated_to"] == "devocity"
    assert data["status"] == "delegated"
    assert len(data["pipeline_steps"]) >= 5


@pytest.mark.asyncio
async def test_platform_overview(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    resp = await client.get("/api/v1/cornelius/platform-overview", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "agents" in data
    assert data["total_agents"] >= 3
    assert "task_metrics" in data
    assert "lanes" in data
    assert "capabilities" in data
    assert data["active_agents"] >= 1


@pytest.mark.asyncio
async def test_adaptive_response_anomaly(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    resp = await client.post("/api/v1/cornelius/adaptive-response", json={
        "event_type": "anomaly",
        "event_data": {"metric": "cpu_usage", "value": 95},
        "severity": "warning",
    }, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "resolved"
    assert "the_dr" in data["responding_agents"]
    assert data["total_actions"] >= 2


@pytest.mark.asyncio
async def test_adaptive_response_security_emergency(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    resp = await client.post("/api/v1/cornelius/adaptive-response", json={
        "event_type": "security_alert",
        "event_data": {"threat": "brute_force_attack"},
        "severity": "emergency",
    }, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "escalated"
    assert data["escalation_strategy"] == "lockdown"


@pytest.mark.asyncio
async def test_adaptive_response_service_down(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    resp = await client.post("/api/v1/cornelius/adaptive-response", json={
        "event_type": "service_down", "severity": "critical",
    }, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["escalation_strategy"] == "immediate_repair"


@pytest.mark.asyncio
async def test_schedule_task(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    resp = await client.post("/api/v1/cornelius/schedule-task", json={
        "name": "nightly-cleanup", "task_type": "cleanup",
        "schedule": "0 2 * * *", "target_agent": "the_dr",
    }, headers=headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "nightly-cleanup"
    assert data["enabled"] is True
    assert "task_id" in data


@pytest.mark.asyncio
async def test_list_scheduled_tasks(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    await client.post("/api/v1/cornelius/schedule-task", json={
        "name": "test-task", "task_type": "health_check", "schedule": "every 1h",
    }, headers=headers)
    resp = await client.get("/api/v1/cornelius/scheduled-tasks", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["total"] >= 1


@pytest.mark.asyncio
async def test_delete_scheduled_task(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    create = await client.post("/api/v1/cornelius/schedule-task", json={
        "name": "delete-me", "task_type": "backup", "schedule": "every 24h",
    }, headers=headers)
    task_id = create.json()["task_id"]
    resp = await client.delete(f"/api/v1/cornelius/scheduled-tasks/{task_id}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "deleted"


@pytest.mark.asyncio
async def test_scheduled_task_not_found(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    resp = await client.delete("/api/v1/cornelius/scheduled-tasks/nonexistent", headers=headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_agent_capabilities(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    resp = await client.get("/api/v1/cornelius/agent-capabilities", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "the_dr" in data["agents"]
    assert "norman" in data["agents"]
    assert data["total_agents"] >= 5
    assert data["routing_keywords"] >= 10