"""
App Factory Module - v5.5
Compile, Host, Deploy, and Disconnect Applications

Features:
- Build system for Node.js, Python, and static projects
- Internal sandbox hosting with preview URLs
- Automated GitHub repo creation and push
- Modular disconnect for standalone apps
- App registry with PID assignment
"""

import os
import json
import uuid
import shutil
import asyncio
import subprocess
import hashlib
from datetime import datetime
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field, asdict
from enum import Enum
from pathlib import Path


class AppStatus(Enum):
    """Application lifecycle status"""
    CREATED = "created"
    BUILDING = "building"
    BUILD_FAILED = "build_failed"
    READY = "ready"
    HOSTING = "hosting"
    DEPLOYED = "deployed"
    DISCONNECTED = "disconnected"
    ARCHIVED = "archived"


class AppType(Enum):
    """Application type"""
    NODEJS = "nodejs"
    PYTHON = "python"
    STATIC = "static"
    REACT = "react"
    NEXTJS = "nextjs"
    FASTAPI = "fastapi"
    FLASK = "flask"


class DeployTarget(Enum):
    """Deployment targets"""
    INTERNAL = "internal"
    GITHUB_PAGES = "github_pages"
    CLOUDFLARE_PAGES = "cloudflare_pages"
    VERCEL = "vercel"
    NETLIFY = "netlify"
    RENDER = "render"


@dataclass
class BuildResult:
    """Result of a build operation"""
    success: bool
    output: str
    errors: str
    duration_ms: int
    artifacts: List[str]
    build_dir: str


@dataclass
class HostingInfo:
    """Internal hosting information"""
    preview_url: str
    internal_port: int
    process_id: Optional[int]
    started_at: datetime
    status: str


@dataclass
class GitHubRepo:
    """GitHub repository information"""
    name: str
    full_name: str
    url: str
    clone_url: str
    private: bool
    created_at: datetime


@dataclass
class App:
    """Application entity"""
    pid: str  # Product ID
    name: str
    description: str
    app_type: AppType
    status: AppStatus
    created_at: datetime
    updated_at: datetime
    source_dir: str
    build_dir: Optional[str] = None
    hosting: Optional[HostingInfo] = None
    github_repo: Optional[GitHubRepo] = None
    deploy_target: Optional[DeployTarget] = None
    deploy_url: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    version: str = "1.0.0"
    tags: List[str] = field(default_factory=list)
    
    def to_dict(self) -> Dict:
        data = asdict(self)
        data['app_type'] = self.app_type.value
        data['status'] = self.status.value
        data['created_at'] = self.created_at.isoformat()
        data['updated_at'] = self.updated_at.isoformat()
        if self.deploy_target:
            data['deploy_target'] = self.deploy_target.value
        if self.hosting:
            data['hosting']['started_at'] = self.hosting.started_at.isoformat()
        if self.github_repo:
            data['github_repo']['created_at'] = self.github_repo.created_at.isoformat()
        return data


