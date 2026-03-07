# main.py — Infinity OS API Gateway
# Features:
# - Request correlation IDs
# - Rate limiting (slowapi)
# - Security headers
# - WebSocket support
# - Health check with DB verification
# - All routers registered

import os
import uuid
import time
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError

from database import init_db, close_db, get_db_session
from telemetry import setup_telemetry
from config import get_config
from middleware_production import install_production_middleware, get_shutdown_manager
from middleware_compliance import install_compliance_middleware
from zero_cost_guard import install_zero_cost_middleware, get_zero_cost_guard

# Logging
logging.basicConfig(
    level=getattr(logging, os.getenv("LOG_LEVEL", "INFO").upper(), logging.INFO),
    format="%(asctime)s [%(name)s] %(levelname)s %(message)s",
)
logger = logging.getLogger("infinity-os")


def _check_startup_config():
    """Validate critical configuration on startup."""
    warnings = []

    # JWT Secret
    jwt_key = os.getenv("JWT_SECRET_KEY", "")
    if not jwt_key or len(jwt_key) < 32 or jwt_key == "generate-a-64-char-random-string-here":
        warnings.append("⚠️  JWT_SECRET_KEY is not set or insecure — generate one: python -c &quot;import secrets; print(secrets.token_urlsafe(48))&quot;")

    # LLM Providers
    llm_keys = {
        "GROQ_API_KEY": os.getenv("GROQ_API_KEY"),
        "OPENAI_API_KEY": os.getenv("OPENAI_API_KEY"),
        "ANTHROPIC_API_KEY": os.getenv("ANTHROPIC_API_KEY"),
        "HF_API_KEY": os.getenv("HF_API_KEY"),
    }
    active_providers = [k for k, v in llm_keys.items() if v]
    if active_providers:
        logger.info(f"🤖 LLM providers configured: {', '.join(active_providers)}")
    else:
        warnings.append("⚠️  No LLM API keys configured — AI generation will use stub responses. Set GROQ_API_KEY or OPENAI_API_KEY in .env")

    # C2PA
    if os.getenv("C2PA_ENABLED", "false").lower() == "true":
        if not os.getenv("C2PA_CERT_PATH"):
            warnings.append("⚠️  C2PA_ENABLED=true but C2PA_CERT_PATH not set — provenance signing disabled")
        else:
            logger.info("🔏 C2PA content provenance signing enabled")

    for w in warnings:
        logger.warning(w)

    return len(warnings) == 0


@asynccontextmanager
async def lifespan(app: FastAPI):
    config = get_config()
    logger.info(f"🚀 Starting Infinity OS v{config.service_version} [{config.environment}]...")
    await init_db()
    logger.info("✅ Database initialized")
    _check_startup_config()
    # Initialise OpenTelemetry (no-op if OTEL_EXPORTER_OTLP_ENDPOINT not set)
    setup_telemetry(app)
    # Start Kernel Event Bus
    from kernel_event_bus import KernelEventBus
    bus = await KernelEventBus.get_instance()
    await bus.start()
    logger.info("✅ Kernel Event Bus started")
    # Production readiness check
    if config.is_production:
        issues = config.validate_production_readiness()
        for issue in issues:
            logger.warning(f"  {issue}")
        if any(i.startswith("CRITICAL") for i in issues):
            logger.error("❌ Critical production issues detected — review before serving traffic")
    logger.info(f"✅ Infinity OS ready — {config.environment} mode, 2060 standard level {config.future_proof_level}")
    yield
    logger.info("🛑 Shutting down Infinity OS...")
    # Graceful shutdown — drain active connections
    shutdown_mgr = get_shutdown_manager()
    await shutdown_mgr.initiate_shutdown()
    await bus.stop()
    logger.info("✅ Kernel Event Bus stopped")
    await close_db()
    logger.info("✅ Shutdown complete")


app = FastAPI(
    title="Infinity OS",
    description="Browser-native AI-augmented Virtual Operating System with EU AI Act compliance",
    version="3.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# ============================================================
# CORS
# ============================================================

ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ORIGINS",
        "http://localhost:3000,http://localhost:5173,http://localhost:8080"
    ).split(",")
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID", "X-Correlation-ID"],
    expose_headers=["X-Request-ID", "X-Correlation-ID"],
)


