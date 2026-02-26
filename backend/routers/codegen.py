"""
Infinity OS — Code Generation Router
AI-powered project scaffolding, code completion, refactoring, and ZIP export.
Adapted from infinity-worker code_engine.py v5.0
"""

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from fastapi.responses import Response
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
import uuid

from auth import get_current_user, require_min_role, UserRole
from code_engine import (
    code_engine, file_manager,
    CodeGenerationRequest, RefactorRequest, CompletionRequest,
    Language, ProjectType, GenerationPhase,
)

router = APIRouter(prefix="/api/v1/codegen", tags=["Code Generation"])


# ── Request/Response Models ───────────────────────────────────────────────────

class GenerateProjectRequest(BaseModel):
    description: str = Field(..., min_length=10, max_length=10000,
                              description="Natural language description of the project")
    project_type: str = Field("react_app", description="Project template type")
    language: str = Field("typescript", description="Primary programming language")
    features: List[str] = Field(default_factory=list, description="Feature list")
    include_tests: bool = True
    include_docs: bool = True


class RefactorCodeRequest(BaseModel):
    file_path: str
    code: str = Field(..., min_length=1, max_length=100000)
    refactor_type: str = Field(..., description="rename | extract_function | inline | optimize")
    target: Optional[str] = None
    new_name: Optional[str] = None


class CompletionCodeRequest(BaseModel):
    file_path: str
    code: str = Field(..., max_length=50000)
    cursor_position: int
    language: str = "typescript"
    context_files: List[str] = Field(default_factory=list)


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/languages")
async def list_languages():
    """List supported programming languages."""
    return {"languages": [l.value for l in Language]}


@router.get("/project-types")
async def list_project_types():
    """List available project template types."""
    return {
        "project_types": [
            {"id": t.value, "name": t.value.replace("_", " ").title()}
            for t in ProjectType
        ]
    }


@router.get("/phases")
async def list_generation_phases():
    """List code generation phases."""
    return {"phases": [p.value for p in GenerationPhase]}


@router.post("/generate")
async def generate_project(
    request: GenerateProjectRequest,
    current_user=Depends(require_min_role(UserRole.USER)),
):
    """
    Generate a complete project from a natural language description.
    Returns all project files with content.
    """
    try:
        project_type = ProjectType(request.project_type)
    except ValueError:
        raise HTTPException(400, f"Invalid project_type. Valid: {[t.value for t in ProjectType]}")

    try:
        language = Language(request.language)
    except ValueError:
        raise HTTPException(400, f"Invalid language. Valid: {[l.value for l in Language]}")

    gen_request = CodeGenerationRequest(
        description=request.description,
        project_type=project_type,
        language=language,
        features=request.features,
        include_tests=request.include_tests,
        include_docs=request.include_docs,
    )

    response = await code_engine.generate_project(gen_request)

    return {
        "project_id": response.project_id,
        "project_name": response.project_name,
        "files": [
            {
                "path": f.path,
                "content": f.content,
                "language": f.language.value if f.language else None,
                "size": f.size,
                "checksum": f.checksum,
            }
            for f in response.files
        ],
        "stats": {
            "total_files": response.total_files,
            "total_lines": response.total_lines,
            "estimated_tokens": response.estimated_tokens,
            "generation_time_s": round(response.generation_time, 3),
        },
        "phase": {
            "current": response.current_phase.value,
            "completed": [p.value for p in response.phases_completed],
        },
        "ai_model_used": response.ai_model_used,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "generated_by": str(current_user.id),
    }


@router.get("/projects/{project_id}")
async def get_project(
    project_id: str,
    current_user=Depends(require_min_role(UserRole.USER)),
):
    """Get a previously generated project by ID."""
    project = code_engine.projects.get(project_id)
    if not project:
        raise HTTPException(404, f"Project {project_id} not found")

    return {
        "project_id": project_id,
        "name": project.name,
        "type": project.type.value,
        "file_count": len(project.files),
        "files": list(project.files.keys()),
        "created_at": project.created_at.isoformat(),
        "version": project.version,
    }


