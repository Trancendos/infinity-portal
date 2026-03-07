# tests/test_cornelius.py — Cornelius AI Orchestrator tests
import pytest
from httpx import AsyncClient
from tests.conftest import get_auth_headers


@pytest.mark.asyncio
async def test_orchestrate_task(client: AsyncClient, admin_user):
    """Cornelius can orchestrate a task across agents."""
    headers = get_auth_headers(admin_user)
    resp = await client.post(
        "/api/v1/cornelius/orchestrate",
        json={
            "prompt": "Scan the codebase for security vulnerabilities",
            "context": {"lane": "ai_nexus", "priority": "high"},
        },
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "task_id" in data
    assert "agents" in data or "subtasks" in data
    assert data["status"] in ("completed", "in_progress", "pending")


@pytest.mark.asyncio
async def test_analyze_intent(client: AsyncClient, admin_user):
    """Cornelius can analyze user intent."""
    headers = get_auth_headers(admin_user)
    resp = await client.post(
        "/api/v1/cornelius/analyze-intent",
        json={"text": "I need to deploy the application to production"},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "primary_intent" in data
    assert "confidence" in data


@pytest.mark.asyncio
async def test_list_agents(client: AsyncClient, admin_user):
    """Can list registered agents."""
    headers = get_auth_headers(admin_user)
    resp = await client.get("/api/v1/cornelius/agents", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "agents" in data


@pytest.mark.asyncio
async def test_agent_status(client: AsyncClient, admin_user):
    """Can get status of all agents."""
    headers = get_auth_headers(admin_user)
    resp = await client.get("/api/v1/cornelius/agents/status", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "agents" in data
    assert "total_agents" in data


@pytest.mark.asyncio
async def test_register_agent(client: AsyncClient, admin_user):
    """Can register a new agent."""
    headers = get_auth_headers(admin_user)
    resp = await client.post(
        "/api/v1/cornelius/agents/register",
        json={
            "name": "test_agent_reg",
            "capabilities": ["testing", "validation"],
            "lane": "ai_nexus",
        },
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    # Response may wrap in agent key or return directly
    agent = data.get("agent", data)
    assert agent.get("name") == "test_agent_reg" or "registered" in str(data).lower()


@pytest.mark.asyncio
async def test_mesh_topology(client: AsyncClient, admin_user):
    """Can retrieve mesh topology."""
    headers = get_auth_headers(admin_user)
    resp = await client.get("/api/v1/cornelius/mesh/topology", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "nodes" in data
    assert "edges" in data


@pytest.mark.asyncio
async def test_get_task(client: AsyncClient, admin_user):
    """Can retrieve a task by ID after orchestration."""
    headers = get_auth_headers(admin_user)
    orch_resp = await client.post(
        "/api/v1/cornelius/orchestrate",
        json={"prompt": "Analyze code quality"},
        headers=headers,
    )
    task_id = orch_resp.json()["task_id"]

    resp = await client.get(f"/api/v1/cornelius/tasks/{task_id}", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["task_id"] == task_id