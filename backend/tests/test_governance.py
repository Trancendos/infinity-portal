# tests/test_governance.py — Governance Routers Test Suite
"""
Tests for the 4 Governance routers:
  - The Citadel (citadel.py) — Strategic Ops
  - Think Tank (think_tank.py) — R&D Centre
  - ChronosSphere (chronossphere.py) — Time Management
  - DevOcity (devocity.py) — DevOps Operations
"""

import pytest
from httpx import AsyncClient
from tests.conftest import get_auth_headers


# ══════════════════════════════════════════════════════════════════
# THE CITADEL — Strategic Ops
# ══════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_citadel_list_directives_empty(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/citadel/directives", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert "items" in data
    assert data["total"] >= 0


@pytest.mark.asyncio
async def test_citadel_issue_directive(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    payload = {
        "title": "Ecosystem Security Lockdown",
        "description": "Enforce full security audit across all lanes",
        "priority": "critical",
        "scope": "ecosystem",
    }
    r = await client.post("/api/v1/citadel/directives", json=payload, headers=headers)
    assert r.status_code == 201
    data = r.json()
    assert data["title"] == "Ecosystem Security Lockdown"
    assert data["priority"] == "critical"
    assert data["status"] == "active"
    assert "id" in data


@pytest.mark.asyncio
async def test_citadel_get_directive(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    payload = {"title": "Test Directive Alpha", "priority": "high"}
    r = await client.post("/api/v1/citadel/directives", json=payload, headers=headers)
    assert r.status_code == 201
    did = r.json()["id"]
    r = await client.get(f"/api/v1/citadel/directives/{did}", headers=headers)
    assert r.status_code == 200
    assert r.json()["id"] == did


@pytest.mark.asyncio
async def test_citadel_get_directive_404(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/citadel/directives/nonexistent", headers=headers)
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_citadel_revoke_directive(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    payload = {"title": "Revocable Directive"}
    r = await client.post("/api/v1/citadel/directives", json=payload, headers=headers)
    did = r.json()["id"]
    r = await client.delete(f"/api/v1/citadel/directives/{did}", headers=headers)
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_citadel_revoke_directive_404(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.delete("/api/v1/citadel/directives/nonexistent", headers=headers)
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_citadel_create_initiative(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    payload = {
        "name": "Lane 3 Expansion",
        "description": "Expand Hive data layer capacity",
        "status": "proposed",
        "owner": "trancendos",
    }
    r = await client.post("/api/v1/citadel/initiatives", json=payload, headers=headers)
    assert r.status_code == 201
    data = r.json()
    assert data["name"] == "Lane 3 Expansion"
    assert "id" in data


@pytest.mark.asyncio
async def test_citadel_list_initiatives(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/citadel/initiatives", headers=headers)
    assert r.status_code == 200
    assert r.json()["total"] >= 0


@pytest.mark.asyncio
async def test_citadel_get_initiative(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    payload = {"name": "Fetchable Initiative"}
    r = await client.post("/api/v1/citadel/initiatives", json=payload, headers=headers)
    iid = r.json()["id"]
    r = await client.get(f"/api/v1/citadel/initiatives/{iid}", headers=headers)
    assert r.status_code == 200
    assert r.json()["id"] == iid


@pytest.mark.asyncio
async def test_citadel_initiative_404(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/citadel/initiatives/nonexistent", headers=headers)
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_citadel_fortress_status(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/citadel/fortress-status", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert "security_level" in data


@pytest.mark.asyncio
async def test_citadel_update_fortress_status(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    payload = {"security_level": "red", "reason": "Elevated threat detected"}
    r = await client.put("/api/v1/citadel/fortress-status", json=payload, headers=headers)
    assert r.status_code == 200
    assert r.json()["security_level"] == "red"


@pytest.mark.asyncio
async def test_citadel_audit_log(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/citadel/audit-log", headers=headers)
    assert r.status_code == 200
    assert "items" in r.json()


# ══════════════════════════════════════════════════════════════════
# THINK TANK — R&D Centre
# ══════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_think_tank_list_projects_empty(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/think-tank/projects", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert "items" in data


@pytest.mark.asyncio
async def test_think_tank_create_project(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    payload = {
        "name": "Quantum Mesh Networking",
        "description": "Research quantum-safe mesh protocols",
        "domain": "infrastructure",
    }
    r = await client.post("/api/v1/think-tank/projects", json=payload, headers=headers)
    assert r.status_code == 201
    data = r.json()
    assert data["name"] == "Quantum Mesh Networking"
    assert data["domain"] == "infrastructure"
    assert "id" in data


@pytest.mark.asyncio
async def test_think_tank_get_project(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    payload = {"name": "AI Ethics Framework", "domain": "governance"}
    r = await client.post("/api/v1/think-tank/projects", json=payload, headers=headers)
    assert r.status_code == 201
    pid = r.json()["id"]
    r = await client.get(f"/api/v1/think-tank/projects/{pid}", headers=headers)
    assert r.status_code == 200
    assert r.json()["id"] == pid


@pytest.mark.asyncio
async def test_think_tank_get_project_404(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/think-tank/projects/nonexistent", headers=headers)
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_think_tank_run_experiment(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    # Create project first
    proj = {"name": "Experiment Host Project"}
    r = await client.post("/api/v1/think-tank/projects", json=proj, headers=headers)
    assert r.status_code == 201
    pid = r.json()["id"]
    # Run experiment
    payload = {
        "name": "Latency Benchmark v1",
        "project_id": pid,
        "description": "Sub-10ms response under load test",
        "expected_outcome": "Latency stays below 10ms at 10k concurrent",
    }
    r = await client.post("/api/v1/think-tank/experiments", json=payload, headers=headers)
    assert r.status_code == 201
    data = r.json()
    assert data["project_id"] == pid
    assert "id" in data


@pytest.mark.asyncio
async def test_think_tank_list_experiments(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/think-tank/experiments", headers=headers)
    assert r.status_code == 200
    assert "items" in r.json()


@pytest.mark.asyncio
async def test_think_tank_get_experiment_404(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/think-tank/experiments/nonexistent", headers=headers)
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_think_tank_submit_proposal(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    payload = {
        "title": "Decentralised Identity Layer",
        "abstract": "Implement DID-based auth across ecosystem",
        "impact_assessment": "high",
    }
    r = await client.post("/api/v1/think-tank/proposals", json=payload, headers=headers)
    assert r.status_code == 201
    data = r.json()
    assert data["impact_assessment"] == "high"


@pytest.mark.asyncio
async def test_think_tank_list_proposals(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/think-tank/proposals", headers=headers)
    assert r.status_code == 200
    assert "items" in r.json()


@pytest.mark.asyncio
async def test_think_tank_get_proposal_404(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/think-tank/proposals/nonexistent", headers=headers)
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_think_tank_overview(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/think-tank/overview", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert "total_projects" in data
    assert "total_experiments" in data
    assert "total_proposals" in data


# ══════════════════════════════════════════════════════════════════
# CHRONOSSPHERE — Time Management
# ══════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_chrono_list_schedules_empty(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/chronossphere/schedules", headers=headers)
    assert r.status_code == 200
    assert "items" in r.json()


@pytest.mark.asyncio
async def test_chrono_create_schedule(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    payload = {
        "title": "Daily Ecosystem Health Check",
        "description": "Run full health scan every morning",
        "scheduled_at": "2061-01-01T08:00:00Z",
        "duration_minutes": 60,
        "recurrence": "daily",
        "priority": "high",
    }
    r = await client.post("/api/v1/chronossphere/schedules", json=payload, headers=headers)
    assert r.status_code == 201
    data = r.json()
    assert data["title"] == "Daily Ecosystem Health Check"
    assert "id" in data


@pytest.mark.asyncio
async def test_chrono_get_schedule(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    payload = {
        "title": "Weekly Backup",
        "scheduled_at": "2061-01-07T02:00:00Z",
    }
    r = await client.post("/api/v1/chronossphere/schedules", json=payload, headers=headers)
    assert r.status_code == 201
    sid = r.json()["id"]
    r = await client.get(f"/api/v1/chronossphere/schedules/{sid}", headers=headers)
    assert r.status_code == 200
    assert r.json()["id"] == sid


@pytest.mark.asyncio
async def test_chrono_get_schedule_404(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/chronossphere/schedules/nonexistent", headers=headers)
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_chrono_cancel_schedule(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    payload = {
        "title": "Cancellable Schedule",
        "scheduled_at": "2061-06-01T00:00:00Z",
    }
    r = await client.post("/api/v1/chronossphere/schedules", json=payload, headers=headers)
    assert r.status_code == 201
    sid = r.json()["id"]
    r = await client.delete(f"/api/v1/chronossphere/schedules/{sid}", headers=headers)
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_chrono_cancel_schedule_404(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.delete("/api/v1/chronossphere/schedules/nonexistent", headers=headers)
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_chrono_set_deadline(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    payload = {
        "title": "Phase 19 Completion",
        "due_at": "2061-06-01T00:00:00Z",
        "severity": "critical",
    }
    r = await client.post("/api/v1/chronossphere/deadlines", json=payload, headers=headers)
    assert r.status_code == 201
    data = r.json()
    assert data["severity"] == "critical"


@pytest.mark.asyncio
async def test_chrono_list_deadlines(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/chronossphere/deadlines", headers=headers)
    assert r.status_code == 200
    assert "items" in r.json()


@pytest.mark.asyncio
async def test_chrono_get_deadline_404(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/chronossphere/deadlines/nonexistent", headers=headers)
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_chrono_create_temporal_rule(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    payload = {
        "name": "Auto-Scale on Peak",
        "trigger_type": "event",
        "trigger_value": "cpu_usage > 80%",
        "action": "scale_up",
    }
    r = await client.post("/api/v1/chronossphere/rules", json=payload, headers=headers)
    assert r.status_code == 201
    data = r.json()
    assert data["trigger_type"] == "event"


@pytest.mark.asyncio
async def test_chrono_list_rules(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/chronossphere/rules", headers=headers)
    assert r.status_code == 200
    assert "items" in r.json()


@pytest.mark.asyncio
async def test_chrono_get_rule_404(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/chronossphere/rules/nonexistent", headers=headers)
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_chrono_timeline(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/chronossphere/timeline", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert "items" in data
    assert "total" in data


@pytest.mark.asyncio
async def test_chrono_overview(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/chronossphere/overview", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert "total_schedules" in data
    assert "total_deadlines" in data
    assert "total_rules" in data


# ══════════════════════════════════════════════════════════════════
# DEVOCITY — DevOps Operations
# ══════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_devocity_list_pipelines_empty(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/devocity/pipelines", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert "items" in data
    assert data["total"] >= 0


@pytest.mark.asyncio
async def test_devocity_create_pipeline(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    payload = {
        "name": "Infinity Portal CI",
        "repository": "github.com/trancendos/infinity-portal",
        "branch": "main",
        "stages": ["lint", "test", "build", "deploy"],
    }
    r = await client.post("/api/v1/devocity/pipelines", json=payload, headers=headers)
    assert r.status_code == 201
    data = r.json()
    assert data["name"] == "Infinity Portal CI"
    assert data["status"] == "pending"
    assert data["runs"] == 0
    assert "id" in data


@pytest.mark.asyncio
async def test_devocity_get_pipeline(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    payload = {"name": "Test Pipeline", "repository": "repo/test"}
    r = await client.post("/api/v1/devocity/pipelines", json=payload, headers=headers)
    pid = r.json()["id"]
    r = await client.get(f"/api/v1/devocity/pipelines/{pid}", headers=headers)
    assert r.status_code == 200
    assert r.json()["id"] == pid


@pytest.mark.asyncio
async def test_devocity_get_pipeline_404(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/devocity/pipelines/nonexistent", headers=headers)
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_devocity_trigger_pipeline(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    payload = {"name": "Triggerable Pipeline", "repository": "repo/trigger"}
    r = await client.post("/api/v1/devocity/pipelines", json=payload, headers=headers)
    pid = r.json()["id"]
    r = await client.post(f"/api/v1/devocity/pipelines/{pid}/trigger", headers=headers)
    assert r.status_code == 200
    assert r.json()["run_number"] == 1
    # Trigger again
    r = await client.post(f"/api/v1/devocity/pipelines/{pid}/trigger", headers=headers)
    assert r.json()["run_number"] == 2


@pytest.mark.asyncio
async def test_devocity_trigger_pipeline_404(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.post("/api/v1/devocity/pipelines/nonexistent/trigger", headers=headers)
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_devocity_delete_pipeline(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    payload = {"name": "Deletable Pipeline", "repository": "repo/delete"}
    r = await client.post("/api/v1/devocity/pipelines", json=payload, headers=headers)
    pid = r.json()["id"]
    r = await client.delete(f"/api/v1/devocity/pipelines/{pid}", headers=headers)
    assert r.status_code == 200
    # Confirm gone
    r = await client.get(f"/api/v1/devocity/pipelines/{pid}", headers=headers)
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_devocity_delete_pipeline_404(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.delete("/api/v1/devocity/pipelines/nonexistent", headers=headers)
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_devocity_create_deployment(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    # Create pipeline first
    pipe = {"name": "Deploy Source Pipeline", "repository": "repo/deploy"}
    r = await client.post("/api/v1/devocity/pipelines", json=pipe, headers=headers)
    pid = r.json()["id"]
    # Create deployment
    payload = {
        "pipeline_id": pid,
        "environment": "staging",
        "version": "v2.1.0",
        "notes": "Pre-release staging deployment",
        "rollback_version": "v2.0.9",
    }
    r = await client.post("/api/v1/devocity/deployments", json=payload, headers=headers)
    assert r.status_code == 201
    data = r.json()
    assert data["environment"] == "staging"
    assert data["version"] == "v2.1.0"
    assert data["status"] == "deployed"


@pytest.mark.asyncio
async def test_devocity_create_deployment_pipeline_404(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    payload = {
        "pipeline_id": "nonexistent",
        "environment": "dev",
        "version": "v0.0.1",
    }
    r = await client.post("/api/v1/devocity/deployments", json=payload, headers=headers)
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_devocity_list_deployments(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/devocity/deployments", headers=headers)
    assert r.status_code == 200
    assert "items" in r.json()


@pytest.mark.asyncio
async def test_devocity_get_deployment_404(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/devocity/deployments/nonexistent", headers=headers)
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_devocity_rollback_deployment(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    # Create pipeline + deployment with rollback version
    pipe = {"name": "Rollback Pipeline", "repository": "repo/rollback"}
    r = await client.post("/api/v1/devocity/pipelines", json=pipe, headers=headers)
    pid = r.json()["id"]
    dep = {
        "pipeline_id": pid,
        "environment": "production",
        "version": "v3.0.0",
        "rollback_version": "v2.9.0",
    }
    r = await client.post("/api/v1/devocity/deployments", json=dep, headers=headers)
    did = r.json()["id"]
    # Rollback
    r = await client.post(f"/api/v1/devocity/deployments/{did}/rollback", headers=headers)
    assert r.status_code == 200
    assert r.json()["version"] == "v2.9.0"


@pytest.mark.asyncio
async def test_devocity_rollback_no_version(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    pipe = {"name": "No Rollback Pipeline", "repository": "repo/norollback"}
    r = await client.post("/api/v1/devocity/pipelines", json=pipe, headers=headers)
    pid = r.json()["id"]
    dep = {
        "pipeline_id": pid,
        "environment": "dev",
        "version": "v1.0.0",
    }
    r = await client.post("/api/v1/devocity/deployments", json=dep, headers=headers)
    did = r.json()["id"]
    r = await client.post(f"/api/v1/devocity/deployments/{did}/rollback", headers=headers)
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_devocity_rollback_404(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.post("/api/v1/devocity/deployments/nonexistent/rollback", headers=headers)
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_devocity_provision_environment(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    payload = {
        "name": "staging-eu-west",
        "env_type": "staging",
        "region": "eu-west-1",
        "resources": {"cpu": 4, "memory_gb": 16},
    }
    r = await client.post("/api/v1/devocity/environments", json=payload, headers=headers)
    assert r.status_code == 201
    data = r.json()
    assert data["name"] == "staging-eu-west"
    assert data["status"] == "provisioning"


@pytest.mark.asyncio
async def test_devocity_list_environments(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/devocity/environments", headers=headers)
    assert r.status_code == 200
    assert "items" in r.json()


@pytest.mark.asyncio
async def test_devocity_get_environment_404(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/devocity/environments/nonexistent", headers=headers)
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_devocity_update_environment_status(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    payload = {"name": "health-check-env", "env_type": "dev", "region": "us-east-1"}
    r = await client.post("/api/v1/devocity/environments", json=payload, headers=headers)
    eid = r.json()["id"]
    r = await client.put(f"/api/v1/devocity/environments/{eid}/status?status=healthy", headers=headers)
    assert r.status_code == 200
    assert r.json()["status"] == "healthy"


@pytest.mark.asyncio
async def test_devocity_update_environment_status_404(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.put("/api/v1/devocity/environments/nonexistent/status?status=healthy", headers=headers)
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_devocity_health(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/devocity/health", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert "overall" in data
    assert "checks" in data


@pytest.mark.asyncio
async def test_devocity_overview(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/devocity/overview", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert "pipelines_total" in data
    assert "deployments_total" in data
    assert "environments_total" in data


@pytest.mark.asyncio
async def test_devocity_audit_log(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/devocity/audit", headers=headers)
    assert r.status_code == 200
    assert "items" in r.json()