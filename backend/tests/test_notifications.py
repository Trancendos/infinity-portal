"""Tests for the Notifications router."""
import pytest
from tests.conftest import get_auth_headers


@pytest.mark.asyncio
async def test_list_notifications_empty(client, test_user):
    headers = get_auth_headers(test_user)
    resp = await client.get("/api/v1/notifications", headers=headers)
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


@pytest.mark.asyncio
async def test_notification_count_empty(client, test_user):
    headers = get_auth_headers(test_user)
    resp = await client.get("/api/v1/notifications/count", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert "unread" in body
    assert "urgent" in body
    assert body["unread"] == 0


@pytest.mark.asyncio
async def test_create_notification(client, test_user):
    headers = get_auth_headers(test_user)
    data = {
        "title": "Test Notification",
        "body": "This is a test notification for the notification centre.",
        "priority": "normal",
        "source_module": "test-suite",
    }
    resp = await client.post("/api/v1/notifications", json=data, headers=headers)
    assert resp.status_code == 201
    body = resp.json()
    assert body["title"] == "Test Notification"
    assert body["is_read"] is False


@pytest.mark.asyncio
async def test_create_urgent_notification(client, test_user):
    headers = get_auth_headers(test_user)
    data = {
        "title": "Urgent Alert",
        "body": "Critical security event detected in the compliance engine.",
        "priority": "urgent",
        "source_module": "compliance",
    }
    resp = await client.post("/api/v1/notifications", json=data, headers=headers)
    assert resp.status_code == 201
    assert resp.json()["priority"] == "urgent"


@pytest.mark.asyncio
async def test_mark_notification_read(client, test_user):
    headers = get_auth_headers(test_user)
    create_resp = await client.post("/api/v1/notifications", json={
        "title": "Read Me",
        "body": "This notification should be marked as read.",
    }, headers=headers)
    assert create_resp.status_code == 201
    notif_id = create_resp.json()["id"]

    resp = await client.post(f"/api/v1/notifications/{notif_id}/read", headers=headers)
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_mark_all_read(client, test_user):
    headers = get_auth_headers(test_user)
    for title in ["First", "Second"]:
        await client.post("/api/v1/notifications", json={
            "title": title,
            "body": f"Notification {title} for mark-all-read test.",
        }, headers=headers)

    resp = await client.post("/api/v1/notifications/read-all", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["marked"] >= 0


@pytest.mark.asyncio
async def test_delete_notification(client, test_user):
    headers = get_auth_headers(test_user)
    create_resp = await client.post("/api/v1/notifications", json={
        "title": "Delete Me",
        "body": "This notification will be deleted.",
    }, headers=headers)
    notif_id = create_resp.json()["id"]

    resp = await client.delete(f"/api/v1/notifications/{notif_id}", headers=headers)
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_clear_read_notifications(client, test_user):
    headers = get_auth_headers(test_user)
    create_resp = await client.post("/api/v1/notifications", json={
        "title": "Clear Me",
        "body": "This read notification will be cleared.",
    }, headers=headers)
    notif_id = create_resp.json()["id"]
    await client.post(f"/api/v1/notifications/{notif_id}/read", headers=headers)

    resp = await client.delete("/api/v1/notifications", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["deleted"] >= 0


@pytest.mark.asyncio
async def test_filter_unread_only(client, test_user):
    headers = get_auth_headers(test_user)
    resp = await client.get("/api/v1/notifications?unread_only=true", headers=headers)
    assert resp.status_code == 200
    for n in resp.json():
        assert n["is_read"] is False


@pytest.mark.asyncio
async def test_filter_by_priority(client, test_user):
    headers = get_auth_headers(test_user)
    resp = await client.get("/api/v1/notifications?priority=urgent", headers=headers)
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_notifications_require_auth(client):
    resp = await client.get("/api/v1/notifications")
    assert resp.status_code in [401, 403]