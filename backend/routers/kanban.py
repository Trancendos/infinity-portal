# routers/kanban.py — Jira-style Kanban board with full task management
import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, func, and_, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from auth import get_current_user, require_permission, CurrentUser
from database import get_db_session
from models import (
    Board, BoardColumn, Task, TaskComment, TaskHistory, TaskAttachment, TaskLabel,
    BoardColumnType, TaskPriority, TaskType, AuditLog, AuditEventType, utcnow,
)

router = APIRouter(prefix="/api/v1/kanban", tags=["Kanban Board"])

# Default columns for a new AI Development board
DEFAULT_COLUMNS = [
    {"name": "Backlog", "type": BoardColumnType.BACKLOG, "position": 0, "color": "#64748b"},
    {"name": "To Do", "type": BoardColumnType.TODO, "position": 1, "color": "#3b82f6"},
    {"name": "In Progress", "type": BoardColumnType.IN_PROGRESS, "position": 2, "color": "#f59e0b", "wip_limit": 5},
    {"name": "In Review", "type": BoardColumnType.IN_REVIEW, "position": 3, "color": "#8b5cf6", "wip_limit": 3},
    {"name": "Testing", "type": BoardColumnType.TESTING, "position": 4, "color": "#06b6d4", "wip_limit": 3},
    {"name": "Done", "type": BoardColumnType.DONE, "position": 5, "color": "#22c55e", "is_done": True},
]

DEFAULT_LABELS = [
    {"name": "AI/ML", "color": "#8b5cf6"},
    {"name": "Backend", "color": "#3b82f6"},
    {"name": "Frontend", "color": "#22c55e"},
    {"name": "Infrastructure", "color": "#f59e0b"},
    {"name": "Compliance", "color": "#ef4444"},
    {"name": "Bug", "color": "#dc2626"},
    {"name": "Feature", "color": "#06b6d4"},
    {"name": "Tech Debt", "color": "#64748b"},
    {"name": "Security", "color": "#f97316"},
    {"name": "Documentation", "color": "#a855f7"},
]


# ============================================================
# SCHEMAS
# ============================================================

# --- Board ---
class BoardCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    use_default_columns: bool = True


class BoardUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    settings: Optional[dict] = None


class ColumnOut(BaseModel):
    id: str
    name: str
    column_type: str
    position: int
    wip_limit: Optional[int] = None
    color: Optional[str] = None
    is_done_column: bool
    task_count: int = 0


class LabelOut(BaseModel):
    id: str
    name: str
    color: str


class BoardOut(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    owner_id: str
    is_default: bool
    columns: List[ColumnOut] = []
    labels: List[LabelOut] = []
    task_count: int = 0
    settings: dict = {}
    created_at: str
    updated_at: str


# --- Column ---
class ColumnCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)
    column_type: str = "todo"
    position: Optional[int] = None
    wip_limit: Optional[int] = None
    color: Optional[str] = None
    is_done_column: bool = False


class ColumnUpdate(BaseModel):
    name: Optional[str] = None
    position: Optional[int] = None
    wip_limit: Optional[int] = None
    color: Optional[str] = None


# --- Task ---
class TaskCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    description: Optional[str] = None
    task_type: str = "task"
    priority: str = "medium"
    column_id: Optional[str] = None  # If None, goes to first column (Backlog)
    assignee_id: Optional[str] = None
    parent_id: Optional[str] = None
    labels: List[str] = Field(default_factory=list)
    story_points: Optional[int] = None
    due_date: Optional[str] = None
    estimated_hours: Optional[int] = None
    tags: List[str] = Field(default_factory=list)


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    task_type: Optional[str] = None
    priority: Optional[str] = None
    assignee_id: Optional[str] = None
    labels: Optional[List[str]] = None
    story_points: Optional[int] = None
    due_date: Optional[str] = None
    estimated_hours: Optional[int] = None
    actual_hours: Optional[int] = None
    tags: Optional[List[str]] = None


class TaskMove(BaseModel):
    column_id: str
    position: Optional[int] = None


class CommentOut(BaseModel):
    id: str
    author_id: str
    author_name: str
    content: str
    is_internal: bool
    created_at: str
    edited_at: Optional[str] = None


class HistoryOut(BaseModel):
    id: str
    user_id: str
    user_name: str
    action: str
    field_name: Optional[str] = None
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    created_at: str


