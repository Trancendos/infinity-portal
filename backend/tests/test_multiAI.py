# tests/test_multiAI.py — Multi-AI Communication tests
import pytest
from httpx import AsyncClient
from tests.conftest import get_auth_headers


@pytest.mark.asyncio
async def test_send_message(client: AsyncClient, admin_user):
    """Can send a message between agents."""
    headers = get_auth_headers(admin_user)
    resp = await client.post(
        "/api/v1/multi-ai/message",
        json={
            "from_agent": "cornelius",
            "to_agent": "norman",
            "message_type": "request",
            "payload": {"action": "scan", "target": "dependencies"},
        },
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "message_id" in data
    assert data["from_agent"] == "cornelius"
    assert data["to_agent"] == "norman"
    assert data["status"] == "delivered"


@pytest.mark.asyncio
async def test_get_agent_messages(client: AsyncClient, admin_user):
    """Can retrieve messages for an agent."""
    headers = get_auth_headers(admin_user)
    # Send a message first
    await client.post(
        "/api/v1/multi-ai/message",
        json={
            "from_agent": "the_dr",
            "to_agent": "norman",
            "message_type": "event",
            "payload": {"type": "anomaly_detected"},
        },
        headers=headers,
    )
    resp = await client.get("/api/v1/multi-ai/messages/norman", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "messages" in data
    assert data["agent_id"] == "norman"


@pytest.mark.asyncio
async def test_start_collaboration(client: AsyncClient, admin_user):
    """Can start a multi-agent collaboration session."""
    headers = get_auth_headers(admin_user)
    resp = await client.post(
        "/api/v1/multi-ai/collaborate",
        json={
            "title": "Security Audit",
            "objective": "Perform comprehensive security audit of the platform",
            "agents": ["norman", "the_dr", "guardian"],
            "strategy": "parallel",
            "max_rounds": 3,
        },
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "session_id" in data
    assert data["strategy"] == "parallel"
    assert len(data["agents"]) == 3
    assert data["status"] == "active"


@pytest.mark.asyncio
async def test_get_collaboration(client: AsyncClient, admin_user):
    """Can retrieve a collaboration session."""
    headers = get_auth_headers(admin_user)
    # Create first
    create_resp = await client.post(
        "/api/v1/multi-ai/collaborate",
        json={
            "title": "Test Collab",
            "objective": "Test objective",
            "agents": ["norman", "the_dr"],
            "strategy": "round_robin",
        },
        headers=headers,
    )
    session_id = create_resp.json()["session_id"]

    resp = await client.get(f"/api/v1/multi-ai/collaborations/{session_id}", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["session_id"] == session_id


@pytest.mark.asyncio
async def test_list_protocols(client: AsyncClient, admin_user):
    """Can list communication protocols."""
    headers = get_auth_headers(admin_user)
    resp = await client.get("/api/v1/multi-ai/protocols", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, (list, dict))


@pytest.mark.asyncio
async def test_health(client: AsyncClient, admin_user):
    """Multi-AI health endpoint works."""
    headers = get_auth_headers(admin_user)
    resp = await client.get("/api/v1/multi-ai/health", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "healthy"