class AppRegistry:
    """Registry for tracking all applications"""
    
    def __init__(self, storage_dir: str = "/tmp/infinity-apps"):
        self.storage_dir = Path(storage_dir)
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        self.registry_file = self.storage_dir / "registry.json"
        self.apps: Dict[str, App] = {}
        self._load_registry()
    
    def _load_registry(self):
        """Load registry from disk"""
        if self.registry_file.exists():
            try:
                with open(self.registry_file, 'r') as f:
                    data = json.load(f)
                    # Reconstruct apps from stored data
                    for pid, app_data in data.get('apps', {}).items():
                        self.apps[pid] = self._deserialize_app(app_data)
            except Exception:
                self.apps = {}
    
    def _save_registry(self):
        """Save registry to disk"""
        data = {
            'apps': {pid: app.to_dict() for pid, app in self.apps.items()},
            'updated_at': datetime.utcnow().isoformat()
        }
        with open(self.registry_file, 'w') as f:
            json.dump(data, f, indent=2)
    
    def _deserialize_app(self, data: Dict) -> App:
        """Deserialize app from dictionary"""
        return App(
            pid=data['pid'],
            name=data['name'],
            description=data['description'],
            app_type=AppType(data['app_type']),
            status=AppStatus(data['status']),
            created_at=datetime.fromisoformat(data['created_at']),
            updated_at=datetime.fromisoformat(data['updated_at']),
            source_dir=data['source_dir'],
            build_dir=data.get('build_dir'),
            version=data.get('version', '1.0.0'),
            tags=data.get('tags', []),
            metadata=data.get('metadata', {})
        )
    
    def generate_pid(self, name: str) -> str:
        """Generate unique Product ID"""
        timestamp = datetime.utcnow().strftime('%Y%m%d%H%M%S')
        hash_part = hashlib.md5(f"{name}{timestamp}".encode()).hexdigest()[:8]
        return f"APP-{timestamp}-{hash_part.upper()}"
    
    def register(self, app: App) -> str:
        """Register a new application"""
        self.apps[app.pid] = app
        self._save_registry()
        return app.pid
    
    def update(self, pid: str, **kwargs) -> Optional[App]:
        """Update an application"""
        if pid not in self.apps:
            return None
        app = self.apps[pid]
        for key, value in kwargs.items():
            if hasattr(app, key):
                setattr(app, key, value)
        app.updated_at = datetime.utcnow()
        self._save_registry()
        return app
    
    def get(self, pid: str) -> Optional[App]:
        """Get an application by PID"""
        return self.apps.get(pid)
    
    def list_all(self, status: Optional[AppStatus] = None) -> List[App]:
        """List all applications, optionally filtered by status"""
        apps = list(self.apps.values())
        if status:
            apps = [a for a in apps if a.status == status]
        return sorted(apps, key=lambda a: a.updated_at, reverse=True)
    
    def delete(self, pid: str) -> bool:
        """Delete an application from registry"""
        if pid in self.apps:
            del self.apps[pid]
            self._save_registry()
            return True
        return False


