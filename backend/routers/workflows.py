# routers/workflows.py — Automation workflow engine (Make/Zapier/n8n equivalent)
import uuid
import asyncio
import httpx
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user, require_min_role, CurrentUser
from database import get_db_session
from models import (
    WorkflowDefinition, WorkflowExecution, Notification,
    UserRole, WorkflowTriggerType, WorkflowStatus,
    WorkflowExecutionStatus, NotificationPriority, utcnow,
)

router = APIRouter(prefix="/api/v1/workflows", tags=["Workflow Engine"])


# ============================================================
# SCHEMAS
# ============================================================

class WorkflowStepSchema(BaseModel):
    id: str
    type: str  # http_request, ai_generate, send_notification, create_task, condition, transform, delay
    name: str
    config: Dict[str, Any] = {}
    on_success: Optional[str] = None   # next step id or "end"
    on_failure: Optional[str] = None   # next step id or "end" or "retry"


class WorkflowCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    trigger_type: WorkflowTriggerType = WorkflowTriggerType.MANUAL
    trigger_config: Dict[str, Any] = {}
    steps: List[WorkflowStepSchema] = []
    timeout_seconds: int = 300
    max_retries: int = 3
    tags: List[str] = []


class WorkflowUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    trigger_config: Optional[Dict[str, Any]] = None
    steps: Optional[List[WorkflowStepSchema]] = None
    status: Optional[WorkflowStatus] = None
    timeout_seconds: Optional[int] = None
    tags: Optional[List[str]] = None


class WorkflowOut(BaseModel):
    id: str
    name: str
    description: Optional[str]
    trigger_type: str
    trigger_config: Dict[str, Any]
    steps: List[Dict[str, Any]]
    status: str
    run_count: int
    success_count: int
    failure_count: int
    last_run_at: Optional[datetime]
    last_run_status: Optional[str]
    version: int
    created_at: datetime
    updated_at: datetime


class ExecutionOut(BaseModel):
    id: str
    workflow_id: str
    status: str
    trigger_type: Optional[str]
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    duration_ms: Optional[int]
    step_results: List[Dict[str, Any]]
    final_output: Optional[Dict[str, Any]]
    error_message: Optional[str]
    tokens_consumed: int
    created_at: datetime


class TriggerRequest(BaseModel):
    input_data: Dict[str, Any] = {}


# ============================================================
# WORKFLOW EXECUTION ENGINE
# ============================================================

async def _execute_step(
    step: Dict[str, Any],
    context: Dict[str, Any],
    db: AsyncSession,
) -> Dict[str, Any]:
    """Execute a single workflow step and return result"""
    step_type = step.get("type", "")
    config = step.get("config", {})
    result = {"step_id": step["id"], "status": "completed", "output": {}}

    try:
        if step_type == "http_request":
            method = config.get("method", "GET").upper()
            url = config.get("url", "")
            headers = config.get("headers", {})
            body = config.get("body", None)

            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.request(method, url, headers=headers, json=body)
                result["output"] = {
                    "status_code": resp.status_code,
                    "body": resp.json() if resp.headers.get("content-type", "").startswith("application/json") else resp.text,
                }

        elif step_type == "ai_generate":
            # Delegate to AI router logic
            prompt = config.get("prompt", "")
            result["output"] = {
                "content": f"[AI] Generated response for: {prompt[:100]}...",
                "model": "stub",
            }

        elif step_type == "send_notification":
            title = config.get("title", "Workflow Notification")
            body = config.get("body", "")
            user_id = config.get("user_id") or context.get("triggered_by")
            if user_id:
                notif = Notification(
                    user_id=user_id,
                    organisation_id=context.get("organisation_id", ""),
                    title=title,
                    body=body,
                    priority=NotificationPriority.NORMAL,
                    source_module="workflow_engine",
                )
                db.add(notif)
                await db.commit()
            result["output"] = {"notification_sent": True, "title": title}

        elif step_type == "condition":
            # Simple condition evaluation
            condition = config.get("condition", "true")
            # In production: use a safe expression evaluator
            result["output"] = {"condition_result": True, "condition": condition}

        elif step_type == "transform":
            # Data transformation
            result["output"] = {"transformed": True, "input": context.get("last_output", {})}

        elif step_type == "delay":
            seconds = min(config.get("seconds", 1), 60)  # Max 60s delay
            await asyncio.sleep(seconds)
            result["output"] = {"delayed_seconds": seconds}

        else:
            result["output"] = {"message": f"Unknown step type: {step_type}"}

    except Exception as e:
        result["status"] = "failed"
        result["error"] = str(e)

    return result


