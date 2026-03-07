# routers/sandboxes.py — Sandbox & VM Management — Isolated execution environments
# Phase 22 — Platform Operations & Intelligence Layer
#
# Provides isolated sandbox environments for running apps, testing code,
# and experimenting safely. Each sandbox has its own workspace, resource
# limits, networking, and lifecycle management.
#
# Production: Backed by Docker containers, Firecracker microVMs, or K8s pods.
# Development: Simulated with process isolation and directory sandboxing.

from typing import Optional, Dict, Any, List
from datetime import datetime, timezone, timedelta
from enum import Enum
import uuid
import os
import shutil
import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Path, Body
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user, require_min_role, CurrentUser
from database import get_db_session
from router_migration_helper import store_factory, audit_log_factory

router = APIRouter(prefix="/api/v1/sandboxes", tags=["Sandboxes & VMs"])
logger = logging.getLogger("sandboxes")

# ============================================================
# MODELS
# ============================================================

class SandboxType(str, Enum):
    CONTAINER = "container"       # Docker/Podman container
    MICROVM = "microvm"           # Firecracker microVM
    PROCESS = "process"           # Process-level isolation (dev mode)
    KUBERNETES = "kubernetes"     # K8s pod

class SandboxStatus(str, Enum):
    CREATING = "creating"
    RUNNING = "running"
    STOPPED = "stopped"
    PAUSED = "paused"
    ERROR = "error"
    DESTROYED = "destroyed"

class ResourceLimits(BaseModel):
    cpu_cores: float = Field(default=1.0, ge=0.25, le=8.0)
    memory_mb: int = Field(default=512, ge=128, le=8192)
    disk_mb: int = Field(default=1024, ge=256, le=20480)
    network_enabled: bool = True
    max_processes: int = Field(default=100, ge=10, le=1000)
    timeout_minutes: int = Field(default=60, ge=5, le=1440)

class SandboxCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)
    sandbox_type: SandboxType = Field(default=SandboxType.CONTAINER)
    base_image: str = Field(default="python:3.11-slim", max_length=256)
    resources: ResourceLimits = Field(default_factory=ResourceLimits)
    environment: Dict[str, str] = Field(default_factory=dict)
    ports: List[int] = Field(default_factory=list, max_length=10)
    auto_destroy_minutes: Optional[int] = Field(default=120, ge=0, le=1440)
    clone_repo: Optional[str] = Field(None, max_length=512, description="GitHub repo URL to clone into sandbox")
    workspace_template: Optional[str] = Field(None, max_length=128, description="Template: python, node, fullstack, empty")
    labels: Dict[str, str] = Field(default_factory=dict)

class SandboxExecRequest(BaseModel):
    command: str = Field(..., min_length=1, max_length=4096)
    working_directory: str = Field(default="/workspace")
    timeout_seconds: int = Field(default=30, ge=1, le=300)
    environment: Dict[str, str] = Field(default_factory=dict)

class SandboxUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=128)
    resources: Optional[ResourceLimits] = None
    labels: Optional[Dict[str, str]] = None

class SnapshotCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)
    description: str = Field(default="", max_length=512)
    include_state: bool = True

class VMCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)
    os_image: str = Field(default="debian-12", max_length=256)
    cpu_cores: int = Field(default=2, ge=1, le=16)
    memory_mb: int = Field(default=2048, ge=512, le=32768)
    disk_gb: int = Field(default=10, ge=5, le=100)
    ssh_key: Optional[str] = Field(None, max_length=4096)
    startup_script: Optional[str] = Field(None, max_length=10000)
    labels: Dict[str, str] = Field(default_factory=dict)

# ============================================================
# IN-MEMORY STATE (production: Turso + container runtime)
# ============================================================

_sandboxes = store_factory("sandboxes", "instances")
_snapshots = store_factory("sandboxes", "snapshots")
_vms = store_factory("sandboxes", "vms")
_exec_history = audit_log_factory("sandboxes", "exec_history")
_audit = audit_log_factory("sandboxes", "audit")

# Workspace templates
_TEMPLATES = {
    "python": {
        "files": {"main.py": "# Python workspace\nprint('Hello from sandbox!')\n", "requirements.txt": "fastapi\nuvicorn\n"},
        "setup_cmd": "pip install -r requirements.txt",
    },
    "node": {
        "files": {"index.js": "// Node.js workspace\nconsole.log('Hello from sandbox!');\n", "package.json": '{"name":"sandbox","version":"1.0.0","main":"index.js"}'},
        "setup_cmd": "npm install",
    },
    "fullstack": {
        "files": {
            "backend/main.py": "from fastapi import FastAPI\napp = FastAPI()\n\n@app.get('/')\ndef root():\n    return {'status': 'running'}\n",
            "frontend/index.html": "<!DOCTYPE html><html><body><h1>Sandbox</h1></body></html>\n",
            "README.md": "# Fullstack Sandbox\n\nBackend: FastAPI\nFrontend: Static HTML\n",
        },
        "setup_cmd": "pip install fastapi uvicorn",
    },
    "empty": {"files": {"README.md": "# Sandbox Workspace\n"}, "setup_cmd": ""},
}