class BuildSystem:
    """Build system for compiling applications"""
    
    def __init__(self, workspace_dir: str = "/tmp/infinity-builds"):
        self.workspace_dir = Path(workspace_dir)
        self.workspace_dir.mkdir(parents=True, exist_ok=True)
    
    def detect_app_type(self, source_dir: str) -> AppType:
        """Detect application type from source files"""
        source_path = Path(source_dir)
        
        # Check for Node.js
        if (source_path / "package.json").exists():
            try:
                with open(source_path / "package.json") as f:
                    pkg = json.load(f)
                    deps = {**pkg.get('dependencies', {}), **pkg.get('devDependencies', {})}
                    
                    if 'next' in deps:
                        return AppType.NEXTJS
                    elif 'react' in deps:
                        return AppType.REACT
                    else:
                        return AppType.NODEJS
            except Exception:
                return AppType.NODEJS
        
        # Check for Python
        if (source_path / "requirements.txt").exists():
            try:
                with open(source_path / "requirements.txt") as f:
                    content = f.read().lower()
                    if 'fastapi' in content:
                        return AppType.FASTAPI
                    elif 'flask' in content:
                        return AppType.FLASK
            except Exception:
                pass
            return AppType.PYTHON
        
        # Check for static
        if (source_path / "index.html").exists():
            return AppType.STATIC
        
        return AppType.STATIC
    
    async def build(self, app: App) -> BuildResult:
        """Build an application"""
        start_time = datetime.utcnow()
        build_dir = self.workspace_dir / app.pid / "dist"
        build_dir.mkdir(parents=True, exist_ok=True)
        
        try:
            if app.app_type in [AppType.NODEJS, AppType.REACT, AppType.NEXTJS]:
                result = await self._build_nodejs(app, build_dir)
            elif app.app_type in [AppType.PYTHON, AppType.FASTAPI, AppType.FLASK]:
                result = await self._build_python(app, build_dir)
            else:
                result = await self._build_static(app, build_dir)
            
            duration = int((datetime.utcnow() - start_time).total_seconds() * 1000)
            result.duration_ms = duration
            return result
            
        except Exception as e:
            duration = int((datetime.utcnow() - start_time).total_seconds() * 1000)
            return BuildResult(
                success=False,
                output="",
                errors=str(e),
                duration_ms=duration,
                artifacts=[],
                build_dir=str(build_dir)
            )
    
    async def _build_nodejs(self, app: App, build_dir: Path) -> BuildResult:
        """Build Node.js application"""
        source_dir = Path(app.source_dir)
        
        # Install dependencies
        install_result = await self._run_command(
            ["npm", "install"],
            cwd=str(source_dir)
        )
        
        if install_result['returncode'] != 0:
            return BuildResult(
                success=False,
                output=install_result['stdout'],
                errors=install_result['stderr'],
                duration_ms=0,
                artifacts=[],
                build_dir=str(build_dir)
            )
        
        # Run build
        build_result = await self._run_command(
            ["npm", "run", "build"],
            cwd=str(source_dir)
        )
        
        # Copy build artifacts
        artifacts = []
        potential_dirs = ["dist", "build", ".next", "out"]
        for dir_name in potential_dirs:
            src = source_dir / dir_name
            if src.exists():
                dst = build_dir / dir_name
                if dst.exists():
                    shutil.rmtree(dst)
                shutil.copytree(src, dst)
                artifacts.append(str(dst))
        
        return BuildResult(
            success=build_result['returncode'] == 0,
            output=install_result['stdout'] + "\n" + build_result['stdout'],
            errors=build_result['stderr'],
            duration_ms=0,
            artifacts=artifacts,
            build_dir=str(build_dir)
        )
    
    async def _build_python(self, app: App, build_dir: Path) -> BuildResult:
        """Build Python application"""
        source_dir = Path(app.source_dir)
        
        # Copy source to build dir
        if build_dir.exists():
            shutil.rmtree(build_dir)
        shutil.copytree(source_dir, build_dir)
        
        # Install dependencies
        req_file = build_dir / "requirements.txt"
        if req_file.exists():
            result = await self._run_command(
                ["pip", "install", "-r", "requirements.txt", "-t", str(build_dir / "deps")],
                cwd=str(build_dir)
            )
            
            return BuildResult(
                success=result['returncode'] == 0,
                output=result['stdout'],
                errors=result['stderr'],
                duration_ms=0,
                artifacts=[str(build_dir)],
                build_dir=str(build_dir)
            )
        
        return BuildResult(
            success=True,
            output="Python project copied successfully",
            errors="",
            duration_ms=0,
            artifacts=[str(build_dir)],
            build_dir=str(build_dir)
        )
    
    async def _build_static(self, app: App, build_dir: Path) -> BuildResult:
        """Build static application (just copy files)"""
        source_dir = Path(app.source_dir)
        
        if build_dir.exists():
            shutil.rmtree(build_dir)
        shutil.copytree(source_dir, build_dir)
        
        return BuildResult(
            success=True,
            output="Static files copied successfully",
            errors="",
            duration_ms=0,
            artifacts=[str(build_dir)],
            build_dir=str(build_dir)
        )
    
    async def _run_command(self, cmd: List[str], cwd: str, timeout: int = 300) -> Dict:
        """Run a shell command asynchronously"""
        try:
            process = await asyncio.create_subprocess_exec(
                *cmd,
                cwd=cwd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            
            stdout, stderr = await asyncio.wait_for(
                process.communicate(),
                timeout=timeout
            )
            
            return {
                'returncode': process.returncode,
                'stdout': stdout.decode('utf-8', errors='replace'),
                'stderr': stderr.decode('utf-8', errors='replace')
            }
        except asyncio.TimeoutError:
            process.kill()
            return {
                'returncode': -1,
                'stdout': '',
                'stderr': f'Command timed out after {timeout} seconds'
            }
        except Exception as e:
            return {
                'returncode': -1,
                'stdout': '',
                'stderr': str(e)
            }


class InternalHosting:
    """Internal hosting for preview applications"""
    
    def __init__(self, base_port: int = 9000, max_apps: int = 10):
        self.base_port = base_port
        self.max_apps = max_apps
        self.hosted_apps: Dict[str, Dict] = {}
        self.processes: Dict[str, subprocess.Popen] = {}
    
    def get_preview_url(self, pid: str, port: int) -> str:
        """Generate preview URL for an app"""
        # In production, this would be a real URL
        return f"http://localhost:{port}"
    
    def find_available_port(self) -> int:
        """Find an available port"""
        used_ports = set(info['port'] for info in self.hosted_apps.values())
        for port in range(self.base_port, self.base_port + self.max_apps):
            if port not in used_ports:
                return port
        raise RuntimeError("No available ports for hosting")
    
    async def start_hosting(self, app: App) -> HostingInfo:
        """Start hosting an application"""
        port = self.find_available_port()
        build_dir = app.build_dir
        
        if not build_dir:
            raise ValueError("App must be built before hosting")
        
        # Start a simple HTTP server for static/built content
        process = subprocess.Popen(
            ["python3", "-m", "http.server", str(port)],
            cwd=build_dir,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )
        
        self.processes[app.pid] = process
        self.hosted_apps[app.pid] = {
            'port': port,
            'process_id': process.pid,
            'started_at': datetime.utcnow()
        }
        
        hosting_info = HostingInfo(
            preview_url=self.get_preview_url(app.pid, port),
            internal_port=port,
            process_id=process.pid,
            started_at=datetime.utcnow(),
            status="running"
        )
        
        return hosting_info
    
    async def stop_hosting(self, pid: str) -> bool:
        """Stop hosting an application"""
        if pid in self.processes:
            self.processes[pid].terminate()
            del self.processes[pid]
        if pid in self.hosted_apps:
            del self.hosted_apps[pid]
        return True
    
    def get_hosting_status(self, pid: str) -> Optional[Dict]:
        """Get hosting status for an app"""
        if pid not in self.hosted_apps:
            return None
        
        info = self.hosted_apps[pid]
        process = self.processes.get(pid)
        
        return {
            'port': info['port'],
            'process_id': info['process_id'],
            'started_at': info['started_at'].isoformat(),
            'running': process is not None and process.poll() is None
        }


class GitHubIntegration:
    """GitHub integration for repository management"""
    
    def __init__(self, token: Optional[str] = None):
        self.token = token or os.environ.get('GITHUB_TOKEN')
        self.api_base = "https://api.github.com"
    
    def _get_headers(self) -> Dict[str, str]:
        """Get API headers"""
        return {
            "Authorization": f"token {self.token}",
            "Accept": "application/vnd.github.v3+json"
        }
    
    async def create_repository(
        self,
        name: str,
        description: str = "",
        private: bool = True,
        auto_init: bool = True
    ) -> GitHubRepo:
        """Create a new GitHub repository"""
        import aiohttp
        
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{self.api_base}/user/repos",
                headers=self._get_headers(),
                json={
                    "name": name,
                    "description": description,
                    "private": private,
                    "auto_init": auto_init
                }
            ) as response:
                if response.status != 201:
                    error = await response.text()
                    raise RuntimeError(f"Failed to create repository: {error}")
                
                data = await response.json()
                
                return GitHubRepo(
                    name=data['name'],
                    full_name=data['full_name'],
                    url=data['html_url'],
                    clone_url=data['clone_url'],
                    private=data['private'],
                    created_at=datetime.utcnow()
                )
    
    async def push_to_repository(
        self,
        source_dir: str,
        repo_url: str,
        branch: str = "main",
        commit_message: str = "Initial commit from Infinity Worker"
    ) -> bool:
        """Push code to a GitHub repository"""
        source_path = Path(source_dir)
        
        # Initialize git if needed
        git_dir = source_path / ".git"
        if not git_dir.exists():
            subprocess.run(["git", "init"], cwd=str(source_path), check=True)
        
        # Configure git
        subprocess.run(
            ["git", "config", "user.email", "infinity-worker@trancendos.com"],
            cwd=str(source_path),
            check=True
        )
        subprocess.run(
            ["git", "config", "user.name", "Infinity Worker"],
            cwd=str(source_path),
            check=True
        )
        
        # Add all files
        subprocess.run(["git", "add", "-A"], cwd=str(source_path), check=True)
        
        # Commit
        subprocess.run(
            ["git", "commit", "-m", commit_message],
            cwd=str(source_path),
            check=True
        )
        
        # Add remote and push
        subprocess.run(
            ["git", "remote", "add", "origin", repo_url],
            cwd=str(source_path),
            capture_output=True  # Ignore if already exists
        )
        
        subprocess.run(
            ["git", "push", "-u", "origin", branch, "--force"],
            cwd=str(source_path),
            check=True
        )
        
        return True


