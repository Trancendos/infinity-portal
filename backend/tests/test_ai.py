# tests/test_ai.py — AI generation & HITL governance tests
import pytest
from httpx import AsyncClient
from tests.conftest import get_auth_headers


@pytest.mark.asyncio
class TestAIGeneration:
    async def test_generate_minimal_risk(self, client: AsyncClient, test_user):
        headers = get_auth_headers(test_user)
        res = await client.post("/api/v1/ai/generate", headers=headers, json={
            "system_id": "test-system-id",
            "prompt": "Write a hello world program",
            "task_type": "general",
        })
        # Should succeed (minimal risk = no HITL gate)
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "processed"
        assert data["content"] is not None

    async def test_generate_high_risk_triggers_hitl(self, client: AsyncClient, test_user):
        headers = get_auth_headers(test_user)
        res = await client.post("/api/v1/ai/generate", headers=headers, json={
            "system_id": "any-system",
            "prompt": "Analyze biometric data for recruitment screening",
            "task_type": "biometric_recruitment",
        })
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "pending_human_oversight"
        assert data["content"] is None  # Output withheld

    async def test_generate_without_auth(self, client: AsyncClient):
        res = await client.post("/api/v1/ai/generate", json={
            "system_id": "test",
            "prompt": "Hello",
        })
        assert res.status_code in (401, 403)

    async def test_generate_empty_prompt(self, client: AsyncClient, test_user):
        headers = get_auth_headers(test_user)
        res = await client.post("/api/v1/ai/generate", headers=headers, json={
            "system_id": "test",
            "prompt": "",
        })
        assert res.status_code == 422


@pytest.mark.asyncio
class TestHITL:
    async def test_get_pending_reviews(self, client: AsyncClient, admin_user):
        headers = get_auth_headers(admin_user)
        res = await client.get("/api/v1/ai/pending-reviews", headers=headers)
        assert res.status_code == 200

    async def test_regular_user_cannot_review(self, client: AsyncClient, test_user):
        headers = get_auth_headers(test_user)
        res = await client.patch(
            "/api/v1/ai/review/fake-task-id",
            headers=headers,
            json={"approved": True, "comments": "Looks good"},
        )
        # Should be 403 (no permission)
        assert res.status_code == 403