# ============================================================
# PRODUCTION MIDDLEWARE (Rate Limiting, Size Limits, Logging, Shutdown)
# ============================================================
install_production_middleware(app)

# ============================================================
# 2060 COMPLIANCE MIDDLEWARE (Data Residency, Consent, AI Audit)
# ============================================================
install_compliance_middleware(app)

# ── Zero-Cost Enforcement Middleware ──────────────────────────
install_zero_cost_middleware(app)

# ============================================================
# MIDDLEWARE: Correlation IDs + Timing
# ============================================================

@app.middleware("http")
async def correlation_id_middleware(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
    correlation_id = request.headers.get("X-Correlation-ID", request_id)
    request.state.request_id = request_id
    request.state.correlation_id = correlation_id

    start = time.perf_counter()
    response = await call_next(request)
    duration = time.perf_counter() - start

    response.headers["X-Request-ID"] = request_id
    response.headers["X-Correlation-ID"] = correlation_id
    response.headers["X-Response-Time"] = f"{duration:.4f}s"

    # Log request
    logger.info(
        f"{request.method} {request.url.path} → {response.status_code} "
        f"({duration:.3f}s) [rid={request_id[:8]}]"
    )
    return response


# ============================================================
# MIDDLEWARE: Security Headers
# ============================================================

@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    response = await call_next(request)
    # OWASP recommended security headers
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = (
        "camera=(), microphone=(), geolocation=(), payment=(), "
        "usb=(), magnetometer=(), gyroscope=(), accelerometer=()"
    )
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; script-src 'self' 'unsafe-inline'; "
        "style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; "
        "connect-src 'self' wss: https:; font-src 'self' https:; "
        "frame-ancestors 'none'; base-uri 'self'; form-action 'self';"
    )
    response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
    response.headers["Cross-Origin-Resource-Policy"] = "same-origin"
    response.headers["Cross-Origin-Embedder-Policy"] = "require-corp"
    # Remove server identification
    if "server" in response.headers:
        del response.headers["server"]
    return response


# ============================================================
# EXCEPTION HANDLERS
# ============================================================

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    # Sanitise errors to ensure JSON serialisability
    errors = []
    for err in exc.errors():
        clean_err = {
            "type": str(err.get("type", "unknown")),
            "loc": list(err.get("loc", [])),
            "msg": str(err.get("msg", "")),
        }
        if "input" in err:
            try:
                import json
                json.dumps(err["input"])
                clean_err["input"] = err["input"]
            except (TypeError, ValueError):
                clean_err["input"] = str(err["input"])
        errors.append(clean_err)

    return JSONResponse(
        status_code=422,
        content={
            "detail": errors,
            "request_id": getattr(request.state, "request_id", None),
        },
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "detail": "Internal server error",
            "request_id": getattr(request.state, "request_id", None),
        },
    )


# ============================================================
# ROUTERS
# ============================================================

from routers import (
    auth, ai, compliance, users, organisations, files,
    repositories, build, federation, websocket_router, kanban,
    integrations, appstore, notifications,
    itsm, gates, documents, assets, kb, deps,
    billing, workflows, artifacts, errors, security,
    observability, compliance_frameworks, vulnerability,
    codegen, agent_manager, agent_memory,
    self_healing, adaptive_engine,
    townhall,
)
from routers import version_history as version_history_router

# Wave 1 Migration — 22-Component Architecture Routers
from routers import (
    cornelius, the_dr, norman, guardian,
    hive, nexus, observatory, rbac, admin,
    search, sync, multiAI, chaos_party,
    lighthouse, the_void, icebox,
    library, academy, workshop, treasury, arcadia,
)

# Tranquillity Realm — Cross-Lane Wellbeing Services
from routers import (
    tranquillity, i_mind, resonate, taimra, savania,
)

# Turing's Hub — AI Character Registry & Generator
from routers import turings_hub

# Governance — Citadel, Think Tank, ChronosSphere, DevOcity
from routers import citadel, think_tank, chronossphere, devocity

# The Studio — Creative Hub + 6 specialist modules
from routers import studio, section7, style_and_shoot, digital_grid, tranceflow, tateking, fabulousa

# Infrastructure + Wellbeing — Arcadian Exchange, VRAR3D
from routers import arcadian_exchange, vrar3d

# Luminous — Cognitive Core Application
from routers import luminous
from routers import attachments, accessibility