class ModularDisconnect:
    """Module for disconnecting apps as standalone packages"""
    
    def __init__(self, export_dir: str = "/tmp/infinity-exports"):
        self.export_dir = Path(export_dir)
        self.export_dir.mkdir(parents=True, exist_ok=True)
    
    def export_standalone(self, app: App, include_build: bool = True) -> str:
        """Export app as standalone package"""
        export_path = self.export_dir / f"{app.pid}-standalone"
        
        if export_path.exists():
            shutil.rmtree(export_path)
        export_path.mkdir(parents=True)
        
        # Copy source
        source_dst = export_path / "source"
        shutil.copytree(app.source_dir, source_dst)
        
        # Copy build if available
        if include_build and app.build_dir:
            build_dst = export_path / "build"
            shutil.copytree(app.build_dir, build_dst)
        
        # Create manifest
        manifest = {
            "pid": app.pid,
            "name": app.name,
            "description": app.description,
            "app_type": app.app_type.value,
            "version": app.version,
            "created_at": app.created_at.isoformat(),
            "exported_at": datetime.utcnow().isoformat(),
            "tags": app.tags,
            "metadata": app.metadata
        }
        
        with open(export_path / "manifest.json", 'w') as f:
            json.dump(manifest, f, indent=2)
        
        # Create deployment scripts
        self._create_deploy_scripts(export_path, app)
        
        # Create README
        self._create_readme(export_path, app)
        
        # Create ZIP
        zip_path = self.export_dir / f"{app.pid}-standalone.zip"
        shutil.make_archive(
            str(zip_path).replace('.zip', ''),
            'zip',
            str(export_path)
        )
        
        return str(zip_path)
    
    def _create_deploy_scripts(self, export_path: Path, app: App):
        """Create deployment scripts for various platforms"""
        scripts_dir = export_path / "deploy-scripts"
        scripts_dir.mkdir(exist_ok=True)
        
        # Cloudflare Pages
        with open(scripts_dir / "deploy-cloudflare.sh", 'w') as f:
            f.write(f"""#!/bin/bash
# Deploy to Cloudflare Pages
# Prerequisites: npm install -g wrangler && wrangler login

cd source
npm install
npm run build
wrangler pages deploy dist --project-name={app.name.lower().replace(' ', '-')}
""")
        
        # Vercel
        with open(scripts_dir / "deploy-vercel.sh", 'w') as f:
            f.write(f"""#!/bin/bash
# Deploy to Vercel
# Prerequisites: npm install -g vercel && vercel login

cd source
vercel --prod
""")
        
        # Netlify
        with open(scripts_dir / "deploy-netlify.sh", 'w') as f:
            f.write(f"""#!/bin/bash
# Deploy to Netlify
# Prerequisites: npm install -g netlify-cli && netlify login

cd source
npm install
npm run build
netlify deploy --prod --dir=dist
""")
        
        # GitHub Pages
        with open(scripts_dir / "deploy-github-pages.sh", 'w') as f:
            f.write(f"""#!/bin/bash
# Deploy to GitHub Pages
# Prerequisites: gh auth login

cd source
npm install
npm run build
gh-pages -d dist
""")
        
        # Docker
        with open(scripts_dir / "Dockerfile", 'w') as f:
            if app.app_type in [AppType.NODEJS, AppType.REACT, AppType.NEXTJS]:
                f.write(f"""FROM node:20-alpine
WORKDIR /app
COPY source/package*.json ./
RUN npm install
COPY source/ .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
""")
            elif app.app_type in [AppType.PYTHON, AppType.FASTAPI, AppType.FLASK]:
                f.write(f"""FROM python:3.11-slim
WORKDIR /app
COPY source/requirements.txt .
RUN pip install -r requirements.txt
COPY source/ .
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
""")
    
    def _create_readme(self, export_path: Path, app: App):
        """Create README for standalone package"""
        readme = f"""# {app.name}

{app.description}

## Product Information

- **PID**: {app.pid}
- **Type**: {app.app_type.value}
- **Version**: {app.version}
- **Created**: {app.created_at.strftime('%Y-%m-%d %H:%M:%S')}

## Quick Start

### Local Development

```bash
cd source
npm install  # or pip install -r requirements.txt
npm run dev  # or python main.py
```

### Deployment

Choose your preferred platform:

- **Cloudflare Pages**: `./deploy-scripts/deploy-cloudflare.sh`
- **Vercel**: `./deploy-scripts/deploy-vercel.sh`
- **Netlify**: `./deploy-scripts/deploy-netlify.sh`
- **GitHub Pages**: `./deploy-scripts/deploy-github-pages.sh`
- **Docker**: `docker build -f deploy-scripts/Dockerfile -t {app.name.lower()} .`

## Generated by Infinity Worker

This application was generated and exported by Infinity Worker v5.5.
Visit https://infinity-worker.onrender.com for more information.
"""
        
        with open(export_path / "README.md", 'w') as f:
            f.write(readme)