class TaskOut(BaseModel):
    id: str
    key: str
    title: str
    description: Optional[str] = None
    task_type: str
    priority: str
    column_id: Optional[str] = None
    column_name: Optional[str] = None
    board_id: str
    parent_id: Optional[str] = None
    creator_id: str
    creator_name: str
    assignee_id: Optional[str] = None
    assignee_name: Optional[str] = None
    labels: list = []
    story_points: Optional[int] = None
    due_date: Optional[str] = None
    estimated_hours: Optional[int] = None
    actual_hours: Optional[int] = None
    tags: list = []
    position: int = 0
    subtask_count: int = 0
    comment_count: int = 0
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    created_at: str
    updated_at: str


class TaskDetailOut(TaskOut):
    comments: List[CommentOut] = []
    history: List[HistoryOut] = []


class CommentCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=10000)
    is_internal: bool = False


class CommentUpdate(BaseModel):
    content: str = Field(..., min_length=1, max_length=10000)


class LabelCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)
    color: str = "#6366f1"


# ============================================================
# HELPERS
# ============================================================

async def _get_next_task_key(db: AsyncSession, board_id: str) -> str:
    """Generate the next task key like INF-1, INF-2, etc."""
    stmt = select(func.count(Task.id)).where(Task.board_id == board_id)
    result = await db.execute(stmt)
    count = result.scalar() or 0
    # Get board name prefix
    board_stmt = select(Board.name).where(Board.id == board_id)
    board_result = await db.execute(board_stmt)
    board_name = board_result.scalar() or "TASK"
    prefix = "".join(c for c in board_name[:4].upper() if c.isalpha()) or "TASK"
    return f"{prefix}-{count + 1}"


async def _record_history(
    db: AsyncSession, task_id: str, user_id: str, action: str,
    field_name: str = None, old_value: str = None, new_value: str = None,
    metadata: dict = None,
):
    """Record a task history entry"""
    entry = TaskHistory(
        task_id=task_id,
        user_id=user_id,
        action=action,
        field_name=field_name,
        old_value=old_value,
        new_value=new_value,
        extra_data=metadata or {},
    )
    db.add(entry)


def _ts(dt) -> Optional[str]:
    if dt is None:
        return None
    return dt.isoformat() if isinstance(dt, datetime) else str(dt)


# ============================================================
# BOARD ENDPOINTS
# ============================================================

