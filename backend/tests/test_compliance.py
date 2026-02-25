# tests/test_compliance.py — Compliance management tests
import pytest
from httpx import AsyncClient
from tests.conftest import get_auth_headers


@pytest.mark.asyncio
class TestAISystems:
    async def test_register_system(self, client: AsyncClient, admin_user):
        headers = get_auth_headers(admin_user)
        res = await client.post("/api/v1/compliance/systems", headers=headers, json={
            "id": "sys-001",
            "name": "Test Generator",
            "description": "Test AI system",
            "purpose": "Testing",
            "risk_level": "MINIMAL_RISK",
        })
        assert res.status_code == 200
        data = res.json()
        assert data["name"] == "Test Generator"
        assert data["risk_level"] == "MINIMAL_RISK"

    async def test_register_high_risk_system(self, client: AsyncClient, admin_user):
        headers = get_auth_headers(admin_user)
        res = await client.post("/api/v1/compliance/systems", headers=headers, json={
            "id": "sys-hr-001",
            "name": "HR Screening AI",
            "description": "High-risk recruitment system",
            "purpose": "Candidate screening",
            "risk_level": "HIGH_RISK",
            "human_oversight_level": "full",
        })
        assert res.status_code == 200
        data = res.json()
        assert data["risk_level"] == "HIGH_RISK"

    async def test_list_systems(self, client: AsyncClient, admin_user):
        headers = get_auth_headers(admin_user)
        # Register a system first
        await client.post("/api/v1/compliance/systems", headers=headers, json={
            "id": "sys-list-001",
            "name": "List Test System",
            "risk_level": "MINIMAL_RISK",
        })
        res = await client.get("/api/v1/compliance/systems", headers=headers)
        assert res.status_code == 200
        data = res.json()
        assert "systems" in data

    async def test_regular_user_cannot_register(self, client: AsyncClient, test_user):
        headers = get_auth_headers(test_user)
        res = await client.post("/api/v1/compliance/systems", headers=headers, json={
            "id": "sys-forbidden",
            "name": "Forbidden System",
            "risk_level": "MINIMAL_RISK",
        })
        assert res.status_code == 403


@pytest.mark.asyncio
class TestRiskAssessment:
    async def test_assess_minimal_risk(self, client: AsyncClient, test_user):
        headers = get_auth_headers(test_user)
        res = await client.post("/api/v1/compliance/assess", headers=headers, json={
            "system_name": "Test System",
            "intended_use": "General text generation",
            "risk_level": "minimal",
        })
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "compliant"
        assert data["risk_level"] == "minimal"

    async def test_assess_high_risk_without_oversight(self, client: AsyncClient, test_user):
        headers = get_auth_headers(test_user)
        res = await client.post("/api/v1/compliance/assess", headers=headers, json={
            "system_name": "HR System",
            "intended_use": "Recruitment screening",
            "risk_level": "high",
            "human_oversight_enabled": False,
        })
        assert res.status_code == 400  # Must have human oversight

    async def test_assess_unacceptable_risk(self, client: AsyncClient, test_user):
        headers = get_auth_headers(test_user)
        res = await client.post("/api/v1/compliance/assess", headers=headers, json={
            "system_name": "Social Scoring",
            "intended_use": "Social credit scoring",
            "risk_level": "unacceptable",
        })
        assert res.status_code == 403  # Prohibited


@pytest.mark.asyncio
class TestAuditLogs:
    async def test_query_audit_logs(self, client: AsyncClient, admin_user):
        headers = get_auth_headers(admin_user)
        res = await client.get("/api/v1/compliance/audit-logs", headers=headers)
        assert res.status_code == 200
        data = res.json()
        assert "logs" in data
        assert "count" in data

    async def test_query_audit_logs_with_limit(self, client: AsyncClient, admin_user):
        headers = get_auth_headers(admin_user)
        res = await client.get("/api/v1/compliance/audit-logs?limit=5", headers=headers)
        assert res.status_code == 200
        data = res.json()
        assert data["count"] <= 5

    async def test_query_audit_logs_without_auth(self, client: AsyncClient):
        res = await client.get("/api/v1/compliance/audit-logs")
        assert res.status_code in (401, 403)


@pytest.mark.asyncio
class TestDPIA:
    async def test_create_dpia(self, client: AsyncClient, admin_user):
        headers = get_auth_headers(admin_user)
        # Register system first
        await client.post("/api/v1/compliance/systems", headers=headers, json={
            "id": "sys-dpia-001",
            "name": "DPIA Test System",
            "risk_level": "HIGH_RISK",
        })
        res = await client.post("/api/v1/compliance/dpia", headers=headers, json={
            "system_id": "sys-dpia-001",
            "data_categories": ["personal", "biometric"],
            "risk_assessment": {"level": "high", "impact": "significant"},
            "safeguards_implemented": ["encryption", "access_control", "audit_logging"],
        })
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "PENDING"

    async def test_create_dpia_system_not_found(self, client: AsyncClient, admin_user):
        headers = get_auth_headers(admin_user)
        res = await client.post("/api/v1/compliance/dpia", headers=headers, json={
            "system_id": "nonexistent-system",
            "data_categories": ["personal"],
        })
        assert res.status_code == 404


@pytest.mark.asyncio
class TestDashboard:
    async def test_compliance_dashboard(self, client: AsyncClient, admin_user):
        headers = get_auth_headers(admin_user)
        res = await client.get("/api/v1/compliance/dashboard", headers=headers)
        assert res.status_code == 200
        data = res.json()
        assert "total_systems" in data
        assert "risk_breakdown" in data
        assert "pending_hitl_tasks" in data
        assert "audit_events_24h" in data


@pytest.mark.asyncio
class TestHealthAndHeaders:
    async def test_health_check(self, client: AsyncClient):
        res = await client.get("/health")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "healthy"

    async def test_security_headers_present(self, client: AsyncClient):
        res = await client.get("/health")
        assert res.headers.get("X-Content-Type-Options") == "nosniff"
        assert res.headers.get("X-Frame-Options") == "DENY"