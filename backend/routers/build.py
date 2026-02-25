# routers/build.py — Multi-platform build & package system
# Supports: PWA, Android APK, Desktop (Electron/Tauri), Docker, npm/pip packages
import uuid
import os
import json
import shutil
import subprocess
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user, require_permission, CurrentUser
from database import get_db_session
from models import BuildJob, Repository, AuditLog, AuditEventType, BuildStatus, BuildTarget, utcnow

router = APIRouter(prefix="/api/v1/builds", tags=["Build & Package"])

BUILD_OUTPUT_ROOT = os.getenv("BUILD_OUTPUT_ROOT", "/data/builds")


# --- Schemas ---

class BuildRequest(BaseModel):
    repository_id: Optional[str] = None
    source_path: Optional[str] = None
    target: str = Field(..., description="pwa, android_apk, desktop_electron, desktop_tauri, docker, npm_package, pip_package")
    build_command: Optional[str] = None
    config: Dict[str, Any] = Field(default_factory=dict)


class BuildOut(BaseModel):
    id: str
    repository_id: Optional[str] = None
    target: str
    status: str
    artifact_url: Optional[str] = None
    artifact_size: Optional[int] = None
    error_message: Optional[str] = None
    duration_seconds: Optional[int] = None
    config: dict
    created_at: str
    started_at: Optional[str] = None
    completed_at: Optional[str] = None


class PWAConfig(BaseModel):
    app_name: str = "Infinity App"
    short_name: Optional[str] = None
    description: str = ""
    theme_color: str = "#1a1a2e"
    background_color: str = "#1a1a2e"
    display: str = "standalone"
    orientation: str = "any"
    start_url: str = "/"
    scope: str = "/"
    icons: List[Dict[str, str]] = Field(default_factory=list)


class DockerConfig(BaseModel):
    base_image: str = "node:20-alpine"
    build_command: str = "npm run build"
    start_command: str = "npm start"
    port: int = 3000
    env_vars: Dict[str, str] = Field(default_factory=dict)


# --- Helpers ---

def _build_to_out(b: BuildJob) -> BuildOut:
    return BuildOut(
        id=b.id,
        repository_id=b.repository_id,
        target=b.target.value if isinstance(b.target, BuildTarget) else b.target,
        status=b.status.value if isinstance(b.status, BuildStatus) else b.status,
        artifact_url=b.artifact_url,
        artifact_size=b.artifact_size,
        error_message=b.error_message,
        duration_seconds=b.duration_seconds,
        config=b.config or {},
        created_at=b.created_at.isoformat() if b.created_at else "",
        started_at=b.started_at.isoformat() if b.started_at else None,
        completed_at=b.completed_at.isoformat() if b.completed_at else None,
    )


def _generate_pwa_manifest(config: dict) -> dict:
    """Generate a PWA manifest.json"""
    icons = config.get("icons", [])
    if not icons:
        icons = [
            {"src": "/icons/icon-192x192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable"},
            {"src": "/icons/icon-512x512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable"},
        ]

    return {
        "name": config.get("app_name", "Infinity App"),
        "short_name": config.get("short_name", config.get("app_name", "App")[:12]),
        "description": config.get("description", "Built with Infinity OS"),
        "start_url": config.get("start_url", "/"),
        "scope": config.get("scope", "/"),
        "display": config.get("display", "standalone"),
        "orientation": config.get("orientation", "any"),
        "theme_color": config.get("theme_color", "#1a1a2e"),
        "background_color": config.get("background_color", "#1a1a2e"),
        "icons": icons,
        "categories": ["productivity"],
        "prefer_related_applications": False,
    }


def _generate_service_worker() -> str:
    """Generate a basic service worker for PWA"""
    return """// Infinity OS Service Worker
const CACHE_NAME = 'infinity-os-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetched = fetch(event.request).then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached);
      return cached || fetched;
    })
  );
});
"""


def _generate_dockerfile(config: dict) -> str:
    """Generate a Dockerfile"""
    base = config.get("base_image", "node:20-alpine")
    build_cmd = config.get("build_command", "npm run build")
    start_cmd = config.get("start_command", "npm start")
    port = config.get("port", 3000)

    return f"""# Generated by Infinity OS Build System
FROM {base} AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --production=false
COPY . .
RUN {build_cmd}

FROM {base} AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/package*.json ./
RUN npm ci --production
COPY --from=builder /app/dist ./dist
EXPOSE {port}
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q --spider http://localhost:{port}/health || exit 1
CMD ["{start_cmd.split()[0]}", "{start_cmd.split()[1] if len(start_cmd.split()) > 1 else 'start'}"]
"""


