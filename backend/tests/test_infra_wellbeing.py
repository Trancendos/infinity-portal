# tests/test_infra_wellbeing.py — Infrastructure + Wellbeing Routers Test Suite
"""
Tests for:
  - Arcadian Exchange (arcadian_exchange.py) — Procurement
  - VRAR3D (vrar3d.py) — VR/AR Immersion
"""

import pytest
from httpx import AsyncClient
from tests.conftest import get_auth_headers


# ══════════════════════════════════════════════════════════════════
# ARCADIAN EXCHANGE — Procurement
# ══════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_ae_list_vendors(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/arcadian-exchange/vendors", headers=headers)
    assert r.status_code == 200
    assert "items" in r.json()

@pytest.mark.asyncio
async def test_ae_register_vendor(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    payload = {"name": "CloudForge Ltd", "category": "technology", "rating": 5}
    r = await client.post("/api/v1/arcadian-exchange/vendors", json=payload, headers=headers)
    assert r.status_code == 201
    assert r.json()["name"] == "CloudForge Ltd"
    assert r.json()["category"] == "technology"

@pytest.mark.asyncio
async def test_ae_get_vendor_404(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/arcadian-exchange/vendors/nonexistent", headers=headers)
    assert r.status_code == 404

@pytest.mark.asyncio
async def test_ae_create_order(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    vendor = {"name": "Order Vendor", "category": "infrastructure"}
    r = await client.post("/api/v1/arcadian-exchange/vendors", json=vendor, headers=headers)
    vid = r.json()["id"]
    order = {"vendor_id": vid, "title": "Server Rack x10", "total_amount": 50000, "priority": "high"}
    r = await client.post("/api/v1/arcadian-exchange/orders", json=order, headers=headers)
    assert r.status_code == 201
    assert r.json()["status"] == "submitted"

@pytest.mark.asyncio
async def test_ae_order_vendor_404(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.post("/api/v1/arcadian-exchange/orders",
                          json={"vendor_id": "nope", "title": "X"}, headers=headers)
    assert r.status_code == 404

@pytest.mark.asyncio
async def test_ae_list_orders(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/arcadian-exchange/orders", headers=headers)
    assert r.status_code == 200

@pytest.mark.asyncio
async def test_ae_get_order_404(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/arcadian-exchange/orders/nonexistent", headers=headers)
    assert r.status_code == 404

@pytest.mark.asyncio
async def test_ae_create_contract(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    vendor = {"name": "Contract Vendor", "category": "consulting"}
    r = await client.post("/api/v1/arcadian-exchange/vendors", json=vendor, headers=headers)
    vid = r.json()["id"]
    contract = {"vendor_id": vid, "title": "Annual Support", "contract_type": "maintenance", "value": 120000}
    r = await client.post("/api/v1/arcadian-exchange/contracts", json=contract, headers=headers)
    assert r.status_code == 201
    assert r.json()["status"] == "draft"

@pytest.mark.asyncio
async def test_ae_contract_vendor_404(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.post("/api/v1/arcadian-exchange/contracts",
                          json={"vendor_id": "nope", "title": "X"}, headers=headers)
    assert r.status_code == 404

@pytest.mark.asyncio
async def test_ae_list_contracts(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/arcadian-exchange/contracts", headers=headers)
    assert r.status_code == 200

@pytest.mark.asyncio
async def test_ae_get_contract_404(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/arcadian-exchange/contracts/nonexistent", headers=headers)
    assert r.status_code == 404

@pytest.mark.asyncio
async def test_ae_overview(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/arcadian-exchange/overview", headers=headers)
    assert r.status_code == 200
    assert "total_vendors" in r.json()
    assert "total_orders" in r.json()


# ══════════════════════════════════════════════════════════════════
# VRAR3D — VR/AR Immersion
# ══════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_vr_list_experiences(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/vrar3d/experiences", headers=headers)
    assert r.status_code == 200
    assert "items" in r.json()

@pytest.mark.asyncio
async def test_vr_create_experience(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    payload = {"name": "Arcadia Tour", "experience_type": "vr", "platform": "quest", "max_participants": 50}
    r = await client.post("/api/v1/vrar3d/experiences", json=payload, headers=headers)
    assert r.status_code == 201
    assert r.json()["experience_type"] == "vr"
    assert r.json()["status"] == "draft"

@pytest.mark.asyncio
async def test_vr_get_experience_404(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/vrar3d/experiences/nonexistent", headers=headers)
    assert r.status_code == 404

@pytest.mark.asyncio
async def test_vr_create_anchor(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    exp = {"name": "Anchor Host Exp", "experience_type": "ar"}
    r = await client.post("/api/v1/vrar3d/experiences", json=exp, headers=headers)
    eid = r.json()["id"]
    anchor = {"experience_id": eid, "name": "Entry Point", "anchor_type": "world",
              "position": {"x": 1.0, "y": 2.0, "z": 3.0}}
    r = await client.post("/api/v1/vrar3d/anchors", json=anchor, headers=headers)
    assert r.status_code == 201

@pytest.mark.asyncio
async def test_vr_anchor_exp_404(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.post("/api/v1/vrar3d/anchors",
                          json={"experience_id": "nope", "name": "X"}, headers=headers)
    assert r.status_code == 404

@pytest.mark.asyncio
async def test_vr_list_anchors(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/vrar3d/anchors", headers=headers)
    assert r.status_code == 200

@pytest.mark.asyncio
async def test_vr_get_anchor_404(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/vrar3d/anchors/nonexistent", headers=headers)
    assert r.status_code == 404

@pytest.mark.asyncio
async def test_vr_start_session(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    exp = {"name": "Session Host Exp", "experience_type": "mr"}
    r = await client.post("/api/v1/vrar3d/experiences", json=exp, headers=headers)
    eid = r.json()["id"]
    session = {"experience_id": eid, "participant_count": 4, "device_type": "headset"}
    r = await client.post("/api/v1/vrar3d/sessions", json=session, headers=headers)
    assert r.status_code == 201
    assert r.json()["status"] == "active"

@pytest.mark.asyncio
async def test_vr_session_exp_404(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.post("/api/v1/vrar3d/sessions",
                          json={"experience_id": "nope"}, headers=headers)
    assert r.status_code == 404

@pytest.mark.asyncio
async def test_vr_list_sessions(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/vrar3d/sessions", headers=headers)
    assert r.status_code == 200

@pytest.mark.asyncio
async def test_vr_get_session_404(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/vrar3d/sessions/nonexistent", headers=headers)
    assert r.status_code == 404

@pytest.mark.asyncio
async def test_vr_overview(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/vrar3d/overview", headers=headers)
    assert r.status_code == 200
    assert "total_experiences" in r.json()
    assert "total_sessions" in r.json()