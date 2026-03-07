"""Tests for TheDr Platform Maintenance AI — Phase 22"""
import pytest
from httpx import AsyncClient
from tests.conftest import get_auth_headers


@pytest.mark.asyncio
async def test_repair_dry_run(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    resp = await client.post("/api/v1/the-dr/repair", json={
        "target": "api_service",
        "issue_description": "Service is down and not responding on port 8000",
        "dry_run": True,
    }, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "simulated"
    assert data["classification"] == "service_down"
    assert data["risk_level"] == "low"
    assert len(data["step_results"]) >= 3
    assert "repair_id" in data


@pytest.mark.asyncio
async def test_repair_auto_apply(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    resp = await client.post("/api/v1/the-dr/repair", json={
        "target": "cache_service",
        "issue_description": "Config error in cache settings",
        "dry_run": False, "auto_apply": True,
    }, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "applied"
    assert data["classification"] == "config_error"


@pytest.mark.asyncio
async def test_repair_high_risk_needs_approval(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    resp = await client.post("/api/v1/the-dr/repair", json={
        "target": "main_code",
        "issue_description": "Code error with traceback exception in production",
        "dry_run": False, "auto_apply": True,
    }, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "pending_approval"
    assert data["risk_level"] == "high"


@pytest.mark.asyncio
async def test_maintain_cleanup(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    resp = await client.post("/api/v1/the-dr/maintain", json={
        "task_type": "cleanup",
    }, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "completed"
    assert data["actions_executed"] >= 3
    assert "freed_mb" in data


@pytest.mark.asyncio
async def test_maintain_health_check(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    resp = await client.post("/api/v1/the-dr/maintain", json={
        "task_type": "health_check",
    }, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "completed"
    assert data["services_checked"] >= 5


@pytest.mark.asyncio
async def test_maintain_optimize(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    resp = await client.post("/api/v1/the-dr/maintain", json={
        "task_type": "optimize", "targets": ["database"],
    }, headers=headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "completed"


@pytest.mark.asyncio
async def test_maintain_backup(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    resp = await client.post("/api/v1/the-dr/maintain", json={
        "task_type": "backup",
    }, headers=headers)
    assert resp.status_code == 200
    assert "backup_size_mb" in resp.json()


@pytest.mark.asyncio
async def test_watch_configure(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    resp = await client.post("/api/v1/the-dr/watch", json={
        "services": ["all"], "check_interval_seconds": 60, "auto_heal": True,
    }, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "active"
    assert len(data["services"]) >= 5
    assert len(data["initial_results"]) >= 5
    assert "watch_id" in data


@pytest.mark.asyncio
async def test_watch_list(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    await client.post("/api/v1/the-dr/watch", json={"services": ["api"]}, headers=headers)
    resp = await client.get("/api/v1/the-dr/watch", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["total"] >= 1


@pytest.mark.asyncio
async def test_watch_stop(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    create = await client.post("/api/v1/the-dr/watch", json={"services": ["api"]}, headers=headers)
    watch_id = create.json()["watch_id"]
    resp = await client.delete(f"/api/v1/the-dr/watch/{watch_id}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "stopped"


@pytest.mark.asyncio
async def test_watch_not_found(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    resp = await client.delete("/api/v1/the-dr/watch/nonexistent", headers=headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_platform_health(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    resp = await client.get("/api/v1/the-dr/platform-health", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "platform_health_score" in data
    assert "grade" in data
    assert "services" in data
    assert "infrastructure" in data
    assert "code_quality" in data
    assert "recommendations" in data
    assert data["platform_health_score"] >= 0


@pytest.mark.asyncio
async def test_code_fix_analysis(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    resp = await client.post("/api/v1/the-dr/code-fix", json={
        "file_path": "routers/admin.py",
        "error_message": "NameError: name 'foo' is not defined",
        "error_line": 50,
    }, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["fix_type"] == "undefined_name"
    assert data["confidence"] >= 0.5
    assert data["file_exists"] is True
    assert data["context"] is not None
    assert "fix_id" in data


@pytest.mark.asyncio
async def test_code_fix_missing_import(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    resp = await client.post("/api/v1/the-dr/code-fix", json={
        "file_path": "routers/admin.py",
        "error_message": "ImportError: No module named 'nonexistent'",
    }, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["fix_type"] == "missing_import"
    assert data["confidence"] >= 0.7


@pytest.mark.asyncio
async def test_code_fix_nonexistent_file(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    resp = await client.post("/api/v1/the-dr/code-fix", json={
        "file_path": "nonexistent/file.py",
        "error_message": "SyntaxError: invalid syntax",
    }, headers=headers)
    assert resp.status_code == 200
    assert resp.json()["file_exists"] is False


@pytest.mark.asyncio
async def test_repair_history(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    await client.post("/api/v1/the-dr/repair", json={
        "target": "test", "issue_description": "test issue", "dry_run": True,
    }, headers=headers)
    resp = await client.get("/api/v1/the-dr/repair-history", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["total"] >= 1


@pytest.mark.asyncio
async def test_maintenance_log(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    await client.post("/api/v1/the-dr/maintain", json={"task_type": "cleanup"}, headers=headers)
    resp = await client.get("/api/v1/the-dr/maintenance-log", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["total"] >= 1