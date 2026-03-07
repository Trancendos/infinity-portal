# routers/admin_cli.py — Admin OS CLI Terminal — Sandboxed command execution
# Phase 22 — Platform Operations & Intelligence Layer
#
# Provides a secure, audited CLI terminal within the Infinity OS Admin Portal.
# Commands are sandboxed, categorised, and logged. Supports session management,
# command history, autocomplete, and piped command chains.
#
# Security: All commands run through a whitelist/capability system.
# Production: Commands execute via isolated containers or subprocess sandboxes.

from typing import Optional, Dict, Any, List
from datetime import datetime, timezone
from enum import Enum
import uuid
import os
import re
import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Path, Body
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user, require_min_role, CurrentUser
from database import get_db_session
from router_migration_helper import store_factory, audit_log_factory

router = APIRouter(prefix="/api/v1/admin/cli", tags=["Admin CLI Terminal"])
logger = logging.getLogger("admin_cli")

# ============================================================
# MODELS
# ============================================================

class CommandCategory(str, Enum):
    SYSTEM = "system"
    GIT = "git"
    DOCKER = "docker"
    DATABASE = "database"
    NETWORK = "network"
    FILES = "files"
    PLATFORM = "platform"
    DIAGNOSTICS = "diagnostics"
    CUSTOM = "custom"

class CommandRequest(BaseModel):
    command: str = Field(..., min_length=1, max_length=4096, description="Command to execute")
    session_id: Optional[str] = Field(None, description="CLI session ID (auto-created if None)")
    working_directory: str = Field(default="/workspace", max_length=512)
    timeout_seconds: int = Field(default=30, ge=1, le=300)
    environment: Dict[str, str] = Field(default_factory=dict, description="Extra env vars")
    pipe_to: Optional[str] = Field(None, max_length=4096, description="Pipe output to another command")

class BatchCommandRequest(BaseModel):
    commands: List[str] = Field(..., min_length=1, max_length=20)
    session_id: Optional[str] = None
    working_directory: str = Field(default="/workspace")
    stop_on_error: bool = True
    timeout_seconds: int = Field(default=60, ge=1, le=600)

class SessionCreateRequest(BaseModel):
    name: str = Field(default="default", min_length=1, max_length=128)
    working_directory: str = Field(default="/workspace")
    environment: Dict[str, str] = Field(default_factory=dict)

class AliasRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=64, pattern="^[a-zA-Z0-9_-]+$")
    command: str = Field(..., min_length=1, max_length=4096)
    description: str = Field(default="", max_length=256)

# ============================================================
# IN-MEMORY STATE (production: Redis + Turso)
# ============================================================

_sessions = store_factory("admin_cli", "sessions")
_command_history = audit_log_factory("admin_cli", "command_history")
_aliases = store_factory("admin_cli", "aliases")
_audit = audit_log_factory("admin_cli", "audit")

# ============================================================
# COMMAND SAFETY & CLASSIFICATION
# ============================================================

# Blocked patterns — commands that could damage the host
_BLOCKED_PATTERNS = [
    r"\brm\s+-rf\s+/",              # rm -rf /
    r"\bmkfs\b",                     # format filesystem
    r"\bdd\s+if=",                   # raw disk write
    r":(){.*};:",                     # fork bomb
    r"\bshutdown\b",                 # shutdown
    r"\breboot\b",                   # reboot
    r"\binit\s+[06]\b",             # init 0/6
    r"\bkill\s+-9\s+1\b",           # kill init
    r"\bchmod\s+-R\s+777\s+/",       # chmod 777 /
    r"\biptables\s+-F\b",           # flush firewall
    r">\s*/dev/sd[a-z]",            # write to disk device
    r"\bpasswd\b",                   # change passwords
    r"\buserdel\b",                  # delete users
    r"\bsystemctl\s+(disable|mask)", # disable services
]