@router.get("/projects/{project_id}/files/{file_path:path}")
async def get_project_file(
    project_id: str,
    file_path: str,
    current_user=Depends(require_min_role(UserRole.USER)),
):
    """Get a specific file from a generated project."""
    project = code_engine.projects.get(project_id)
    if not project:
        raise HTTPException(404, f"Project {project_id} not found")

    file_node = project.files.get(file_path)
    if not file_node:
        raise HTTPException(404, f"File {file_path} not found in project")

    return {
        "path": file_node.path,
        "content": file_node.content,
        "language": file_node.language.value if file_node.language else None,
        "size": file_node.size,
        "checksum": file_node.checksum,
    }


@router.get("/projects/{project_id}/download")
async def download_project_zip(
    project_id: str,
    current_user=Depends(require_min_role(UserRole.USER)),
):
    """Download a generated project as a ZIP file."""
    try:
        zip_bytes = code_engine.export_project_zip(project_id)
        project = code_engine.projects.get(project_id)
        filename = f"{project.name if project else project_id}.zip"

        return Response(
            content=zip_bytes,
            media_type="application/zip",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except ValueError as e:
        raise HTTPException(404, str(e))


@router.post("/complete")
async def get_code_completion(
    request: CompletionCodeRequest,
    current_user=Depends(require_min_role(UserRole.USER)),
):
    """Get AI-powered code completions at cursor position."""
    try:
        language = Language(request.language)
    except ValueError:
        language = Language.TYPESCRIPT

    completion_request = CompletionRequest(
        file_path=request.file_path,
        code=request.code,
        cursor_position=request.cursor_position,
        language=language,
        context_files=request.context_files,
    )

    completions = await code_engine.get_completion(completion_request)

    return {
        "completions": completions,
        "count": len(completions),
        "cursor_position": request.cursor_position,
        "language": request.language,
    }


@router.post("/refactor")
async def refactor_code(
    request: RefactorCodeRequest,
    current_user=Depends(require_min_role(UserRole.USER)),
):
    """Refactor code using AI assistance."""
    valid_types = ["rename", "extract_function", "inline", "optimize"]
    if request.refactor_type not in valid_types:
        raise HTTPException(400, f"Invalid refactor_type. Valid: {valid_types}")

    refactor_request = RefactorRequest(
        file_path=request.file_path,
        code=request.code,
        refactor_type=request.refactor_type,
        target=request.target,
        new_name=request.new_name,
    )

    result = await code_engine.refactor_code(refactor_request)

    return {
        "file_path": request.file_path,
        "refactor_type": request.refactor_type,
        "original_lines": request.code.count("\n") + 1,
        "refactored_lines": result["refactored"].count("\n") + 1,
        "changes": result["changes"],
        "refactored_code": result["refactored"],
        "success": result["success"],
    }


@router.get("/projects")
async def list_projects(
    current_user=Depends(require_min_role(UserRole.USER)),
):
    """List all generated projects in the current session."""
    projects = []
    for project_id, project in code_engine.projects.items():
        projects.append({
            "project_id": project_id,
            "name": project.name,
            "type": project.type.value,
            "file_count": len(project.files),
            "created_at": project.created_at.isoformat(),
        })

    return {
        "projects": sorted(projects, key=lambda p: p["created_at"], reverse=True),
        "total": len(projects),
    }


@router.get("/templates")
async def list_templates():
    """List available project templates with their file structure."""
    from code_engine import PROJECT_TEMPLATES
    templates = {}
    for project_type, files in PROJECT_TEMPLATES.items():
        templates[project_type.value] = {
            "name": project_type.value.replace("_", " ").title(),
            "files": list(files.keys()),
            "file_count": len(files),
        }
    return {"templates": templates}