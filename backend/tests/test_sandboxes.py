"""Tests for Sandboxes & VM Management — Phase 22"""
import pytest
from httpx import AsyncClient
from tests.conftest import get_auth_headers


@pytest.mark.asyncio
async def test_create_sandbox(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    resp = await client.post("/api/v1/sandboxes", json={
        "name": "test-sandbox", "sandbox_type": "container",
        "base_image": "python:3.11-slim", "workspace_template": "python",
    }, headers=headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "test-sandbox"
    assert data["status"] == "running"
    assert data["sandbox_type"] == "container"
    assert "sandbox_id" in data
    assert "ip_address" in data


@pytest.mark.asyncio
async def test_list_sandboxes(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    await client.post("/api/v1/sandboxes", json={"name": "list-test"}, headers=headers)
    resp = await client.get("/api/v1/sandboxes", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["total"] >= 1


@pytest.mark.asyncio
async def test_get_sandbox(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    create = await client.post("/api/v1/sandboxes", json={"name": "get-test"}, headers=headers)
    sid = create.json()["sandbox_id"]
    resp = await client.get(f"/api/v1/sandboxes/{sid}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["sandbox_id"] == sid


@pytest.mark.asyncio
async def test_sandbox_not_found(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    resp = await client.get("/api/v1/sandboxes/nonexistent", headers=headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_update_sandbox(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    create = await client.post("/api/v1/sandboxes", json={"name": "update-test"}, headers=headers)
    sid = create.json()["sandbox_id"]
    resp = await client.patch(f"/api/v1/sandboxes/{sid}", json={"name": "updated-name"}, headers=headers)
    assert resp.status_code == 200
    assert resp.json()["name"] == "updated-name"


@pytest.mark.asyncio
async def test_stop_start_sandbox(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    create = await client.post("/api/v1/sandboxes", json={"name": "lifecycle-test"}, headers=headers)
    sid = create.json()["sandbox_id"]
    resp = await client.post(f"/api/v1/sandboxes/{sid}/stop", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "stopped"
    resp = await client.post(f"/api/v1/sandboxes/{sid}/start", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "running"


@pytest.mark.asyncio
async def test_pause_resume_sandbox(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    create = await client.post("/api/v1/sandboxes", json={"name": "pause-test"}, headers=headers)
    sid = create.json()["sandbox_id"]
    resp = await client.post(f"/api/v1/sandboxes/{sid}/pause", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "paused"
    resp = await client.post(f"/api/v1/sandboxes/{sid}/resume", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "running"


@pytest.mark.asyncio
async def test_destroy_sandbox(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    create = await client.post("/api/v1/sandboxes", json={"name": "destroy-test"}, headers=headers)
    sid = create.json()["sandbox_id"]
    resp = await client.delete(f"/api/v1/sandboxes/{sid}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "destroyed"


@pytest.mark.asyncio
async def test_exec_in_sandbox(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    create = await client.post("/api/v1/sandboxes", json={"name": "exec-test"}, headers=headers)
    sid = create.json()["sandbox_id"]
    resp = await client.post(f"/api/v1/sandboxes/{sid}/exec", json={
        "command": "echo sandbox_exec",
    }, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["exit_code"] == 0
    assert "sandbox_exec" in data["output"]


@pytest.mark.asyncio
async def test_exec_in_stopped_sandbox(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    create = await client.post("/api/v1/sandboxes", json={"name": "exec-stopped"}, headers=headers)
    sid = create.json()["sandbox_id"]
    await client.post(f"/api/v1/sandboxes/{sid}/stop", headers=headers)
    resp = await client.post(f"/api/v1/sandboxes/{sid}/exec", json={"command": "echo fail"}, headers=headers)
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_sandbox_logs(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    create = await client.post("/api/v1/sandboxes", json={"name": "logs-test"}, headers=headers)
    sid = create.json()["sandbox_id"]
    await client.post(f"/api/v1/sandboxes/{sid}/exec", json={"command": "echo log_entry"}, headers=headers)
    resp = await client.get(f"/api/v1/sandboxes/{sid}/logs", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["total_entries"] >= 1


@pytest.mark.asyncio
async def test_snapshot_crud(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    create = await client.post("/api/v1/sandboxes", json={"name": "snap-test"}, headers=headers)
    sid = create.json()["sandbox_id"]
    resp = await client.post(f"/api/v1/sandboxes/{sid}/snapshot", json={
        "name": "test-snapshot", "description": "Test snapshot",
    }, headers=headers)
    assert resp.status_code == 201
    snap_id = resp.json()["snapshot_id"]
    resp = await client.get(f"/api/v1/sandboxes/{sid}/snapshots", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["total"] >= 1
    resp = await client.post(f"/api/v1/sandboxes/{sid}/restore/{snap_id}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["restored_from"] == snap_id


@pytest.mark.asyncio
async def test_vm_crud(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    resp = await client.post("/api/v1/sandboxes/vms", json={
        "name": "test-vm", "os_image": "debian-12", "cpu_cores": 2, "memory_mb": 2048,
    }, headers=headers)
    assert resp.status_code == 201
    vm_id = resp.json()["vm_id"]
    assert resp.json()["status"] == "running"

    resp = await client.get(f"/api/v1/sandboxes/vms/{vm_id}", headers=headers)
    assert resp.status_code == 200

    resp = await client.get("/api/v1/sandboxes/vms/list", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["total"] >= 1

    resp = await client.post(f"/api/v1/sandboxes/vms/{vm_id}/stop", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "stopped"

    resp = await client.post(f"/api/v1/sandboxes/vms/{vm_id}/start", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "running"

    resp = await client.delete(f"/api/v1/sandboxes/vms/{vm_id}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "destroyed"


@pytest.mark.asyncio
async def test_vm_not_found(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    resp = await client.get("/api/v1/sandboxes/vms/nonexistent", headers=headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_templates_list(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    resp = await client.get("/api/v1/sandboxes/templates/list", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 3
    names = [t["name"] for t in data["templates"]]
    assert "python" in names
    assert "node" in names


@pytest.mark.asyncio
async def test_sandboxes_overview(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    await client.post("/api/v1/sandboxes", json={"name": "overview-test"}, headers=headers)
    resp = await client.get("/api/v1/sandboxes/overview", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "sandboxes" in data
    assert "vms" in data
    assert "templates_available" in data


@pytest.mark.asyncio
async def test_sandbox_audit(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    await client.post("/api/v1/sandboxes", json={"name": "audit-test"}, headers=headers)
    resp = await client.get("/api/v1/sandboxes/audit", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["total"] >= 1