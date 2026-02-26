# routers/billing.py — Zero-Net-Cost billing, usage metering & plan enforcement
import uuid
from datetime import datetime, timezone, date
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user, require_min_role, CurrentUser
from database import get_db_session
from models import (
    UsageMetric, BillingAccount, Invoice, FeatureFlag,
    UserRole, Organisation, utcnow, BillingPlan, InvoiceStatus,
)

router = APIRouter(prefix="/api/v1/billing", tags=["Billing & Usage"])

# ============================================================
# PLAN LIMITS
# ============================================================

PLAN_LIMITS = {
    BillingPlan.FREE: {
        "ai_generations_per_month": 100,
        "storage_gb": 1,
        "users": 3,
        "api_calls_per_day": 1000,
        "build_minutes_per_month": 60,
    },
    BillingPlan.PRO: {
        "ai_generations_per_month": 5000,
        "storage_gb": 50,
        "users": -1,  # unlimited
        "api_calls_per_day": 50000,
        "build_minutes_per_month": 500,
    },
    BillingPlan.ENTERPRISE: {
        "ai_generations_per_month": -1,  # unlimited
        "storage_gb": -1,
        "users": -1,
        "api_calls_per_day": -1,
        "build_minutes_per_month": -1,
    },
}


# ============================================================
# SCHEMAS
# ============================================================

class UsageSummary(BaseModel):
    period: str
    organisation_id: str
    plan: str
    ai_generations: int
    ai_tokens_input: int
    ai_tokens_output: int
    ai_cost_usd: str
    api_calls: int
    storage_bytes_used: int
    build_minutes: int
    limits: dict
    usage_percentages: dict


class BillingAccountOut(BaseModel):
    id: str
    organisation_id: str
    plan: str
    stripe_customer_id: Optional[str]
    billing_email: Optional[str]
    trial_ends_at: Optional[datetime]
    plan_expires_at: Optional[datetime]
    balance_credits: int
    is_active: bool
    created_at: datetime


class InvoiceOut(BaseModel):
    id: str
    stripe_invoice_id: Optional[str]
    total_pence: int
    currency: str
    status: str
    period_start: Optional[datetime]
    period_end: Optional[datetime]
    paid_at: Optional[datetime]
    created_at: datetime


class FeatureFlagOut(BaseModel):
    key: str
    enabled: bool
    description: Optional[str]
    rollout_percentage: int


class RecordUsageRequest(BaseModel):
    metric_type: str  # ai_generation, api_call, storage_upload, build_minute
    quantity: int = 1
    cost_usd: Optional[str] = None
    tokens_input: Optional[int] = None
    tokens_output: Optional[int] = None
    bytes_delta: Optional[int] = None


# ============================================================
# USAGE ENDPOINTS
# ============================================================