@router.get("/boards", response_model=List[BoardOut])
async def list_boards(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """List all boards in the organisation"""
    stmt = (
        select(Board)
        .where(
            Board.organisation_id == user.organisation_id,
            Board.deleted_at.is_(None),
        )
        .options(selectinload(Board.columns), selectinload(Board.labels))
        .order_by(Board.created_at.desc())
    )
    result = await db.execute(stmt)
    boards = result.scalars().unique().all()

    out = []
    for b in boards:
        # Count tasks
        count_stmt = select(func.count(Task.id)).where(
            Task.board_id == b.id, Task.deleted_at.is_(None)
        )
        count_result = await db.execute(count_stmt)
        task_count = count_result.scalar() or 0

        # Count tasks per column
        col_counts = {}
        for col in b.columns:
            cc_stmt = select(func.count(Task.id)).where(
                Task.column_id == col.id, Task.deleted_at.is_(None)
            )
            cc_result = await db.execute(cc_stmt)
            col_counts[col.id] = cc_result.scalar() or 0

        out.append(BoardOut(
            id=b.id,
            name=b.name,
            description=b.description,
            owner_id=b.owner_id,
            is_default=b.is_default or False,
            columns=[ColumnOut(
                id=c.id, name=c.name,
                column_type=c.column_type.value if isinstance(c.column_type, BoardColumnType) else c.column_type,
                position=c.position, wip_limit=c.wip_limit, color=c.color,
                is_done_column=c.is_done_column or False,
                task_count=col_counts.get(c.id, 0),
            ) for c in sorted(b.columns, key=lambda x: x.position)],
            labels=[LabelOut(id=l.id, name=l.name, color=l.color) for l in b.labels],
            task_count=task_count,
            settings=b.settings or {},
            created_at=_ts(b.created_at),
            updated_at=_ts(b.updated_at),
        ))
    return out


@router.post("/boards", response_model=BoardOut)
async def create_board(
    data: BoardCreate,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Create a new Kanban board with default columns"""
    board = Board(
        name=data.name,
        description=data.description,
        organisation_id=user.organisation_id,
        owner_id=user.id,
        settings={},
    )
    db.add(board)
    await db.flush()

    # Create default columns
    if data.use_default_columns:
        for col_def in DEFAULT_COLUMNS:
            col = BoardColumn(
                board_id=board.id,
                name=col_def["name"],
                column_type=col_def["type"],
                position=col_def["position"],
                color=col_def.get("color"),
                wip_limit=col_def.get("wip_limit"),
                is_done_column=col_def.get("is_done", False),
            )
            db.add(col)

    # Create default labels
    for label_def in DEFAULT_LABELS:
        label = TaskLabel(
            board_id=board.id,
            name=label_def["name"],
            color=label_def["color"],
        )
        db.add(label)

    await db.commit()
    await db.refresh(board)

    # Re-fetch with relationships
    stmt = (
        select(Board)
        .where(Board.id == board.id)
        .options(selectinload(Board.columns), selectinload(Board.labels))
    )
    result = await db.execute(stmt)
    board = result.scalar_one()

    return BoardOut(
        id=board.id,
        name=board.name,
        description=board.description,
        owner_id=board.owner_id,
        is_default=board.is_default or False,
        columns=[ColumnOut(
            id=c.id, name=c.name,
            column_type=c.column_type.value if isinstance(c.column_type, BoardColumnType) else c.column_type,
            position=c.position, wip_limit=c.wip_limit, color=c.color,
            is_done_column=c.is_done_column or False, task_count=0,
        ) for c in sorted(board.columns, key=lambda x: x.position)],
        labels=[LabelOut(id=l.id, name=l.name, color=l.color) for l in board.labels],
        task_count=0,
        settings=board.settings or {},
        created_at=_ts(board.created_at),
        updated_at=_ts(board.updated_at),
    )


@router.patch("/boards/{board_id}", response_model=BoardOut)
async def update_board(
    board_id: str,
    data: BoardUpdate,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Update board name, description, or settings"""
    stmt = select(Board).where(
        Board.id == board_id,
        Board.organisation_id == user.organisation_id,
        Board.deleted_at.is_(None),
    ).options(selectinload(Board.columns), selectinload(Board.labels))
    result = await db.execute(stmt)
    board = result.scalar_one_or_none()
    if not board:
        raise HTTPException(status_code=404, detail="Board not found")

    if data.name is not None:
        board.name = data.name
    if data.description is not None:
        board.description = data.description
    if data.settings is not None:
        board.settings = data.settings

    await db.commit()
    await db.refresh(board)

    return BoardOut(
        id=board.id, name=board.name, description=board.description,
        owner_id=board.owner_id, is_default=board.is_default or False,
        columns=[ColumnOut(
            id=c.id, name=c.name,
            column_type=c.column_type.value if isinstance(c.column_type, BoardColumnType) else c.column_type,
            position=c.position, wip_limit=c.wip_limit, color=c.color,
            is_done_column=c.is_done_column or False, task_count=0,
        ) for c in sorted(board.columns, key=lambda x: x.position)],
        labels=[LabelOut(id=l.id, name=l.name, color=l.color) for l in board.labels],
        task_count=0, settings=board.settings or {},
        created_at=_ts(board.created_at), updated_at=_ts(board.updated_at),
    )


@router.delete("/boards/{board_id}")
async def delete_board(
    board_id: str,
    user: CurrentUser = Depends(require_permission("admin:platform")),
    db: AsyncSession = Depends(get_db_session),
):
    """Soft-delete a board"""
    stmt = select(Board).where(
        Board.id == board_id,
        Board.organisation_id == user.organisation_id,
    )
    result = await db.execute(stmt)
    board = result.scalar_one_or_none()
    if not board:
        raise HTTPException(status_code=404, detail="Board not found")

    board.deleted_at = utcnow()
    await db.commit()
    return {"status": "deleted", "board_id": board_id}


# ============================================================
# COLUMN ENDPOINTS
# ============================================================

@router.post("/boards/{board_id}/columns", response_model=ColumnOut)
async def create_column(
    board_id: str,
    data: ColumnCreate,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Add a new column to a board"""
    board = await _get_board(board_id, user.organisation_id, db)

    # Determine position
    if data.position is not None:
        position = data.position
    else:
        max_stmt = select(func.max(BoardColumn.position)).where(BoardColumn.board_id == board_id)
        max_result = await db.execute(max_stmt)
        max_pos = max_result.scalar() or 0
        position = max_pos + 1

    try:
        col_type = BoardColumnType(data.column_type)
    except ValueError:
        col_type = BoardColumnType.TODO

    col = BoardColumn(
        board_id=board_id,
        name=data.name,
        column_type=col_type,
        position=position,
        wip_limit=data.wip_limit,
        color=data.color,
        is_done_column=data.is_done_column,
    )
    db.add(col)
    await db.commit()
    await db.refresh(col)

    return ColumnOut(
        id=col.id, name=col.name,
        column_type=col.column_type.value,
        position=col.position, wip_limit=col.wip_limit,
        color=col.color, is_done_column=col.is_done_column or False,
        task_count=0,
    )


@router.patch("/boards/{board_id}/columns/{column_id}", response_model=ColumnOut)
async def update_column(
    board_id: str,
    column_id: str,
    data: ColumnUpdate,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Update a column's name, position, WIP limit, or color"""
    await _get_board(board_id, user.organisation_id, db)

    stmt = select(BoardColumn).where(BoardColumn.id == column_id, BoardColumn.board_id == board_id)
    result = await db.execute(stmt)
    col = result.scalar_one_or_none()
    if not col:
        raise HTTPException(status_code=404, detail="Column not found")

    if data.name is not None:
        col.name = data.name
    if data.position is not None:
        col.position = data.position
    if data.wip_limit is not None:
        col.wip_limit = data.wip_limit
    if data.color is not None:
        col.color = data.color

    await db.commit()
    await db.refresh(col)

    count_stmt = select(func.count(Task.id)).where(Task.column_id == col.id, Task.deleted_at.is_(None))
    count_result = await db.execute(count_stmt)
    task_count = count_result.scalar() or 0

    return ColumnOut(
        id=col.id, name=col.name,
        column_type=col.column_type.value if isinstance(col.column_type, BoardColumnType) else col.column_type,
        position=col.position, wip_limit=col.wip_limit,
        color=col.color, is_done_column=col.is_done_column or False,
        task_count=task_count,
    )


@router.delete("/boards/{board_id}/columns/{column_id}")
async def delete_column(
    board_id: str,
    column_id: str,
    move_tasks_to: Optional[str] = Query(None, description="Column ID to move tasks to"),
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Delete a column, optionally moving tasks to another column"""
    await _get_board(board_id, user.organisation_id, db)

    stmt = select(BoardColumn).where(BoardColumn.id == column_id, BoardColumn.board_id == board_id)
    result = await db.execute(stmt)
    col = result.scalar_one_or_none()
    if not col:
        raise HTTPException(status_code=404, detail="Column not found")

    if move_tasks_to:
        await db.execute(
            update(Task).where(Task.column_id == column_id).values(column_id=move_tasks_to)
        )

    await db.delete(col)
    await db.commit()
    return {"status": "deleted", "column_id": column_id}


# ============================================================
# TASK ENDPOINTS
# ============================================================

@router.get("/boards/{board_id}/tasks", response_model=List[TaskOut])
async def list_tasks(
    board_id: str,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
    column_id: Optional[str] = None,
    assignee_id: Optional[str] = None,
    priority: Optional[str] = None,
    task_type: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = Query(default=200, le=500),
):
    """List tasks on a board with optional filters"""
    await _get_board(board_id, user.organisation_id, db)

    stmt = (
        select(Task)
        .where(Task.board_id == board_id, Task.deleted_at.is_(None))
        .order_by(Task.position.asc(), Task.created_at.desc())
        .limit(limit)
    )

    if column_id:
        stmt = stmt.where(Task.column_id == column_id)
    if assignee_id:
        stmt = stmt.where(Task.assignee_id == assignee_id)
    if priority:
        try:
            stmt = stmt.where(Task.priority == TaskPriority(priority))
        except ValueError:
            pass
    if task_type:
        try:
            stmt = stmt.where(Task.task_type == TaskType(task_type))
        except ValueError:
            pass
    if search:
        stmt = stmt.where(
            Task.title.ilike(f"%{search}%") | Task.key.ilike(f"%{search}%")
        )

    result = await db.execute(stmt)
    tasks = result.scalars().all()

    return [await _task_to_out(t, db) for t in tasks]


@router.post("/boards/{board_id}/tasks", response_model=TaskOut)
async def create_task(
    board_id: str,
    data: TaskCreate,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Create a new task card"""
    board = await _get_board(board_id, user.organisation_id, db)

    # Determine column
    column_id = data.column_id
    if not column_id:
        # Default to first column (Backlog)
        col_stmt = (
            select(BoardColumn)
            .where(BoardColumn.board_id == board_id)
            .order_by(BoardColumn.position.asc())
            .limit(1)
        )
        col_result = await db.execute(col_stmt)
        first_col = col_result.scalar_one_or_none()
        if first_col:
            column_id = first_col.id

    # Generate task key
    key = await _get_next_task_key(db, board_id)

    # Determine position (append to end of column)
    pos_stmt = select(func.max(Task.position)).where(
        Task.board_id == board_id, Task.column_id == column_id
    )
    pos_result = await db.execute(pos_stmt)
    max_pos = pos_result.scalar() or 0

    # Parse priority and type
    try:
        priority = TaskPriority(data.priority)
    except ValueError:
        priority = TaskPriority.MEDIUM

    try:
        task_type = TaskType(data.task_type)
    except ValueError:
        task_type = TaskType.TASK

    # Parse due date
    due_date = None
    if data.due_date:
        try:
            due_date = datetime.fromisoformat(data.due_date.replace("Z", "+00:00"))
        except (ValueError, AttributeError):
            pass

    task = Task(
        board_id=board_id,
        column_id=column_id,
        organisation_id=user.organisation_id,
        key=key,
        title=data.title,
        description=data.description,
        task_type=task_type,
        priority=priority,
        position=max_pos + 1,
        creator_id=user.id,
        assignee_id=data.assignee_id,
        parent_id=data.parent_id,
        labels=data.labels,
        story_points=data.story_points,
        due_date=due_date,
        estimated_hours=data.estimated_hours,
        tags=data.tags,
    )
    db.add(task)
    await db.flush()

    # Record history
    await _record_history(db, task.id, user.id, "created", metadata={"key": key})

    if data.assignee_id:
        await _record_history(
            db, task.id, user.id, "assigned",
            field_name="assignee_id", new_value=data.assignee_id,
        )

    await db.commit()
    await db.refresh(task)

    return await _task_to_out(task, db)


@router.get("/boards/{board_id}/tasks/{task_id}", response_model=TaskDetailOut)
async def get_task(
    board_id: str,
    task_id: str,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Get full task details including comments and history"""
    await _get_board(board_id, user.organisation_id, db)

    stmt = (
        select(Task)
        .where(Task.id == task_id, Task.board_id == board_id, Task.deleted_at.is_(None))
        .options(
            selectinload(Task.comments).selectinload(TaskComment.author),
            selectinload(Task.history).selectinload(TaskHistory.user),
        )
    )
    result = await db.execute(stmt)
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    base = await _task_to_out(task, db)

    comments = [
        CommentOut(
            id=c.id,
            author_id=c.author_id,
            author_name=c.author.display_name if c.author else "Unknown",
            content=c.content,
            is_internal=c.is_internal or False,
            created_at=_ts(c.created_at),
            edited_at=_ts(c.edited_at),
        )
        for c in (task.comments or [])
        if c.deleted_at is None
    ]

    history = [
        HistoryOut(
            id=h.id,
            user_id=h.user_id,
            user_name=h.user.display_name if h.user else "Unknown",
            action=h.action,
            field_name=h.field_name,
            old_value=h.old_value,
            new_value=h.new_value,
            created_at=_ts(h.created_at),
        )
        for h in (task.history or [])
    ]

    return TaskDetailOut(
        **base.model_dump(),
        comments=comments,
        history=history,
    )


@router.patch("/boards/{board_id}/tasks/{task_id}", response_model=TaskOut)
async def update_task(
    board_id: str,
    task_id: str,
    data: TaskUpdate,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Update task fields"""
    await _get_board(board_id, user.organisation_id, db)

    stmt = select(Task).where(
        Task.id == task_id, Task.board_id == board_id, Task.deleted_at.is_(None)
    )
    result = await db.execute(stmt)
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    # Track changes for history
    changes = []

    if data.title is not None and data.title != task.title:
        changes.append(("title", task.title, data.title))
        task.title = data.title
    if data.description is not None and data.description != task.description:
        changes.append(("description", "...", "..."))
        task.description = data.description
    if data.priority is not None:
        old_p = task.priority.value if isinstance(task.priority, TaskPriority) else task.priority
        if data.priority != old_p:
            changes.append(("priority", old_p, data.priority))
            try:
                task.priority = TaskPriority(data.priority)
            except ValueError:
                pass
    if data.task_type is not None:
        old_t = task.task_type.value if isinstance(task.task_type, TaskType) else task.task_type
        if data.task_type != old_t:
            changes.append(("task_type", old_t, data.task_type))
            try:
                task.task_type = TaskType(data.task_type)
            except ValueError:
                pass
    if data.assignee_id is not None and data.assignee_id != task.assignee_id:
        changes.append(("assignee_id", task.assignee_id, data.assignee_id))
        task.assignee_id = data.assignee_id or None
    if data.labels is not None:
        task.labels = data.labels
    if data.story_points is not None:
        changes.append(("story_points", str(task.story_points), str(data.story_points)))
        task.story_points = data.story_points
    if data.due_date is not None:
        try:
            task.due_date = datetime.fromisoformat(data.due_date.replace("Z", "+00:00"))
        except (ValueError, AttributeError):
            pass
    if data.estimated_hours is not None:
        task.estimated_hours = data.estimated_hours
    if data.actual_hours is not None:
        task.actual_hours = data.actual_hours
    if data.tags is not None:
        task.tags = data.tags

    # Record all changes
    for field, old, new in changes:
        await _record_history(db, task.id, user.id, "updated", field_name=field, old_value=old, new_value=new)

    await db.commit()
    await db.refresh(task)
    return await _task_to_out(task, db)


@router.post("/boards/{board_id}/tasks/{task_id}/move", response_model=TaskOut)
async def move_task(
    board_id: str,
    task_id: str,
    data: TaskMove,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Move a task to a different column (swim lane)"""
    await _get_board(board_id, user.organisation_id, db)

    stmt = select(Task).where(
        Task.id == task_id, Task.board_id == board_id, Task.deleted_at.is_(None)
    )
    result = await db.execute(stmt)
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    # Verify target column exists
    col_stmt = select(BoardColumn).where(
        BoardColumn.id == data.column_id, BoardColumn.board_id == board_id
    )
    col_result = await db.execute(col_stmt)
    target_col = col_result.scalar_one_or_none()
    if not target_col:
        raise HTTPException(status_code=404, detail="Target column not found")

    # Check WIP limit
    if target_col.wip_limit:
        count_stmt = select(func.count(Task.id)).where(
            Task.column_id == target_col.id, Task.deleted_at.is_(None)
        )
        count_result = await db.execute(count_stmt)
        current_count = count_result.scalar() or 0
        if current_count >= target_col.wip_limit:
            raise HTTPException(
                status_code=409,
                detail=f"Column '{target_col.name}' has reached its WIP limit of {target_col.wip_limit}"
            )

    # Get old column name for history
    old_col_name = "Unknown"
    if task.column_id:
        old_col_stmt = select(BoardColumn.name).where(BoardColumn.id == task.column_id)
        old_col_result = await db.execute(old_col_stmt)
        old_col_name = old_col_result.scalar() or "Unknown"

    old_column_id = task.column_id
    task.column_id = data.column_id

    if data.position is not None:
        task.position = data.position
    else:
        pos_stmt = select(func.max(Task.position)).where(
            Task.column_id == data.column_id, Task.board_id == board_id
        )
        pos_result = await db.execute(pos_stmt)
        max_pos = pos_result.scalar() or 0
        task.position = max_pos + 1

    # Track started_at and completed_at
    now = utcnow()
    if target_col.column_type == BoardColumnType.IN_PROGRESS and not task.started_at:
        task.started_at = now
    if target_col.is_done_column and not task.completed_at:
        task.completed_at = now

    await _record_history(
        db, task.id, user.id, "moved",
        field_name="column",
        old_value=old_col_name,
        new_value=target_col.name,
    )

    await db.commit()
    await db.refresh(task)
    return await _task_to_out(task, db)


@router.delete("/boards/{board_id}/tasks/{task_id}")
async def delete_task(
    board_id: str,
    task_id: str,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Soft-delete a task"""
    await _get_board(board_id, user.organisation_id, db)

    stmt = select(Task).where(
        Task.id == task_id, Task.board_id == board_id, Task.deleted_at.is_(None)
    )
    result = await db.execute(stmt)
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    task.deleted_at = utcnow()
    await _record_history(db, task.id, user.id, "deleted")
    await db.commit()
    return {"status": "deleted", "task_id": task_id}


# ============================================================
# COMMENT ENDPOINTS
# ============================================================

@router.get("/boards/{board_id}/tasks/{task_id}/comments", response_model=List[CommentOut])
async def list_comments(
    board_id: str,
    task_id: str,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """List comments on a task"""
    stmt = (
        select(TaskComment)
        .where(TaskComment.task_id == task_id, TaskComment.deleted_at.is_(None))
        .options(selectinload(TaskComment.author))
        .order_by(TaskComment.created_at.asc())
    )
    result = await db.execute(stmt)
    comments = result.scalars().all()

    return [
        CommentOut(
            id=c.id,
            author_id=c.author_id,
            author_name=c.author.display_name if c.author else "Unknown",
            content=c.content,
            is_internal=c.is_internal or False,
            created_at=_ts(c.created_at),
            edited_at=_ts(c.edited_at),
        )
        for c in comments
    ]


@router.post("/boards/{board_id}/tasks/{task_id}/comments", response_model=CommentOut)
async def add_comment(
    board_id: str,
    task_id: str,
    data: CommentCreate,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Add a comment to a task"""
    # Verify task exists
    task_stmt = select(Task).where(Task.id == task_id, Task.board_id == board_id, Task.deleted_at.is_(None))
    task_result = await db.execute(task_stmt)
    task = task_result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    comment = TaskComment(
        task_id=task_id,
        author_id=user.id,
        content=data.content,
        is_internal=data.is_internal,
    )
    db.add(comment)

    await _record_history(
        db, task_id, user.id, "commented",
        metadata={"comment_preview": data.content[:100]},
    )

    await db.commit()
    await db.refresh(comment)

    return CommentOut(
        id=comment.id,
        author_id=comment.author_id,
        author_name=user.display_name or user.email,
        content=comment.content,
        is_internal=comment.is_internal or False,
        created_at=_ts(comment.created_at),
        edited_at=None,
    )


@router.patch("/boards/{board_id}/tasks/{task_id}/comments/{comment_id}", response_model=CommentOut)
async def update_comment(
    board_id: str,
    task_id: str,
    comment_id: str,
    data: CommentUpdate,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Edit a comment (only the author can edit)"""
    stmt = select(TaskComment).where(
        TaskComment.id == comment_id,
        TaskComment.task_id == task_id,
        TaskComment.deleted_at.is_(None),
    ).options(selectinload(TaskComment.author))
    result = await db.execute(stmt)
    comment = result.scalar_one_or_none()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    if comment.author_id != user.id:
        raise HTTPException(status_code=403, detail="Can only edit your own comments")

    comment.content = data.content
    comment.edited_at = utcnow()
    await db.commit()
    await db.refresh(comment)

    return CommentOut(
        id=comment.id,
        author_id=comment.author_id,
        author_name=comment.author.display_name if comment.author else "Unknown",
        content=comment.content,
        is_internal=comment.is_internal or False,
        created_at=_ts(comment.created_at),
        edited_at=_ts(comment.edited_at),
    )


@router.delete("/boards/{board_id}/tasks/{task_id}/comments/{comment_id}")
async def delete_comment(
    board_id: str,
    task_id: str,
    comment_id: str,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Soft-delete a comment"""
    stmt = select(TaskComment).where(
        TaskComment.id == comment_id, TaskComment.task_id == task_id
    )
    result = await db.execute(stmt)
    comment = result.scalar_one_or_none()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    if comment.author_id != user.id:
        from models import UserRole
        user_role = user.role if isinstance(user.role, str) else user.role.value
        if user_role not in ("super_admin", "org_admin"):
            raise HTTPException(status_code=403, detail="Cannot delete others' comments")

    comment.deleted_at = utcnow()
    await db.commit()
    return {"status": "deleted"}


# ============================================================
# TASK HISTORY
# ============================================================

@router.get("/boards/{board_id}/tasks/{task_id}/history", response_model=List[HistoryOut])
async def get_task_history(
    board_id: str,
    task_id: str,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
    limit: int = Query(default=50, le=200),
):
    """Get the action history / audit trail for a task"""
    stmt = (
        select(TaskHistory)
        .where(TaskHistory.task_id == task_id)
        .options(selectinload(TaskHistory.user))
        .order_by(TaskHistory.created_at.desc())
        .limit(limit)
    )
    result = await db.execute(stmt)
    entries = result.scalars().all()

    return [
        HistoryOut(
            id=h.id,
            user_id=h.user_id,
            user_name=h.user.display_name if h.user else "Unknown",
            action=h.action,
            field_name=h.field_name,
            old_value=h.old_value,
            new_value=h.new_value,
            created_at=_ts(h.created_at),
        )
        for h in entries
    ]


# ============================================================
# LABELS
# ============================================================

@router.post("/boards/{board_id}/labels", response_model=LabelOut)
async def create_label(
    board_id: str,
    data: LabelCreate,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Create a new label for a board"""
    await _get_board(board_id, user.organisation_id, db)

    label = TaskLabel(board_id=board_id, name=data.name, color=data.color)
    db.add(label)
    await db.commit()
    await db.refresh(label)
    return LabelOut(id=label.id, name=label.name, color=label.color)


@router.delete("/boards/{board_id}/labels/{label_id}")
async def delete_label(
    board_id: str,
    label_id: str,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Delete a label"""
    stmt = select(TaskLabel).where(TaskLabel.id == label_id, TaskLabel.board_id == board_id)
    result = await db.execute(stmt)
    label = result.scalar_one_or_none()
    if not label:
        raise HTTPException(status_code=404, detail="Label not found")
    await db.delete(label)
    await db.commit()
    return {"status": "deleted"}


# ============================================================
# BOARD STATS / METRICS
# ============================================================

@router.get("/boards/{board_id}/stats")
async def get_board_stats(
    board_id: str,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Get board statistics and metrics"""
    board = await _get_board(board_id, user.organisation_id, db)

    # Total tasks
    total_stmt = select(func.count(Task.id)).where(Task.board_id == board_id, Task.deleted_at.is_(None))
    total = (await db.execute(total_stmt)).scalar() or 0

    # Tasks by column
    col_stmt = (
        select(BoardColumn.name, func.count(Task.id))
        .outerjoin(Task, and_(Task.column_id == BoardColumn.id, Task.deleted_at.is_(None)))
        .where(BoardColumn.board_id == board_id)
        .group_by(BoardColumn.name, BoardColumn.position)
        .order_by(BoardColumn.position)
    )
    col_result = await db.execute(col_stmt)
    by_column = {name: count for name, count in col_result.all()}

    # Tasks by priority
    pri_stmt = (
        select(Task.priority, func.count(Task.id))
        .where(Task.board_id == board_id, Task.deleted_at.is_(None))
        .group_by(Task.priority)
    )
    pri_result = await db.execute(pri_stmt)
    by_priority = {
        (p.value if isinstance(p, TaskPriority) else p): c
        for p, c in pri_result.all()
    }

    # Tasks by type
    type_stmt = (
        select(Task.task_type, func.count(Task.id))
        .where(Task.board_id == board_id, Task.deleted_at.is_(None))
        .group_by(Task.task_type)
    )
    type_result = await db.execute(type_stmt)
    by_type = {
        (t.value if isinstance(t, TaskType) else t): c
        for t, c in type_result.all()
    }

    # Completed tasks
    done_stmt = select(func.count(Task.id)).where(
        Task.board_id == board_id, Task.completed_at.isnot(None), Task.deleted_at.is_(None)
    )
    completed = (await db.execute(done_stmt)).scalar() or 0

    # Overdue tasks
    overdue_stmt = select(func.count(Task.id)).where(
        Task.board_id == board_id,
        Task.due_date < utcnow(),
        Task.completed_at.is_(None),
        Task.deleted_at.is_(None),
    )
    overdue = (await db.execute(overdue_stmt)).scalar() or 0

    return {
        "total_tasks": total,
        "completed_tasks": completed,
        "overdue_tasks": overdue,
        "completion_rate": round((completed / total * 100) if total > 0 else 0, 1),
        "by_column": by_column,
        "by_priority": by_priority,
        "by_type": by_type,
    }


# ============================================================
# INTERNAL HELPERS
# ============================================================

async def _get_board(board_id: str, org_id: str, db: AsyncSession) -> Board:
    stmt = select(Board).where(
        Board.id == board_id,
        Board.organisation_id == org_id,
        Board.deleted_at.is_(None),
    )
    result = await db.execute(stmt)
    board = result.scalar_one_or_none()
    if not board:
        raise HTTPException(status_code=404, detail="Board not found")
    return board


async def _task_to_out(task: Task, db: AsyncSession) -> TaskOut:
    """Convert a Task ORM object to TaskOut schema"""
    # Get column name
    col_name = None
    if task.column_id:
        col_stmt = select(BoardColumn.name).where(BoardColumn.id == task.column_id)
        col_result = await db.execute(col_stmt)
        col_name = col_result.scalar()

    # Get creator name
    from models import User
    creator_name = "Unknown"
    cr_stmt = select(User.display_name).where(User.id == task.creator_id)
    cr_result = await db.execute(cr_stmt)
    creator_name = cr_result.scalar() or "Unknown"

    # Get assignee name
    assignee_name = None
    if task.assignee_id:
        as_stmt = select(User.display_name).where(User.id == task.assignee_id)
        as_result = await db.execute(as_stmt)
        assignee_name = as_result.scalar()

    # Count subtasks
    sub_stmt = select(func.count(Task.id)).where(Task.parent_id == task.id, Task.deleted_at.is_(None))
    sub_result = await db.execute(sub_stmt)
    subtask_count = sub_result.scalar() or 0

    # Count comments
    com_stmt = select(func.count(TaskComment.id)).where(
        TaskComment.task_id == task.id, TaskComment.deleted_at.is_(None)
    )
    com_result = await db.execute(com_stmt)
    comment_count = com_result.scalar() or 0

    return TaskOut(
        id=task.id,
        key=task.key,
        title=task.title,
        description=task.description,
        task_type=task.task_type.value if isinstance(task.task_type, TaskType) else task.task_type,
        priority=task.priority.value if isinstance(task.priority, TaskPriority) else task.priority,
        column_id=task.column_id,
        column_name=col_name,
        board_id=task.board_id,
        parent_id=task.parent_id,
        creator_id=task.creator_id,
        creator_name=creator_name,
        assignee_id=task.assignee_id,
        assignee_name=assignee_name,
        labels=task.labels or [],
        story_points=task.story_points,
        due_date=_ts(task.due_date),
        estimated_hours=task.estimated_hours,
        actual_hours=task.actual_hours,
        tags=task.tags or [],
        position=task.position or 0,
        subtask_count=subtask_count,
        comment_count=comment_count,
        started_at=_ts(task.started_at),
        completed_at=_ts(task.completed_at),
        created_at=_ts(task.created_at),
        updated_at=_ts(task.updated_at),
    )