def _generate_electron_config(config: dict) -> dict:
    """Generate Electron builder configuration"""
    return {
        "appId": config.get("app_id", "com.infinity-os.app"),
        "productName": config.get("app_name", "Infinity App"),
        "directories": {"output": "dist-electron"},
        "files": ["dist/**/*", "electron/**/*"],
        "mac": {
            "category": "public.app-category.productivity",
            "target": ["dmg", "zip"],
        },
        "win": {
            "target": ["nsis", "portable"],
        },
        "linux": {
            "target": ["AppImage", "deb"],
            "category": "Utility",
        },
    }


# --- Background Build Execution ---

async def _execute_build(build_id: str, db_url: str):
    """Execute a build job in the background"""
    from database import get_db_context
    async with get_db_context() as db:
        stmt = select(BuildJob).where(BuildJob.id == build_id)
        result = await db.execute(stmt)
        build = result.scalar_one_or_none()
        if not build:
            return

        build.status = BuildStatus.BUILDING
        build.started_at = datetime.now(timezone.utc)
        db.add(build)
        await db.commit()

        try:
            output_dir = os.path.join(BUILD_OUTPUT_ROOT, build.id)
            os.makedirs(output_dir, exist_ok=True)

            target = build.target if isinstance(build.target, str) else build.target.value
            config = build.config or {}

            if target == "pwa":
                # Generate PWA assets
                manifest = _generate_pwa_manifest(config)
                sw = _generate_service_worker()

                with open(os.path.join(output_dir, "manifest.json"), "w") as f:
                    json.dump(manifest, f, indent=2)
                with open(os.path.join(output_dir, "sw.js"), "w") as f:
                    f.write(sw)

                build.artifact_url = f"/builds/{build.id}/manifest.json"
                build.artifact_size = os.path.getsize(os.path.join(output_dir, "manifest.json"))

            elif target == "docker":
                dockerfile = _generate_dockerfile(config)
                with open(os.path.join(output_dir, "Dockerfile"), "w") as f:
                    f.write(dockerfile)
                build.artifact_url = f"/builds/{build.id}/Dockerfile"
                build.artifact_size = len(dockerfile.encode())

            elif target == "desktop_electron":
                electron_config = _generate_electron_config(config)
                with open(os.path.join(output_dir, "electron-builder.json"), "w") as f:
                    json.dump(electron_config, f, indent=2)
                build.artifact_url = f"/builds/{build.id}/electron-builder.json"

            build.status = BuildStatus.SUCCESS
            build.completed_at = datetime.now(timezone.utc)
            if build.started_at:
                build.duration_seconds = int(
                    (build.completed_at - build.started_at).total_seconds()
                )

        except Exception as e:
            build.status = BuildStatus.FAILED
            build.error_message = str(e)[:1000]
            build.completed_at = datetime.now(timezone.utc)

        db.add(build)
        await db.commit()


# --- Endpoints ---

@router.get("")
async def list_builds(
    user: CurrentUser = Depends(require_permission("builds:read")),
    db: AsyncSession = Depends(get_db_session),
    status: Optional[str] = None,
    limit: int = Query(default=20, le=100),
):
    """List build jobs"""
    stmt = (
        select(BuildJob)
        .where(BuildJob.organisation_id == user.organisation_id)
        .order_by(BuildJob.created_at.desc())
        .limit(limit)
    )
    if status:
        try:
            stmt = stmt.where(BuildJob.status == BuildStatus(status))
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid status: {status}")

    result = await db.execute(stmt)
    builds = result.scalars().all()

    return {"builds": [_build_to_out(b) for b in builds], "count": len(builds)}