@router.get("/usage", response_model=UsageSummary)
async def get_usage_summary(
    period: str = Query(default="current_month", description="current_month, last_month, or YYYY-MM"),
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Get usage summary for the current organisation"""
    today = date.today()
    if period == "current_month":
        year_month = today.strftime("%Y-%m")
    elif period == "last_month":
        if today.month == 1:
            year_month = f"{today.year - 1}-12"
        else:
            year_month = f"{today.year}-{today.month - 1:02d}"
    else:
        year_month = period

    # Aggregate usage for the period
    stmt = select(
        func.sum(UsageMetric.ai_generations).label("ai_gen"),
        func.sum(UsageMetric.ai_tokens_input).label("tokens_in"),
        func.sum(UsageMetric.ai_tokens_output).label("tokens_out"),
        func.sum(UsageMetric.api_calls).label("api_calls"),
        func.sum(UsageMetric.storage_bytes_used).label("storage"),
        func.sum(UsageMetric.build_minutes).label("build_min"),
    ).where(
        UsageMetric.organisation_id == user.organisation_id,
        UsageMetric.date.like(f"{year_month}%"),
    )
    result = await db.execute(stmt)
    row = result.one()

    # Get billing account for plan
    ba_stmt = select(BillingAccount).where(BillingAccount.organisation_id == user.organisation_id)
    ba_result = await db.execute(ba_stmt)
    billing = ba_result.scalar_one_or_none()
    plan = billing.plan if billing else BillingPlan.FREE
    limits = PLAN_LIMITS.get(plan, PLAN_LIMITS[BillingPlan.FREE])

    ai_gen = row.ai_gen or 0
    api_calls = row.api_calls or 0
    build_min = row.build_min or 0

    def pct(used, limit):
        if limit == -1:
            return 0.0
        return round((used / limit) * 100, 1) if limit > 0 else 0.0

    return UsageSummary(
        period=year_month,
        organisation_id=user.organisation_id,
        plan=plan.value,
        ai_generations=ai_gen,
        ai_tokens_input=row.tokens_in or 0,
        ai_tokens_output=row.tokens_out or 0,
        ai_cost_usd="0.000000",
        api_calls=api_calls,
        storage_bytes_used=row.storage or 0,
        build_minutes=build_min,
        limits=limits,
        usage_percentages={
            "ai_generations": pct(ai_gen, limits["ai_generations_per_month"]),
            "api_calls": pct(api_calls, limits["api_calls_per_day"] * 30),
            "build_minutes": pct(build_min, limits["build_minutes_per_month"]),
        },
    )


@router.post("/usage/record")
async def record_usage(
    req: RecordUsageRequest,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Record a usage event for the current organisation (internal use)"""
    today = date.today().strftime("%Y-%m-%d")

    stmt = select(UsageMetric).where(
        UsageMetric.organisation_id == user.organisation_id,
        UsageMetric.user_id == user.id,
        UsageMetric.date == today,
    )
    result = await db.execute(stmt)
    metric = result.scalar_one_or_none()

    if not metric:
        metric = UsageMetric(
            organisation_id=user.organisation_id,
            user_id=user.id,
            date=today,
        )
        db.add(metric)

    if req.metric_type == "ai_generation":
        metric.ai_generations = (metric.ai_generations or 0) + req.quantity
        if req.tokens_input:
            metric.ai_tokens_input = (metric.ai_tokens_input or 0) + req.tokens_input
        if req.tokens_output:
            metric.ai_tokens_output = (metric.ai_tokens_output or 0) + req.tokens_output
    elif req.metric_type == "api_call":
        metric.api_calls = (metric.api_calls or 0) + req.quantity
    elif req.metric_type == "storage_upload":
        if req.bytes_delta:
            metric.storage_bytes_uploaded = (metric.storage_bytes_uploaded or 0) + req.bytes_delta
    elif req.metric_type == "build_minute":
        metric.build_minutes = (metric.build_minutes or 0) + req.quantity

    await db.commit()
    return {"recorded": True, "metric_type": req.metric_type, "quantity": req.quantity}


# ============================================================
# BILLING ACCOUNT
# ============================================================

@router.get("/account", response_model=BillingAccountOut)
async def get_billing_account(
    user: CurrentUser = Depends(require_min_role(UserRole.ORG_ADMIN)),
    db: AsyncSession = Depends(get_db_session),
):
    """Get billing account for the current organisation"""
    stmt = select(BillingAccount).where(BillingAccount.organisation_id == user.organisation_id)
    result = await db.execute(stmt)
    billing = result.scalar_one_or_none()

    if not billing:
        # Auto-create free billing account
        billing = BillingAccount(
            organisation_id=user.organisation_id,
            plan=BillingPlan.FREE,
            billing_email=user.email,
        )
        db.add(billing)
        await db.commit()
        await db.refresh(billing)

    return BillingAccountOut(
        id=billing.id,
        organisation_id=billing.organisation_id,
        plan=billing.plan.value,
        stripe_customer_id=billing.stripe_customer_id,
        billing_email=billing.billing_email,
        trial_ends_at=billing.trial_ends_at,
        plan_expires_at=billing.plan_expires_at,
        balance_credits=billing.balance_credits or 0,
        is_active=billing.is_active,
        created_at=billing.created_at,
    )


# ============================================================
# INVOICES
# ============================================================

@router.get("/invoices", response_model=List[InvoiceOut])
async def list_invoices(
    limit: int = Query(default=20, le=100),
    user: CurrentUser = Depends(require_min_role(UserRole.ORG_ADMIN)),
    db: AsyncSession = Depends(get_db_session),
):
    """List invoices for the current organisation"""
    stmt = (
        select(Invoice)
        .where(Invoice.organisation_id == user.organisation_id)
        .order_by(Invoice.created_at.desc())
        .limit(limit)
    )
    result = await db.execute(stmt)
    invoices = result.scalars().all()

    return [
        InvoiceOut(
            id=inv.id,
            stripe_invoice_id=inv.stripe_invoice_id,
            total_pence=inv.total_pence or 0,
            currency=inv.currency or "GBP",
            status=inv.status.value if inv.status else "draft",
            period_start=inv.period_start,
            period_end=inv.period_end,
            paid_at=inv.paid_at,
            created_at=inv.created_at,
        )
        for inv in invoices
    ]


# ============================================================
# FEATURE FLAGS
# ============================================================

@router.get("/features", response_model=List[FeatureFlagOut])
async def get_feature_flags(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Get active feature flags for the current organisation"""
    stmt = select(FeatureFlag).where(
        (FeatureFlag.organisation_id == user.organisation_id) |
        (FeatureFlag.organisation_id == None),  # noqa: E711 — global flags
        FeatureFlag.enabled == True,  # noqa: E712
    )
    result = await db.execute(stmt)
    flags = result.scalars().all()

    return [
        FeatureFlagOut(
            key=f.key,
            enabled=f.enabled,
            description=f.description,
            rollout_percentage=f.rollout_percentage or 100,
        )
        for f in flags
    ]


@router.put("/features/{key}")
async def set_feature_flag(
    key: str,
    enabled: bool,
    user: CurrentUser = Depends(require_min_role(UserRole.SUPER_ADMIN)),
    db: AsyncSession = Depends(get_db_session),
):
    """Enable or disable a feature flag (super_admin only)"""
    stmt = select(FeatureFlag).where(
        FeatureFlag.key == key,
        FeatureFlag.organisation_id == None,  # noqa: E711
    )
    result = await db.execute(stmt)
    flag = result.scalar_one_or_none()

    if not flag:
        flag = FeatureFlag(
            key=key,
            enabled=enabled,
            created_by=user.id,
        )
        db.add(flag)
    else:
        flag.enabled = enabled

    await db.commit()
    return {"key": key, "enabled": enabled}


# ============================================================
# PLAN LIMITS CHECK (used by middleware)
# ============================================================

async def check_plan_limits(
    org_id: str,
    metric_type: str,
    db: AsyncSession,
) -> dict:
    """Check if an organisation has exceeded their plan limits. Returns {allowed, limit, used, plan}"""
    today = date.today()
    year_month = today.strftime("%Y-%m")

    ba_stmt = select(BillingAccount).where(BillingAccount.organisation_id == org_id)
    ba_result = await db.execute(ba_stmt)
    billing = ba_result.scalar_one_or_none()
    plan = billing.plan if billing else BillingPlan.FREE
    limits = PLAN_LIMITS.get(plan, PLAN_LIMITS[BillingPlan.FREE])

    if metric_type == "ai_generation":
        limit = limits["ai_generations_per_month"]
        if limit == -1:
            return {"allowed": True, "limit": -1, "used": 0, "plan": plan.value}

        stmt = select(func.sum(UsageMetric.ai_generations)).where(
            UsageMetric.organisation_id == org_id,
            UsageMetric.date.like(f"{year_month}%"),
        )
        result = await db.execute(stmt)
        used = result.scalar() or 0
        return {"allowed": used < limit, "limit": limit, "used": used, "plan": plan.value}

    return {"allowed": True, "limit": -1, "used": 0, "plan": plan.value}