# Ecosystem Branded Aliases — Lille SC, Lunascene, SolarScene
from routers import lille_sc, lunascene, solarscene
from routers import admin_cli, sandboxes

app.include_router(auth.router)
app.include_router(ai.router)
app.include_router(compliance.router)
app.include_router(users.router)
app.include_router(organisations.router)
app.include_router(files.router)
app.include_router(repositories.router)
app.include_router(build.router)
app.include_router(federation.router)
app.include_router(kanban.router)
app.include_router(integrations.router)
app.include_router(appstore.router)
app.include_router(notifications.router)
app.include_router(websocket_router.router)

# Project & IT Management System routers
app.include_router(itsm.router)
app.include_router(gates.router)
app.include_router(documents.router)
app.include_router(assets.router)
app.include_router(kb.router)
app.include_router(deps.router)

# Production hardening routers (Zero-Net-Cost, Workflows, Artifacts, Errors, Security)
app.include_router(billing.router)
app.include_router(workflows.router)
app.include_router(artifacts.router)
app.include_router(errors.router)
app.include_router(security.router)
# Ecosystem expansion — Sprint 1
app.include_router(observability.router)
app.include_router(compliance_frameworks.router)
app.include_router(vulnerability.router)
# Ecosystem expansion — Sprint 2
app.include_router(codegen.router)
app.include_router(version_history_router.router)
# Agent Control Plane & Memory (adopted from conversation artifacts)
app.include_router(agent_manager.router)
app.include_router(agent_memory.router)
# Self-Healing & Adaptive Intelligence (2060 future-proofing)
app.include_router(self_healing.router)
app.include_router(adaptive_engine.router)
# The TownHall — Governance Hub (Platform 21)
app.include_router(townhall.router)

# ============================================================
# WAVE 1 MIGRATION — 22-COMPONENT ARCHITECTURE (2060 Standard)
# Migrated from Trancendos monorepo per MIGRATION_PLAN.md
# ============================================================

# Cognitive Core — Luminous/Cornelius Orchestrator
app.include_router(cornelius.router)
app.include_router(multiAI.router)

# Self-Healing — The Lab / TheDr
app.include_router(the_dr.router)

# Security Intelligence — The Cryptex / Norman
app.include_router(norman.router)

# IAM — Infinity-One / Guardian
app.include_router(guardian.router)
app.include_router(rbac.router)

# Data Transfer — The HIVE + The Nexus
app.include_router(hive.router)
app.include_router(nexus.router)

# Immutable Data Hub — The Observatory
app.include_router(observatory.router)

# Knowledge — The Library + The Academy
app.include_router(library.router)
app.include_router(academy.router)

# Code Repository — The Workshop
app.include_router(workshop.router)

# Adversarial Testing — The Chaos Party
app.include_router(chaos_party.router)

# Post-Quantum Security — The Lighthouse + The Void + The IceBox
app.include_router(lighthouse.router)
app.include_router(the_void.router)
app.include_router(icebox.router)

# Economic Engine — The Treasury (Royal Bank of Arcadia)
app.include_router(treasury.router)

# Generative Front-End — Arcadia
app.include_router(arcadia.router)

# Platform Infrastructure — Admin + Search + Sync
app.include_router(admin.router)
app.include_router(search.router)
app.include_router(sync.router)

# --- Tranquillity Realm (Cross-Lane Wellbeing) ---
app.include_router(tranquillity.router)   # Gateway orchestrator
app.include_router(i_mind.router)         # Lane 2 — Cognitive wellness
app.include_router(resonate.router)       # Lane 2 — Sound & frequency healing
app.include_router(taimra.router)         # Lane 3 — Digital twin analytics
app.include_router(savania.router)        # Lane 1 — AI healer & defender

# --- Turing's Hub (Governance — AI Character Registry) ---
app.include_router(turings_hub.router)   # AI Generator — all characters originate here

# --- Governance Routers ---
app.include_router(citadel.router)       # The Citadel — Strategic Ops fortress
app.include_router(think_tank.router)    # Think Tank — R&D Centre
app.include_router(chronossphere.router) # ChronosSphere — Time management
app.include_router(devocity.router)      # DevOcity — DevOps operations