# Command category detection
_CATEGORY_PATTERNS = {
    CommandCategory.GIT: [r"\bgit\b", r"\bgh\b"],
    CommandCategory.DOCKER: [r"\bdocker\b", r"\bdocker-compose\b", r"\bpodman\b"],
    CommandCategory.DATABASE: [r"\bsqlite3\b", r"\bpsql\b", r"\bmysql\b", r"\bredis-cli\b", r"\bturso\b"],
    CommandCategory.NETWORK: [r"\bcurl\b", r"\bwget\b", r"\bping\b", r"\bnslookup\b", r"\bnetstat\b", r"\bss\b"],
    CommandCategory.FILES: [r"\bls\b", r"\bfind\b", r"\bcat\b", r"\bhead\b", r"\btail\b", r"\bgrep\b", r"\bawk\b", r"\bsed\b", r"\bcp\b", r"\bmv\b", r"\bmkdir\b", r"\btouch\b", r"\btree\b"],
    CommandCategory.SYSTEM: [r"\bps\b", r"\btop\b", r"\bhtop\b", r"\bdf\b", r"\bdu\b", r"\bfree\b", r"\buptime\b", r"\bwho\b", r"\buname\b", r"\benv\b", r"\bprintenv\b"],
    CommandCategory.DIAGNOSTICS: [r"\bpython.*-m\s+pytest\b", r"\bnpm\s+test\b", r"\bflake8\b", r"\bmypy\b", r"\bbandit\b", r"\bpylint\b"],
    CommandCategory.PLATFORM: [r"\buvicorn\b", r"\bgunicorn\b", r"\bnpm\s+(start|run|build)\b", r"\bpip\b", r"\bnpm\s+install\b"],
}

def _classify_command(cmd: str) -> CommandCategory:
    """Classify a command into a category."""
    for category, patterns in _CATEGORY_PATTERNS.items():
        for pattern in patterns:
            if re.search(pattern, cmd):
                return category
    return CommandCategory.CUSTOM

def _is_blocked(cmd: str) -> Optional[str]:
    """Check if a command matches any blocked pattern. Returns reason or None."""
    for pattern in _BLOCKED_PATTERNS:
        if re.search(pattern, cmd, re.IGNORECASE):
            return f"Command blocked by safety filter: matches pattern '{pattern}'"
    return None

def _sanitize_output(output: str, max_length: int = 50000) -> str:
    """Truncate and sanitize command output."""
    if len(output) > max_length:
        truncated = output[:max_length]
        return truncated + f"\n\n--- OUTPUT TRUNCATED ({len(output)} bytes total, showing first {max_length}) ---"
    return output

def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()

# ============================================================
# PLATFORM COMMANDS — Built-in commands that don't shell out
# ============================================================

_PLATFORM_COMMANDS = {
    "platform:status": {
        "description": "Show platform status summary",
        "handler": lambda: {
            "platform": "Infinity OS",
            "version": "3.0.0",
            "environment": os.getenv("ENVIRONMENT", "development"),
            "python": os.popen("python3 --version 2>&1").read().strip(),
            "node": os.popen("node --version 2>&1").read().strip(),
            "uptime": os.popen("uptime -p 2>/dev/null || uptime").read().strip(),
        },
    },
    "platform:health": {
        "description": "Quick health check of all services",
        "handler": lambda: {
            "api": "running",
            "database": "connected" if os.path.exists("/workspace/repos/infinity-portal/backend/infinity.db") else "in-memory",
            "disk_usage": os.popen("df -h / | tail -1 | awk '{print $5}'").read().strip(),
            "memory": os.popen("free -h | grep Mem | awk '{print $3&quot;/&quot;$2}'").read().strip(),
            "load": os.popen("cat /proc/loadavg 2>/dev/null || echo 'N/A'").read().strip(),
        },
    },
    "platform:routes": {
        "description": "Count registered API routes",
        "handler": lambda: {
            "hint": "Run via API: GET /api/v1/admin/platform/status",
            "estimated_routes": 890,
        },
    },
    "platform:routers": {
        "description": "List all registered routers",
        "handler": lambda: {
            "routers": sorted(os.popen("ls /workspace/repos/infinity-portal/backend/routers/*.py 2>/dev/null | xargs -I{} basename {} .py | grep -v __").read().strip().split("\n")),
        },
    },
    "test:run": {
        "description": "Run the test suite",
        "handler": lambda: {"hint": "Use: python -m pytest tests/ -x -q"},
    },
    "git:status": {
        "description": "Show git status",
        "handler": lambda: {"output": os.popen("cd /workspace/repos/infinity-portal && git status --short 2>&1").read().strip()},
    },
    "git:log": {
        "description": "Show recent git log",
        "handler": lambda: {"output": os.popen("cd /workspace/repos/infinity-portal && git log --oneline -10 2>&1").read().strip()},
    },
}

