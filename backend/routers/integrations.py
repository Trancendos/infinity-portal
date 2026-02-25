# routers/integrations.py — API Integration Hub
import uuid
import hmac
import hashlib
import secrets
import httpx
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user, require_permission, require_min_role, CurrentUser
from database import get_db_session
from models import (
    IntegrationConnector, WebhookEndpoint, WebhookDelivery,
    AuditLog, AuditEventType, ConnectorStatus, ConnectorAuthType,
    WebhookEventType, UserRole, utcnow, new_uuid,
)

router = APIRouter(prefix="/api/v1/integrations", tags=["Integrations"])


# --- Schemas ---

class ConnectorCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    slug: str = Field(..., min_length=1, max_length=50, pattern=r'^[a-z0-9][a-z0-9-]*$')
    description: Optional[str] = None
    icon_url: Optional[str] = None
    category: str = Field(default="general")
    base_url: str = Field(..., min_length=1)
    auth_type: str = Field(default="bearer")
    auth_config: Dict[str, Any] = Field(default_factory=dict)
    headers: Dict[str, str] = Field(default_factory=dict)
    rate_limit_rpm: int = Field(default=60, ge=1, le=10000)
    capabilities: List[str] = Field(default_factory=list)
    supported_events: List[str] = Field(default_factory=list)
    config_schema: Dict[str, Any] = Field(default_factory=dict)
    user_config: Dict[str, Any] = Field(default_factory=dict)


class ConnectorUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    icon_url: Optional[str] = None
    category: Optional[str] = None
    base_url: Optional[str] = None
    auth_type: Optional[str] = None
    auth_config: Optional[Dict[str, Any]] = None
    headers: Optional[Dict[str, str]] = None
    rate_limit_rpm: Optional[int] = None
    capabilities: Optional[List[str]] = None
    supported_events: Optional[List[str]] = None
    user_config: Optional[Dict[str, Any]] = None
    status: Optional[str] = None


class ConnectorOut(BaseModel):
    id: str
    name: str
    slug: str
    description: Optional[str] = None
    icon_url: Optional[str] = None
    category: str
    base_url: str
    auth_type: str
    status: str
    capabilities: list
    supported_events: list
    rate_limit_rpm: int
    request_count: int
    error_count: int
    is_built_in: bool
    version: str
    last_health_check: Optional[str] = None
    last_error: Optional[str] = None
    webhook_count: int = 0
    created_at: str


class WebhookCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    event_type: str = Field(default="incoming")
    url: Optional[str] = None
    event_filters: List[str] = Field(default_factory=list)
    headers: Dict[str, str] = Field(default_factory=dict)
    max_retries: int = Field(default=3, ge=0, le=10)
    retry_delay_seconds: int = Field(default=60, ge=10, le=3600)


class WebhookOut(BaseModel):
    id: str
    connector_id: str
    name: str
    description: Optional[str] = None
    event_type: str
    url: Optional[str] = None
    path_suffix: Optional[str] = None
    incoming_url: Optional[str] = None
    is_active: bool
    event_filters: list
    trigger_count: int
    failure_count: int
    last_triggered: Optional[str] = None
    last_error: Optional[str] = None
    created_at: str


# --- Built-in Templates ---

