"""
Dependency Manager Router — Cross-Repository Dependency Management
Maps, nodes, edges, deployment chains, repo sync, impact analysis
Central management for the entire Trancendos ecosystem
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_
from pydantic import BaseModel, Field
from typing import Optional, List

import uuid
from database import get_db_session
from auth import get_current_user, require_min_role
from models import (
    User, UserRole, utcnow,
    DependencyMap, DependencyNode, DependencyEdge,
    DeploymentChain, DeploymentExecution, RepoSyncConfig,
    DependencyMapType, NodeHealthStatus, AuditLog,
)

router = APIRouter(prefix="/api/v1/deps", tags=["dependencies"])


# ── Schemas ──────────────────────────────────────────────────

class MapCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=300)
    description: Optional[str] = None
    map_type: str = "mixed"

class NodeCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=300)
    node_type: str  # repo, service, package, infra
    source_url: Optional[str] = None
    version: Optional[str] = None
    health_check_url: Optional[str] = None
    extra_data: dict = {}

class EdgeCreate(BaseModel):
    source_id: str
    target_id: str
    edge_type: str  # depends_on, blocks, triggers, deploys_to
    weight: int = 1
    is_critical: bool = False
    label: Optional[str] = None

class ChainCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=300)
    description: Optional[str] = None
    node_ids: List[str] = []
    auto_rollback: bool = True

class RepoSyncCreate(BaseModel):
    repo_url: str
    repo_name: str
    branch: str = "main"
    sync_frequency_mins: int = 60
    health_check_url: Optional[str] = None
    auto_deploy: bool = False
    deploy_chain_id: Optional[str] = None


# ── Dependency Maps ──────────────────────────────────────────

@router.post("/maps", status_code=201)
async def create_map(
    body: MapCreate,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    dep_map = DependencyMap(
        name=body.name,
        description=body.description,
        map_type=body.map_type,
        organisation_id=user.organisation_id,
    )
    db.add(dep_map)
    await db.commit()
    await db.refresh(dep_map)
    return {"id": dep_map.id, "name": dep_map.name, "map_type": dep_map.map_type}


@router.get("/maps")
async def list_maps(
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(DependencyMap).where(DependencyMap.organisation_id == user.organisation_id)
    )
    maps = result.scalars().all()

    items = []
    for m in maps:
        node_count = (await db.execute(
            select(func.count(DependencyNode.id)).where(DependencyNode.map_id == m.id)
        )).scalar() or 0
        edge_count = (await db.execute(
            select(func.count(DependencyEdge.id)).where(DependencyEdge.map_id == m.id)
        )).scalar() or 0
        items.append({
            "id": m.id, "name": m.name, "description": m.description,
            "map_type": m.map_type, "auto_discovered": m.auto_discovered,
            "node_count": node_count, "edge_count": edge_count,
            "created_at": str(m.created_at),
        })

    return items


@router.get("/maps/{map_id}")
async def get_map(
    map_id: str,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(DependencyMap).where(
            and_(DependencyMap.id == map_id, DependencyMap.organisation_id == user.organisation_id)
        )
    )
    dep_map = result.scalars().first()
    if not dep_map:
        raise HTTPException(404, "Map not found")

    nodes_result = await db.execute(
        select(DependencyNode).where(DependencyNode.map_id == map_id)
    )
    nodes = nodes_result.scalars().all()

    edges_result = await db.execute(
        select(DependencyEdge).where(DependencyEdge.map_id == map_id)
    )
    edges = edges_result.scalars().all()

    return {
        "id": dep_map.id, "name": dep_map.name, "description": dep_map.description,
        "map_type": dep_map.map_type,
        "nodes": [
            {"id": n.id, "name": n.name, "node_type": n.node_type,
             "source_url": n.source_url, "version": n.version,
             "health_status": n.health_status, "extra_data": n.extra_data}
            for n in nodes
        ],
        "edges": [
            {"id": e.id, "source_id": e.source_id, "target_id": e.target_id,
             "edge_type": e.edge_type, "weight": e.weight,
             "is_critical": e.is_critical, "label": e.label}
            for e in edges
        ],
    }


# ── Nodes & Edges ────────────────────────────────────────────

@router.post("/maps/{map_id}/nodes", status_code=201)
async def add_node(
    map_id: str,
    body: NodeCreate,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    node = DependencyNode(
        map_id=map_id,
        name=body.name,
        node_type=body.node_type,
        source_url=body.source_url,
        version=body.version,
        health_check_url=body.health_check_url,
        extra_data=body.extra_data,
    )
    db.add(node)
    await db.commit()
    await db.refresh(node)
    return {"id": node.id, "name": node.name, "node_type": node.node_type}


@router.post("/maps/{map_id}/edges", status_code=201)
async def add_edge(
    map_id: str,
    body: EdgeCreate,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    edge = DependencyEdge(
        map_id=map_id,
        source_id=body.source_id,
        target_id=body.target_id,
        edge_type=body.edge_type,
        weight=body.weight,
        is_critical=body.is_critical,
        label=body.label,
    )
    db.add(edge)
    await db.commit()
    await db.refresh(edge)
    return {"id": edge.id, "source_id": edge.source_id, "target_id": edge.target_id, "edge_type": edge.edge_type}


@router.delete("/maps/{map_id}/nodes/{node_id}")
async def remove_node(
    map_id: str,
    node_id: str,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(DependencyNode).where(
            and_(DependencyNode.id == node_id, DependencyNode.map_id == map_id)
        )
    )
    node = result.scalars().first()
    if not node:
        raise HTTPException(404, "Node not found")

    # Delete connected edges
    await db.execute(
        select(DependencyEdge).where(
            or_(DependencyEdge.source_id == node_id, DependencyEdge.target_id == node_id)
        )
    )
    # Actually delete edges
    from sqlalchemy import delete
    await db.execute(
        delete(DependencyEdge).where(
            or_(DependencyEdge.source_id == node_id, DependencyEdge.target_id == node_id)
        )
    )
    await db.delete(node)
    await db.commit()
    return {"status": "deleted"}


@router.get("/maps/{map_id}/nodes/{node_id}/upstream")
async def get_upstream(
    map_id: str,
    node_id: str,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    """All nodes that this node depends on (upstream)"""
    result = await db.execute(
        select(DependencyEdge, DependencyNode)
        .join(DependencyNode, DependencyEdge.target_id == DependencyNode.id)
        .where(and_(DependencyEdge.map_id == map_id, DependencyEdge.source_id == node_id))
    )
    items = result.all()
    return [
        {"id": n.id, "name": n.name, "node_type": n.node_type,
         "edge_type": e.edge_type, "is_critical": e.is_critical}
        for e, n in items
    ]


@router.get("/maps/{map_id}/nodes/{node_id}/downstream")
async def get_downstream(
    map_id: str,
    node_id: str,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    """All nodes that depend on this node (downstream)"""
    result = await db.execute(
        select(DependencyEdge, DependencyNode)
        .join(DependencyNode, DependencyEdge.source_id == DependencyNode.id)
        .where(and_(DependencyEdge.map_id == map_id, DependencyEdge.target_id == node_id))
    )
    items = result.all()
    return [
        {"id": n.id, "name": n.name, "node_type": n.node_type,
         "edge_type": e.edge_type, "is_critical": e.is_critical}
        for e, n in items
    ]


@router.get("/maps/{map_id}/critical-path")
async def critical_path(
    map_id: str,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    """Calculate critical path through the dependency chain"""
    edges_result = await db.execute(
        select(DependencyEdge).where(
            and_(DependencyEdge.map_id == map_id, DependencyEdge.is_critical == True)
        )
    )
    critical_edges = edges_result.scalars().all()

    node_ids = set()
    for e in critical_edges:
        node_ids.add(e.source_id)
        node_ids.add(e.target_id)

    nodes = []
    if node_ids:
        nodes_result = await db.execute(
            select(DependencyNode).where(DependencyNode.id.in_(node_ids))
        )
        nodes = [
            {"id": n.id, "name": n.name, "node_type": n.node_type, "health_status": n.health_status}
            for n in nodes_result.scalars().all()
        ]

    return {
        "critical_nodes": nodes,
        "critical_edges": [
            {"source_id": e.source_id, "target_id": e.target_id, "edge_type": e.edge_type}
            for e in critical_edges
        ],
    }


@router.get("/maps/{map_id}/impact-analysis/{node_id}")
async def impact_analysis(
    map_id: str,
    node_id: str,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    """What breaks if this node fails? BFS through downstream dependencies."""
    visited = set()
    queue = [node_id]
    affected = []

    while queue:
        current = queue.pop(0)
        if current in visited:
            continue
        visited.add(current)

        # Find all nodes that depend on current
        result = await db.execute(
            select(DependencyEdge).where(
                and_(DependencyEdge.map_id == map_id, DependencyEdge.target_id == current)
            )
        )
        edges = result.scalars().all()
        for edge in edges:
            if edge.source_id not in visited:
                queue.append(edge.source_id)
                # Get node info
                node_result = await db.execute(
                    select(DependencyNode).where(DependencyNode.id == edge.source_id)
                )
                node = node_result.scalars().first()
                if node:
                    affected.append({
                        "id": node.id, "name": node.name, "node_type": node.node_type,
                        "edge_type": edge.edge_type, "is_critical": edge.is_critical,
                    })

    return {
        "source_node_id": node_id,
        "affected_count": len(affected),
        "affected_nodes": affected,
        "blast_radius": len(affected),
    }


# ── Deployment Chains ────────────────────────────────────────

@router.post("/chains", status_code=201)
async def create_chain(
    body: ChainCreate,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    chain = DeploymentChain(
        name=body.name,
        description=body.description,
        node_ids=body.node_ids,
        auto_rollback=body.auto_rollback,
        organisation_id=user.organisation_id,
    )
    db.add(chain)
    await db.commit()
    await db.refresh(chain)
    return {"id": chain.id, "name": chain.name, "steps": len(body.node_ids)}


@router.get("/chains")
async def list_chains(
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(DeploymentChain).where(DeploymentChain.organisation_id == user.organisation_id)
    )
    chains = result.scalars().all()
    return [
        {"id": c.id, "name": c.name, "description": c.description,
         "steps": len(c.node_ids or []), "auto_rollback": c.auto_rollback,
         "last_executed": str(c.last_executed) if c.last_executed else None}
        for c in chains
    ]


@router.post("/chains/{chain_id}/execute")
async def execute_chain(
    chain_id: str,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(require_min_role(UserRole.POWER_USER)),
):
    result = await db.execute(
        select(DeploymentChain).where(
            and_(DeploymentChain.id == chain_id, DeploymentChain.organisation_id == user.organisation_id)
        )
    )
    chain = result.scalars().first()
    if not chain:
        raise HTTPException(404, "Chain not found")

    execution = DeploymentExecution(
        chain_id=chain.id,
        triggered_by=user.id,
        total_steps=len(chain.node_ids or []),
        logs=[{"step": 0, "message": "Deployment chain started", "timestamp": str(utcnow())}],
    )
    db.add(execution)
    chain.last_executed = utcnow()

    db.add(AuditLog(
            request_id=str(uuid.uuid4()),
        user_id=user.id,
        organisation_id=user.organisation_id,
        event_type="deployment.chain.executed",
        resource_type="deployment_chain",
        resource_id=chain.id,
        governance_metadata={"chain_name": chain.name, "steps": len(chain.node_ids or [])},
    ))

    await db.commit()
    await db.refresh(execution)
    return {"execution_id": execution.id, "status": execution.status, "total_steps": execution.total_steps}


@router.get("/chains/{chain_id}/executions")
async def list_executions(
    chain_id: str,
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(DeploymentExecution).where(DeploymentExecution.chain_id == chain_id)
        .order_by(DeploymentExecution.started_at.desc()).offset(skip).limit(limit)
    )
    executions = result.scalars().all()
    return [
        {"id": e.id, "status": e.status, "current_step": e.current_step,
         "total_steps": e.total_steps, "triggered_by": e.triggered_by,
         "started_at": str(e.started_at),
         "completed_at": str(e.completed_at) if e.completed_at else None}
        for e in executions
    ]


@router.post("/chains/{chain_id}/executions/{exec_id}/rollback")
async def rollback_execution(
    chain_id: str,
    exec_id: str,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(require_min_role(UserRole.POWER_USER)),
):
    result = await db.execute(
        select(DeploymentExecution).where(DeploymentExecution.id == exec_id)
    )
    execution = result.scalars().first()
    if not execution:
        raise HTTPException(404, "Execution not found")

    execution.status = "rolled_back"
    execution.completed_at = utcnow()
    logs = execution.logs or []
    logs.append({"step": -1, "message": f"Rolled back by {user.id}", "timestamp": str(utcnow())})
    execution.logs = logs

    await db.commit()
    return {"status": "rolled_back", "execution_id": exec_id}


# ── Repository Sync ──────────────────────────────────────────

@router.post("/repos/sync", status_code=201)
async def register_repo_sync(
    body: RepoSyncCreate,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    config = RepoSyncConfig(
        repo_url=body.repo_url,
        repo_name=body.repo_name,
        branch=body.branch,
        sync_frequency_mins=body.sync_frequency_mins,
        health_check_url=body.health_check_url,
        auto_deploy=body.auto_deploy,
        deploy_chain_id=body.deploy_chain_id,
        organisation_id=user.organisation_id,
    )
    db.add(config)
    await db.commit()
    await db.refresh(config)
    return {"id": config.id, "repo_name": config.repo_name, "branch": config.branch}


@router.get("/repos/sync")
async def list_repo_syncs(
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(RepoSyncConfig).where(RepoSyncConfig.organisation_id == user.organisation_id)
    )
    configs = result.scalars().all()
    return [
        {"id": c.id, "repo_name": c.repo_name, "repo_url": c.repo_url,
         "branch": c.branch, "health_status": c.health_status,
         "auto_deploy": c.auto_deploy, "last_synced": str(c.last_synced) if c.last_synced else None}
        for c in configs
    ]


@router.post("/repos/sync/{config_id}/trigger")
async def trigger_repo_sync(
    config_id: str,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(RepoSyncConfig).where(
            and_(RepoSyncConfig.id == config_id, RepoSyncConfig.organisation_id == user.organisation_id)
        )
    )
    config = result.scalars().first()
    if not config:
        raise HTTPException(404, "Repo sync config not found")

    config.last_synced = utcnow()
    config.health_status = NodeHealthStatus.HEALTHY.value
    await db.commit()
    return {"status": "sync_triggered", "repo_name": config.repo_name}


@router.get("/repos/health")
async def repos_health(
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(RepoSyncConfig).where(RepoSyncConfig.organisation_id == user.organisation_id)
    )
    configs = result.scalars().all()

    healthy = sum(1 for c in configs if c.health_status == "healthy")
    degraded = sum(1 for c in configs if c.health_status == "degraded")
    down = sum(1 for c in configs if c.health_status == "down")
    unknown = sum(1 for c in configs if c.health_status == "unknown")

    return {
        "total": len(configs),
        "healthy": healthy,
        "degraded": degraded,
        "down": down,
        "unknown": unknown,
        "repos": [
            {"name": c.repo_name, "status": c.health_status,
             "last_synced": str(c.last_synced) if c.last_synced else None}
            for c in configs
        ],
    }