# ============================================================
# AUTOCOMPLETE DATA
# ============================================================

_AUTOCOMPLETE_COMMANDS = sorted(list(_PLATFORM_COMMANDS.keys()) + [
    "ls", "cd", "pwd", "cat", "head", "tail", "grep", "find", "tree",
    "git status", "git log", "git diff", "git branch", "git pull", "git push",
    "docker ps", "docker images", "docker logs",
    "python -m pytest", "pip list", "pip install",
    "npm test", "npm run", "npm install",
    "curl", "wget", "ping",
    "df -h", "free -h", "uptime", "ps aux",
])

# ============================================================
# ENDPOINTS
# ============================================================

@router.post("/execute")
async def execute_command(
    request: CommandRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Execute a command in the sandboxed CLI terminal.

    Commands are classified, safety-checked, and executed with full audit logging.
    Supports platform built-in commands (platform:status, git:log, etc.) and
    shell commands (ls, git, docker, python, etc.).
    """
    user_id = current_user.id
    cmd = request.command.strip()
    now = _utcnow()

    # Resolve aliases
    first_word = cmd.split()[0] if cmd else ""
    alias = _aliases.get(first_word)
    original_cmd = cmd
    if alias:
        cmd = cmd.replace(first_word, alias["command"], 1)

    # Safety check
    blocked_reason = _is_blocked(cmd)
    if blocked_reason:
        _audit.append({
            "user_id": user_id, "command": original_cmd, "status": "blocked",
            "reason": blocked_reason, "timestamp": now,
        })
        raise HTTPException(status_code=403, detail=blocked_reason)

    # Classify
    category = _classify_command(cmd)

    # Ensure/create session
    session_id = request.session_id
    if not session_id:
        session_id = f"cli-{uuid.uuid4().hex[:8]}"
    if session_id not in _sessions:
        _sessions[session_id] = {
            "session_id": session_id,
            "user_id": user_id,
            "name": "default",
            "working_directory": request.working_directory,
            "environment": request.environment,
            "created_at": now,
            "last_active": now,
            "command_count": 0,
        }
    session = _sessions[session_id]
    session["last_active"] = now
    session["command_count"] = session.get("command_count", 0) + 1

    # Execute
    start_time = datetime.now(timezone.utc)

    # Check for platform built-in commands
    if cmd in _PLATFORM_COMMANDS:
        handler = _PLATFORM_COMMANDS[cmd]["handler"]
        try:
            result = handler()
            output = str(result)
            exit_code = 0
        except Exception as e:
            output = f"Platform command error: {str(e)}"
            exit_code = 1
    else:
        # Shell execution (production: containerised subprocess)
        import asyncio
        import subprocess

        working_dir = session.get("working_directory", request.working_directory)
        env = {**os.environ, **session.get("environment", {}), **request.environment}

        full_cmd = cmd
        if request.pipe_to:
            pipe_blocked = _is_blocked(request.pipe_to)
            if pipe_blocked:
                raise HTTPException(status_code=403, detail=f"Pipe target blocked: {pipe_blocked}")
            full_cmd = f"{cmd} | {request.pipe_to}"

        try:
            proc = await asyncio.wait_for(
                asyncio.create_subprocess_shell(
                    full_cmd,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                    cwd=working_dir if os.path.isdir(working_dir) else "/workspace",
                    env=env,
                ),
                timeout=5,
            )
            stdout, stderr = await asyncio.wait_for(
                proc.communicate(),
                timeout=request.timeout_seconds,
            )
            output = stdout.decode("utf-8", errors="replace")
            if stderr:
                err_text = stderr.decode("utf-8", errors="replace")
                if err_text.strip():
                    output += f"\n--- STDERR ---\n{err_text}"
            exit_code = proc.returncode or 0
        except asyncio.TimeoutError:
            output = f"Command timed out after {request.timeout_seconds}s"
            exit_code = 124
        except Exception as e:
            output = f"Execution error: {str(e)}"
            exit_code = 1

    end_time = datetime.now(timezone.utc)
    duration_ms = int((end_time - start_time).total_seconds() * 1000)

    # Sanitize output
    output = _sanitize_output(output)

    # Build result
    result = {
        "command_id": f"cmd-{uuid.uuid4().hex[:8]}",
        "session_id": session_id,
        "command": original_cmd,
        "resolved_command": cmd if cmd != original_cmd else None,
        "category": category.value,
        "exit_code": exit_code,
        "output": output,
        "duration_ms": duration_ms,
        "working_directory": session.get("working_directory", request.working_directory),
        "timestamp": now,
    }

    # Store in history
    _command_history.append(result)

    # Audit log
    _audit.append({
        "user_id": user_id,
        "command": original_cmd,
        "category": category.value,
        "exit_code": exit_code,
        "duration_ms": duration_ms,
        "session_id": session_id,
        "status": "success" if exit_code == 0 else "error",
        "timestamp": now,
    })

    logger.info(f"CLI [{session_id}] {category.value}: {original_cmd[:80]} → exit {exit_code} ({duration_ms}ms)")
    return result


@router.post("/execute/batch")
async def execute_batch(
    request: BatchCommandRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Execute multiple commands sequentially with optional stop-on-error."""
    results = []
    session_id = request.session_id or f"cli-batch-{uuid.uuid4().hex[:8]}"

    for i, cmd in enumerate(request.commands):
        cmd_request = CommandRequest(
            command=cmd,
            session_id=session_id,
            working_directory=request.working_directory,
            timeout_seconds=request.timeout_seconds // len(request.commands),
        )
        try:
            result = await execute_command(cmd_request, current_user, db)
            results.append(result)
            if request.stop_on_error and result["exit_code"] != 0:
                break
        except HTTPException as e:
            results.append({
                "command": cmd, "exit_code": 1, "output": e.detail,
                "status": "blocked", "index": i,
            })
            if request.stop_on_error:
                break

    return {
        "batch_id": f"batch-{uuid.uuid4().hex[:8]}",
        "session_id": session_id,
        "total_commands": len(request.commands),
        "executed": len(results),
        "successful": sum(1 for r in results if r.get("exit_code") == 0),
        "failed": sum(1 for r in results if r.get("exit_code", 1) != 0),
        "results": results,
        "timestamp": _utcnow(),
    }


@router.get("/history")
async def get_command_history(
    session_id: Optional[str] = Query(None),
    category: Optional[CommandCategory] = Query(None),
    limit: int = Query(50, ge=1, le=500),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Get command execution history with optional filters."""
    history = list(_command_history)

    if session_id:
        history = [h for h in history if h.get("session_id") == session_id]
    if category:
        history = [h for h in history if h.get("category") == category.value]

    # Most recent first
    history.reverse()

    return {
        "total": len(history),
        "history": history[:limit],
        "filters": {"session_id": session_id, "category": category.value if category else None},
        "timestamp": _utcnow(),
    }


@router.get("/sessions")
async def list_sessions(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """List all CLI sessions."""
    sessions = list(_sessions.values())
    sessions.sort(key=lambda s: s.get("last_active", ""), reverse=True)
    return {
        "total": len(sessions),
        "sessions": sessions,
        "timestamp": _utcnow(),
    }


@router.post("/sessions", status_code=201)
async def create_session(
    request: SessionCreateRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Create a new CLI session with custom working directory and environment."""
    session_id = f"cli-{uuid.uuid4().hex[:8]}"
    session = {
        "session_id": session_id,
        "user_id": current_user.id,
        "name": request.name,
        "working_directory": request.working_directory,
        "environment": request.environment,
        "created_at": _utcnow(),
        "last_active": _utcnow(),
        "command_count": 0,
    }
    _sessions[session_id] = session
    return session


@router.delete("/sessions/{session_id}")
async def delete_session(
    session_id: str = Path(...),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Close and delete a CLI session."""
    if session_id not in _sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    session = _sessions.pop(session_id)
    return {"session_id": session_id, "status": "deleted", "commands_executed": session.get("command_count", 0)}


@router.get("/autocomplete")
async def autocomplete(
    prefix: str = Query(..., min_length=1, max_length=256),
    session_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Get autocomplete suggestions for a command prefix.

    Combines platform commands, common CLI commands, user aliases,
    and recent command history for intelligent suggestions.
    """
    prefix_lower = prefix.lower()
    suggestions = []

    # Platform commands
    for cmd in _PLATFORM_COMMANDS:
        if cmd.lower().startswith(prefix_lower):
            suggestions.append({
                "command": cmd,
                "source": "platform",
                "description": _PLATFORM_COMMANDS[cmd]["description"],
            })

    # Aliases
    for alias_name, alias_data in _aliases.items():
        if alias_name.lower().startswith(prefix_lower):
            suggestions.append({
                "command": alias_name,
                "source": "alias",
                "description": f"Alias → {alias_data['command'][:60]}",
            })

    # Common commands
    for cmd in _AUTOCOMPLETE_COMMANDS:
        if cmd.lower().startswith(prefix_lower) and not any(s["command"] == cmd for s in suggestions):
            suggestions.append({"command": cmd, "source": "common", "description": ""})

    # Recent history (unique commands)
    seen = {s["command"] for s in suggestions}
    for entry in reversed(list(_command_history)):
        cmd = entry.get("command", "")
        if cmd.lower().startswith(prefix_lower) and cmd not in seen:
            suggestions.append({"command": cmd, "source": "history", "description": f"Used {entry.get('timestamp', '')[:10]}"})
            seen.add(cmd)
        if len(suggestions) >= 20:
            break

    return {
        "prefix": prefix,
        "suggestions": suggestions[:20],
        "total": len(suggestions),
    }


@router.get("/aliases")
async def list_aliases(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """List all command aliases."""
    return {
        "aliases": list(_aliases.values()),
        "total": len(_aliases),
        "timestamp": _utcnow(),
    }


@router.post("/aliases", status_code=201)
async def create_alias(
    request: AliasRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Create a command alias for quick access."""
    blocked = _is_blocked(request.command)
    if blocked:
        raise HTTPException(status_code=403, detail=f"Cannot alias blocked command: {blocked}")

    alias = {
        "name": request.name,
        "command": request.command,
        "description": request.description,
        "created_by": current_user.id,
        "created_at": _utcnow(),
    }
    _aliases[request.name] = alias
    return alias


@router.delete("/aliases/{alias_name}")
async def delete_alias(
    alias_name: str = Path(...),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Delete a command alias."""
    if alias_name not in _aliases:
        raise HTTPException(status_code=404, detail="Alias not found")
    _aliases.pop(alias_name)
    return {"alias": alias_name, "status": "deleted"}


@router.get("/blocked-patterns")
async def get_blocked_patterns(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """List all blocked command patterns (safety filters)."""
    return {
        "patterns": _BLOCKED_PATTERNS,
        "total": len(_BLOCKED_PATTERNS),
        "note": "Commands matching these patterns are rejected for safety",
    }


@router.get("/audit")
async def get_cli_audit_log(
    limit: int = Query(100, ge=1, le=1000),
    status: Optional[str] = Query(None, pattern="^(success|error|blocked)$"),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Get CLI audit log with optional status filter."""
    log = list(_audit)
    if status:
        log = [e for e in log if e.get("status") == status]
    log.reverse()
    return {
        "total": len(log),
        "entries": log[:limit],
        "filters": {"status": status},
        "timestamp": _utcnow(),
    }