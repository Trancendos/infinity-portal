# routers/repositories.py — Internal Git hosting with GitHub sync
import uuid
import os
import re
import subprocess
import shutil
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user, require_permission, CurrentUser
from database import get_db_session
from models import Repository, AuditLog, AuditEventType, RepoVisibility, utcnow

router = APIRouter(prefix="/api/v1/repos", tags=["Repositories"])

GIT_STORAGE_ROOT = os.getenv("GIT_STORAGE_ROOT", "/data/repos")


# --- Schemas ---

class RepoOut(BaseModel):
    id: str
    name: str
    slug: str
    description: Optional[str] = None
    visibility: str
    default_branch: str
    github_remote_url: Optional[str] = None
    github_sync_enabled: bool
    size_bytes: int
    commit_count: int
    branch_count: int
    topics: list
    is_archived: bool
    created_at: str
    updated_at: str


class RepoCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    visibility: str = "private"
    default_branch: str = "main"
    topics: List[str] = Field(default_factory=list)
    init_readme: bool = True


class RepoUpdate(BaseModel):
    description: Optional[str] = None
    visibility: Optional[str] = None
    default_branch: Optional[str] = None
    topics: Optional[List[str]] = None
    is_archived: Optional[bool] = None


class GitHubSyncConfig(BaseModel):
    remote_url: str = Field(..., description="GitHub repository URL")
    enabled: bool = True


class CommitOut(BaseModel):
    sha: str
    message: str
    author: str
    email: str
    timestamp: str
    files_changed: int = 0


class BranchOut(BaseModel):
    name: str
    is_default: bool
    last_commit_sha: Optional[str] = None


class FileTreeEntry(BaseModel):
    name: str
    path: str
    type: str  # "file" or "directory"
    size: Optional[int] = None


# --- Helpers ---

def _slugify(name: str) -> str:
    return re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')[:80]


def _repo_to_out(r: Repository) -> RepoOut:
    return RepoOut(
        id=r.id,
        name=r.name,
        slug=r.slug,
        description=r.description,
        visibility=r.visibility.value if isinstance(r.visibility, RepoVisibility) else r.visibility,
        default_branch=r.default_branch or "main",
        github_remote_url=r.github_remote_url,
        github_sync_enabled=r.github_sync_enabled or False,
        size_bytes=r.size_bytes or 0,
        commit_count=r.commit_count or 0,
        branch_count=r.branch_count or 0,
        topics=r.topics or [],
        is_archived=r.is_archived or False,
        created_at=r.created_at.isoformat() if r.created_at else "",
        updated_at=r.updated_at.isoformat() if r.updated_at else "",
    )


def _run_git(repo_path: str, *args, check: bool = True) -> subprocess.CompletedProcess:
    """Run a git command in the given repo path"""
    cmd = ["git", "-C", repo_path] + list(args)
    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=30, check=check,
        )
        return result
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="Git operation timed out")
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=500, detail=f"Git error: {e.stderr[:500]}")


def _init_bare_repo(repo_path: str, default_branch: str = "main", init_readme: bool = True) -> None:
    """Initialize a bare git repository with optional README"""
    os.makedirs(repo_path, exist_ok=True)

    if init_readme:
        # Init as regular repo, add README, then we track it
        subprocess.run(["git", "init", "-b", default_branch, repo_path],
                       capture_output=True, check=True)
        readme_path = os.path.join(repo_path, "README.md")
        with open(readme_path, "w") as f:
            f.write("# New Repository\n\nCreated with Infinity OS.\n")
        subprocess.run(["git", "-C", repo_path, "add", "."],
                       capture_output=True, check=True)
        subprocess.run(
            ["git", "-C", repo_path, "commit", "-m", "Initial commit",
             "--author", "Infinity OS <system@infinity-os.dev>"],
            capture_output=True, check=True,
            env={**os.environ, "GIT_COMMITTER_NAME": "Infinity OS",
                 "GIT_COMMITTER_EMAIL": "system@infinity-os.dev"},
        )
    else:
        subprocess.run(["git", "init", "-b", default_branch, repo_path],
                       capture_output=True, check=True)


# --- Endpoints ---

@router.get("")
async def list_repositories(
    user: CurrentUser = Depends(require_permission("repos:read")),
    db: AsyncSession = Depends(get_db_session),
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
):
    """List repositories in the organisation"""
    stmt = (
        select(Repository)
        .where(
            Repository.organisation_id == user.organisation_id,
            Repository.deleted_at.is_(None),
        )
        .order_by(Repository.updated_at.desc())
        .offset(offset)
        .limit(limit)
    )
    result = await db.execute(stmt)
    repos = result.scalars().all()

    return {
        "repositories": [_repo_to_out(r) for r in repos],
        "count": len(repos),
    }


