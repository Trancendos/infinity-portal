# tests/test_kanban.py — Kanban board router tests
import pytest
from httpx import AsyncClient

from tests.conftest import get_auth_headers


@pytest.mark.asyncio
async def test_create_board(client: AsyncClient, admin_user):
    """Admin can create a kanban board"""
    headers = get_auth_headers(admin_user)
    resp = await client.post(
        "/api/v1/kanban/boards",
        json={
            "name": "Sprint Board",
            "description": "Main sprint board",
            "prefix": "SPR",
        },
        headers=headers,
    )
    assert resp.status_code in (200, 201)
    data = resp.json()
    assert data["name"] == "Sprint Board"
    assert "columns" in data
    assert len(data["columns"]) >= 1


@pytest.mark.asyncio
async def test_list_boards(client: AsyncClient, admin_user):
    """User can list boards"""
    headers = get_auth_headers(admin_user)
    await client.post(
        "/api/v1/kanban/boards",
        json={"name": "Test Board", "prefix": "TST"},
        headers=headers,
    )
    resp = await client.get("/api/v1/kanban/boards", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) >= 1


@pytest.mark.asyncio
async def test_create_task(client: AsyncClient, admin_user):
    """User can create a task on a board"""
    headers = get_auth_headers(admin_user)
    board_resp = await client.post(
        "/api/v1/kanban/boards",
        json={"name": "Task Board", "prefix": "TBD"},
        headers=headers,
    )
    board_id = board_resp.json()["id"]

    resp = await client.post(
        f"/api/v1/kanban/boards/{board_id}/tasks",
        json={
            "title": "Implement login",
            "description": "Add JWT authentication",
            "priority": "high",
            "task_type": "story",
            "story_points": 5,
        },
        headers=headers,
    )
    assert resp.status_code in (200, 201)
    data = resp.json()
    assert data["title"] == "Implement login"
    assert data["priority"] == "high"


@pytest.mark.asyncio
async def test_list_tasks(client: AsyncClient, admin_user):
    """User can list tasks on a board"""
    headers = get_auth_headers(admin_user)
    board_resp = await client.post(
        "/api/v1/kanban/boards",
        json={"name": "List Board", "prefix": "LST"},
        headers=headers,
    )
    board_id = board_resp.json()["id"]
    await client.post(
        f"/api/v1/kanban/boards/{board_id}/tasks",
        json={"title": "Task 1", "priority": "medium"},
        headers=headers,
    )

    resp = await client.get(f"/api/v1/kanban/boards/{board_id}/tasks", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) >= 1


@pytest.mark.asyncio
async def test_move_task(client: AsyncClient, admin_user):
    """User can move a task to a different column"""
    headers = get_auth_headers(admin_user)
    board_resp = await client.post(
        "/api/v1/kanban/boards",
        json={"name": "Move Board", "prefix": "MOV"},
        headers=headers,
    )
    board = board_resp.json()
    board_id = board["id"]
    target_col = board["columns"][1]["id"]

    task_resp = await client.post(
        f"/api/v1/kanban/boards/{board_id}/tasks",
        json={"title": "Moveable Task", "priority": "low"},
        headers=headers,
    )
    task_id = task_resp.json()["id"]

    resp = await client.post(
        f"/api/v1/kanban/boards/{board_id}/tasks/{task_id}/move",
        json={"column_id": target_col, "position": 0},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["column_id"] == target_col


@pytest.mark.asyncio
async def test_add_comment(client: AsyncClient, admin_user):
    """User can add a comment to a task"""
    headers = get_auth_headers(admin_user)
    board_resp = await client.post(
        "/api/v1/kanban/boards",
        json={"name": "Comment Board", "prefix": "CMT"},
        headers=headers,
    )
    board_id = board_resp.json()["id"]
    task_resp = await client.post(
        f"/api/v1/kanban/boards/{board_id}/tasks",
        json={"title": "Commentable Task", "priority": "medium"},
        headers=headers,
    )
    task_id = task_resp.json()["id"]

    resp = await client.post(
        f"/api/v1/kanban/boards/{board_id}/tasks/{task_id}/comments",
        json={"content": "This looks good!"},
        headers=headers,
    )
    assert resp.status_code in (200, 201)
    data = resp.json()
    assert data["content"] == "This looks good!"


@pytest.mark.asyncio
async def test_get_task_history(client: AsyncClient, admin_user):
    """User can get task action history"""
    headers = get_auth_headers(admin_user)
    board_resp = await client.post(
        "/api/v1/kanban/boards",
        json={"name": "History Board", "prefix": "HST"},
        headers=headers,
    )
    board_id = board_resp.json()["id"]
    task_resp = await client.post(
        f"/api/v1/kanban/boards/{board_id}/tasks",
        json={"title": "History Task", "priority": "high"},
        headers=headers,
    )
    task_id = task_resp.json()["id"]

    resp = await client.get(
        f"/api/v1/kanban/boards/{board_id}/tasks/{task_id}/history",
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) >= 1