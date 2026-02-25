# tests/test_compliance.py — Compliance & governance tests
import pytest
from httpx import AsyncClient
from tests.conftest import get_auth_headers


@pytest.mark.asyncio
class TestAISystemRegistration:
    async def test_register_system(self, client: AsyncClient, admin_user):
        headers = get_auth_headers(admin_user)
        res = await client.post("/api/v1/compliance/ai-systems", headers=headers, json={
            "name": "Content Generator",
            "description": "Generates marketing content",
            "purpose": "Marketing automation",
            "risk_level": "MINIMAL_RISK",
            "data_sources": [{"type": "user_input"}],
            "model_ids": ["gpt-4"],
        })
        assert res.status_code == 200
        data = res.json()
        assert data["name"] == "Content Generator"
        assert data["risk_level"] == "MINIMAL_RISK"

    async def test_register_high_risk_system(self, client: AsyncClient, admin_user):
        headers = get_auth_headers(admin_user)
        res = await client.post("/api/v1/compliance/ai-systems", headers=headers, json={
            "name": "HR Screening Tool",
            "description": "Screens job applicants",
            "purpose": "Recruitment",
            "risk_level": "HIGH_RISK",
            "human_oversight_required": True,
        })
        assert res.status_code == 200
        data = res.json()
        assert data["risk_level"] == "HIGH_RISK"


@pytest.mark.asyncio
class TestRiskAssessment:
    async def test_risk_assessment(self, client: AsyncClient, admin_user):
        headers = get_auth_headers(admin_user)
        # Register a system first
        sys_res = await client.post("/api/v1/compliance/ai-systems", headers=headers, json={
            "name": "Risk Test System",
            "description": "For testing risk assessment",
            "purpose": "Testing",
            "risk_level": "LIMITED_RISK",
        })
        if sys_res.status_code == 200:
            system_id = sys_res.json()["id"]
            res = await client.get(
                f"/api/v1/compliance/risk-assessment/{system_id}",
                headers=headers,
            )
            assert res.status_code == 200


@pytest.mark.asyncio
class TestAuditLog:
    async def test_get_audit_logs(self, client: AsyncClient, admin_user):
        headers = get_auth_headers(admin_user)
        res = await client.get("/api/v1/compliance/audit-log", headers=headers)
        assert res.status_code == 200
        assert isinstance(res.json(), list)

    async def test_audit_log_pagination(self, client: AsyncClient, admin_user):
        headers = get_auth_headers(admin_user)
        res = await client.get(
            "/api/v1/compliance/audit-log?limit=5&offset=0",
            headers=headers,
        )
        assert res.status_code == 200

    async def test_regular_user_limited_audit(self, client: AsyncClient, test_user):
        headers = get_auth_headers(test_user)
        res = await client.get("/api/v1/compliance/audit-log", headers=headers)
        # Users may have limited or no access to audit logs
        assert res.status_code in (200, 403)


@pytest.mark.asyncio
class TestDPIA:
    async def test_create_dpia(self, client: AsyncClient, admin_user):
        headers = get_auth_headers(admin_user)
        res = await client.post("/api/v1/compliance/dpia", headers=headers, json={
            "system_name": "Content Generator",
            "description": "DPIA for content generation system",
            "data_types": ["user_prompts", "generated_content"],
            "processing_purposes": ["content_generation"],
            "risk_mitigation": "HITL review for high-risk content",
        })
        assert res.status_code in (200, 201)

    async def test_list_dpias(self, client: AsyncClient, admin_user):
        headers = get_auth_headers(admin_user)
        res = await client.get("/api/v1/compliance/dpia", headers=headers)
        assert res.status_code == 200


@pytest.mark.asyncio
class TestComplianceDashboard:
    async def test_get_dashboard(self, client: AsyncClient, admin_user):
        headers = get_auth_headers(admin_user)
        res = await client.get("/api/v1/compliance/dashboard", headers=headers)
        assert res.status_code == 200
        data = res.json()
        assert "total_ai_systems" in data or "compliance_score" in data


@pytest.mark.asyncio
class TestHealthAndRoot:
    async def test_health_check(self, client: AsyncClient):
        res = await client.get("/health")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "healthy"
        assert data["version"] == "3.0.0"

    async def test_root(self, client: AsyncClient):
        res = await client.get("/")
        assert res.status_code == 200
        data = res.json()
        assert data["name"] == "Infinity OS"

    async def test_security_headers(self, client: AsyncClient):
        res = await client.get("/health")
        assert res.headers.get("X-Content-Type-Options") == "nosniff"
        assert res.headers.get("X-Frame-Options") == "DENY"
        assert "X-Request-ID" in res.headers

    async def test_correlation_id_passthrough(self, client: AsyncClient):
        res = await client.get("/health", headers={"X-Request-ID": "test-123"})
        assert res.headers.get("X-Request-ID") == "test-123"