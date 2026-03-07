# tests/test_guardian.py — Guardian IAM tests
import pytest
from httpx import AsyncClient
from tests.conftest import get_auth_headers


@pytest.mark.asyncio
async def test_issue_agent_token(client: AsyncClient, admin_user):
    """Can issue an agent token."""
    headers = get_auth_headers(admin_user)
    resp = await client.post(
        "/api/v1/guardian/agent-token",
        json={
            "agent_id": "norman",
            "scopes": ["security.scan", "security.report"],
            "lane": "ai_nexus",
            "ttl_seconds": 3600,
        },
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "token" in data or "agent_token" in data
    assert "expires_at" in data


@pytest.mark.asyncio
async def test_verify_token(client: AsyncClient, admin_user):
    """Can verify an agent token."""
    headers = get_auth_headers(admin_user)
    issue_resp = await client.post(
        "/api/v1/guardian/agent-token",
        json={
            "agent_id": "the_dr",
            "scopes": ["healing.diagnose"],
            "lane": "ai_nexus",
        },
        headers=headers,
    )
    token = issue_resp.json().get("token") or issue_resp.json().get("agent_token")

    resp = await client.post(
        "/api/v1/guardian/verify-token",
        json={"token": token},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "valid" in data


@pytest.mark.asyncio
async def test_rbac_evaluate(client: AsyncClient, admin_user):
    """Can evaluate RBAC policy."""
    headers = get_auth_headers(admin_user)
    resp = await client.post(
        "/api/v1/guardian/rbac/evaluate",
        json={
            "subject": "admin",
            "action": "write",
            "resource": "platform.config",
        },
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "allowed" in data or "decision" in data


@pytest.mark.asyncio
async def test_zero_trust_status(client: AsyncClient, admin_user):
    """Can check zero-trust status."""
    headers = get_auth_headers(admin_user)
    resp = await client.get("/api/v1/guardian/zero-trust/status", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, dict)


@pytest.mark.asyncio
async def test_behavioral_check(client: AsyncClient, admin_user):
    """Can perform behavioral baseline check."""
    headers = get_auth_headers(admin_user)
    resp = await client.post(
        "/api/v1/guardian/behavioral-check",
        json={
            "agent_id": "norman",
            "action": "security.scan",
            "resource": "codebase.backend",
            "context": {"source_ip": "10.0.0.1", "request_rate": 5},
        },
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, dict)


@pytest.mark.asyncio
async def test_active_sessions(client: AsyncClient, admin_user):
    """Can list active sessions."""
    headers = get_auth_headers(admin_user)
    resp = await client.get("/api/v1/guardian/sessions/active", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, (list, dict))


@pytest.mark.asyncio
async def test_context_declaration(client: AsyncClient, admin_user):
    """Can submit EU AI Act context declaration."""
    headers = get_auth_headers(admin_user)
    resp = await client.post(
        "/api/v1/guardian/context-declaration",
        json={
            "agent_id": "cornelius",
            "purpose": "Orchestrate multi-agent tasks with human oversight",
            "data_categories": ["operational", "telemetry"],
            "risk_level": "limited",
            "human_oversight": True,
            "transparency_notice": "All orchestration decisions are logged and auditable",
        },
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "declaration_id" in data or isinstance(data, dict)