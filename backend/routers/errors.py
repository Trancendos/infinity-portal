# routers/errors.py — Structured error registry with IOS-DOMAIN-NUMBER codes
import uuid
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user, require_min_role, CurrentUser
from database import get_db_session
from models import ErrorEvent, ErrorSeverity, UserRole, utcnow

router = APIRouter(prefix="/api/v1/errors", tags=["Error Registry"])

# ============================================================
# ERROR CODE CATALOGUE
# IOS-{DOMAIN}-{NUMBER}
# Domains: AUTH, AI, FS, DB, NET, COMP, BUILD, WF, BILL, SYS
# ============================================================

ERROR_CATALOGUE = {
    # Authentication & Authorisation
    "IOS-AUTH-001": {"message": "Invalid credentials", "severity": "warning", "http_status": 401},
    "IOS-AUTH-002": {"message": "Token expired", "severity": "info", "http_status": 401},
    "IOS-AUTH-003": {"message": "Insufficient permissions", "severity": "warning", "http_status": 403},
    "IOS-AUTH-004": {"message": "Account locked — too many failed attempts", "severity": "warning", "http_status": 429},
    "IOS-AUTH-005": {"message": "Token revoked", "severity": "warning", "http_status": 401},
    "IOS-AUTH-006": {"message": "MFA required", "severity": "info", "http_status": 403},
    "IOS-AUTH-007": {"message": "Account deactivated", "severity": "warning", "http_status": 403},
    "IOS-AUTH-008": {"message": "Password policy violation", "severity": "warning", "http_status": 400},

    # AI Generation
    "IOS-AI-001": {"message": "LLM provider unavailable", "severity": "error", "http_status": 503},
    "IOS-AI-002": {"message": "HITL review required — high-risk task queued", "severity": "info", "http_status": 202},
    "IOS-AI-003": {"message": "Content policy violation", "severity": "warning", "http_status": 400},
    "IOS-AI-004": {"message": "AI system not found", "severity": "warning", "http_status": 404},
    "IOS-AI-005": {"message": "Prompt too long — exceeds model context window", "severity": "warning", "http_status": 400},
    "IOS-AI-006": {"message": "AI generation quota exceeded", "severity": "warning", "http_status": 429},
    "IOS-AI-007": {"message": "C2PA signing failed", "severity": "error", "http_status": 500},

    # File System
    "IOS-FS-001": {"message": "File not found", "severity": "info", "http_status": 404},
    "IOS-FS-002": {"message": "Storage quota exceeded", "severity": "warning", "http_status": 413},
    "IOS-FS-003": {"message": "File type not permitted", "severity": "warning", "http_status": 400},
    "IOS-FS-004": {"message": "File access denied", "severity": "warning", "http_status": 403},
    "IOS-FS-005": {"message": "Object storage unavailable", "severity": "error", "http_status": 503},

    # Database
    "IOS-DB-001": {"message": "Database connection failed", "severity": "critical", "http_status": 503},
    "IOS-DB-002": {"message": "Record not found", "severity": "info", "http_status": 404},
    "IOS-DB-003": {"message": "Unique constraint violation", "severity": "warning", "http_status": 409},
    "IOS-DB-004": {"message": "Migration required", "severity": "error", "http_status": 503},

    # Compliance
    "IOS-COMP-001": {"message": "DPIA required before deployment", "severity": "warning", "http_status": 400},
    "IOS-COMP-002": {"message": "Annex IV documentation incomplete", "severity": "warning", "http_status": 400},
    "IOS-COMP-003": {"message": "Risk level exceeds permitted threshold", "severity": "error", "http_status": 403},
    "IOS-COMP-004": {"message": "Audit log integrity check failed", "severity": "critical", "http_status": 500},

    # Build System
    "IOS-BUILD-001": {"message": "Build failed", "severity": "error", "http_status": 500},
    "IOS-BUILD-002": {"message": "Build timeout", "severity": "warning", "http_status": 408},
    "IOS-BUILD-003": {"message": "Build quota exceeded", "severity": "warning", "http_status": 429},

    # Workflow Engine
    "IOS-WF-001": {"message": "Workflow not found", "severity": "info", "http_status": 404},
    "IOS-WF-002": {"message": "Workflow step failed", "severity": "error", "http_status": 500},
    "IOS-WF-003": {"message": "Workflow timeout", "severity": "warning", "http_status": 408},
    "IOS-WF-004": {"message": "Workflow trigger failed", "severity": "error", "http_status": 500},

    # Billing
    "IOS-BILL-001": {"message": "Plan limit exceeded", "severity": "warning", "http_status": 429},
    "IOS-BILL-002": {"message": "Payment required", "severity": "warning", "http_status": 402},
    "IOS-BILL-003": {"message": "Stripe webhook verification failed", "severity": "critical", "http_status": 400},

    # System
    "IOS-SYS-001": {"message": "Internal server error", "severity": "critical", "http_status": 500},
    "IOS-SYS-002": {"message": "Service temporarily unavailable", "severity": "error", "http_status": 503},
    "IOS-SYS-003": {"message": "Rate limit exceeded", "severity": "warning", "http_status": 429},
    "IOS-SYS-004": {"message": "Request validation failed", "severity": "info", "http_status": 422},
}


