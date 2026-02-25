# tests/test_ai.py - AI generation and HITL tests
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_generate_content(client: AsyncClient, auth_headers: dict):
    """Test standard AI content generation (minimal risk)"""
    response = await client.post(
        "/api/v1/ai/generate",
        json={
            "system_id": "ios-text-gen",
            "prompt": "Write a hello world function",
            "task_type": "general",
            "require_provenance": True,
        },
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert "request_id" in data
    assert "content" in data
    assert data["status"] == "processed"
    assert data["governance_decision"]["allowed"] is True


@pytest.mark.asyncio
async def test_generate_high_risk_triggers_hitl(client: AsyncClient, auth_headers: dict):
    """Test that high-risk task types trigger HITL queue"""
    response = await client.post(
        "/api/v1/ai/generate",
        json={
            "system_id": "ios-text-gen",
            "prompt": "Screen candidate CVs for engineering role",
            "task_type": "recruitment",
            "require_provenance": True,
        },
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "pending_human_oversight"
    assert data["content"] is None
    assert data["governance_decision"]["allowed"] is False
    assert "hitl_task_id" in data["governance_decision"]


@pytest.mark.asyncio
async def test_generate_without_auth(client: AsyncClient):
    """Test generation without authentication is rejected"""
    response = await client.post(
        "/api/v1/ai/generate",
        json={"system_id": "ios-text-gen", "prompt": "Test"},
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_pending_reviews_requires_admin(client: AsyncClient, auth_headers: dict):
    """Test that pending-reviews endpoint requires admin role"""
    response = await client.get(
        "/api/v1/ai/pending-reviews",
        headers=auth_headers,
    )
    # Regular user should be denied (403)
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_provenance_not_found(client: AsyncClient, auth_headers: dict):
    """Test provenance for nonexistent request returns 404"""
    response = await client.get(
        "/api/v1/ai/provenance/nonexistent-id",
        headers=auth_headers,
    )
    assert response.status_code == 404