async def _run_workflow(
    execution_id: str,
    workflow_id: str,
    steps: List[Dict[str, Any]],
    input_data: Dict[str, Any],
    organisation_id: str,
    triggered_by: Optional[str],
):
    """Background task: execute workflow steps sequentially"""
    from database import get_db_context

    async with get_db_context() as db:
        # Fetch execution record
        stmt = select(WorkflowExecution).where(WorkflowExecution.id == execution_id)
        result = await db.execute(stmt)
        execution = result.scalar_one_or_none()
        if not execution:
            return

        execution.status = WorkflowExecutionStatus.RUNNING
        execution.started_at = utcnow()
        await db.commit()

        step_results = []
        context = {
            "input": input_data,
            "organisation_id": organisation_id,
            "triggered_by": triggered_by,
            "last_output": {},
        }

        start_time = datetime.now(timezone.utc)
        final_status = WorkflowExecutionStatus.COMPLETED
        error_msg = None

        for step in steps:
            step_start = datetime.now(timezone.utc)
            step_result = await _execute_step(step, context, db)
            step_end = datetime.now(timezone.utc)
            step_result["started_at"] = step_start.isoformat()
            step_result["completed_at"] = step_end.isoformat()
            step_result["duration_ms"] = int((step_end - step_start).total_seconds() * 1000)
            step_results.append(step_result)

            if step_result["status"] == "failed":
                final_status = WorkflowExecutionStatus.FAILED
                error_msg = step_result.get("error", "Step failed")
                break

            context["last_output"] = step_result.get("output", {})

        end_time = datetime.now(timezone.utc)
        duration_ms = int((end_time - start_time).total_seconds() * 1000)

        execution.status = final_status
        execution.completed_at = end_time
        execution.duration_ms = duration_ms
        execution.step_results = step_results
        execution.final_output = context.get("last_output", {})
        execution.error_message = error_msg

        # Update workflow stats
        wf_stmt = select(WorkflowDefinition).where(WorkflowDefinition.id == workflow_id)
        wf_result = await db.execute(wf_stmt)
        workflow = wf_result.scalar_one_or_none()
        if workflow:
            workflow.run_count = (workflow.run_count or 0) + 1
            if final_status == WorkflowExecutionStatus.COMPLETED:
                workflow.success_count = (workflow.success_count or 0) + 1
            else:
                workflow.failure_count = (workflow.failure_count or 0) + 1
            workflow.last_run_at = end_time
            workflow.last_run_status = final_status.value

        await db.commit()


# ============================================================
# ENDPOINTS
# ============================================================

@router.post("", response_model=WorkflowOut, status_code=201)
async def create_workflow(
    data: WorkflowCreate,
    user: CurrentUser = Depends(require_min_role(UserRole.POWER_USER)),
    db: AsyncSession = Depends(get_db_session),
):
    """Create a new workflow definition"""
    workflow = WorkflowDefinition(
        name=data.name,
        description=data.description,
        organisation_id=user.organisation_id,
        created_by=user.id,
        trigger_type=data.trigger_type,
        trigger_config=data.trigger_config,
        steps=[s.model_dump() for s in data.steps],
        status=WorkflowStatus.DRAFT,
        timeout_seconds=data.timeout_seconds,
        max_retries=data.max_retries,
        tags=data.tags,
    )
    db.add(workflow)
    await db.commit()
    await db.refresh(workflow)
    return _wf_out(workflow)