# ============================================================
# SCHEMAS
# ============================================================

class ErrorEventCreate(BaseModel):
    error_code: str
    message: str
    severity: ErrorSeverity = ErrorSeverity.ERROR
    stack_trace: Optional[str] = None
    context: dict = {}
    request_id: Optional[str] = None
    endpoint: Optional[str] = None
    http_method: Optional[str] = None


class ErrorEventOut(BaseModel):
    id: str
    error_code: str
    severity: str
    message: str
    context: dict
    request_id: Optional[str]
    user_id: Optional[str]
    endpoint: Optional[str]
    is_resolved: bool
    occurrence_count: int
    first_seen_at: str
    last_seen_at: str
    resolved_at: Optional[str]
    resolution_notes: Optional[str]
    created_at: str


class ResolveRequest(BaseModel):
    resolution_notes: str


# ============================================================
# ENDPOINTS
# ============================================================

@router.get("/catalogue")
async def get_error_catalogue(
    user: CurrentUser = Depends(get_current_user),
):
    """Get the full error code catalogue"""
    return {
        "catalogue": ERROR_CATALOGUE,
        "total": len(ERROR_CATALOGUE),
        "domains": list({code.split("-")[1] for code in ERROR_CATALOGUE.keys()}),
    }


@router.post("", response_model=ErrorEventOut, status_code=201)
async def report_error(
    data: ErrorEventCreate,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Report an error event (used by frontend and backend services)"""
    # Check if same error already exists (deduplication)
    stmt = select(ErrorEvent).where(
        ErrorEvent.error_code == data.error_code,
        ErrorEvent.organisation_id == user.organisation_id,
        ErrorEvent.is_resolved == False,  # noqa: E712
        ErrorEvent.endpoint == data.endpoint,
    )
    result = await db.execute(stmt)
    existing = result.scalar_one_or_none()

    if existing:
        # Increment occurrence count
        existing.occurrence_count = (existing.occurrence_count or 1) + 1
        existing.last_seen_at = utcnow()
        await db.commit()
        await db.refresh(existing)
        return _error_out(existing)

    # Create new error event
    error = ErrorEvent(
        error_code=data.error_code,
        severity=data.severity,
        message=data.message,
        stack_trace=data.stack_trace,
        context=data.context,
        request_id=data.request_id,
        user_id=user.id,
        organisation_id=user.organisation_id,
        endpoint=data.endpoint,
        http_method=data.http_method,
    )
    db.add(error)
    await db.commit()
    await db.refresh(error)
    return _error_out(error)


@router.get("", response_model=List[ErrorEventOut])
async def list_errors(
    severity: Optional[str] = None,
    is_resolved: Optional[bool] = None,
    error_code: Optional[str] = None,
    limit: int = Query(default=50, le=200),
    offset: int = 0,
    user: CurrentUser = Depends(require_min_role(UserRole.AUDITOR)),
    db: AsyncSession = Depends(get_db_session),
):
    """List error events"""
    stmt = select(ErrorEvent).where(
        ErrorEvent.organisation_id == user.organisation_id,
    )
    if severity:
        stmt = stmt.where(ErrorEvent.severity == severity)
    if is_resolved is not None:
        stmt = stmt.where(ErrorEvent.is_resolved == is_resolved)
    if error_code:
        stmt = stmt.where(ErrorEvent.error_code == error_code)
    stmt = stmt.order_by(ErrorEvent.last_seen_at.desc()).offset(offset).limit(limit)
    result = await db.execute(stmt)
    return [_error_out(e) for e in result.scalars().all()]


@router.get("/stats")
async def get_error_stats(
    user: CurrentUser = Depends(require_min_role(UserRole.AUDITOR)),
    db: AsyncSession = Depends(get_db_session),
):
    """Get error statistics dashboard"""
    stmt = select(
        ErrorEvent.severity,
        func.count(ErrorEvent.id).label("count"),
        func.sum(ErrorEvent.occurrence_count).label("total_occurrences"),
    ).where(
        ErrorEvent.organisation_id == user.organisation_id,
        ErrorEvent.is_resolved == False,  # noqa: E712
    ).group_by(ErrorEvent.severity)
    result = await db.execute(stmt)

    by_severity = {}
    for row in result.all():
        by_severity[row.severity.value if hasattr(row.severity, 'value') else row.severity] = {
            "unique_errors": row.count,
            "total_occurrences": row.total_occurrences or 0,
        }

    # Top error codes
    top_stmt = select(
        ErrorEvent.error_code,
        func.sum(ErrorEvent.occurrence_count).label("occurrences"),
    ).where(
        ErrorEvent.organisation_id == user.organisation_id,
        ErrorEvent.is_resolved == False,  # noqa: E712
    ).group_by(ErrorEvent.error_code).order_by(func.sum(ErrorEvent.occurrence_count).desc()).limit(10)
    top_result = await db.execute(top_stmt)

    return {
        "by_severity": by_severity,
        "top_errors": [
            {"error_code": r.error_code, "occurrences": r.occurrences or 0}
            for r in top_result.all()
        ],
    }


@router.patch("/{error_id}/resolve")
async def resolve_error(
    error_id: str,
    req: ResolveRequest,
    user: CurrentUser = Depends(require_min_role(UserRole.ORG_ADMIN)),
    db: AsyncSession = Depends(get_db_session),
):
    """Mark an error as resolved"""
    stmt = select(ErrorEvent).where(
        ErrorEvent.id == error_id,
        ErrorEvent.organisation_id == user.organisation_id,
    )
    result = await db.execute(stmt)
    error = result.scalar_one_or_none()
    if not error:
        raise HTTPException(status_code=404, detail="Error event not found")

    error.is_resolved = True
    error.resolved_at = utcnow()
    error.resolved_by = user.id
    error.resolution_notes = req.resolution_notes
    await db.commit()
    return {"resolved": True, "error_id": error_id}


# ============================================================
# HELPERS
# ============================================================

def _error_out(e: ErrorEvent) -> ErrorEventOut:
    return ErrorEventOut(
        id=e.id,
        error_code=e.error_code,
        severity=e.severity.value if hasattr(e.severity, 'value') else str(e.severity),
        message=e.message,
        context=e.context or {},
        request_id=e.request_id,
        user_id=e.user_id,
        endpoint=e.endpoint,
        is_resolved=e.is_resolved or False,
        occurrence_count=e.occurrence_count or 1,
        first_seen_at=e.first_seen_at.isoformat() if e.first_seen_at else "",
        last_seen_at=e.last_seen_at.isoformat() if e.last_seen_at else "",
        resolved_at=e.resolved_at.isoformat() if e.resolved_at else None,
        resolution_notes=e.resolution_notes,
        created_at=e.created_at.isoformat() if e.created_at else "",
    )