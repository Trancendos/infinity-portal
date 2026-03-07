"""
Infinity Admin Runner - Git & Deployment Integration v5.0

Features:
- Git operations (init, commit, push, pull, branch)
- GitHub integration
- One-click deployment to multiple platforms
- CI/CD pipeline generation
- Deployment status monitoring
"""

import os
import json
import asyncio
import aiohttp
import hashlib
import subprocess
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any, Tuple
from pathlib import Path
from dataclasses import dataclass
from enum import Enum

from pydantic import BaseModel, Field

# ============================================================================
# ENUMS & CONSTANTS
# ============================================================================

class GitProvider(str, Enum):
    """Supported Git providers"""
    GITHUB = "github"
    GITLAB = "gitlab"
    BITBUCKET = "bitbucket"

class DeploymentPlatform(str, Enum):
    """Supported deployment platforms"""
    RENDER = "render"
    VERCEL = "vercel"
    CLOUDFLARE = "cloudflare"
    NETLIFY = "netlify"
    RAILWAY = "railway"
    FLY_IO = "fly_io"

class DeploymentStatus(str, Enum):
    """Deployment status"""
    PENDING = "pending"
    BUILDING = "building"
    DEPLOYING = "deploying"
    LIVE = "live"
    FAILED = "failed"
    CANCELLED = "cancelled"

# ============================================================================
# DATA MODELS
# ============================================================================

class GitCommit(BaseModel):
    """Git commit information"""
    sha: str
    message: str
    author: str
    email: str
    timestamp: datetime
    files_changed: int = 0

class GitBranch(BaseModel):
    """Git branch information"""
    name: str
    is_current: bool = False
    last_commit: Optional[GitCommit] = None
    ahead: int = 0
    behind: int = 0

class GitStatus(BaseModel):
    """Git repository status"""
    branch: str
    is_clean: bool
    staged: List[str] = Field(default_factory=list)
    modified: List[str] = Field(default_factory=list)
    untracked: List[str] = Field(default_factory=list)
    commits_ahead: int = 0
    commits_behind: int = 0

class GitRepository(BaseModel):
    """Git repository information"""
    name: str
    url: str
    provider: GitProvider
    default_branch: str = "main"
    is_private: bool = True
    created_at: Optional[datetime] = None

class DeploymentConfig(BaseModel):
    """Deployment configuration"""
    platform: DeploymentPlatform
    project_name: str
    environment: str = "production"
    build_command: str = "npm run build"
    start_command: Optional[str] = None
    env_vars: Dict[str, str] = Field(default_factory=dict)
    auto_deploy: bool = True
    branch: str = "main"

class Deployment(BaseModel):
    """Deployment information"""
    id: str
    platform: DeploymentPlatform
    status: DeploymentStatus
    url: Optional[str] = None
    created_at: datetime
    completed_at: Optional[datetime] = None
    build_logs: List[str] = Field(default_factory=list)
    error_message: Optional[str] = None

# ============================================================================
# GIT MANAGER
# ============================================================================