@router.get("", response_model=List[WorkflowOut])
async def list_workflows(
    status: Optional[str] = None,
    limit: int = Query(default=50, le=200),
    offset: int = 0,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """List workflows for the current organisation"""
    stmt = select(WorkflowDefinition).where(
        WorkflowDefinition.organisation_id == user.organisation_id,
        WorkflowDefinition.deleted_at == None,  # noqa: E711
    )
    if status:
        stmt = stmt.where(WorkflowDefinition.status == status)
    stmt = stmt.order_by(WorkflowDefinition.updated_at.desc()).offset(offset).limit(limit)
    result = await db.execute(stmt)
    return [_wf_out(w) for w in result.scalars().all()]


@router.get("/{workflow_id}", response_model=WorkflowOut)
async def get_workflow(
    workflow_id: str,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Get a workflow by ID"""
    workflow = await _get_workflow_or_404(workflow_id, user.organisation_id, db)
    return _wf_out(workflow)


@router.patch("/{workflow_id}", response_model=WorkflowOut)
async def update_workflow(
    workflow_id: str,
    data: WorkflowUpdate,
    user: CurrentUser = Depends(require_min_role(UserRole.POWER_USER)),
    db: AsyncSession = Depends(get_db_session),
):
    """Update a workflow"""
    workflow = await _get_workflow_or_404(workflow_id, user.organisation_id, db)

    if data.name is not None:
        workflow.name = data.name
    if data.description is not None:
        workflow.description = data.description
    if data.trigger_config is not None:
        workflow.trigger_config = data.trigger_config
    if data.steps is not None:
        workflow.steps = [s.model_dump() for s in data.steps]
        workflow.version = (workflow.version or 1) + 1
    if data.status is not None:
        workflow.status = data.status
    if data.timeout_seconds is not None:
        workflow.timeout_seconds = data.timeout_seconds
    if data.tags is not None:
        workflow.tags = data.tags

    await db.commit()
    await db.refresh(workflow)
    return _wf_out(workflow)


@router.delete("/{workflow_id}", status_code=204)
async def delete_workflow(
    workflow_id: str,
    user: CurrentUser = Depends(require_min_role(UserRole.POWER_USER)),
    db: AsyncSession = Depends(get_db_session),
):
    """Soft-delete a workflow"""
    workflow = await _get_workflow_or_404(workflow_id, user.organisation_id, db)
    workflow.deleted_at = utcnow()
    workflow.status = WorkflowStatus.ARCHIVED
    await db.commit()


@router.post("/{workflow_id}/trigger", response_model=ExecutionOut)
async def trigger_workflow(
    workflow_id: str,
    req: TriggerRequest,
    background_tasks: BackgroundTasks,
    user: CurrentUser = Depends(require_min_role(UserRole.POWER_USER)),
    db: AsyncSession = Depends(get_db_session),
):
    """Manually trigger a workflow execution"""
    workflow = await _get_workflow_or_404(workflow_id, user.organisation_id, db)

    if workflow.status not in (WorkflowStatus.ACTIVE, WorkflowStatus.DRAFT):
        raise HTTPException(status_code=400, detail="Workflow is not active")

    execution = WorkflowExecution(
        workflow_id=workflow.id,
        organisation_id=user.organisation_id,
        triggered_by=user.id,
        status=WorkflowExecutionStatus.PENDING,
        trigger_type="manual",
        trigger_data=req.input_data,
    )
    db.add(execution)
    await db.commit()
    await db.refresh(execution)

    # Run in background
    background_tasks.add_task(
        _run_workflow,
        execution.id,
        workflow.id,
        workflow.steps or [],
        req.input_data,
        user.organisation_id,
        user.id,
    )

    return _exec_out(execution)


@router.get("/{workflow_id}/executions", response_model=List[ExecutionOut])
async def list_executions(
    workflow_id: str,
    limit: int = Query(default=20, le=100),
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """List execution history for a workflow"""
    await _get_workflow_or_404(workflow_id, user.organisation_id, db)

    stmt = (
        select(WorkflowExecution)
        .where(WorkflowExecution.workflow_id == workflow_id)
        .order_by(WorkflowExecution.created_at.desc())
        .limit(limit)
    )
    result = await db.execute(stmt)
    return [_exec_out(e) for e in result.scalars().all()]


@router.get("/{workflow_id}/executions/{execution_id}", response_model=ExecutionOut)
async def get_execution(
    workflow_id: str,
    execution_id: str,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Get a specific execution"""
    stmt = select(WorkflowExecution).where(
        WorkflowExecution.id == execution_id,
        WorkflowExecution.workflow_id == workflow_id,
        WorkflowExecution.organisation_id == user.organisation_id,
    )
    result = await db.execute(stmt)
    execution = result.scalar_one_or_none()
    if not execution:
        raise HTTPException(status_code=404, detail="Execution not found")
    return _exec_out(execution)


# ============================================================
# HELPERS
# ============================================================

async def _get_workflow_or_404(workflow_id: str, org_id: str, db: AsyncSession) -> WorkflowDefinition:
    stmt = select(WorkflowDefinition).where(
        WorkflowDefinition.id == workflow_id,
        WorkflowDefinition.organisation_id == org_id,
        WorkflowDefinition.deleted_at == None,  # noqa: E711
    )
    result = await db.execute(stmt)
    workflow = result.scalar_one_or_none()
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return workflow


def _wf_out(w: WorkflowDefinition) -> WorkflowOut:
    return WorkflowOut(
        id=w.id,
        name=w.name,
        description=w.description,
        trigger_type=w.trigger_type.value if w.trigger_type else "manual",
        trigger_config=w.trigger_config or {},
        steps=w.steps or [],
        status=w.status.value if w.status else "draft",
        run_count=w.run_count or 0,
        success_count=w.success_count or 0,
        failure_count=w.failure_count or 0,
        last_run_at=w.last_run_at,
        last_run_status=w.last_run_status,
        version=w.version or 1,
        created_at=w.created_at,
        updated_at=w.updated_at,
    )


def _exec_out(e: WorkflowExecution) -> ExecutionOut:
    return ExecutionOut(
        id=e.id,
        workflow_id=e.workflow_id,
        status=e.status.value if e.status else "pending",
        trigger_type=e.trigger_type,
        started_at=e.started_at,
        completed_at=e.completed_at,
        duration_ms=e.duration_ms,
        step_results=e.step_results or [],
        final_output=e.final_output,
        error_message=e.error_message,
        tokens_consumed=e.tokens_consumed or 0,
        created_at=e.created_at,
    )