@router.post("", response_model=RepoOut)
async def create_repository(
    repo_data: RepoCreate,
    user: CurrentUser = Depends(require_permission("repos:write")),
    db: AsyncSession = Depends(get_db_session),
):
    """Create a new Git repository"""
    slug = _slugify(repo_data.name)

    # Check uniqueness
    existing = await db.execute(
        select(Repository).where(
            Repository.organisation_id == user.organisation_id,
            Repository.slug == slug,
            Repository.deleted_at.is_(None),
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"Repository '{slug}' already exists")

    try:
        visibility = RepoVisibility(repo_data.visibility)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid visibility: {repo_data.visibility}")

    repo_id = str(uuid.uuid4())
    storage_path = os.path.join(GIT_STORAGE_ROOT, user.organisation_id, f"{slug}.git")

    # Initialize git repo on disk
    try:
        _init_bare_repo(storage_path, repo_data.default_branch, repo_data.init_readme)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to initialize repository: {str(e)[:200]}")

    repo = Repository(
        id=repo_id,
        organisation_id=user.organisation_id,
        owner_id=user.id,
        name=repo_data.name,
        slug=slug,
        description=repo_data.description,
        visibility=visibility,
        default_branch=repo_data.default_branch,
        storage_path=storage_path,
        topics=repo_data.topics,
        commit_count=1 if repo_data.init_readme else 0,
    )
    db.add(repo)

    audit = AuditLog(
        event_type=AuditEventType.REPO_CREATED,
        user_id=user.id,
        organisation_id=user.organisation_id,
        resource_type="repository",
        resource_id=repo_id,
        governance_metadata={"name": repo_data.name, "slug": slug},
        request_id=str(uuid.uuid4()),
    )
    db.add(audit)
    await db.commit()
    await db.refresh(repo)

    return _repo_to_out(repo)


@router.get("/{repo_id}", response_model=RepoOut)
async def get_repository(
    repo_id: str,
    user: CurrentUser = Depends(require_permission("repos:read")),
    db: AsyncSession = Depends(get_db_session),
):
    """Get repository details"""
    stmt = select(Repository).where(
        Repository.id == repo_id,
        Repository.organisation_id == user.organisation_id,
        Repository.deleted_at.is_(None),
    )
    result = await db.execute(stmt)
    repo = result.scalar_one_or_none()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")
    return _repo_to_out(repo)


@router.patch("/{repo_id}", response_model=RepoOut)
async def update_repository(
    repo_id: str,
    update: RepoUpdate,
    user: CurrentUser = Depends(require_permission("repos:write")),
    db: AsyncSession = Depends(get_db_session),
):
    """Update repository settings"""
    stmt = select(Repository).where(
        Repository.id == repo_id,
        Repository.organisation_id == user.organisation_id,
        Repository.deleted_at.is_(None),
    )
    result = await db.execute(stmt)
    repo = result.scalar_one_or_none()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    if update.description is not None:
        repo.description = update.description
    if update.visibility is not None:
        try:
            repo.visibility = RepoVisibility(update.visibility)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid visibility: {update.visibility}")
    if update.default_branch is not None:
        repo.default_branch = update.default_branch
    if update.topics is not None:
        repo.topics = update.topics
    if update.is_archived is not None:
        repo.is_archived = update.is_archived

    db.add(repo)
    await db.commit()
    await db.refresh(repo)
    return _repo_to_out(repo)


@router.delete("/{repo_id}")
async def delete_repository(
    repo_id: str,
    user: CurrentUser = Depends(require_permission("repos:delete")),
    db: AsyncSession = Depends(get_db_session),
):
    """Soft-delete a repository"""
    stmt = select(Repository).where(
        Repository.id == repo_id,
        Repository.organisation_id == user.organisation_id,
        Repository.deleted_at.is_(None),
    )
    result = await db.execute(stmt)
    repo = result.scalar_one_or_none()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    repo.deleted_at = datetime.now(timezone.utc)
    db.add(repo)
    await db.commit()

    return {"repo_id": repo_id, "status": "deleted"}


# --- Git Operations ---

@router.get("/{repo_id}/commits")
async def list_commits(
    repo_id: str,
    user: CurrentUser = Depends(require_permission("repos:read")),
    db: AsyncSession = Depends(get_db_session),
    branch: Optional[str] = None,
    limit: int = Query(default=20, le=100),
):
    """List commits in a repository"""
    stmt = select(Repository).where(
        Repository.id == repo_id,
        Repository.organisation_id == user.organisation_id,
        Repository.deleted_at.is_(None),
    )
    result = await db.execute(stmt)
    repo = result.scalar_one_or_none()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    if not os.path.exists(repo.storage_path):
        return {"commits": [], "branch": branch or repo.default_branch}

    ref = branch or repo.default_branch
    git_result = _run_git(
        repo.storage_path, "log", ref,
        f"--max-count={limit}",
        "--format=%H|%s|%an|%ae|%aI|%D",
        check=False,
    )

    commits = []
    if git_result.returncode == 0:
        for line in git_result.stdout.strip().split("\n"):
            if not line:
                continue
            parts = line.split("|", 5)
            if len(parts) >= 5:
                commits.append(CommitOut(
                    sha=parts[0],
                    message=parts[1],
                    author=parts[2],
                    email=parts[3],
                    timestamp=parts[4],
                ))

    return {"commits": [c.model_dump() for c in commits], "branch": ref}


@router.get("/{repo_id}/branches")
async def list_branches(
    repo_id: str,
    user: CurrentUser = Depends(require_permission("repos:read")),
    db: AsyncSession = Depends(get_db_session),
):
    """List branches in a repository"""
    stmt = select(Repository).where(
        Repository.id == repo_id,
        Repository.organisation_id == user.organisation_id,
        Repository.deleted_at.is_(None),
    )
    result = await db.execute(stmt)
    repo = result.scalar_one_or_none()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    if not os.path.exists(repo.storage_path):
        return {"branches": []}

    git_result = _run_git(repo.storage_path, "branch", "--format=%(refname:short)|%(objectname:short)", check=False)

    branches = []
    if git_result.returncode == 0:
        for line in git_result.stdout.strip().split("\n"):
            if not line:
                continue
            parts = line.split("|", 1)
            name = parts[0].strip()
            sha = parts[1].strip() if len(parts) > 1 else None
            branches.append(BranchOut(
                name=name,
                is_default=(name == repo.default_branch),
                last_commit_sha=sha,
            ))

    return {"branches": [b.model_dump() for b in branches]}


@router.get("/{repo_id}/tree")
async def get_file_tree(
    repo_id: str,
    user: CurrentUser = Depends(require_permission("repos:read")),
    db: AsyncSession = Depends(get_db_session),
    path: str = Query(default="", description="Path within the repo"),
    ref: Optional[str] = None,
):
    """Browse repository file tree"""
    stmt = select(Repository).where(
        Repository.id == repo_id,
        Repository.organisation_id == user.organisation_id,
        Repository.deleted_at.is_(None),
    )
    result = await db.execute(stmt)
    repo = result.scalar_one_or_none()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    if not os.path.exists(repo.storage_path):
        return {"entries": [], "path": path}

    branch = ref or repo.default_branch
    tree_ref = f"{branch}:{path}" if path else branch

    git_result = _run_git(
        repo.storage_path, "ls-tree", "--name-only", "-z", tree_ref, check=False,
    )

    entries = []
    if git_result.returncode == 0:
        for name in git_result.stdout.split("\0"):
            if not name:
                continue
            entry_path = f"{path}/{name}" if path else name
            # Check if directory
            type_result = _run_git(
                repo.storage_path, "cat-file", "-t", f"{branch}:{entry_path}", check=False,
            )
            entry_type = "directory" if type_result.stdout.strip() == "tree" else "file"
            entries.append(FileTreeEntry(name=name, path=entry_path, type=entry_type))

    return {"entries": [e.model_dump() for e in entries], "path": path, "ref": branch}


@router.get("/{repo_id}/blob")
async def get_file_content_from_repo(
    repo_id: str,
    path: str = Query(..., description="File path within the repo"),
    user: CurrentUser = Depends(require_permission("repos:read")),
    db: AsyncSession = Depends(get_db_session),
    ref: Optional[str] = None,
):
    """Get file content from repository"""
    stmt = select(Repository).where(
        Repository.id == repo_id,
        Repository.organisation_id == user.organisation_id,
        Repository.deleted_at.is_(None),
    )
    result = await db.execute(stmt)
    repo = result.scalar_one_or_none()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    branch = ref or repo.default_branch
    git_result = _run_git(repo.storage_path, "show", f"{branch}:{path}", check=False)

    if git_result.returncode != 0:
        raise HTTPException(status_code=404, detail=f"File not found: {path}")

    return {
        "path": path,
        "ref": branch,
        "content": git_result.stdout,
        "size": len(git_result.stdout.encode()),
    }


# --- GitHub Sync ---

@router.post("/{repo_id}/github-sync")
async def configure_github_sync(
    repo_id: str,
    config: GitHubSyncConfig,
    user: CurrentUser = Depends(require_permission("repos:admin")),
    db: AsyncSession = Depends(get_db_session),
):
    """Configure GitHub remote sync for a repository"""
    stmt = select(Repository).where(
        Repository.id == repo_id,
        Repository.organisation_id == user.organisation_id,
        Repository.deleted_at.is_(None),
    )
    result = await db.execute(stmt)
    repo = result.scalar_one_or_none()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    repo.github_remote_url = config.remote_url
    repo.github_sync_enabled = config.enabled

    # Add remote to git repo
    if os.path.exists(repo.storage_path):
        _run_git(repo.storage_path, "remote", "remove", "github", check=False)
        _run_git(repo.storage_path, "remote", "add", "github", config.remote_url, check=False)

    db.add(repo)
    await db.commit()

    return {
        "repo_id": repo_id,
        "github_remote_url": config.remote_url,
        "sync_enabled": config.enabled,
        "status": "configured",
    }


@router.post("/{repo_id}/push-to-github")
async def push_to_github(
    repo_id: str,
    user: CurrentUser = Depends(require_permission("repos:admin")),
    db: AsyncSession = Depends(get_db_session),
):
    """Push local repository to GitHub"""
    stmt = select(Repository).where(
        Repository.id == repo_id,
        Repository.organisation_id == user.organisation_id,
        Repository.deleted_at.is_(None),
    )
    result = await db.execute(stmt)
    repo = result.scalar_one_or_none()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    if not repo.github_remote_url:
        raise HTTPException(status_code=400, detail="GitHub remote not configured")

    if not os.path.exists(repo.storage_path):
        raise HTTPException(status_code=400, detail="Repository storage not found")

    # Push to GitHub
    git_result = _run_git(
        repo.storage_path, "push", "github", repo.default_branch, "--force", check=False,
    )

    if git_result.returncode != 0:
        return {
            "status": "failed",
            "error": git_result.stderr[:500],
            "message": "Push failed. Ensure GitHub credentials are configured.",
        }

    repo.last_synced_at = datetime.now(timezone.utc)
    db.add(repo)

    audit = AuditLog(
        event_type=AuditEventType.REPO_SYNCED,
        user_id=user.id,
        organisation_id=user.organisation_id,
        resource_type="repository",
        resource_id=repo_id,
        governance_metadata={"remote": repo.github_remote_url, "direction": "push"},
        request_id=str(uuid.uuid4()),
    )
    db.add(audit)
    await db.commit()

    return {"repo_id": repo_id, "status": "pushed", "synced_at": repo.last_synced_at.isoformat()}


@router.post("/{repo_id}/pull-from-github")
async def pull_from_github(
    repo_id: str,
    user: CurrentUser = Depends(require_permission("repos:admin")),
    db: AsyncSession = Depends(get_db_session),
):
    """Pull from GitHub into local repository"""
    stmt = select(Repository).where(
        Repository.id == repo_id,
        Repository.organisation_id == user.organisation_id,
        Repository.deleted_at.is_(None),
    )
    result = await db.execute(stmt)
    repo = result.scalar_one_or_none()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    if not repo.github_remote_url:
        raise HTTPException(status_code=400, detail="GitHub remote not configured")

    git_result = _run_git(
        repo.storage_path, "pull", "github", repo.default_branch, check=False,
    )

    if git_result.returncode != 0:
        return {"status": "failed", "error": git_result.stderr[:500]}

    repo.last_synced_at = datetime.now(timezone.utc)
    db.add(repo)

    audit = AuditLog(
        event_type=AuditEventType.REPO_SYNCED,
        user_id=user.id,
        organisation_id=user.organisation_id,
        resource_type="repository",
        resource_id=repo_id,
        governance_metadata={"remote": repo.github_remote_url, "direction": "pull"},
        request_id=str(uuid.uuid4()),
    )
    db.add(audit)
    await db.commit()

    return {"repo_id": repo_id, "status": "pulled", "synced_at": repo.last_synced_at.isoformat()}