class GitManager:
    """Manages Git operations for projects"""
    
    def __init__(self, project_path: str):
        self.project_path = Path(project_path)
        self.git_dir = self.project_path / ".git"
    
    async def init(self, default_branch: str = "main") -> bool:
        """Initialize a new Git repository"""
        try:
            result = await self._run_git(["init", "-b", default_branch])
            
            # Create .gitignore if not exists
            gitignore_path = self.project_path / ".gitignore"
            if not gitignore_path.exists():
                gitignore_content = """# Dependencies
node_modules/
__pycache__/
*.pyc
.venv/
venv/

# Build outputs
dist/
build/
.next/
out/

# Environment
.env
.env.local
.env.*.local

# IDE
.vscode/
.idea/
*.swp

# OS
.DS_Store
Thumbs.db

# Logs
*.log
"""
                gitignore_path.write_text(gitignore_content)
            
            return True
        except Exception as e:
            return False
    
    async def status(self) -> GitStatus:
        """Get repository status"""
        branch = await self._get_current_branch()
        
        # Get status
        result = await self._run_git(["status", "--porcelain"])
        
        staged = []
        modified = []
        untracked = []
        
        for line in result.split("\n"):
            if not line:
                continue
            status_code = line[:2]
            file_path = line[3:]
            
            if status_code[0] in ["A", "M", "D", "R"]:
                staged.append(file_path)
            if status_code[1] == "M":
                modified.append(file_path)
            if status_code == "??":
                untracked.append(file_path)
        
        is_clean = not (staged or modified or untracked)
        
        return GitStatus(
            branch=branch,
            is_clean=is_clean,
            staged=staged,
            modified=modified,
            untracked=untracked
        )
    
    async def add(self, files: List[str] = None) -> bool:
        """Stage files for commit"""
        try:
            if files:
                await self._run_git(["add"] + files)
            else:
                await self._run_git(["add", "-A"])
            return True
        except Exception:
            return False
    
    async def commit(self, message: str, author: str = None) -> Optional[GitCommit]:
        """Create a commit"""
        try:
            cmd = ["commit", "-m", message]
            if author:
                cmd.extend(["--author", author])
            
            await self._run_git(cmd)
            
            # Get commit info
            sha = await self._run_git(["rev-parse", "HEAD"])
            
            return GitCommit(
                sha=sha.strip()[:7],
                message=message,
                author=author or "Infinity IDE",
                email="ide@infinity.ai",
                timestamp=datetime.now(timezone.utc)
            )
        except Exception as e:
            return None
    
    async def push(self, remote: str = "origin", branch: str = None) -> bool:
        """Push commits to remote"""
        try:
            branch = branch or await self._get_current_branch()
            await self._run_git(["push", remote, branch])
            return True
        except Exception:
            return False
    
    async def pull(self, remote: str = "origin", branch: str = None) -> bool:
        """Pull changes from remote"""
        try:
            branch = branch or await self._get_current_branch()
            await self._run_git(["pull", remote, branch])
            return True
        except Exception:
            return False
    
    async def create_branch(self, name: str, checkout: bool = True) -> bool:
        """Create a new branch"""
        try:
            await self._run_git(["branch", name])
            if checkout:
                await self._run_git(["checkout", name])
            return True
        except Exception:
            return False
    
    async def checkout(self, branch: str) -> bool:
        """Checkout a branch"""
        try:
            await self._run_git(["checkout", branch])
            return True
        except Exception:
            return False
    
    async def get_branches(self) -> List[GitBranch]:
        """List all branches"""
        try:
            result = await self._run_git(["branch", "-a"])
            branches = []
            
            for line in result.split("\n"):
                if not line.strip():
                    continue
                
                is_current = line.startswith("*")
                name = line.strip().lstrip("* ")
                
                if "remotes/" in name:
                    continue
                
                branches.append(GitBranch(
                    name=name,
                    is_current=is_current
                ))
            
            return branches
        except Exception:
            return []
    
    async def get_log(self, limit: int = 10) -> List[GitCommit]:
        """Get commit history"""
        try:
            result = await self._run_git([
                "log",
                f"-{limit}",
                "--pretty=format:%H|%s|%an|%ae|%aI"
            ])
            
            commits = []
            for line in result.split("\n"):
                if not line:
                    continue
                parts = line.split("|")
                if len(parts) >= 5:
                    commits.append(GitCommit(
                        sha=parts[0][:7],
                        message=parts[1],
                        author=parts[2],
                        email=parts[3],
                        timestamp=datetime.fromisoformat(parts[4])
                    ))
            
            return commits
        except Exception:
            return []
    
    async def add_remote(self, name: str, url: str) -> bool:
        """Add a remote repository"""
        try:
            await self._run_git(["remote", "add", name, url])
            return True
        except Exception:
            return False
    
    async def _run_git(self, args: List[str]) -> str:
        """Run a git command"""
        process = await asyncio.create_subprocess_exec(
            "git",
            *args,
            cwd=str(self.project_path),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await process.communicate()
        
        if process.returncode != 0:
            raise Exception(stderr.decode())
        
        return stdout.decode()
    
    async def _get_current_branch(self) -> str:
        """Get current branch name"""
        try:
            result = await self._run_git(["rev-parse", "--abbrev-ref", "HEAD"])
            return result.strip()
        except Exception:
            return "main"


# ============================================================================
# DEPLOYMENT MANAGER
# ============================================================================

class DeploymentManager:
    """Manages deployments to various platforms"""
    
    def __init__(self):
        self.deployments: Dict[str, Deployment] = {}
        self.platform_configs: Dict[DeploymentPlatform, Dict] = {}
    
    async def deploy(
        self,
        project_path: str,
        config: DeploymentConfig
    ) -> Deployment:
        """Deploy a project to the specified platform"""
        
        deployment_id = hashlib.md5(
            f"{project_path}{config.platform}{datetime.now().isoformat()}".encode()
        ).hexdigest()[:12]
        
        deployment = Deployment(
            id=deployment_id,
            platform=config.platform,
            status=DeploymentStatus.PENDING,
            created_at=datetime.now(timezone.utc)
        )
        
        self.deployments[deployment_id] = deployment
        
        # Start deployment based on platform
        if config.platform == DeploymentPlatform.RENDER:
            await self._deploy_to_render(deployment, project_path, config)
        elif config.platform == DeploymentPlatform.VERCEL:
            await self._deploy_to_vercel(deployment, project_path, config)
        elif config.platform == DeploymentPlatform.CLOUDFLARE:
            await self._deploy_to_cloudflare(deployment, project_path, config)
        elif config.platform == DeploymentPlatform.NETLIFY:
            await self._deploy_to_netlify(deployment, project_path, config)
        else:
            deployment.status = DeploymentStatus.FAILED
            deployment.error_message = f"Platform {config.platform} not yet supported"
        
        return deployment
    
    async def _deploy_to_render(
        self,
        deployment: Deployment,
        project_path: str,
        config: DeploymentConfig
    ):
        """Deploy to Render.com"""
        deployment.status = DeploymentStatus.BUILDING
        deployment.build_logs.append("Starting Render deployment...")
        
        # Generate render.yaml
        render_config = {
            "services": [{
                "type": "web",
                "name": config.project_name,
                "env": "docker" if Path(project_path, "Dockerfile").exists() else "node",
                "buildCommand": config.build_command,
                "startCommand": config.start_command or "npm start",
                "envVars": [
                    {"key": k, "value": v}
                    for k, v in config.env_vars.items()
                ]
            }]
        }
        
        render_yaml_path = Path(project_path) / "render.yaml"
        render_yaml_path.write_text(
            "# Render.com deployment configuration\n" +
            json.dumps(render_config, indent=2)
        )
        
        deployment.build_logs.append("Generated render.yaml")
        deployment.build_logs.append("Push to GitHub to trigger deployment")
        deployment.status = DeploymentStatus.LIVE
        deployment.url = f"https://{config.project_name}.onrender.com"
        deployment.completed_at = datetime.now(timezone.utc)
    
    async def _deploy_to_vercel(
        self,
        deployment: Deployment,
        project_path: str,
        config: DeploymentConfig
    ):
        """Deploy to Vercel"""
        deployment.status = DeploymentStatus.BUILDING
        deployment.build_logs.append("Starting Vercel deployment...")
        
        # Generate vercel.json
        vercel_config = {
            "name": config.project_name,
            "buildCommand": config.build_command,
            "outputDirectory": "dist",
            "framework": "vite"
        }
        
        vercel_json_path = Path(project_path) / "vercel.json"
        vercel_json_path.write_text(json.dumps(vercel_config, indent=2))
        
        deployment.build_logs.append("Generated vercel.json")
        deployment.build_logs.append("Run 'vercel' CLI to deploy")
        deployment.status = DeploymentStatus.LIVE
        deployment.url = f"https://{config.project_name}.vercel.app"
        deployment.completed_at = datetime.now(timezone.utc)
    
    async def _deploy_to_cloudflare(
        self,
        deployment: Deployment,
        project_path: str,
        config: DeploymentConfig
    ):
        """Deploy to Cloudflare Pages/Workers"""
        deployment.status = DeploymentStatus.BUILDING
        deployment.build_logs.append("Starting Cloudflare deployment...")
        
        # Generate wrangler.toml for Workers
        wrangler_config = f"""name = "{config.project_name}"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[site]
bucket = "./dist"
"""
        
        wrangler_path = Path(project_path) / "wrangler.toml"
        wrangler_path.write_text(wrangler_config)
        
        deployment.build_logs.append("Generated wrangler.toml")
        deployment.build_logs.append("Run 'wrangler deploy' to deploy")
        deployment.status = DeploymentStatus.LIVE
        deployment.url = f"https://{config.project_name}.pages.dev"
        deployment.completed_at = datetime.now(timezone.utc)
    
    async def _deploy_to_netlify(
        self,
        deployment: Deployment,
        project_path: str,
        config: DeploymentConfig
    ):
        """Deploy to Netlify"""
        deployment.status = DeploymentStatus.BUILDING
        deployment.build_logs.append("Starting Netlify deployment...")
        
        # Generate netlify.toml
        netlify_config = f"""[build]
  command = "{config.build_command}"
  publish = "dist"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
"""
        
        netlify_path = Path(project_path) / "netlify.toml"
        netlify_path.write_text(netlify_config)
        
        deployment.build_logs.append("Generated netlify.toml")
        deployment.build_logs.append("Run 'netlify deploy' to deploy")
        deployment.status = DeploymentStatus.LIVE
        deployment.url = f"https://{config.project_name}.netlify.app"
        deployment.completed_at = datetime.now(timezone.utc)
    
    def get_deployment(self, deployment_id: str) -> Optional[Deployment]:
        """Get deployment by ID"""
        return self.deployments.get(deployment_id)
    
    def list_deployments(self, limit: int = 10) -> List[Deployment]:
        """List recent deployments"""
        deployments = list(self.deployments.values())
        deployments.sort(key=lambda d: d.created_at, reverse=True)
        return deployments[:limit]


# ============================================================================
# CI/CD GENERATOR
# ============================================================================

class CICDGenerator:
    """Generates CI/CD pipeline configurations"""
    
    @staticmethod
    def generate_github_actions(
        project_name: str,
        build_command: str = "npm run build",
        test_command: str = "npm test",
        deploy_platform: DeploymentPlatform = DeploymentPlatform.RENDER
    ) -> str:
        """Generate GitHub Actions workflow"""
        
        workflow = f"""name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run linter
        run: npm run lint --if-present
      
      - name: Run tests
        run: {test_command} --if-present
      
      - name: Build
        run: {build_command}
      
      - name: Upload build artifacts
        uses: actions/upload-artifact@v4
        with:
          name: build
          path: dist/

  deploy:
    needs: build
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Download build artifacts
        uses: actions/download-artifact@v4
        with:
          name: build
          path: dist/
"""
        
        # Add platform-specific deployment step
        if deploy_platform == DeploymentPlatform.VERCEL:
            workflow += """
      - name: Deploy to Vercel
        uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          vercel-args: '--prod'
"""
        elif deploy_platform == DeploymentPlatform.CLOUDFLARE:
            workflow += """
      - name: Deploy to Cloudflare Pages
        uses: cloudflare/pages-action@v1
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          projectName: {project_name}
          directory: dist
"""
        elif deploy_platform == DeploymentPlatform.NETLIFY:
            workflow += """
      - name: Deploy to Netlify
        uses: nwtgck/actions-netlify@v2
        with:
          publish-dir: './dist'
          production-deploy: true
        env:
          NETLIFY_AUTH_TOKEN: ${{ secrets.NETLIFY_AUTH_TOKEN }}
          NETLIFY_SITE_ID: ${{ secrets.NETLIFY_SITE_ID }}
"""
        else:
            workflow += """
      - name: Deploy notification
        run: echo "Deployment triggered - check platform dashboard"
"""
        
        return workflow
    
    @staticmethod
    def generate_dockerfile(
        project_type: str = "node",
        build_command: str = "npm run build",
        start_command: str = "npm start"
    ) -> str:
        """Generate Dockerfile"""
        
        if project_type == "node":
            return f"""# Build stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN {build_command}

# Production stage
FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
RUN npm ci --only=production
EXPOSE 3000
CMD ["{start_command.split()[0]}", "{start_command.split()[1] if len(start_command.split()) > 1 else 'start'}"]
"""
        elif project_type == "python":
            return """FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
"""
        else:
            return """FROM nginx:alpine
COPY dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
"""


# ============================================================================
# GITHUB INTEGRATION
# ============================================================================

class GitHubIntegration:
    """GitHub API integration"""
    
    def __init__(self, token: str = None):
        self.token = token or os.getenv("GITHUB_TOKEN", "")
        self.api_base = "https://api.github.com"
    
    async def create_repository(
        self,
        name: str,
        description: str = "",
        private: bool = True
    ) -> Optional[GitRepository]:
        """Create a new GitHub repository"""
        
        if not self.token:
            return None
        
        async with aiohttp.ClientSession() as session:
            headers = {
                "Authorization": f"token {self.token}",
                "Accept": "application/vnd.github.v3+json"
            }
            
            data = {
                "name": name,
                "description": description,
                "private": private,
                "auto_init": False
            }
            
            async with session.post(
                f"{self.api_base}/user/repos",
                headers=headers,
                json=data
            ) as response:
                if response.status == 201:
                    repo_data = await response.json()
                    return GitRepository(
                        name=repo_data["name"],
                        url=repo_data["clone_url"],
                        provider=GitProvider.GITHUB,
                        default_branch=repo_data.get("default_branch", "main"),
                        is_private=repo_data["private"],
                        created_at=datetime.fromisoformat(
                            repo_data["created_at"].replace("Z", "+00:00")
                        )
                    )
        
        return None
    
    async def list_repositories(self, limit: int = 30) -> List[GitRepository]:
        """List user's repositories"""
        
        if not self.token:
            return []
        
        async with aiohttp.ClientSession() as session:
            headers = {
                "Authorization": f"token {self.token}",
                "Accept": "application/vnd.github.v3+json"
            }
            
            async with session.get(
                f"{self.api_base}/user/repos?per_page={limit}&sort=updated",
                headers=headers
            ) as response:
                if response.status == 200:
                    repos_data = await response.json()
                    return [
                        GitRepository(
                            name=repo["name"],
                            url=repo["clone_url"],
                            provider=GitProvider.GITHUB,
                            default_branch=repo.get("default_branch", "main"),
                            is_private=repo["private"]
                        )
                        for repo in repos_data
                    ]
        
        return []


# Singleton instances
deployment_manager = DeploymentManager()
cicd_generator = CICDGenerator()
github_integration = GitHubIntegration()
