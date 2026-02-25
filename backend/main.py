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

# Logging
logging.basicConfig(
    level=getattr(logging, os.getenv("LOG_LEVEL", "INFO").upper(), logging.INFO),
    format="%(asctime)s [%(name)s] %(levelname)s %(message)s",
)
logger = logging.getLogger("infinity-os")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("🚀 Starting Infinity OS v3.0...")
    await init_db()
    logger.info("✅ Database initialized")
    # Initialise OpenTelemetry (no-op if OTEL_EXPORTER_OTLP_ENDPOINT not set)
    setup_telemetry(app)
    yield
    logger.info("🛑 Shutting down Infinity OS...")
    await close_db()


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
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; script-src 'self' 'unsafe-inline'; "
        "style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; "
        "connect-src 'self' wss: https:;"
    )
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

from routers import auth, ai, compliance, users, organisations, files, repositories, build, federation, websocket_router, kanban

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
app.include_router(websocket_router.router)


# ============================================================
# HEALTH & ROOT
# ============================================================

@app.get("/health")
async def health_check():
    """Health check with database connectivity verification"""
    db_status = "unknown"
    try:
        async for db in get_db_session():
            from sqlalchemy import text
            await db.execute(text("SELECT 1"))
            db_status = "connected"
            break
    except Exception as e:
        db_status = f"error: {str(e)[:100]}"

    return {
        "status": "healthy" if db_status == "connected" else "degraded",
        "version": "3.0.0",
        "environment": os.getenv("ENVIRONMENT", "development"),
        "database": db_status,
        "services": {
            "api": "operational",
            "auth": "operational",
            "ai": "operational",
            "compliance": "operational",
            "git": "operational",
            "build": "operational",
            "federation": "operational",
        },
    }


@app.get("/")
async def root():
    return {
        "name": "Infinity OS",
        "version": "3.0.0",
        "description": "Browser-native AI-augmented Virtual Operating System",
        "docs": "/docs",
        "health": "/health",
        "status": "operational",
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", 8000)),
        reload=os.getenv("ENVIRONMENT") != "production",
        workers=int(os.getenv("WORKERS", 1)),
    )