CONNECTOR_TEMPLATES = {
    "slack": {
        "name": "Slack", "icon_url": "https://cdn.simpleicons.org/slack",
        "category": "comms", "base_url": "https://slack.com/api",
        "auth_type": "oauth2", "capabilities": ["send_message", "list_channels", "upload_file", "manage_users"],
    },
    "github": {
        "name": "GitHub", "icon_url": "https://cdn.simpleicons.org/github",
        "category": "devops", "base_url": "https://api.github.com",
        "auth_type": "bearer", "capabilities": ["list_repos", "create_issue", "manage_webhooks", "code_search"],
    },
    "stripe": {
        "name": "Stripe", "icon_url": "https://cdn.simpleicons.org/stripe",
        "category": "payments", "base_url": "https://api.stripe.com/v1",
        "auth_type": "bearer", "capabilities": ["create_payment", "list_customers", "manage_subscriptions"],
    },
    "openai": {
        "name": "OpenAI", "icon_url": "https://cdn.simpleicons.org/openai",
        "category": "ai", "base_url": "https://api.openai.com/v1",
        "auth_type": "bearer", "capabilities": ["chat_completion", "embeddings", "image_generation"],
    },
    "huggingface": {
        "name": "Hugging Face", "icon_url": "https://cdn.simpleicons.org/huggingface",
        "category": "ai", "base_url": "https://api-inference.huggingface.co",
        "auth_type": "bearer", "capabilities": ["inference", "model_search", "dataset_search"],
    },
    "discord": {
        "name": "Discord", "icon_url": "https://cdn.simpleicons.org/discord",
        "category": "comms", "base_url": "https://discord.com/api/v10",
        "auth_type": "bearer", "capabilities": ["send_message", "manage_channels", "manage_roles"],
    },
    "jira": {
        "name": "Jira", "icon_url": "https://cdn.simpleicons.org/jira",
        "category": "devops", "base_url": "https://your-domain.atlassian.net/rest/api/3",
        "auth_type": "basic", "capabilities": ["create_issue", "list_projects", "manage_sprints"],
    },
    "s3": {
        "name": "Amazon S3", "icon_url": "https://cdn.simpleicons.org/amazons3",
        "category": "storage", "base_url": "https://s3.amazonaws.com",
        "auth_type": "api_key", "capabilities": ["upload_file", "download_file", "list_buckets"],
    },
    "sendgrid": {
        "name": "SendGrid", "icon_url": "https://cdn.simpleicons.org/sendgrid",
        "category": "comms", "base_url": "https://api.sendgrid.com/v3",
        "auth_type": "bearer", "capabilities": ["send_email", "manage_templates", "list_contacts"],
    },
    "webhook": {
        "name": "Generic Webhook", "icon_url": "https://cdn.simpleicons.org/webhook",
        "category": "general", "base_url": "https://example.com",
        "auth_type": "webhook_secret", "capabilities": ["send_webhook", "receive_webhook"],
    },
}


def _connector_to_out(c, webhook_count: int = 0) -> dict:
    return ConnectorOut(
        id=c.id, name=c.name, slug=c.slug, description=c.description,
        icon_url=c.icon_url, category=c.category, base_url=c.base_url,
        auth_type=c.auth_type.value if hasattr(c.auth_type, 'value') else str(c.auth_type),
        status=c.status.value if hasattr(c.status, 'value') else str(c.status),
        capabilities=c.capabilities or [], supported_events=c.supported_events or [],
        rate_limit_rpm=c.rate_limit_rpm, request_count=c.request_count or 0,
        error_count=c.error_count or 0, is_built_in=c.is_built_in,
        version=c.version or "1.0.0",
        last_health_check=c.last_health_check.isoformat() if c.last_health_check else None,
        last_error=c.last_error, webhook_count=webhook_count,
        created_at=c.created_at.isoformat(),
    ).model_dump()


# ============================================================
# CONNECTOR CRUD
# ============================================================

@router.get("/connectors", response_model=List[ConnectorOut])
async def list_connectors(
    category: Optional[str] = None,
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db_session),
    user: CurrentUser = Depends(get_current_user),
):
    query = select(IntegrationConnector).where(
        IntegrationConnector.organisation_id == user.organisation_id,
        IntegrationConnector.deleted_at.is_(None),
    )
    if category:
        query = query.where(IntegrationConnector.category == category)
    if status:
        query = query.where(IntegrationConnector.status == status)
    query = query.order_by(IntegrationConnector.name)
    result = await db.execute(query)
    connectors = result.scalars().all()
    return [_connector_to_out(c) for c in connectors]