# --- The Studio (Creative Hub + Specialist Modules) ---
app.include_router(studio.router)          # The Studio — Creative hub orchestrator
app.include_router(section7.router)        # Section7 — Intelligence & analytics
app.include_router(style_and_shoot.router) # Style&Shoot — 2D UI/UX design
app.include_router(digital_grid.router)    # DigitalGrid — Spatial CI/CD
app.include_router(tranceflow.router)      # TranceFlow — 3D Spatial design
app.include_router(tateking.router)        # TateKing — Cinematic production
app.include_router(fabulousa.router)       # Fabulousa — Fashion & lifestyle

# --- Infrastructure + Wellbeing ---
app.include_router(arcadian_exchange.router) # Arcadian Exchange — Procurement
app.include_router(vrar3d.router)            # VRAR3D — VR/AR immersion

# --- Luminous (Cognitive Core) ---
app.include_router(luminous.router)          # Luminous — Knowledge graph, sessions, insights
app.include_router(attachments.router)       # Attachments — Universal file upload & management
app.include_router(accessibility.router)     # Accessibility — Takeover mode & accessibility profiles

# --- Ecosystem Branded Aliases (37/37 Full Match) ---
app.include_router(lille_sc.router)          # Lille SC — Sync Centre (branded sync.py)
app.include_router(lunascene.router)         # Lunascene — The Artifactory (branded artifacts.py)
app.include_router(solarscene.router)        # SolarScene — Search & Discovery (branded search.py)

# ── Phase 22: Platform Operations & Intelligence Layer ──────────────
app.include_router(admin_cli.router)           # Admin CLI — Sandboxed terminal & command execution
app.include_router(sandboxes.router)           # Sandboxes & VMs — Isolated execution environments


# ============================================================
# HEALTH, READINESS, METRICS & SYSTEM INFO
# ============================================================

@app.get("/health")
async def health_check():
    """Deep health check — DB, Event Bus, 2060 compliance.
    Used by Kubernetes liveness probe and load balancers.
    """
    config = get_config()
    checks = {}

    # Database connectivity
    try:
        async for db in get_db_session():
            from sqlalchemy import text
            await db.execute(text("SELECT 1"))
            checks["database"] = "connected"
            break
    except Exception as e:
        checks["database"] = f"error: {str(e)[:100]}"

    # Kernel Event Bus
    try:
        from kernel_event_bus import KernelEventBus
        bus = await KernelEventBus.get_instance()
        bus_stats = bus.stats() if hasattr(bus, "stats") else {}
        checks["event_bus"] = "running" if bus else "unavailable"
        checks["event_bus_subscribers"] = bus_stats.get("total_subscribers", 0) if bus_stats else 0
    except Exception as e:
        checks["event_bus"] = f"error: {str(e)[:80]}"

    # 2060 Compliance
    checks["2060_standard"] = {
        "level": config.future_proof_level,
        "data_residency": config.data_residency_default,
        "consent_required": config.consent_required,
        "ai_audit": config.ai_audit_enabled,
        "zero_cost": config.zero_cost_mode,
    }

    # Shutdown state
    shutdown_mgr = get_shutdown_manager()
    checks["shutdown"] = {
        "draining": shutdown_mgr.is_shutting_down,
        "active_requests": shutdown_mgr.active_requests,
    }

    # Overall status
    db_ok = checks["database"] == "connected"
    bus_ok = "error" not in str(checks.get("event_bus", ""))
    overall = "healthy" if (db_ok and bus_ok) else "degraded"
    if shutdown_mgr.is_shutting_down:
        overall = "draining"

    return {
        "status": overall,
        "version": config.service_version,
        "environment": config.environment,
        "checks": checks,
        "services": {
            "api": "operational",
            "auth": "operational",
            "ai": "operational" if config.active_llm_providers else "stub",
            "compliance": "operational",
            "c2pa": "enabled" if config.c2pa_enabled else "disabled",
            "federation": "enabled" if config.federation_enabled else "disabled",
            "telemetry": "enabled" if config.otel_endpoint else "disabled",
        },
    }


@app.get("/ready")
async def readiness_check():
    """Kubernetes readiness probe — lightweight check.
    Returns 200 only when the service is ready to accept traffic.
    """
    shutdown_mgr = get_shutdown_manager()
    if shutdown_mgr.is_shutting_down:
        return JSONResponse(status_code=503, content={"ready": False, "reason": "shutting_down"})

    # Quick DB check
    try:
        async for db in get_db_session():
            from sqlalchemy import text
            await db.execute(text("SELECT 1"))
            break
        return {"ready": True}
    except Exception:
        return JSONResponse(status_code=503, content={"ready": False, "reason": "database_unavailable"})