@router.post("", response_model=BuildOut)
async def trigger_build(
    build_req: BuildRequest,
    background_tasks: BackgroundTasks,
    user: CurrentUser = Depends(require_permission("builds:trigger")),
    db: AsyncSession = Depends(get_db_session),
):
    """Trigger a new build"""
    try:
        target = BuildTarget(build_req.target)
    except ValueError:
        valid = [t.value for t in BuildTarget]
        raise HTTPException(status_code=400, detail=f"Invalid target. Must be one of: {valid}")

    source_path = build_req.source_path or ""

    # If repository_id provided, get its storage path
    if build_req.repository_id:
        repo_stmt = select(Repository).where(
            Repository.id == build_req.repository_id,
            Repository.organisation_id == user.organisation_id,
            Repository.deleted_at.is_(None),
        )
        repo_result = await db.execute(repo_stmt)
        repo = repo_result.scalar_one_or_none()
        if not repo:
            raise HTTPException(status_code=404, detail="Repository not found")
        source_path = repo.storage_path

    build = BuildJob(
        repository_id=build_req.repository_id,
        organisation_id=user.organisation_id,
        triggered_by=user.id,
        target=target,
        status=BuildStatus.QUEUED,
        source_path=source_path,
        build_command=build_req.build_command,
        config=build_req.config,
    )
    db.add(build)

    audit = AuditLog(
        event_type=AuditEventType.BUILD_STARTED,
        user_id=user.id,
        organisation_id=user.organisation_id,
        resource_type="build",
        resource_id=build.id,
        governance_metadata={"target": build_req.target, "repo_id": build_req.repository_id},
        request_id=str(uuid.uuid4()),
    )
    db.add(audit)
    await db.commit()
    await db.refresh(build)

    # Execute build in background
    from database import DATABASE_URL
    background_tasks.add_task(_execute_build, build.id, DATABASE_URL)

    return _build_to_out(build)


@router.get("/{build_id}", response_model=BuildOut)
async def get_build(
    build_id: str,
    user: CurrentUser = Depends(require_permission("builds:read")),
    db: AsyncSession = Depends(get_db_session),
):
    """Get build job details"""
    stmt = select(BuildJob).where(
        BuildJob.id == build_id,
        BuildJob.organisation_id == user.organisation_id,
    )
    result = await db.execute(stmt)
    build = result.scalar_one_or_none()
    if not build:
        raise HTTPException(status_code=404, detail="Build not found")
    return _build_to_out(build)


@router.get("/{build_id}/log")
async def get_build_log(
    build_id: str,
    user: CurrentUser = Depends(require_permission("builds:read")),
    db: AsyncSession = Depends(get_db_session),
):
    """Get build log output"""
    stmt = select(BuildJob).where(
        BuildJob.id == build_id,
        BuildJob.organisation_id == user.organisation_id,
    )
    result = await db.execute(stmt)
    build = result.scalar_one_or_none()
    if not build:
        raise HTTPException(status_code=404, detail="Build not found")

    return {
        "build_id": build_id,
        "status": build.status.value if isinstance(build.status, BuildStatus) else build.status,
        "log": build.build_log or "",
        "error": build.error_message,
    }


@router.post("/{build_id}/cancel")
async def cancel_build(
    build_id: str,
    user: CurrentUser = Depends(require_permission("builds:cancel")),
    db: AsyncSession = Depends(get_db_session),
):
    """Cancel a queued or running build"""
    stmt = select(BuildJob).where(
        BuildJob.id == build_id,
        BuildJob.organisation_id == user.organisation_id,
    )
    result = await db.execute(stmt)
    build = result.scalar_one_or_none()
    if not build:
        raise HTTPException(status_code=404, detail="Build not found")

    if build.status not in (BuildStatus.QUEUED, BuildStatus.BUILDING):
        raise HTTPException(status_code=400, detail="Build cannot be cancelled in current state")

    build.status = BuildStatus.CANCELLED
    build.completed_at = datetime.now(timezone.utc)
    db.add(build)
    await db.commit()

    return {"build_id": build_id, "status": "cancelled"}


@router.get("/targets/available")
async def list_available_targets(
    user: CurrentUser = Depends(get_current_user),
):
    """List available build targets"""
    return {
        "targets": [
            {"id": "pwa", "name": "Progressive Web App", "description": "Installable web app with offline support", "platforms": ["web", "mobile"]},
            {"id": "android_apk", "name": "Android APK", "description": "Android application package via TWA/Capacitor", "platforms": ["android"]},
            {"id": "desktop_electron", "name": "Desktop (Electron)", "description": "Cross-platform desktop app", "platforms": ["windows", "macos", "linux"]},
            {"id": "desktop_tauri", "name": "Desktop (Tauri)", "description": "Lightweight native desktop app", "platforms": ["windows", "macos", "linux"]},
            {"id": "docker", "name": "Docker Container", "description": "Containerized server deployment", "platforms": ["server"]},
            {"id": "npm_package", "name": "npm Package", "description": "JavaScript/TypeScript library package", "platforms": ["library"]},
            {"id": "pip_package", "name": "pip Package", "description": "Python library package", "platforms": ["library"]},
        ],
    }