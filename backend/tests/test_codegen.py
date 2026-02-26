"""Tests for the Code Generation router."""
import pytest
from httpx import AsyncClient
from tests.conftest import get_auth_headers


@pytest.mark.asyncio
async def test_list_languages(client: AsyncClient):
    """Languages endpoint is public."""
    resp = await client.get("/api/v1/codegen/languages")
    assert resp.status_code == 200
    data = resp.json()
    assert "languages" in data
    assert "python" in data["languages"]
    assert "typescript" in data["languages"]
    assert "react" in data["languages"]


@pytest.mark.asyncio
async def test_list_project_types(client: AsyncClient):
    """Project types endpoint is public."""
    resp = await client.get("/api/v1/codegen/project-types")
    assert resp.status_code == 200
    data = resp.json()
    assert "project_types" in data
    type_ids = [t["id"] for t in data["project_types"]]
    assert "react_app" in type_ids
    assert "fastapi_backend" in type_ids


@pytest.mark.asyncio
async def test_list_templates(client: AsyncClient):
    """Templates endpoint is public."""
    resp = await client.get("/api/v1/codegen/templates")
    assert resp.status_code == 200
    data = resp.json()
    assert "templates" in data
    assert "react_app" in data["templates"]
    assert data["templates"]["react_app"]["file_count"] > 0


@pytest.mark.asyncio
async def test_generate_requires_auth(client: AsyncClient):
    """Generate endpoint requires authentication."""
    payload = {
        "description": "A simple todo list application with React",
        "project_type": "react_app",
    }
    resp = await client.post("/api/v1/codegen/generate", json=payload)
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_generate_react_project(client: AsyncClient, test_user):
    """Generate a React project from description."""
    headers = get_auth_headers(test_user)
    payload = {
        "description": "A simple todo list application with React and TypeScript",
        "project_type": "react_app",
        "language": "typescript",
        "features": ["authentication", "dark mode"],
        "include_tests": True,
        "include_docs": True,
    }
    resp = await client.post("/api/v1/codegen/generate", json=payload, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "project_id" in data
    assert "project_name" in data
    assert "files" in data
    assert len(data["files"]) > 0
    assert "stats" in data
    assert data["stats"]["total_files"] > 0
    assert data["stats"]["total_lines"] > 0
    assert "phase" in data
    assert data["phase"]["current"] is not None
    # Check file structure
    file_paths = [f["path"] for f in data["files"]]
    assert any("package.json" in p for p in file_paths)
    assert any("src" in p for p in file_paths)


@pytest.mark.asyncio
async def test_generate_fastapi_project(client: AsyncClient, test_user):
    """Generate a FastAPI backend project."""
    headers = get_auth_headers(test_user)
    payload = {
        "description": "A REST API for managing inventory items",
        "project_type": "fastapi_backend",
        "language": "python",
    }
    resp = await client.post("/api/v1/codegen/generate", json=payload, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["files"]) > 0
    file_paths = [f["path"] for f in data["files"]]
    assert any("requirements.txt" in p for p in file_paths)
    assert any("main.py" in p for p in file_paths)


@pytest.mark.asyncio
async def test_generate_invalid_project_type(client: AsyncClient, test_user):
    """Invalid project type returns 400."""
    headers = get_auth_headers(test_user)
    payload = {
        "description": "A simple application",
        "project_type": "invalid_type",
    }
    resp = await client.post("/api/v1/codegen/generate", json=payload, headers=headers)
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_get_generated_project(client: AsyncClient, test_user):
    """Get a previously generated project."""
    headers = get_auth_headers(test_user)
    # First generate
    payload = {
        "description": "A weather dashboard application",
        "project_type": "react_app",
    }
    gen_resp = await client.post("/api/v1/codegen/generate", json=payload, headers=headers)
    assert gen_resp.status_code == 200
    project_id = gen_resp.json()["project_id"]

    # Then get it
    get_resp = await client.get(f"/api/v1/codegen/projects/{project_id}", headers=headers)
    assert get_resp.status_code == 200
    data = get_resp.json()
    assert data["project_id"] == project_id
    assert "name" in data
    assert "file_count" in data
    assert data["file_count"] > 0


@pytest.mark.asyncio
async def test_get_nonexistent_project(client: AsyncClient, test_user):
    """Getting a non-existent project returns 404."""
    headers = get_auth_headers(test_user)
    resp = await client.get("/api/v1/codegen/projects/nonexistent-id", headers=headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_list_projects(client: AsyncClient, test_user):
    """List all generated projects."""
    headers = get_auth_headers(test_user)
    resp = await client.get("/api/v1/codegen/projects", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "projects" in data
    assert "total" in data


@pytest.mark.asyncio
async def test_code_completion(client: AsyncClient, test_user):
    """Get code completions."""
    headers = get_auth_headers(test_user)
    payload = {
        "file_path": "src/App.tsx",
        "code": "import React from 'react'\n\nconst App = () => {\n  const ",
        "cursor_position": 50,
        "language": "typescript",
    }
    resp = await client.post("/api/v1/codegen/complete", json=payload, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "completions" in data
    assert "count" in data
    assert isinstance(data["completions"], list)


@pytest.mark.asyncio
async def test_refactor_rename(client: AsyncClient, test_user):
    """Refactor code with rename operation."""
    headers = get_auth_headers(test_user)
    payload = {
        "file_path": "src/utils.py",
        "code": "def old_function():\n    return 'hello'\n\nresult = old_function()",
        "refactor_type": "rename",
        "target": "old_function",
        "new_name": "new_function",
    }
    resp = await client.post("/api/v1/codegen/refactor", json=payload, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert "new_function" in data["refactored_code"]
    assert len(data["changes"]) > 0
    assert data["changes"][0]["type"] == "rename"