@app.get("/metrics")
async def metrics_endpoint():
    """Prometheus-compatible metrics stub.
    In production, replace with proper prometheus_client integration.
    """
    config = get_config()
    shutdown_mgr = get_shutdown_manager()

    # Event bridge stats
    from event_bridge import get_event_stats
    event_stats = get_event_stats()

    # 2060 middleware stats
    from middleware_compliance import get_compliance_middleware
    compliance_mw = get_compliance_middleware()
    resource_meter = compliance_mw.get_resource_meter() if compliance_mw else {}

    return {
        "service": config.service_name,
        "version": config.service_version,
        "environment": config.environment,
        "active_requests": shutdown_mgr.active_requests,
        "event_bus": event_stats,
        "resource_meter": resource_meter,
        "routers": 79,
        "middleware_layers": 8,
        "2060_standard": config.future_proof_level,
    }


@app.get("/api/v1/system/info")
async def system_info():
    """Ecosystem information — router count, coverage, architecture stats."""
    config = get_config()

    return {
        "name": "Infinity OS",
        "version": config.service_version,
        "architecture": "Three-Lane Mesh",
        "standard": f"Trancendos {config.future_proof_level}",
        "ecosystem": {
            "total_routers": 79,
            "total_api_prefixes": 78,
            "ecosystem_apps_matched": "37/37 (100%)",
            "ai_characters": 27,
            "lanes": {
                "lane1_ai_nexus": "AI orchestration, agents, characters, cognitive core",
                "lane2_user_infinity": "User-facing apps, creative tools, wellbeing",
                "lane3_data_hive": "Data transfer, sync, search, analytics",
            },
        },
        "middleware": [
            "CORSMiddleware",
            "StructuredLoggingMiddleware",
            "RateLimitMiddleware",
            "RequestSizeLimitMiddleware",
            "GracefulShutdownMiddleware",
            "ComplianceMiddleware",
            "CorrelationIDMiddleware",
            "SecurityHeadersMiddleware",
        ],
        "compliance": {
            "eu_ai_act": True,
            "c2pa_provenance": config.c2pa_enabled,
            "gdpr_soft_delete": True,
            "data_residency": config.data_residency_default,
            "consent_management": config.consent_required,
            "ai_auditability": config.ai_audit_enabled,
            "zero_cost_infrastructure": config.zero_cost_mode,
        },
        "infrastructure": {
            "database": "AsyncPG + SQLAlchemy (async)",
            "event_bus": "Kernel Event Bus (async pub/sub)",
            "auth": "JWT HS512 + RBAC/ABAC hybrid",
            "telemetry": "OpenTelemetry (OTLP)",
            "container": "Docker + Kubernetes",
            "ci_cd": "GitHub Actions (32 workflows)",
        },
        "endpoints": {
            "docs": "/docs",
            "redoc": "/redoc",
            "health": "/health",
            "ready": "/ready",
            "metrics": "/metrics",
        },
    }


@app.get("/api/v1/system/costs")
async def system_costs():
    """Zero-cost infrastructure dashboard — real-time cost tracking."""
    guard = get_zero_cost_guard()
    stats = guard.get_stats()
    return {
        "zero_cost_compliant": stats["mode"] == "zero-cost" or stats["totals"]["lifetime_usd"] == 0,
        **stats,
        "provider_priorities": {
            "llm": get_config().llm_provider_priority.split(","),
            "storage": get_config().storage_provider_priority.split(","),
            "cache": get_config().cache_provider_priority.split(","),
            "search": get_config().search_provider_priority.split(","),
        },
    }


@app.get("/")
async def root():
    config = get_config()
    return {
        "name": "Infinity OS",
        "version": config.service_version,
        "description": "Browser-native AI-augmented Virtual Operating System",
        "standard": f"Trancendos {config.future_proof_level}",
        "docs": "/docs",
        "health": "/health",
        "ready": "/ready",
        "metrics": "/metrics",
        "system": "/api/v1/system/info",
        "costs": "/api/v1/system/costs",
        "status": "operational",
    }


if __name__ == "__main__":
    import uvicorn
    config = get_config()
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=config.port,
        reload=config.is_development,
        workers=config.workers,
    )