@router.post("/connectors", response_model=ConnectorOut, status_code=201)
async def create_connector(
    data: ConnectorCreate,
    db: AsyncSession = Depends(get_db_session),
    user: CurrentUser = Depends(require_min_role(UserRole.ORG_ADMIN)),
):
    existing = await db.execute(
        select(IntegrationConnector).where(
            IntegrationConnector.organisation_id == user.organisation_id,
            IntegrationConnector.slug == data.slug,
            IntegrationConnector.deleted_at.is_(None),
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(409, f"Connector '{data.slug}' already exists")

    connector = IntegrationConnector(
        id=new_uuid(), organisation_id=user.organisation_id, created_by=user.id,
        name=data.name, slug=data.slug, description=data.description,
        icon_url=data.icon_url, category=data.category, base_url=data.base_url,
        auth_type=data.auth_type, auth_config=data.auth_config,
        headers=data.headers, rate_limit_rpm=data.rate_limit_rpm,
        capabilities=data.capabilities, supported_events=data.supported_events,
        config_schema=data.config_schema, user_config=data.user_config,
        status=ConnectorStatus.INACTIVE,
    )
    db.add(connector)
    await db.commit()
    await db.refresh(connector)
    return _connector_to_out(connector)


@router.get("/connectors/{connector_id}", response_model=ConnectorOut)
async def get_connector(
    connector_id: str,
    db: AsyncSession = Depends(get_db_session),
    user: CurrentUser = Depends(get_current_user),
):
    result = await db.execute(
        select(IntegrationConnector).where(
            IntegrationConnector.id == connector_id,
            IntegrationConnector.organisation_id == user.organisation_id,
            IntegrationConnector.deleted_at.is_(None),
        )
    )
    connector = result.scalar_one_or_none()
    if not connector:
        raise HTTPException(404, "Connector not found")
    return _connector_to_out(connector)


@router.patch("/connectors/{connector_id}", response_model=ConnectorOut)
async def update_connector(
    connector_id: str,
    data: ConnectorUpdate,
    db: AsyncSession = Depends(get_db_session),
    user: CurrentUser = Depends(require_min_role(UserRole.ORG_ADMIN)),
):
    result = await db.execute(
        select(IntegrationConnector).where(
            IntegrationConnector.id == connector_id,
            IntegrationConnector.organisation_id == user.organisation_id,
            IntegrationConnector.deleted_at.is_(None),
        )
    )
    connector = result.scalar_one_or_none()
    if not connector:
        raise HTTPException(404, "Connector not found")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(connector, key, value)
    connector.updated_at = utcnow()
    await db.commit()
    await db.refresh(connector)
    return _connector_to_out(connector)


@router.delete("/connectors/{connector_id}")
async def delete_connector(
    connector_id: str,
    db: AsyncSession = Depends(get_db_session),
    user: CurrentUser = Depends(require_min_role(UserRole.ORG_ADMIN)),
):
    result = await db.execute(
        select(IntegrationConnector).where(
            IntegrationConnector.id == connector_id,
            IntegrationConnector.organisation_id == user.organisation_id,
            IntegrationConnector.deleted_at.is_(None),
        )
    )
    connector = result.scalar_one_or_none()
    if not connector:
        raise HTTPException(404, "Connector not found")
    connector.deleted_at = utcnow()
    connector.status = ConnectorStatus.INACTIVE
    await db.commit()
    return {"status": "deleted", "id": connector_id}


# ============================================================
# TEMPLATES
# ============================================================

@router.get("/templates")
async def list_templates(user: CurrentUser = Depends(get_current_user)):
    return [
        {"slug": slug, **{k: v for k, v in tmpl.items()}}
        for slug, tmpl in CONNECTOR_TEMPLATES.items()
    ]


@router.post("/connectors/from-template/{slug}", response_model=ConnectorOut, status_code=201)
async def create_from_template(
    slug: str,
    db: AsyncSession = Depends(get_db_session),
    user: CurrentUser = Depends(require_min_role(UserRole.ORG_ADMIN)),
):
    if slug not in CONNECTOR_TEMPLATES:
        raise HTTPException(404, f"Template '{slug}' not found")

    existing = await db.execute(
        select(IntegrationConnector).where(
            IntegrationConnector.organisation_id == user.organisation_id,
            IntegrationConnector.slug == slug,
            IntegrationConnector.deleted_at.is_(None),
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(409, f"Connector '{slug}' already exists")

    tmpl = CONNECTOR_TEMPLATES[slug]
    connector = IntegrationConnector(
        id=new_uuid(), organisation_id=user.organisation_id, created_by=user.id,
        name=tmpl["name"], slug=slug, description=f'{tmpl["name"]} integration',
        icon_url=tmpl.get("icon_url"), category=tmpl["category"],
        base_url=tmpl["base_url"], auth_type=tmpl.get("auth_type", "bearer"),
        capabilities=tmpl.get("capabilities", []),
        status=ConnectorStatus.INACTIVE, is_built_in=True,
    )
    db.add(connector)
    await db.commit()
    await db.refresh(connector)
    return _connector_to_out(connector)


# ============================================================
# HEALTH CHECK
# ============================================================

@router.post("/connectors/{connector_id}/health")
async def check_health(
    connector_id: str,
    db: AsyncSession = Depends(get_db_session),
    user: CurrentUser = Depends(require_min_role(UserRole.ORG_ADMIN)),
):
    result = await db.execute(
        select(IntegrationConnector).where(
            IntegrationConnector.id == connector_id,
            IntegrationConnector.organisation_id == user.organisation_id,
            IntegrationConnector.deleted_at.is_(None),
        )
    )
    connector = result.scalar_one_or_none()
    if not connector:
        raise HTTPException(404, "Connector not found")

    health_status = "unknown"
    latency_ms = 0
    error_msg = None

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            start = datetime.now(timezone.utc)
            resp = await client.get(connector.base_url)
            latency_ms = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)
            health_status = "healthy" if resp.status_code < 500 else "unhealthy"
    except Exception as e:
        health_status = "unreachable"
        error_msg = str(e)[:200]

    connector.last_health_check = utcnow()
    connector.last_error = error_msg
    if health_status == "healthy" and connector.status == ConnectorStatus.ERROR:
        connector.status = ConnectorStatus.ACTIVE
    elif health_status in ("unhealthy", "unreachable"):
        connector.status = ConnectorStatus.ERROR
        connector.last_error = error_msg
    await db.commit()

    return {"status": health_status, "latency_ms": latency_ms, "error": error_msg}


# ============================================================
# WEBHOOKS
# ============================================================

@router.get("/connectors/{connector_id}/webhooks", response_model=List[WebhookOut])
async def list_webhooks(
    connector_id: str,
    db: AsyncSession = Depends(get_db_session),
    user: CurrentUser = Depends(get_current_user),
):
    result = await db.execute(
        select(WebhookEndpoint).where(
            WebhookEndpoint.connector_id == connector_id,
        ).order_by(WebhookEndpoint.created_at.desc())
    )
    webhooks = result.scalars().all()
    return [
        WebhookOut(
            id=w.id, connector_id=w.connector_id, name=w.name,
            description=w.description,
            event_type=w.event_type.value if hasattr(w.event_type, 'value') else str(w.event_type),
            url=w.url, path_suffix=w.path_suffix,
            incoming_url=f"/api/v1/integrations/webhook/{w.path_suffix}" if w.path_suffix else None,
            is_active=w.is_active, event_filters=w.event_filters or [],
            trigger_count=w.trigger_count or 0, failure_count=w.failure_count or 0,
            last_triggered=w.last_triggered.isoformat() if w.last_triggered else None,
            last_error=w.last_error,
            created_at=w.created_at.isoformat(),
        )
        for w in webhooks
    ]


@router.post("/connectors/{connector_id}/webhooks", response_model=WebhookOut, status_code=201)
async def create_webhook(
    connector_id: str,
    data: WebhookCreate,
    db: AsyncSession = Depends(get_db_session),
    user: CurrentUser = Depends(require_min_role(UserRole.ORG_ADMIN)),
):
    # Verify connector exists
    result = await db.execute(
        select(IntegrationConnector).where(
            IntegrationConnector.id == connector_id,
            IntegrationConnector.organisation_id == user.organisation_id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(404, "Connector not found")

    path_suffix = f"{connector_id[:8]}-{secrets.token_hex(4)}" if data.event_type == "incoming" else None
    hmac_secret = secrets.token_hex(32) if data.event_type == "incoming" else None

    webhook = WebhookEndpoint(
        id=new_uuid(), connector_id=connector_id, name=data.name,
        description=data.description, event_type=data.event_type,
        url=data.url, path_suffix=path_suffix, hmac_secret=hmac_secret,
        event_filters=data.event_filters, headers=data.headers,
        max_retries=data.max_retries, retry_delay_seconds=data.retry_delay_seconds,
    )
    db.add(webhook)
    await db.commit()
    await db.refresh(webhook)

    return WebhookOut(
        id=webhook.id, connector_id=webhook.connector_id, name=webhook.name,
        description=webhook.description,
        event_type=webhook.event_type.value if hasattr(webhook.event_type, 'value') else str(webhook.event_type),
        url=webhook.url, path_suffix=webhook.path_suffix,
        incoming_url=f"/api/v1/integrations/webhook/{webhook.path_suffix}" if webhook.path_suffix else None,
        is_active=webhook.is_active, event_filters=webhook.event_filters or [],
        trigger_count=0, failure_count=0, last_triggered=None, last_error=None,
        created_at=webhook.created_at.isoformat(),
    )


# ============================================================
# PROXY — Execute requests through a connector
# ============================================================

@router.post("/connectors/{connector_id}/proxy")
async def proxy_request(
    connector_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    user: CurrentUser = Depends(require_min_role(UserRole.POWER_USER)),
):
    result = await db.execute(
        select(IntegrationConnector).where(
            IntegrationConnector.id == connector_id,
            IntegrationConnector.organisation_id == user.organisation_id,
            IntegrationConnector.deleted_at.is_(None),
        )
    )
    connector = result.scalar_one_or_none()
    if not connector:
        raise HTTPException(404, "Connector not found")

    body = await request.json()
    method = body.get("method", "GET").upper()
    path = body.get("path", "")
    payload = body.get("body", None)
    target_url = f"{connector.base_url.rstrip('/')}/{path.lstrip('/')}"

    req_headers = dict(connector.headers or {})
    if connector.auth_type in (ConnectorAuthType.BEARER, "bearer"):
        token = (connector.auth_config or {}).get("token", "")
        if token:
            req_headers["Authorization"] = f"Bearer {token}"
    elif connector.auth_type in (ConnectorAuthType.API_KEY, "api_key"):
        key = (connector.auth_config or {}).get("api_key", "")
        header_name = (connector.auth_config or {}).get("header_name", "X-API-Key")
        if key:
            req_headers[header_name] = key

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.request(method, target_url, headers=req_headers, json=payload)
            connector.request_count = (connector.request_count or 0) + 1
            await db.commit()
            return {"status_code": resp.status_code, "body": resp.text[:10000], "headers": dict(resp.headers)}
    except Exception as e:
        connector.error_count = (connector.error_count or 0) + 1
        connector.last_error = str(e)[:200]
        await db.commit()
        raise HTTPException(502, f"Proxy request failed: {str(e)[:200]}")
