"""Tests for Dependency Manager Router"""
import pytest
from httpx import AsyncClient
from tests.conftest import get_auth_headers


@pytest.mark.asyncio
async def test_create_map(client: AsyncClient, test_user, db_session):
    headers = get_auth_headers(test_user)
    r = await client.post("/api/v1/deps/maps", json={
        "name": "Trancendos Ecosystem",
        "description": "Full dependency map",
        "map_type": "mixed",
    }, headers=headers)
    assert r.status_code == 201
    data = r.json()
    assert data["name"] == "Trancendos Ecosystem"
    assert data["map_type"] == "mixed"


@pytest.mark.asyncio
async def test_list_maps(client: AsyncClient, test_user, db_session):
    headers = get_auth_headers(test_user)
    await client.post("/api/v1/deps/maps", json={"name": "Map A"}, headers=headers)
    r = await client.get("/api/v1/deps/maps", headers=headers)
    assert r.status_code == 200
    assert len(r.json()) >= 1


@pytest.mark.asyncio
async def test_add_nodes(client: AsyncClient, test_user, db_session):
    headers = get_auth_headers(test_user)
    r = await client.post("/api/v1/deps/maps", json={"name": "Node Test Map"}, headers=headers)
    map_id = r.json()["id"]
    r2 = await client.post(f"/api/v1/deps/maps/{map_id}/nodes", json={
        "name": "infinity-portal",
        "node_type": "repo",
        "source_url": "https://github.com/Trancendos/infinity-portal",
    }, headers=headers)
    assert r2.status_code == 201
    assert r2.json()["name"] == "infinity-portal"


@pytest.mark.asyncio
async def test_add_edges(client: AsyncClient, test_user, db_session):
    headers = get_auth_headers(test_user)
    r = await client.post("/api/v1/deps/maps", json={"name": "Edge Test Map"}, headers=headers)
    map_id = r.json()["id"]
    n1 = await client.post(f"/api/v1/deps/maps/{map_id}/nodes", json={"name": "Service A", "node_type": "service"}, headers=headers)
    n2 = await client.post(f"/api/v1/deps/maps/{map_id}/nodes", json={"name": "Service B", "node_type": "service"}, headers=headers)
    r2 = await client.post(f"/api/v1/deps/maps/{map_id}/edges", json={
        "source_id": n1.json()["id"],
        "target_id": n2.json()["id"],
        "edge_type": "depends_on",
        "is_critical": True,
    }, headers=headers)
    assert r2.status_code == 201
    assert r2.json()["edge_type"] == "depends_on"


@pytest.mark.asyncio
async def test_get_map_detail(client: AsyncClient, test_user, db_session):
    headers = get_auth_headers(test_user)
    r = await client.post("/api/v1/deps/maps", json={"name": "Detail Map"}, headers=headers)
    map_id = r.json()["id"]
    await client.post(f"/api/v1/deps/maps/{map_id}/nodes", json={"name": "Node X", "node_type": "repo"}, headers=headers)
    r2 = await client.get(f"/api/v1/deps/maps/{map_id}", headers=headers)
    assert r2.status_code == 200
    data = r2.json()
    assert data["name"] == "Detail Map"
    assert len(data["nodes"]) >= 1


@pytest.mark.asyncio
async def test_impact_analysis(client: AsyncClient, test_user, db_session):
    headers = get_auth_headers(test_user)
    r = await client.post("/api/v1/deps/maps", json={"name": "Impact Map"}, headers=headers)
    map_id = r.json()["id"]
    n1 = await client.post(f"/api/v1/deps/maps/{map_id}/nodes", json={"name": "Core", "node_type": "service"}, headers=headers)
    n2 = await client.post(f"/api/v1/deps/maps/{map_id}/nodes", json={"name": "Downstream", "node_type": "service"}, headers=headers)
    await client.post(f"/api/v1/deps/maps/{map_id}/edges", json={
        "source_id": n1.json()["id"], "target_id": n2.json()["id"], "edge_type": "depends_on",
    }, headers=headers)
    # Check impact of n2 — n1 depends on n2, so if n2 fails, n1 is affected
    r2 = await client.get(f"/api/v1/deps/maps/{map_id}/impact-analysis/{n2.json()['id']}", headers=headers)
    assert r2.status_code == 200
    data = r2.json()
    assert data["blast_radius"] >= 1
    assert len(data["affected_nodes"]) >= 1


@pytest.mark.asyncio
async def test_create_chain(client: AsyncClient, test_user, db_session):
    headers = get_auth_headers(test_user)
    r = await client.post("/api/v1/deps/chains", json={
        "name": "Production Deploy Chain",
        "description": "Full production deployment",
        "auto_rollback": True,
    }, headers=headers)
    assert r.status_code == 201
    assert r.json()["name"] == "Production Deploy Chain"


@pytest.mark.asyncio
async def test_list_chains(client: AsyncClient, test_user, db_session):
    headers = get_auth_headers(test_user)
    await client.post("/api/v1/deps/chains", json={"name": "Chain A"}, headers=headers)
    r = await client.get("/api/v1/deps/chains", headers=headers)
    assert r.status_code == 200
    assert len(r.json()) >= 1


@pytest.mark.asyncio
async def test_repo_health(client: AsyncClient, test_user, db_session):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/deps/repos/health", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert "healthy" in data
    assert "degraded" in data
    assert "down" in data