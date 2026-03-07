# tests/test_studio.py — The Studio Routers Test Suite
"""
Tests for the 7 Studio routers:
  - Studio (studio.py) — Creative Hub Orchestrator
  - Section7 (section7.py) — Intelligence
  - Style&Shoot (style_and_shoot.py) — 2D UI/UX
  - DigitalGrid (digital_grid.py) — Spatial CI/CD
  - TranceFlow (tranceflow.py) — 3D Spatial
  - TateKing (tateking.py) — Cinematic
  - Fabulousa (fabulousa.py) — Fashion
"""

import pytest
from httpx import AsyncClient
from tests.conftest import get_auth_headers


# ══════════════════════════════════════════════════════════════════
# THE STUDIO — Creative Hub
# ══════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_studio_list_projects(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/studio/projects", headers=headers)
    assert r.status_code == 200
    assert "items" in r.json()

@pytest.mark.asyncio
async def test_studio_create_project(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    payload = {"name": "Arcadia Rebrand", "studio_modules": ["style_and_shoot", "tranceflow"]}
    r = await client.post("/api/v1/studio/projects", json=payload, headers=headers)
    assert r.status_code == 201
    assert r.json()["name"] == "Arcadia Rebrand"
    assert "id" in r.json()

@pytest.mark.asyncio
async def test_studio_get_project_404(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/studio/projects/nonexistent", headers=headers)
    assert r.status_code == 404

@pytest.mark.asyncio
async def test_studio_create_brief(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    proj = {"name": "Brief Host Project"}
    r = await client.post("/api/v1/studio/projects", json=proj, headers=headers)
    pid = r.json()["id"]
    brief = {"project_id": pid, "title": "Hero Banner Design", "priority": "high"}
    r = await client.post("/api/v1/studio/briefs", json=brief, headers=headers)
    assert r.status_code == 201
    assert r.json()["project_id"] == pid

@pytest.mark.asyncio
async def test_studio_brief_project_404(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.post("/api/v1/studio/briefs", json={"project_id": "nope", "title": "X"}, headers=headers)
    assert r.status_code == 404

@pytest.mark.asyncio
async def test_studio_list_briefs(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/studio/briefs", headers=headers)
    assert r.status_code == 200

@pytest.mark.asyncio
async def test_studio_get_brief_404(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/studio/briefs/nonexistent", headers=headers)
    assert r.status_code == 404

@pytest.mark.asyncio
async def test_studio_upload_asset(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    proj = {"name": "Asset Host Project"}
    r = await client.post("/api/v1/studio/projects", json=proj, headers=headers)
    pid = r.json()["id"]
    asset = {"project_id": pid, "name": "logo.svg", "asset_type": "vector"}
    r = await client.post("/api/v1/studio/assets", json=asset, headers=headers)
    assert r.status_code == 201

@pytest.mark.asyncio
async def test_studio_asset_project_404(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.post("/api/v1/studio/assets", json={"project_id": "nope", "name": "x"}, headers=headers)
    assert r.status_code == 404

@pytest.mark.asyncio
async def test_studio_get_asset_404(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/studio/assets/nonexistent", headers=headers)
    assert r.status_code == 404

@pytest.mark.asyncio
async def test_studio_overview(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/studio/overview", headers=headers)
    assert r.status_code == 200
    assert "total_projects" in r.json()


# ══════════════════════════════════════════════════════════════════
# SECTION7 — Intelligence
# ══════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_s7_create_report(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    payload = {"title": "Competitor Analysis Q4", "classification": "confidential", "domain": "market"}
    r = await client.post("/api/v1/section7/reports", json=payload, headers=headers)
    assert r.status_code == 201
    assert r.json()["classification"] == "confidential"

@pytest.mark.asyncio
async def test_s7_list_reports(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/section7/reports", headers=headers)
    assert r.status_code == 200

@pytest.mark.asyncio
async def test_s7_get_report_404(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/section7/reports/nonexistent", headers=headers)
    assert r.status_code == 404

@pytest.mark.asyncio
async def test_s7_create_task(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    payload = {"title": "Sentiment Scan", "analysis_type": "sentiment"}
    r = await client.post("/api/v1/section7/tasks", json=payload, headers=headers)
    assert r.status_code == 201
    assert r.json()["analysis_type"] == "sentiment"

@pytest.mark.asyncio
async def test_s7_list_tasks(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/section7/tasks", headers=headers)
    assert r.status_code == 200

@pytest.mark.asyncio
async def test_s7_get_task_404(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/section7/tasks/nonexistent", headers=headers)
    assert r.status_code == 404

@pytest.mark.asyncio
async def test_s7_create_feed(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    payload = {"name": "Twitter Monitor", "source_type": "stream", "target": "twitter.com/trancendos"}
    r = await client.post("/api/v1/section7/feeds", json=payload, headers=headers)
    assert r.status_code == 201

@pytest.mark.asyncio
async def test_s7_list_feeds(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/section7/feeds", headers=headers)
    assert r.status_code == 200

@pytest.mark.asyncio
async def test_s7_get_feed_404(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/section7/feeds/nonexistent", headers=headers)
    assert r.status_code == 404

@pytest.mark.asyncio
async def test_s7_overview(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/section7/overview", headers=headers)
    assert r.status_code == 200
    assert "total_reports" in r.json()


# ══════════════════════════════════════════════════════════════════
# STYLE&SHOOT — 2D UI/UX
# ══════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_sns_create_design_system(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    payload = {"name": "Arcadia DS", "brand": "arcadia", "tokens": {"primary": "#6C5CE7"}}
    r = await client.post("/api/v1/style-and-shoot/design-systems", json=payload, headers=headers)
    assert r.status_code == 201
    assert r.json()["brand"] == "arcadia"

@pytest.mark.asyncio
async def test_sns_list_design_systems(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/style-and-shoot/design-systems", headers=headers)
    assert r.status_code == 200

@pytest.mark.asyncio
async def test_sns_get_ds_404(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/style-and-shoot/design-systems/nonexistent", headers=headers)
    assert r.status_code == 404

@pytest.mark.asyncio
async def test_sns_create_component(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    ds = {"name": "Component Host DS"}
    r = await client.post("/api/v1/style-and-shoot/design-systems", json=ds, headers=headers)
    dsid = r.json()["id"]
    comp = {"design_system_id": dsid, "name": "Button", "component_type": "atom"}
    r = await client.post("/api/v1/style-and-shoot/components", json=comp, headers=headers)
    assert r.status_code == 201

@pytest.mark.asyncio
async def test_sns_component_ds_404(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.post("/api/v1/style-and-shoot/components",
                          json={"design_system_id": "nope", "name": "X"}, headers=headers)
    assert r.status_code == 404

@pytest.mark.asyncio
async def test_sns_get_component_404(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/style-and-shoot/components/nonexistent", headers=headers)
    assert r.status_code == 404

@pytest.mark.asyncio
async def test_sns_create_style_guide(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    payload = {"name": "Infinity Portal Guide", "palette": ["#000", "#FFF", "#6C5CE7"]}
    r = await client.post("/api/v1/style-and-shoot/style-guides", json=payload, headers=headers)
    assert r.status_code == 201

@pytest.mark.asyncio
async def test_sns_list_style_guides(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/style-and-shoot/style-guides", headers=headers)
    assert r.status_code == 200

@pytest.mark.asyncio
async def test_sns_get_guide_404(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/style-and-shoot/style-guides/nonexistent", headers=headers)
    assert r.status_code == 404

@pytest.mark.asyncio
async def test_sns_overview(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/style-and-shoot/overview", headers=headers)
    assert r.status_code == 200
    assert "total_design_systems" in r.json()


# ══════════════════════════════════════════════════════════════════
# DIGITALGRID — Spatial CI/CD
# ══════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_dg_register_node(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    payload = {"name": "render-node-01", "node_type": "render", "region": "eu-west-1"}
    r = await client.post("/api/v1/digital-grid/nodes", json=payload, headers=headers)
    assert r.status_code == 201
    assert r.json()["status"] == "online"

@pytest.mark.asyncio
async def test_dg_list_nodes(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/digital-grid/nodes", headers=headers)
    assert r.status_code == 200

@pytest.mark.asyncio
async def test_dg_get_node_404(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/digital-grid/nodes/nonexistent", headers=headers)
    assert r.status_code == 404

@pytest.mark.asyncio
async def test_dg_create_build(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    payload = {"name": "Scene Pack v1", "spatial_format": "glb"}
    r = await client.post("/api/v1/digital-grid/builds", json=payload, headers=headers)
    assert r.status_code == 201
    assert r.json()["status"] == "queued"

@pytest.mark.asyncio
async def test_dg_get_build_404(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/digital-grid/builds/nonexistent", headers=headers)
    assert r.status_code == 404

@pytest.mark.asyncio
async def test_dg_create_deployment(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    build = {"name": "Deploy Build", "spatial_format": "usdz"}
    r = await client.post("/api/v1/digital-grid/builds", json=build, headers=headers)
    bid = r.json()["id"]
    dep = {"name": "Staging Deploy", "build_id": bid, "target_environment": "staging"}
    r = await client.post("/api/v1/digital-grid/deployments", json=dep, headers=headers)
    assert r.status_code == 201

@pytest.mark.asyncio
async def test_dg_deployment_build_404(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.post("/api/v1/digital-grid/deployments",
                          json={"name": "X", "build_id": "nope"}, headers=headers)
    assert r.status_code == 404

@pytest.mark.asyncio
async def test_dg_get_deployment_404(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/digital-grid/deployments/nonexistent", headers=headers)
    assert r.status_code == 404

@pytest.mark.asyncio
async def test_dg_overview(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/digital-grid/overview", headers=headers)
    assert r.status_code == 200
    assert "total_nodes" in r.json()


# ══════════════════════════════════════════════════════════════════
# TRANCEFLOW — 3D Spatial
# ══════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_tf_create_scene(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    payload = {"name": "Lobby Environment", "scene_type": "environment", "lighting": "dramatic"}
    r = await client.post("/api/v1/tranceflow/scenes", json=payload, headers=headers)
    assert r.status_code == 201
    assert r.json()["lighting"] == "dramatic"

@pytest.mark.asyncio
async def test_tf_list_scenes(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/tranceflow/scenes", headers=headers)
    assert r.status_code == 200

@pytest.mark.asyncio
async def test_tf_get_scene_404(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/tranceflow/scenes/nonexistent", headers=headers)
    assert r.status_code == 404

@pytest.mark.asyncio
async def test_tf_create_material(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    payload = {"name": "Brushed Metal", "material_type": "metal"}
    r = await client.post("/api/v1/tranceflow/materials", json=payload, headers=headers)
    assert r.status_code == 201

@pytest.mark.asyncio
async def test_tf_list_materials(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/tranceflow/materials", headers=headers)
    assert r.status_code == 200

@pytest.mark.asyncio
async def test_tf_get_material_404(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/tranceflow/materials/nonexistent", headers=headers)
    assert r.status_code == 404

@pytest.mark.asyncio
async def test_tf_submit_render(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    scene = {"name": "Render Scene", "scene_type": "prop"}
    r = await client.post("/api/v1/tranceflow/scenes", json=scene, headers=headers)
    sid = r.json()["id"]
    render = {"scene_id": sid, "output_format": "exr", "quality": "cinematic"}
    r = await client.post("/api/v1/tranceflow/renders", json=render, headers=headers)
    assert r.status_code == 201
    assert r.json()["quality"] == "cinematic"

@pytest.mark.asyncio
async def test_tf_render_scene_404(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.post("/api/v1/tranceflow/renders",
                          json={"scene_id": "nope", "output_format": "png"}, headers=headers)
    assert r.status_code == 404

@pytest.mark.asyncio
async def test_tf_get_render_404(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/tranceflow/renders/nonexistent", headers=headers)
    assert r.status_code == 404

@pytest.mark.asyncio
async def test_tf_overview(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/tranceflow/overview", headers=headers)
    assert r.status_code == 200
    assert "total_scenes" in r.json()


# ══════════════════════════════════════════════════════════════════
# TATEKING — Cinematic
# ══════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_tk_create_production(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    payload = {"title": "Trancendos Origins", "genre": "narrative", "format": "4k"}
    r = await client.post("/api/v1/tateking/productions", json=payload, headers=headers)
    assert r.status_code == 201
    assert r.json()["status"] == "pre_production"

@pytest.mark.asyncio
async def test_tk_list_productions(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/tateking/productions", headers=headers)
    assert r.status_code == 200

@pytest.mark.asyncio
async def test_tk_get_production_404(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/tateking/productions/nonexistent", headers=headers)
    assert r.status_code == 404

@pytest.mark.asyncio
async def test_tk_create_storyboard(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    prod = {"title": "Storyboard Host", "genre": "documentary"}
    r = await client.post("/api/v1/tateking/productions", json=prod, headers=headers)
    pid = r.json()["id"]
    sb = {"production_id": pid, "title": "Act 1 Boards", "panels": 24}
    r = await client.post("/api/v1/tateking/storyboards", json=sb, headers=headers)
    assert r.status_code == 201

@pytest.mark.asyncio
async def test_tk_storyboard_prod_404(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.post("/api/v1/tateking/storyboards",
                          json={"production_id": "nope", "title": "X"}, headers=headers)
    assert r.status_code == 404

@pytest.mark.asyncio
async def test_tk_get_storyboard_404(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/tateking/storyboards/nonexistent", headers=headers)
    assert r.status_code == 404

@pytest.mark.asyncio
async def test_tk_create_shot(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    prod = {"title": "Shot Host", "genre": "commercial"}
    r = await client.post("/api/v1/tateking/productions", json=prod, headers=headers)
    pid = r.json()["id"]
    shot = {"production_id": pid, "shot_number": 1, "shot_type": "aerial", "duration_seconds": 12.5}
    r = await client.post("/api/v1/tateking/shots", json=shot, headers=headers)
    assert r.status_code == 201

@pytest.mark.asyncio
async def test_tk_shot_prod_404(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.post("/api/v1/tateking/shots",
                          json={"production_id": "nope", "shot_number": 1}, headers=headers)
    assert r.status_code == 404

@pytest.mark.asyncio
async def test_tk_get_shot_404(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/tateking/shots/nonexistent", headers=headers)
    assert r.status_code == 404

@pytest.mark.asyncio
async def test_tk_overview(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/tateking/overview", headers=headers)
    assert r.status_code == 200
    assert "total_productions" in r.json()


# ══════════════════════════════════════════════════════════════════
# FABULOUSA — Fashion & Lifestyle
# ══════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_fab_create_collection(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    payload = {"name": "Neon Dreams", "season": "aw25", "theme": "cyberpunk couture"}
    r = await client.post("/api/v1/fabulousa/collections", json=payload, headers=headers)
    assert r.status_code == 201
    assert r.json()["season"] == "aw25"

@pytest.mark.asyncio
async def test_fab_list_collections(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/fabulousa/collections", headers=headers)
    assert r.status_code == 200

@pytest.mark.asyncio
async def test_fab_get_collection_404(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/fabulousa/collections/nonexistent", headers=headers)
    assert r.status_code == 404

@pytest.mark.asyncio
async def test_fab_create_lookbook(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    coll = {"name": "Lookbook Host Collection", "season": "ss26"}
    r = await client.post("/api/v1/fabulousa/collections", json=coll, headers=headers)
    cid = r.json()["id"]
    lb = {"collection_id": cid, "title": "Summer Vibes", "looks": 12, "mood": "street"}
    r = await client.post("/api/v1/fabulousa/lookbooks", json=lb, headers=headers)
    assert r.status_code == 201

@pytest.mark.asyncio
async def test_fab_lookbook_coll_404(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.post("/api/v1/fabulousa/lookbooks",
                          json={"collection_id": "nope", "title": "X"}, headers=headers)
    assert r.status_code == 404

@pytest.mark.asyncio
async def test_fab_get_lookbook_404(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/fabulousa/lookbooks/nonexistent", headers=headers)
    assert r.status_code == 404

@pytest.mark.asyncio
async def test_fab_create_campaign(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    payload = {"name": "Launch Blitz", "campaign_type": "social", "channels": ["instagram", "tiktok"]}
    r = await client.post("/api/v1/fabulousa/campaigns", json=payload, headers=headers)
    assert r.status_code == 201

@pytest.mark.asyncio
async def test_fab_list_campaigns(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/fabulousa/campaigns", headers=headers)
    assert r.status_code == 200

@pytest.mark.asyncio
async def test_fab_get_campaign_404(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/fabulousa/campaigns/nonexistent", headers=headers)
    assert r.status_code == 404

@pytest.mark.asyncio
async def test_fab_overview(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/fabulousa/overview", headers=headers)
    assert r.status_code == 200
    assert "total_collections" in r.json()