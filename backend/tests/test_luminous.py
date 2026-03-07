# tests/test_luminous.py — Luminous / Cornelius MacIntyre — Cognitive Core
"""
Tests for the Luminous application router:
  - Knowledge Graph (nodes + edges)
  - Cognitive Sessions
  - Insights
  - Neural Mesh status
  - Overview
"""

import pytest
from httpx import AsyncClient
from tests.conftest import get_auth_headers


# ── Knowledge Graph — Nodes ──────────────────────────────────────

@pytest.mark.asyncio
async def test_luminous_list_nodes(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/luminous/knowledge/nodes", headers=headers)
    assert r.status_code == 200
    assert "items" in r.json()

@pytest.mark.asyncio
async def test_luminous_create_node(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    payload = {"label": "Trancendos Ecosystem", "node_type": "entity", "domain": "architecture"}
    r = await client.post("/api/v1/luminous/knowledge/nodes", json=payload, headers=headers)
    assert r.status_code == 201
    assert r.json()["label"] == "Trancendos Ecosystem"
    assert r.json()["node_type"] == "entity"

@pytest.mark.asyncio
async def test_luminous_get_node(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    payload = {"label": "Fetchable Node", "node_type": "concept"}
    r = await client.post("/api/v1/luminous/knowledge/nodes", json=payload, headers=headers)
    nid = r.json()["id"]
    r = await client.get(f"/api/v1/luminous/knowledge/nodes/{nid}", headers=headers)
    assert r.status_code == 200
    assert r.json()["id"] == nid

@pytest.mark.asyncio
async def test_luminous_get_node_404(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/luminous/knowledge/nodes/nonexistent", headers=headers)
    assert r.status_code == 404


# ── Knowledge Graph — Edges ──────────────────────────────────────

@pytest.mark.asyncio
async def test_luminous_create_edge(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    # Create two nodes
    n1 = {"label": "Source Node", "node_type": "concept"}
    r = await client.post("/api/v1/luminous/knowledge/nodes", json=n1, headers=headers)
    src = r.json()["id"]
    n2 = {"label": "Target Node", "node_type": "entity"}
    r = await client.post("/api/v1/luminous/knowledge/nodes", json=n2, headers=headers)
    tgt = r.json()["id"]
    # Create edge
    edge = {"source_id": src, "target_id": tgt, "relation": "governs", "weight": 2.5}
    r = await client.post("/api/v1/luminous/knowledge/edges", json=edge, headers=headers)
    assert r.status_code == 201
    assert r.json()["relation"] == "governs"

@pytest.mark.asyncio
async def test_luminous_edge_source_404(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    n = {"label": "Lonely Node"}
    r = await client.post("/api/v1/luminous/knowledge/nodes", json=n, headers=headers)
    tgt = r.json()["id"]
    r = await client.post("/api/v1/luminous/knowledge/edges",
                          json={"source_id": "nope", "target_id": tgt, "relation": "x"}, headers=headers)
    assert r.status_code == 404

@pytest.mark.asyncio
async def test_luminous_edge_target_404(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    n = {"label": "Source Only"}
    r = await client.post("/api/v1/luminous/knowledge/nodes", json=n, headers=headers)
    src = r.json()["id"]
    r = await client.post("/api/v1/luminous/knowledge/edges",
                          json={"source_id": src, "target_id": "nope", "relation": "x"}, headers=headers)
    assert r.status_code == 404

@pytest.mark.asyncio
async def test_luminous_list_edges(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/luminous/knowledge/edges", headers=headers)
    assert r.status_code == 200
    assert "items" in r.json()

@pytest.mark.asyncio
async def test_luminous_get_edge_404(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/luminous/knowledge/edges/nonexistent", headers=headers)
    assert r.status_code == 404


# ── Cognitive Sessions ───────────────────────────────────────────

@pytest.mark.asyncio
async def test_luminous_create_session(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    payload = {"title": "Ecosystem Strategy Review", "session_type": "analysis",
               "participants": ["cornelius-macintyre", "trancendos"]}
    r = await client.post("/api/v1/luminous/sessions", json=payload, headers=headers)
    assert r.status_code == 201
    assert r.json()["status"] == "active"
    assert r.json()["session_type"] == "analysis"

@pytest.mark.asyncio
async def test_luminous_list_sessions(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/luminous/sessions", headers=headers)
    assert r.status_code == 200

@pytest.mark.asyncio
async def test_luminous_get_session_404(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/luminous/sessions/nonexistent", headers=headers)
    assert r.status_code == 404

@pytest.mark.asyncio
async def test_luminous_end_session(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    sess = {"title": "Endable Session", "session_type": "exploration"}
    r = await client.post("/api/v1/luminous/sessions", json=sess, headers=headers)
    sid = r.json()["id"]
    r = await client.post(f"/api/v1/luminous/sessions/{sid}/end", headers=headers)
    assert r.status_code == 200
    assert r.json()["status"] == "completed"
    assert r.json()["ended_at"] is not None

@pytest.mark.asyncio
async def test_luminous_end_session_404(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.post("/api/v1/luminous/sessions/nonexistent/end", headers=headers)
    assert r.status_code == 404


# ── Insights ─────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_luminous_create_insight(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    payload = {"title": "Lane 3 Bottleneck Detected", "insight_type": "warning",
               "content": "Data throughput in Hive layer dropping below threshold",
               "confidence": 0.92, "tags": ["performance", "hive"]}
    r = await client.post("/api/v1/luminous/insights", json=payload, headers=headers)
    assert r.status_code == 201
    assert r.json()["insight_type"] == "warning"
    assert r.json()["confidence"] == 0.92

@pytest.mark.asyncio
async def test_luminous_list_insights(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/luminous/insights", headers=headers)
    assert r.status_code == 200

@pytest.mark.asyncio
async def test_luminous_get_insight_404(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/luminous/insights/nonexistent", headers=headers)
    assert r.status_code == 404


# ── Neural Mesh & Overview ───────────────────────────────────────

@pytest.mark.asyncio
async def test_luminous_neural_mesh(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/luminous/neural-mesh", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert "status" in data
    assert "knowledge_nodes" in data
    assert "mesh_health" in data

@pytest.mark.asyncio
async def test_luminous_overview(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/luminous/overview", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert "total_knowledge_nodes" in data
    assert "total_sessions" in data
    assert "total_insights" in data