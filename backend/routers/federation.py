# routers/federation.py — Ecosystem federation & service mesh
import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user, require_permission, CurrentUser
from database import get_db_session
from models import FederatedService, AuditLog, AuditEventType, utcnow

router = APIRouter(prefix="/api/v1/federation", tags=["Federation"])


# --- Schemas ---

class ServiceOut(BaseModel):
    id: str
    name: str
    service_type: str
    endpoint_url: str
    health_check_url: Optional[str] = None
    status: str
    capabilities: list
    last_health_check: Optional[str] = None
    extra_data: dict = Field(default_factory=dict, alias="extra_data")
    created_at: str


class ServiceRegister(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    service_type: str = Field(..., description="agent, space, external")
    endpoint_url: str
    health_check_url: Optional[str] = None
    auth_method: str = "bearer"
    capabilities: List[str] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class ServiceUpdate(BaseModel):
    endpoint_url: Optional[str] = None
    health_check_url: Optional[str] = None
    status: Optional[str] = None
    capabilities: Optional[List[str]] = None
    metadata: Optional[Dict[str, Any]] = None


class ServiceInvoke(BaseModel):
    capability: str
    payload: Dict[str, Any] = Field(default_factory=dict)
    timeout_seconds: int = 30


# --- Helpers ---

def _svc_to_out(s: FederatedService) -> ServiceOut:
    return ServiceOut(
        id=s.id,
        name=s.name,
        service_type=s.service_type,
        endpoint_url=s.endpoint_url,
        health_check_url=s.health_check_url,
        status=s.status or "unknown",
        capabilities=s.capabilities or [],
        last_health_check=s.last_health_check.isoformat() if s.last_health_check else None,
        extra_data=s.extra_data or {},
        created_at=s.created_at.isoformat() if s.created_at else "",
    )


# Ecosystem service definitions (the-* repos + AI agents)
ECOSYSTEM_SERVICES = {
    "the-workshop": {"type": "space", "description": "Development, building, and creation space", "capabilities": ["code:generate", "project:scaffold", "build:execute"]},
    "the-void": {"type": "space", "description": "Secure isolated environment", "capabilities": ["sandbox:create", "quarantine:execute", "isolation:manage"]},
    "the-forge": {"type": "space", "description": "AI model training", "capabilities": ["model:train", "model:evaluate", "dataset:prepare"]},
    "the-citadel": {"type": "space", "description": "Defense and protection", "capabilities": ["security:scan", "threat:detect", "firewall:manage"]},
    "the-library": {"type": "space", "description": "Knowledge management", "capabilities": ["docs:search", "knowledge:index", "content:manage"]},
    "the-lighthouse": {"type": "space", "description": "Monitoring and observability", "capabilities": ["metrics:collect", "alerts:manage", "logs:query"]},
    "the-cryptex": {"type": "space", "description": "Security and encryption", "capabilities": ["encrypt:data", "decrypt:data", "keys:manage", "certificates:issue"]},
    "the-hive": {"type": "space", "description": "Collaborative intelligence", "capabilities": ["swarm:orchestrate", "consensus:reach", "distribute:task"]},
    "the-treasury": {"type": "space", "description": "Financial management", "capabilities": ["billing:manage", "costs:track", "invoices:generate"]},
    "the-observatory": {"type": "space", "description": "Analytics and insights", "capabilities": ["analytics:query", "trends:detect", "reports:generate"]},
    "cornelius-ai": {"type": "agent", "description": "Master AI Orchestrator", "capabilities": ["orchestrate:tasks", "route:requests", "coordinate:agents"]},
    "norman-ai": {"type": "agent", "description": "Security guardian", "capabilities": ["security:audit", "compliance:check", "threat:assess"]},
    "guardian-ai": {"type": "agent", "description": "Protection and defense", "capabilities": ["protect:runtime", "detect:anomaly", "respond:incident"]},
    "mercury-ai": {"type": "agent", "description": "Trading and finance", "capabilities": ["market:analyze", "trade:execute", "portfolio:manage"]},
    "chronos-ai": {"type": "agent", "description": "Time management", "capabilities": ["schedule:manage", "cron:execute", "deadline:track"]},
    "echo-ai": {"type": "agent", "description": "Communication", "capabilities": ["message:send", "notify:user", "channel:manage"]},
    "iris-ai": {"type": "agent", "description": "Visual processing", "capabilities": ["image:analyze", "ocr:extract", "vision:detect"]},
    "oracle-ai": {"type": "agent", "description": "Predictions and forecasting", "capabilities": ["predict:trend", "forecast:demand", "analyze:risk"]},
}


# --- Endpoints ---

@router.get("/services")
async def list_services(
    user: CurrentUser = Depends(require_permission("federation:read")),
    db: AsyncSession = Depends(get_db_session),
    service_type: Optional[str] = None,
    limit: int = Query(default=50, le=200),
):
    """List registered federated services"""
    stmt = (
        select(FederatedService)
        .where(FederatedService.organisation_id == user.organisation_id)
        .order_by(FederatedService.name.asc())
        .limit(limit)
    )
    if service_type:
        stmt = stmt.where(FederatedService.service_type == service_type)

    result = await db.execute(stmt)
    services = result.scalars().all()

    return {"services": [_svc_to_out(s) for s in services], "count": len(services)}


@router.post("/services", response_model=ServiceOut)
async def register_service(
    svc_data: ServiceRegister,
    user: CurrentUser = Depends(require_permission("federation:write")),
    db: AsyncSession = Depends(get_db_session),
):
    """Register a new federated service"""
    svc = FederatedService(
        organisation_id=user.organisation_id,
        name=svc_data.name,
        service_type=svc_data.service_type,
        endpoint_url=svc_data.endpoint_url,
        health_check_url=svc_data.health_check_url,
        auth_method=svc_data.auth_method,
        capabilities=svc_data.capabilities,
        extra_data=svc_data.metadata,
        status="active",
    )
    db.add(svc)
    await db.commit()
    await db.refresh(svc)

    return _svc_to_out(svc)


@router.get("/services/{service_id}", response_model=ServiceOut)
async def get_service(
    service_id: str,
    user: CurrentUser = Depends(require_permission("federation:read")),
    db: AsyncSession = Depends(get_db_session),
):
    """Get service details"""
    stmt = select(FederatedService).where(
        FederatedService.id == service_id,
        FederatedService.organisation_id == user.organisation_id,
    )
    result = await db.execute(stmt)
    svc = result.scalar_one_or_none()
    if not svc:
        raise HTTPException(status_code=404, detail="Service not found")
    return _svc_to_out(svc)


@router.patch("/services/{service_id}", response_model=ServiceOut)
async def update_service(
    service_id: str,
    update: ServiceUpdate,
    user: CurrentUser = Depends(require_permission("federation:write")),
    db: AsyncSession = Depends(get_db_session),
):
    """Update a federated service"""
    stmt = select(FederatedService).where(
        FederatedService.id == service_id,
        FederatedService.organisation_id == user.organisation_id,
    )
    result = await db.execute(stmt)
    svc = result.scalar_one_or_none()
    if not svc:
        raise HTTPException(status_code=404, detail="Service not found")

    if update.endpoint_url is not None:
        svc.endpoint_url = update.endpoint_url
    if update.health_check_url is not None:
        svc.health_check_url = update.health_check_url
    if update.status is not None:
        svc.status = update.status
    if update.capabilities is not None:
        svc.capabilities = update.capabilities
    if update.metadata is not None:
        svc.extra_data = {**(svc.extra_data or {}), **update.metadata}

    db.add(svc)
    await db.commit()
    await db.refresh(svc)
    return _svc_to_out(svc)


@router.delete("/services/{service_id}")
async def deregister_service(
    service_id: str,
    user: CurrentUser = Depends(require_permission("federation:write")),
    db: AsyncSession = Depends(get_db_session),
):
    """Remove a federated service"""
    stmt = select(FederatedService).where(
        FederatedService.id == service_id,
        FederatedService.organisation_id == user.organisation_id,
    )
    result = await db.execute(stmt)
    svc = result.scalar_one_or_none()
    if not svc:
        raise HTTPException(status_code=404, detail="Service not found")

    await db.delete(svc)
    await db.commit()
    return {"service_id": service_id, "status": "deregistered"}


@router.get("/ecosystem")
async def get_ecosystem_map(
    user: CurrentUser = Depends(require_permission("federation:read")),
):
    """Get the full Trancendos ecosystem service map"""
    return {
        "ecosystem": "Trancendos",
        "services": ECOSYSTEM_SERVICES,
        "total_services": len(ECOSYSTEM_SERVICES),
        "service_types": {
            "spaces": len([s for s in ECOSYSTEM_SERVICES.values() if s["type"] == "space"]),
            "agents": len([s for s in ECOSYSTEM_SERVICES.values() if s["type"] == "agent"]),
        },
        "total_capabilities": sum(len(s["capabilities"]) for s in ECOSYSTEM_SERVICES.values()),
    }


@router.post("/services/{service_id}/invoke")
async def invoke_service(
    service_id: str,
    invocation: ServiceInvoke,
    user: CurrentUser = Depends(require_permission("federation:write")),
    db: AsyncSession = Depends(get_db_session),
):
    """Invoke a capability on a federated service"""
    stmt = select(FederatedService).where(
        FederatedService.id == service_id,
        FederatedService.organisation_id == user.organisation_id,
    )
    result = await db.execute(stmt)
    svc = result.scalar_one_or_none()
    if not svc:
        raise HTTPException(status_code=404, detail="Service not found")

    if svc.status != "active":
        raise HTTPException(status_code=503, detail=f"Service is {svc.status}")

    if invocation.capability not in (svc.capabilities or []):
        raise HTTPException(
            status_code=400,
            detail=f"Service does not support capability: {invocation.capability}",
        )

    # In production, this would make an HTTP call to the service endpoint
    # For now, return a structured response
    return {
        "invocation_id": str(uuid.uuid4()),
        "service_id": service_id,
        "service_name": svc.name,
        "capability": invocation.capability,
        "status": "dispatched",
        "message": f"Capability '{invocation.capability}' dispatched to {svc.name}",
        "endpoint": svc.endpoint_url,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.post("/services/{service_id}/health-check")
async def check_service_health(
    service_id: str,
    user: CurrentUser = Depends(require_permission("federation:read")),
    db: AsyncSession = Depends(get_db_session),
):
    """Check health of a federated service"""
    stmt = select(FederatedService).where(
        FederatedService.id == service_id,
        FederatedService.organisation_id == user.organisation_id,
    )
    result = await db.execute(stmt)
    svc = result.scalar_one_or_none()
    if not svc:
        raise HTTPException(status_code=404, detail="Service not found")

    # In production, ping the health_check_url
    # For now, update the timestamp
    svc.last_health_check = datetime.now(timezone.utc)
    db.add(svc)
    await db.commit()

    return {
        "service_id": service_id,
        "name": svc.name,
        "status": svc.status,
        "last_check": svc.last_health_check.isoformat(),
    }