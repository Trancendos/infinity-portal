"""Tests for the Multi-Framework Compliance router."""
import pytest
from httpx import AsyncClient
from tests.conftest import get_auth_headers


@pytest.mark.asyncio
async def test_list_frameworks(client: AsyncClient, test_user):
    """List all supported compliance frameworks."""
    headers = get_auth_headers(test_user)
    resp = await client.get("/api/v1/compliance-frameworks/frameworks", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "frameworks" in data
    framework_ids = [f["id"] for f in data["frameworks"]]
    assert "gdpr" in framework_ids
    assert "iso27001" in framework_ids
    assert "eu_ai_act" in framework_ids
    assert "standard_2060" in framework_ids


@pytest.mark.asyncio
async def test_list_controls_requires_auth(client: AsyncClient):
    """Controls endpoint requires authentication."""
    resp = await client.get("/api/v1/compliance-frameworks/controls")
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_list_controls(client: AsyncClient, test_user):
    """List compliance controls."""
    headers = get_auth_headers(test_user)
    resp = await client.get("/api/v1/compliance-frameworks/controls", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "controls" in data
    assert "count" in data
    assert data["count"] > 0
    control = data["controls"][0]
    assert "id" in control
    assert "name" in control
    assert "category" in control
    assert "frameworks" in control
    assert "severity" in control


@pytest.mark.asyncio
async def test_list_controls_filter_by_framework(client: AsyncClient, test_user):
    """Filter controls by framework."""
    headers = get_auth_headers(test_user)
    resp = await client.get("/api/v1/compliance-frameworks/controls?framework=gdpr", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    for control in data["controls"]:
        assert "gdpr" in control["frameworks"]


@pytest.mark.asyncio
async def test_run_compliance_tests_requires_org_admin(client: AsyncClient, test_user):
    """Running compliance tests requires org_admin."""
    headers = get_auth_headers(test_user)
    state = {"has_mfa": True, "has_rbac": True, "has_audit_log": True}
    resp = await client.post("/api/v1/compliance-frameworks/test", json=state, headers=headers)
    assert resp.status_code in (403, 401)


@pytest.mark.asyncio
async def test_run_compliance_tests_as_admin(client: AsyncClient, admin_user):
    """Admin can run compliance tests."""
    headers = get_auth_headers(admin_user)
    state = {
        "has_mfa": False,
        "has_rbac": True,
        "has_audit_log": True,
        "has_encryption_at_rest": False,
        "has_tls": True,
        "has_hitl": True,
        "has_c2pa": False,
        "has_dpia": False,
        "has_vuln_scanning": False,
        "has_secrets_manager": False,
        "has_consent_collection": False,
        "has_data_deletion": False,
        "has_merkle_audit": False,
        "has_crypto_shredding": False,
        "ai_systems_registered": 2,
        "open_critical_vulns": 0,
        "api_key_rotation_days": 90,
        "session_timeout_minutes": 30,
    }
    resp = await client.post("/api/v1/compliance-frameworks/test", json=state, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "summary" in data
    assert "results" in data
    assert data["summary"]["total"] > 0
    # MFA is False so AC-001 should fail
    assert "AC-001" in data["results"]
    assert data["results"]["AC-001"]["status"] == "failing"
    # RBAC is True so AC-002 should pass
    assert data["results"]["AC-002"]["status"] == "passing"


@pytest.mark.asyncio
async def test_get_framework_report(client: AsyncClient, test_user):
    """Get compliance report for a framework."""
    headers = get_auth_headers(test_user)
    resp = await client.get("/api/v1/compliance-frameworks/report/gdpr", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "framework" in data
    assert data["framework"] == "gdpr"
    assert "summary" in data
    assert "overall_score" in data["summary"]
    assert "certification_ready" in data["summary"]


@pytest.mark.asyncio
async def test_get_invalid_framework_report(client: AsyncClient, test_user):
    """Invalid framework returns 400."""
    headers = get_auth_headers(test_user)
    resp = await client.get("/api/v1/compliance-frameworks/report/invalid_framework", headers=headers)
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_get_cross_framework_summary(client: AsyncClient, test_user):
    """Cross-framework summary returns posture overview."""
    headers = get_auth_headers(test_user)
    resp = await client.get("/api/v1/compliance-frameworks/summary", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "frameworks" in data or "message" in data


@pytest.mark.asyncio
async def test_2060_check(client: AsyncClient, test_user):
    """2060 Standard compliance check."""
    headers = get_auth_headers(test_user)
    payload = {
        "agent": "infinity-os-ai",
        "capability": "text-generation",
        "risk_level": "low",
        "data_residency": "eu",
        "consent_tokens": [],
        "data_sources": [],
    }
    resp = await client.post("/api/v1/compliance-frameworks/2060/check", json=payload, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "approved" in data
    assert "invocation_id" in data
    assert "checks_performed" in data
    assert "risk_level" in data


@pytest.mark.asyncio
async def test_2060_grant_consent(client: AsyncClient, test_user):
    """Grant consent under 2060 Standard."""
    headers = get_auth_headers(test_user)
    payload = {
        "consent_types": ["processing", "analytics"],
        "data_residency": "eu",
        "expires_days": 365,
    }
    resp = await client.post("/api/v1/compliance-frameworks/2060/consent", json=payload, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "consent_token" in data
    assert "consent_types" in data
    assert "processing" in data["consent_types"]
    assert "granted_at" in data


@pytest.mark.asyncio
async def test_get_residency_zones(client: AsyncClient):
    """Residency zones endpoint is public."""
    resp = await client.get("/api/v1/compliance-frameworks/2060/residency-zones")
    assert resp.status_code == 200
    data = resp.json()
    assert "zones" in data
    zone_ids = [z["id"] for z in data["zones"]]
    assert "eu" in zone_ids
    assert "uk" in zone_ids