class AppFactory:
    """Main App Factory orchestrator"""
    
    def __init__(self):
        self.registry = AppRegistry()
        self.build_system = BuildSystem()
        self.hosting = InternalHosting()
        self.github = GitHubIntegration()
        self.disconnect = ModularDisconnect()
    
    async def create_app(
        self,
        name: str,
        description: str,
        source_files: Dict[str, str],
        app_type: Optional[AppType] = None,
        tags: List[str] = None
    ) -> App:
        """Create a new application from source files"""
        # Generate PID
        pid = self.registry.generate_pid(name)
        
        # Create source directory
        source_dir = Path(f"/tmp/infinity-apps/{pid}/source")
        source_dir.mkdir(parents=True, exist_ok=True)
        
        # Write source files
        for filename, content in source_files.items():
            file_path = source_dir / filename
            file_path.parent.mkdir(parents=True, exist_ok=True)
            with open(file_path, 'w') as f:
                f.write(content)
        
        # Detect app type if not specified
        if not app_type:
            app_type = self.build_system.detect_app_type(str(source_dir))
        
        # Create app entity
        app = App(
            pid=pid,
            name=name,
            description=description,
            app_type=app_type,
            status=AppStatus.CREATED,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
            source_dir=str(source_dir),
            tags=tags or []
        )
        
        # Register app
        self.registry.register(app)
        
        return app
    
    async def build_app(self, pid: str) -> BuildResult:
        """Build an application"""
        app = self.registry.get(pid)
        if not app:
            raise ValueError(f"App not found: {pid}")
        
        # Update status
        self.registry.update(pid, status=AppStatus.BUILDING)
        
        # Build
        result = await self.build_system.build(app)
        
        # Update app with build info
        if result.success:
            self.registry.update(
                pid,
                status=AppStatus.READY,
                build_dir=result.build_dir
            )
        else:
            self.registry.update(pid, status=AppStatus.BUILD_FAILED)
        
        return result
    
    async def host_app(self, pid: str) -> HostingInfo:
        """Start hosting an application"""
        app = self.registry.get(pid)
        if not app:
            raise ValueError(f"App not found: {pid}")
        
        if app.status not in [AppStatus.READY, AppStatus.HOSTING]:
            raise ValueError(f"App must be built before hosting. Current status: {app.status.value}")
        
        hosting_info = await self.hosting.start_hosting(app)
        self.registry.update(pid, status=AppStatus.HOSTING, hosting=hosting_info)
        
        return hosting_info
    
    async def deploy_to_github(
        self,
        pid: str,
        repo_name: Optional[str] = None,
        private: bool = True
    ) -> GitHubRepo:
        """Deploy app to a new GitHub repository"""
        app = self.registry.get(pid)
        if not app:
            raise ValueError(f"App not found: {pid}")
        
        # Create repo
        repo_name = repo_name or app.name.lower().replace(' ', '-')
        repo = await self.github.create_repository(
            name=repo_name,
            description=app.description,
            private=private
        )
        
        # Push code
        await self.github.push_to_repository(
            source_dir=app.source_dir,
            repo_url=repo.clone_url
        )
        
        # Update app
        self.registry.update(
            pid,
            status=AppStatus.DEPLOYED,
            github_repo=repo,
            deploy_target=DeployTarget.GITHUB_PAGES,
            deploy_url=repo.url
        )
        
        return repo
    
    async def disconnect_app(self, pid: str) -> str:
        """Disconnect app as standalone package"""
        app = self.registry.get(pid)
        if not app:
            raise ValueError(f"App not found: {pid}")
        
        # Stop hosting if running
        if app.status == AppStatus.HOSTING:
            await self.hosting.stop_hosting(pid)
        
        # Export standalone
        export_path = self.disconnect.export_standalone(app)
        
        # Update status
        self.registry.update(pid, status=AppStatus.DISCONNECTED)
        
        return export_path
    
    def get_app(self, pid: str) -> Optional[App]:
        """Get an application by PID"""
        return self.registry.get(pid)
    
    def list_apps(self, status: Optional[AppStatus] = None) -> List[App]:
        """List all applications"""
        return self.registry.list_all(status)
    
    def get_status(self) -> Dict:
        """Get factory status"""
        apps = self.registry.list_all()
        return {
            "total_apps": len(apps),
            "by_status": {
                status.value: len([a for a in apps if a.status == status])
                for status in AppStatus
            },
            "by_type": {
                app_type.value: len([a for a in apps if a.app_type == app_type])
                for app_type in AppType
            },
            "hosted_count": len(self.hosting.hosted_apps),
            "available": True
        }


# Global instance
app_factory = AppFactory()
