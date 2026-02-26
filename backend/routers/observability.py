"""
Infinity OS — Observability Router
Exposes: structured logs, analytics metrics, anomaly detection, Prometheus export
"""

from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone

from auth import get_current_user, require_min_role, UserRole
from logging_system import get_logger, LogLevel, LogCategory
from analytics_engine import get_analytics, TimeWindow

router = APIRouter(prefix="/api/v1/observability", tags=["Observability"])


# ── Logs ─────────────────────────────────────────────────────────────────────

@router.get("/logs")
async def get_logs(
    level: Optional[str] = Query(None, description="Minimum log level"),
    category: Optional[str] = Query(None, description="Log category filter"),
    search: Optional[str] = Query(None, description="Search in message"),
    correlation_id: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=1000),
    current_user=Depends(require_min_role(UserRole.USER)),
):
    """Get structured logs with filtering."""
    logger = get_logger()

    level_enum = None
    if level:
        try:
            level_enum = LogLevel(level.lower())
        except ValueError:
            raise HTTPException(400, f"Invalid log level: {level}")

    category_enum = None
    if category:
        try:
            category_enum = LogCategory(category.lower())
        except ValueError:
            raise HTTPException(400, f"Invalid category: {category}")

    logs = logger.get_logs(
        level=level_enum,
        category=category_enum,
        correlation_id=correlation_id,
        search=search,
        limit=limit,
    )

    return {
        "logs": [log.to_dict() for log in logs],
        "count": len(logs),
        "filters": {
            "level": level,
            "category": category,
            "search": search,
            "correlation_id": correlation_id,
        },
    }


@router.get("/logs/stats")
async def get_log_stats(
    current_user=Depends(require_min_role(UserRole.USER)),
):
    """Get log statistics and distribution."""
    return get_logger().get_stats()


@router.get("/logs/levels")
async def get_log_levels():
    """Get available log levels."""
    return {"levels": [l.value for l in LogLevel]}


@router.get("/logs/categories")
async def get_log_categories():
    """Get available log categories."""
    return {"categories": [c.value for c in LogCategory]}


# ── Analytics / Metrics ───────────────────────────────────────────────────────

@router.get("/metrics")
async def get_all_metrics(
    current_user=Depends(require_min_role(UserRole.USER)),
):
    """Get all current metric values."""
    return get_analytics().get_all_metrics()


@router.get("/metrics/dashboard")
async def get_analytics_dashboard(
    current_user=Depends(get_current_user),
):
    """Get analytics dashboard for current user's organisation."""
    org_id = str(current_user.organisation_id) if current_user.organisation_id else None
    return get_analytics().get_dashboard(organisation_id=org_id)


@router.get("/metrics/prometheus")
async def get_prometheus_metrics():
    """Export metrics in Prometheus text format (no auth — scrape endpoint)."""
    from fastapi.responses import PlainTextResponse
    return PlainTextResponse(
        content=get_analytics().export_prometheus(),
        media_type="text/plain; version=0.0.4",
    )


@router.post("/metrics/record")
async def record_metric(
    metric_name: str,
    value: float,
    labels: Optional[Dict[str, str]] = None,
    current_user=Depends(require_min_role(UserRole.ORG_ADMIN)),
):
    """Record a custom metric value."""
    get_analytics().record(metric_name, value, labels)
    return {"recorded": True, "metric": metric_name, "value": value}


@router.get("/metrics/usage-patterns")
async def get_usage_patterns(
    current_user=Depends(require_min_role(UserRole.USER)),
):
    """Get detected usage patterns."""
    return {"patterns": get_analytics().get_usage_patterns()}


# ── Anomaly Detection ─────────────────────────────────────────────────────────

@router.get("/anomalies")
async def get_anomalies(
    resolved: bool = Query(False, description="Include resolved anomalies"),
    limit: int = Query(50, ge=1, le=200),
    current_user=Depends(require_min_role(UserRole.USER)),
):
    """Get detected anomalies."""
    return {
        "anomalies": get_analytics().get_anomalies(resolved=resolved, limit=limit),
        "resolved": resolved,
    }


@router.post("/anomalies/detect")
async def run_anomaly_detection(
    current_user=Depends(require_min_role(UserRole.ORG_ADMIN)),
):
    """Manually trigger anomaly detection scan."""
    new_anomalies = get_analytics().run_anomaly_detection()
    return {
        "new_anomalies": len(new_anomalies),
        "anomalies": [a.to_dict() for a in new_anomalies],
    }


@router.patch("/anomalies/{anomaly_id}/resolve")
async def resolve_anomaly(
    anomaly_id: str,
    current_user=Depends(require_min_role(UserRole.ORG_ADMIN)),
):
    """Mark an anomaly as resolved."""
    resolved = get_analytics().resolve_anomaly(anomaly_id)
    if not resolved:
        raise HTTPException(404, f"Anomaly {anomaly_id} not found")
    return {"resolved": True, "anomaly_id": anomaly_id}


# ── Health & Status ───────────────────────────────────────────────────────────

@router.get("/health")
async def observability_health():
    """Observability system health check."""
    logger = get_logger()
    analytics = get_analytics()
    stats = logger.get_stats()
    return {
        "status": "healthy",
        "logging": {
            "total_logs": stats["total_logs"],
            "buffer_usage_pct": stats["buffer_usage_pct"],
        },
        "analytics": {
            "total_metrics": analytics.get_dashboard().get("total_metrics", 0),
            "active_anomalies": len(analytics.get_anomalies(resolved=False)),
        },
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }