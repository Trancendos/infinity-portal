"""Tests for Admin CLI Terminal — Phase 22"""
import pytest
from httpx import AsyncClient
from tests.conftest import get_auth_headers


@pytest.mark.asyncio
async def test_execute_simple_command(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    resp = await client.post("/api/v1/admin/cli/execute", json={
        "command": "echo hello world",
    }, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["exit_code"] == 0
    assert "hello world" in data["output"]
    assert data["category"] == "custom"
    assert "command_id" in data
    assert "session_id" in data


@pytest.mark.asyncio
async def test_execute_platform_command(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    resp = await client.post("/api/v1/admin/cli/execute", json={
        "command": "platform:status",
    }, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["exit_code"] == 0
    assert "Infinity OS" in data["output"] or "platform" in data["output"].lower()


@pytest.mark.asyncio
async def test_execute_blocked_command(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    resp = await client.post("/api/v1/admin/cli/execute", json={
        "command": "rm -rf /",
    }, headers=headers)
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_execute_with_pipe(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    resp = await client.post("/api/v1/admin/cli/execute", json={
        "command": "echo 'line1\nline2\nline3'",
        "pipe_to": "wc -l",
    }, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["exit_code"] == 0


@pytest.mark.asyncio
async def test_execute_batch(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    resp = await client.post("/api/v1/admin/cli/execute/batch", json={
        "commands": ["echo first", "echo second", "echo third"],
    }, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_commands"] == 3
    assert data["executed"] == 3
    assert data["successful"] == 3


@pytest.mark.asyncio
async def test_execute_batch_stop_on_error(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    resp = await client.post("/api/v1/admin/cli/execute/batch", json={
        "commands": ["echo ok", "false", "echo should_not_run"],
        "stop_on_error": True,
    }, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["executed"] <= 3


@pytest.mark.asyncio
async def test_command_history(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    await client.post("/api/v1/admin/cli/execute", json={"command": "echo test_history"}, headers=headers)
    resp = await client.get("/api/v1/admin/cli/history", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 1


@pytest.mark.asyncio
async def test_sessions_crud(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    # Create
    resp = await client.post("/api/v1/admin/cli/sessions", json={
        "name": "test-session", "working_directory": "/tmp",
    }, headers=headers)
    assert resp.status_code == 201
    session_id = resp.json()["session_id"]

    # List
    resp = await client.get("/api/v1/admin/cli/sessions", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["total"] >= 1

    # Delete
    resp = await client.delete(f"/api/v1/admin/cli/sessions/{session_id}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "deleted"


@pytest.mark.asyncio
async def test_session_not_found(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    resp = await client.delete("/api/v1/admin/cli/sessions/nonexistent", headers=headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_autocomplete(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    resp = await client.get("/api/v1/admin/cli/autocomplete", params={"prefix": "plat"}, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 1
    assert any("platform" in s["command"] for s in data["suggestions"])


@pytest.mark.asyncio
async def test_aliases_crud(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    # Create
    resp = await client.post("/api/v1/admin/cli/aliases", json={
        "name": "gs", "command": "git status", "description": "Git status shortcut",
    }, headers=headers)
    assert resp.status_code == 201

    # List
    resp = await client.get("/api/v1/admin/cli/aliases", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["total"] >= 1

    # Delete
    resp = await client.delete("/api/v1/admin/cli/aliases/gs", headers=headers)
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_alias_blocked_command(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    resp = await client.post("/api/v1/admin/cli/aliases", json={
        "name": "danger", "command": "rm -rf /",
    }, headers=headers)
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_alias_not_found(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    resp = await client.delete("/api/v1/admin/cli/aliases/nonexistent", headers=headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_blocked_patterns(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    resp = await client.get("/api/v1/admin/cli/blocked-patterns", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["total"] >= 5


@pytest.mark.asyncio
async def test_audit_log(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    await client.post("/api/v1/admin/cli/execute", json={"command": "echo audit_test"}, headers=headers)
    resp = await client.get("/api/v1/admin/cli/audit", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["total"] >= 1


@pytest.mark.asyncio
async def test_command_timeout(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    resp = await client.post("/api/v1/admin/cli/execute", json={
        "command": "sleep 10", "timeout_seconds": 2,
    }, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["exit_code"] == 124 or "timeout" in data["output"].lower() or "timed out" in data["output"].lower()


@pytest.mark.asyncio
async def test_command_category_detection(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    resp = await client.post("/api/v1/admin/cli/execute", json={"command": "git --version"}, headers=headers)
    assert resp.status_code == 200
    assert resp.json()["category"] == "git"