def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()

def _calculate_expiry(minutes: Optional[int]) -> Optional[str]:
    if minutes and minutes > 0:
        return (datetime.now(timezone.utc) + timedelta(minutes=minutes)).isoformat()
    return None

# ============================================================
# SANDBOX ENDPOINTS
# ============================================================

@router.get("")
async def list_sandboxes(
    status: Optional[SandboxStatus] = Query(None),
    sandbox_type: Optional[SandboxType] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """List all sandboxes with optional filters."""
    sandboxes = list(_sandboxes.values())

    if status:
        sandboxes = [s for s in sandboxes if s.get("status") == status.value]
    if sandbox_type:
        sandboxes = [s for s in sandboxes if s.get("sandbox_type") == sandbox_type.value]

    # Filter by user's org
    sandboxes = [s for s in sandboxes if s.get("organisation_id") == current_user.organisation_id]
    sandboxes.sort(key=lambda s: s.get("created_at", ""), reverse=True)

    return {
        "total": len(sandboxes),
        "sandboxes": sandboxes[:limit],
        "filters": {"status": status, "sandbox_type": sandbox_type},
        "timestamp": _utcnow(),
    }


@router.post("", status_code=201)
async def create_sandbox(
    request: SandboxCreate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Create a new isolated sandbox environment.

    Provisions an isolated workspace with configurable resources, networking,
    and optional repo cloning. Supports container, microVM, and process isolation.
    """
    sandbox_id = f"sbx-{uuid.uuid4().hex[:12]}"
    now = _utcnow()

    # Build workspace path
    workspace_path = f"/tmp/sandboxes/{sandbox_id}"

    # Prepare template files
    template_files = {}
    if request.workspace_template and request.workspace_template in _TEMPLATES:
        template_files = _TEMPLATES[request.workspace_template]["files"]

    sandbox = {
        "sandbox_id": sandbox_id,
        "name": request.name,
        "sandbox_type": request.sandbox_type.value,
        "base_image": request.base_image,
        "status": SandboxStatus.CREATING.value,
        "resources": request.resources.model_dump(),
        "environment": request.environment,
        "ports": request.ports,
        "port_mappings": {p: p + 10000 + hash(sandbox_id) % 5000 for p in request.ports},
        "workspace_path": workspace_path,
        "workspace_template": request.workspace_template,
        "template_files": list(template_files.keys()),
        "clone_repo": request.clone_repo,
        "labels": request.labels,
        "auto_destroy_at": _calculate_expiry(request.auto_destroy_minutes),
        "user_id": current_user.id,
        "organisation_id": current_user.organisation_id,
        "created_at": now,
        "started_at": None,
        "stopped_at": None,
        "exec_count": 0,
        "snapshots": [],
    }

    # Simulate provisioning (production: Docker/Firecracker API)
    sandbox["status"] = SandboxStatus.RUNNING.value
    sandbox["started_at"] = now
    sandbox["ip_address"] = f"10.42.{hash(sandbox_id) % 255}.{hash(sandbox_id[:6]) % 255}"

    _sandboxes[sandbox_id] = sandbox

    _audit.append({
        "action": "create_sandbox",
        "sandbox_id": sandbox_id,
        "user_id": current_user.id,
        "sandbox_type": request.sandbox_type.value,
        "timestamp": now,
    })

    logger.info(f"Sandbox created: {sandbox_id} ({request.sandbox_type.value}) by {current_user.id}")
    return sandbox


@router.get("/overview")
async def sandboxes_overview(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Get overview of all sandboxes and VMs."""
    all_sandboxes = list(_sandboxes.values())
    all_vms = list(_vms.values())

    sandbox_by_status = {}
    for s in all_sandboxes:
        st = s.get("status", "unknown")
        sandbox_by_status[st] = sandbox_by_status.get(st, 0) + 1

    vm_by_status = {}
    for v in all_vms:
        st = v.get("status", "unknown")
        vm_by_status[st] = vm_by_status.get(st, 0) + 1

    return {
        "sandboxes": {
            "total": len(all_sandboxes),
            "by_status": sandbox_by_status,
            "total_exec_commands": sum(s.get("exec_count", 0) for s in all_sandboxes),
        },
        "vms": {
            "total": len(all_vms),
            "by_status": vm_by_status,
        },
        "snapshots": {"total": len(_snapshots)},
        "templates_available": len(_TEMPLATES),
        "timestamp": _utcnow(),
    }


@router.get("/audit")
async def get_sandbox_audit(
    limit: int = Query(100, ge=1, le=1000),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Get sandbox/VM audit log."""
    log = list(_audit)
    log.reverse()
    return {"total": len(log), "entries": log[:limit], "timestamp": _utcnow()}


@router.get("/{sandbox_id}")
async def get_sandbox(
    sandbox_id: str = Path(...),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Get sandbox details."""
    sandbox = _sandboxes.get(sandbox_id)
    if not sandbox:
        raise HTTPException(status_code=404, detail="Sandbox not found")
    return sandbox


@router.patch("/{sandbox_id}")
async def update_sandbox(
    update: SandboxUpdate,
    sandbox_id: str = Path(...),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Update sandbox configuration."""
    sandbox = _sandboxes.get(sandbox_id)
    if not sandbox:
        raise HTTPException(status_code=404, detail="Sandbox not found")

    if update.name is not None:
        sandbox["name"] = update.name
    if update.resources is not None:
        sandbox["resources"] = update.resources.model_dump()
    if update.labels is not None:
        sandbox["labels"] = update.labels

    sandbox["updated_at"] = _utcnow()
    return sandbox


@router.delete("/{sandbox_id}")
async def destroy_sandbox(
    sandbox_id: str = Path(...),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Destroy a sandbox and clean up all resources."""
    sandbox = _sandboxes.get(sandbox_id)
    if not sandbox:
        raise HTTPException(status_code=404, detail="Sandbox not found")

    sandbox["status"] = SandboxStatus.DESTROYED.value
    sandbox["stopped_at"] = _utcnow()

    _audit.append({
        "action": "destroy_sandbox",
        "sandbox_id": sandbox_id,
        "user_id": current_user.id,
        "timestamp": _utcnow(),
    })

    # Remove from active (keep in store for audit trail)
    logger.info(f"Sandbox destroyed: {sandbox_id}")
    return {"sandbox_id": sandbox_id, "status": "destroyed"}


@router.post("/{sandbox_id}/start")
async def start_sandbox(
    sandbox_id: str = Path(...),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Start a stopped sandbox."""
    sandbox = _sandboxes.get(sandbox_id)
    if not sandbox:
        raise HTTPException(status_code=404, detail="Sandbox not found")
    if sandbox["status"] == SandboxStatus.RUNNING.value:
        raise HTTPException(status_code=400, detail="Sandbox is already running")
    if sandbox["status"] == SandboxStatus.DESTROYED.value:
        raise HTTPException(status_code=400, detail="Cannot start a destroyed sandbox")

    sandbox["status"] = SandboxStatus.RUNNING.value
    sandbox["started_at"] = _utcnow()
    return {"sandbox_id": sandbox_id, "status": "running", "started_at": sandbox["started_at"]}


@router.post("/{sandbox_id}/stop")
async def stop_sandbox(
    sandbox_id: str = Path(...),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Stop a running sandbox (preserves state)."""
    sandbox = _sandboxes.get(sandbox_id)
    if not sandbox:
        raise HTTPException(status_code=404, detail="Sandbox not found")
    if sandbox["status"] != SandboxStatus.RUNNING.value:
        raise HTTPException(status_code=400, detail=f"Sandbox is {sandbox['status']}, not running")

    sandbox["status"] = SandboxStatus.STOPPED.value
    sandbox["stopped_at"] = _utcnow()
    return {"sandbox_id": sandbox_id, "status": "stopped", "stopped_at": sandbox["stopped_at"]}


@router.post("/{sandbox_id}/pause")
async def pause_sandbox(
    sandbox_id: str = Path(...),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Pause a running sandbox (freeze state)."""
    sandbox = _sandboxes.get(sandbox_id)
    if not sandbox:
        raise HTTPException(status_code=404, detail="Sandbox not found")
    if sandbox["status"] != SandboxStatus.RUNNING.value:
        raise HTTPException(status_code=400, detail="Can only pause a running sandbox")

    sandbox["status"] = SandboxStatus.PAUSED.value
    return {"sandbox_id": sandbox_id, "status": "paused"}


@router.post("/{sandbox_id}/resume")
async def resume_sandbox(
    sandbox_id: str = Path(...),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Resume a paused sandbox."""
    sandbox = _sandboxes.get(sandbox_id)
    if not sandbox:
        raise HTTPException(status_code=404, detail="Sandbox not found")
    if sandbox["status"] != SandboxStatus.PAUSED.value:
        raise HTTPException(status_code=400, detail="Sandbox is not paused")

    sandbox["status"] = SandboxStatus.RUNNING.value
    return {"sandbox_id": sandbox_id, "status": "running"}


@router.post("/{sandbox_id}/exec")
async def exec_in_sandbox(
    request: SandboxExecRequest,
    sandbox_id: str = Path(...),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Execute a command inside a running sandbox."""
    sandbox = _sandboxes.get(sandbox_id)
    if not sandbox:
        raise HTTPException(status_code=404, detail="Sandbox not found")
    if sandbox["status"] != SandboxStatus.RUNNING.value:
        raise HTTPException(status_code=400, detail=f"Sandbox is {sandbox['status']}, must be running")

    exec_id = f"exec-{uuid.uuid4().hex[:8]}"
    now = _utcnow()

    # Simulate execution (production: docker exec / firecracker vsock)
    import asyncio
    try:
        proc = await asyncio.wait_for(
            asyncio.create_subprocess_shell(
                request.command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=request.working_directory if os.path.isdir(request.working_directory) else "/tmp",
                env={**os.environ, **sandbox.get("environment", {}), **request.environment},
            ),
            timeout=5,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=request.timeout_seconds)
        output = stdout.decode("utf-8", errors="replace")
        if stderr:
            err = stderr.decode("utf-8", errors="replace")
            if err.strip():
                output += f"\n--- STDERR ---\n{err}"
        exit_code = proc.returncode or 0
    except asyncio.TimeoutError:
        output = f"Command timed out after {request.timeout_seconds}s"
        exit_code = 124
    except Exception as e:
        output = f"Execution error: {str(e)}"
        exit_code = 1

    # Truncate large output
    if len(output) > 50000:
        output = output[:50000] + "\n--- TRUNCATED ---"

    result = {
        "exec_id": exec_id,
        "sandbox_id": sandbox_id,
        "command": request.command,
        "exit_code": exit_code,
        "output": output,
        "timestamp": now,
    }

    sandbox["exec_count"] = sandbox.get("exec_count", 0) + 1
    _exec_history.append(result)

    return result


@router.get("/{sandbox_id}/logs")
async def get_sandbox_logs(
    sandbox_id: str = Path(...),
    lines: int = Query(100, ge=1, le=1000),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Get execution logs for a sandbox."""
    sandbox = _sandboxes.get(sandbox_id)
    if not sandbox:
        raise HTTPException(status_code=404, detail="Sandbox not found")

    logs = [e for e in _exec_history if e.get("sandbox_id") == sandbox_id]
    logs.reverse()

    return {
        "sandbox_id": sandbox_id,
        "total_entries": len(logs),
        "logs": logs[:lines],
        "timestamp": _utcnow(),
    }


@router.post("/{sandbox_id}/snapshot", status_code=201)
async def create_snapshot(
    request: SnapshotCreate,
    sandbox_id: str = Path(...),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Create a snapshot of the current sandbox state."""
    sandbox = _sandboxes.get(sandbox_id)
    if not sandbox:
        raise HTTPException(status_code=404, detail="Sandbox not found")

    snapshot_id = f"snap-{uuid.uuid4().hex[:8]}"
    now = _utcnow()

    snapshot = {
        "snapshot_id": snapshot_id,
        "sandbox_id": sandbox_id,
        "name": request.name,
        "description": request.description,
        "include_state": request.include_state,
        "sandbox_status_at_snapshot": sandbox["status"],
        "resources_at_snapshot": sandbox["resources"],
        "size_mb": sandbox["resources"].get("disk_mb", 1024) // 4,  # Simulated
        "created_by": current_user.id,
        "created_at": now,
    }

    _snapshots[snapshot_id] = snapshot
    sandbox.setdefault("snapshots", []).append(snapshot_id)

    return snapshot


@router.get("/{sandbox_id}/snapshots")
async def list_snapshots(
    sandbox_id: str = Path(...),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """List all snapshots for a sandbox."""
    sandbox = _sandboxes.get(sandbox_id)
    if not sandbox:
        raise HTTPException(status_code=404, detail="Sandbox not found")

    snapshot_ids = sandbox.get("snapshots", [])
    snapshots = [_snapshots[sid] for sid in snapshot_ids if sid in _snapshots]

    return {
        "sandbox_id": sandbox_id,
        "total": len(snapshots),
        "snapshots": snapshots,
    }


@router.post("/{sandbox_id}/restore/{snapshot_id}")
async def restore_snapshot(
    sandbox_id: str = Path(...),
    snapshot_id: str = Path(...),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Restore a sandbox from a snapshot."""
    sandbox = _sandboxes.get(sandbox_id)
    if not sandbox:
        raise HTTPException(status_code=404, detail="Sandbox not found")

    snapshot = _snapshots.get(snapshot_id)
    if not snapshot or snapshot["sandbox_id"] != sandbox_id:
        raise HTTPException(status_code=404, detail="Snapshot not found for this sandbox")

    sandbox["status"] = snapshot["sandbox_status_at_snapshot"]
    sandbox["resources"] = snapshot["resources_at_snapshot"]
    sandbox["restored_from"] = snapshot_id
    sandbox["restored_at"] = _utcnow()

    return {
        "sandbox_id": sandbox_id,
        "restored_from": snapshot_id,
        "status": sandbox["status"],
        "timestamp": _utcnow(),
    }


# ============================================================
# VM ENDPOINTS
# ============================================================

@router.get("/vms/list")
async def list_vms(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """List all virtual machines."""
    vms = [v for v in _vms.values() if v.get("organisation_id") == current_user.organisation_id]
    vms.sort(key=lambda v: v.get("created_at", ""), reverse=True)
    return {"total": len(vms), "vms": vms, "timestamp": _utcnow()}


@router.post("/vms", status_code=201)
async def create_vm(
    request: VMCreate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Provision a new virtual machine.

    Creates a full VM with SSH access, configurable resources,
    and optional startup scripts. Production: Firecracker or cloud VMs.
    """
    vm_id = f"vm-{uuid.uuid4().hex[:12]}"
    now = _utcnow()

    vm = {
        "vm_id": vm_id,
        "name": request.name,
        "os_image": request.os_image,
        "cpu_cores": request.cpu_cores,
        "memory_mb": request.memory_mb,
        "disk_gb": request.disk_gb,
        "status": "running",
        "ip_address": f"10.50.{hash(vm_id) % 255}.{hash(vm_id[:6]) % 255}",
        "ssh_port": 22,
        "ssh_key_configured": request.ssh_key is not None,
        "startup_script_set": request.startup_script is not None,
        "labels": request.labels,
        "user_id": current_user.id,
        "organisation_id": current_user.organisation_id,
        "created_at": now,
        "uptime_seconds": 0,
    }

    _vms[vm_id] = vm

    _audit.append({
        "action": "create_vm", "vm_id": vm_id,
        "user_id": current_user.id, "timestamp": now,
    })

    return vm


@router.get("/vms/{vm_id}")
async def get_vm(
    vm_id: str = Path(...),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Get VM details."""
    vm = _vms.get(vm_id)
    if not vm:
        raise HTTPException(status_code=404, detail="VM not found")
    return vm


@router.delete("/vms/{vm_id}")
async def destroy_vm(
    vm_id: str = Path(...),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Destroy a virtual machine."""
    vm = _vms.get(vm_id)
    if not vm:
        raise HTTPException(status_code=404, detail="VM not found")

    vm["status"] = "destroyed"
    vm["destroyed_at"] = _utcnow()

    return {"vm_id": vm_id, "status": "destroyed"}


@router.post("/vms/{vm_id}/start")
async def start_vm(
    vm_id: str = Path(...),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Start a stopped VM."""
    vm = _vms.get(vm_id)
    if not vm:
        raise HTTPException(status_code=404, detail="VM not found")
    if vm["status"] == "running":
        raise HTTPException(status_code=400, detail="VM is already running")

    vm["status"] = "running"
    vm["started_at"] = _utcnow()
    return {"vm_id": vm_id, "status": "running"}


@router.post("/vms/{vm_id}/stop")
async def stop_vm(
    vm_id: str = Path(...),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Stop a running VM."""
    vm = _vms.get(vm_id)
    if not vm:
        raise HTTPException(status_code=404, detail="VM not found")

    vm["status"] = "stopped"
    vm["stopped_at"] = _utcnow()
    return {"vm_id": vm_id, "status": "stopped"}


# ============================================================
# TEMPLATES & OVERVIEW
# ============================================================

@router.get("/templates/list")
async def list_templates(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """List available workspace templates."""
    templates = []
    for name, tmpl in _TEMPLATES.items():
        templates.append({
            "name": name,
            "files": list(tmpl["files"].keys()),
            "setup_command": tmpl.get("setup_cmd", ""),
        })
    return {"templates": templates, "total": len(templates)}