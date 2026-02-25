# tests/test_compliance.py - Compliance tests
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_list_ai_systems(client: AsyncClient, auth_headers: dict):
    """Test listing AI systems"""
    response = await client.get(
        "/api/v1/compliance/systems",
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert "systems" in data
    assert isinstance(data["systems"], list)


@pytest.mark.asyncio
async def test_query_audit_logs(client: AsyncClient, auth_headers: dict):
    """Test querying audit logs"""
    response = await client.get(
        "/api/v1/compliance/audit-logs",
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert "logs" in data
    assert "count" in data


@pytest.mark.asyncio
async def test_risk_assessment_prohibited(client: AsyncClient, auth_headers: dict):
    """Test that unacceptable risk is rejected"""
    response = await client.post(
        "/api/v1/compliance/assess",
        json={
            "system_name": "Social Scoring System",
            "intended_use": "Government social credit scoring",
            "risk_level": "unacceptable",
            "data_sources": ["public_records"],
            "human_oversight_enabled": False,
        },
        headers=auth_headers,
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_risk_assessment_high_without_oversight(client: AsyncClient, auth_headers: dict):
    """Test that high-risk without human oversight is rejected"""
    response = await client.post(
        "/api/v1/compliance/assess",
        json={
            "system_name": "HR Screener",
            "intended_use": "Automated CV filtering",
            "risk_level": "high",
            "data_sources": ["applications"],
            "human_oversight_enabled": False,
        },
        headers=auth_headers,
    )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_risk_assessment_compliant(client: AsyncClient, auth_headers: dict):
    """Test that a compliant assessment passes"""
    response = await client.post(
        "/api/v1/compliance/assess",
        json={
            "system_name": "Support Bot",
            "intended_use": "Customer FAQ assistance",
            "risk_level": "minimal",
            "data_sources": ["faq_database"],
            "human_oversight_enabled": False,
        },
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "compliant"


@pytest.mark.asyncio
async def test_compliance_dashboard(client: AsyncClient, auth_headers: dict):
    """Test compliance dashboard summary"""
    response = await client.get(
        "/api/v1/compliance/dashboard",
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert "total_systems" in data
    assert "pending_hitl_tasks" in data
    assert "audit_events_24h" in data


@pytest.mark.asyncio
async def test_health_check(client: AsyncClient):
    """Test health check endpoint"""
    response = await client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["version"] == "2.0.0"


@pytest.mark.asyncio
async def test_root_endpoint(client: AsyncClient):
    """Test root endpoint"""
    response = await client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Infinity OS"
