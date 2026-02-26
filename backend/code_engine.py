"""
Infinity OS — Code Generation Engine
Adapted from infinity-worker v5.0
AI-Powered Code Generation with Phase-based Development

Features:
- Multi-language code generation (Python, JavaScript, TypeScript, React, etc.)
- Phase-based generation (Planning → Foundation → Core → Styling → Integration → Optimization)
- Template-based project scaffolding
- AI-powered code completion and refactoring
- File system management
- Git integration ready
"""

import os
import json
import asyncio
import aiohttp
import hashlib
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any, Tuple
from enum import Enum
from dataclasses import dataclass, field
from pathlib import Path
import tempfile
import shutil
import zipfile
import io

from pydantic import BaseModel, Field

# ============================================================================
# ENUMS & CONSTANTS
# ============================================================================

class Language(str, Enum):
    """Supported programming languages"""
    PYTHON = "python"
    JAVASCRIPT = "javascript"
    TYPESCRIPT = "typescript"
    REACT = "react"
    NEXTJS = "nextjs"
    FASTAPI = "fastapi"
    HTML = "html"
    CSS = "css"
    SQL = "sql"
    RUST = "rust"
    GO = "go"

class ProjectType(str, Enum):
    """Project template types"""
    REACT_APP = "react_app"
    NEXTJS_APP = "nextjs_app"
    FASTAPI_BACKEND = "fastapi_backend"
    FULL_STACK = "full_stack"
    STATIC_SITE = "static_site"
    API_ONLY = "api_only"
    LIBRARY = "library"

class GenerationPhase(str, Enum):
    """Code generation phases (VibeSDK-inspired)"""
    PLANNING = "planning"
    FOUNDATION = "foundation"
    CORE = "core"
    STYLING = "styling"
    INTEGRATION = "integration"
    OPTIMIZATION = "optimization"
    TESTING = "testing"
    DOCUMENTATION = "documentation"

# ============================================================================
# DATA MODELS
# ============================================================================

class FileNode(BaseModel):
    """Represents a file in the project"""
    path: str
    content: str
    language: Optional[Language] = None
    is_binary: bool = False
    size: int = 0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    modified_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    checksum: Optional[str] = None

class ProjectStructure(BaseModel):
    """Project file structure"""
    name: str
    type: ProjectType
    files: Dict[str, FileNode] = Field(default_factory=dict)
    dependencies: Dict[str, str] = Field(default_factory=dict)
    dev_dependencies: Dict[str, str] = Field(default_factory=dict)
    scripts: Dict[str, str] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    version: str = "1.0.0"

class CodeGenerationRequest(BaseModel):
    """Request for code generation"""
    description: str = Field(..., min_length=10, max_length=10000)
    project_type: ProjectType = ProjectType.REACT_APP
    language: Language = Language.TYPESCRIPT
    features: List[str] = Field(default_factory=list)
    style_preferences: Dict[str, Any] = Field(default_factory=dict)
    include_tests: bool = True
    include_docs: bool = True
    target_phase: Optional[GenerationPhase] = None

class CodeGenerationResponse(BaseModel):
    """Response from code generation"""
    project_id: str
    project_name: str
    files: List[FileNode]
    current_phase: GenerationPhase
    phases_completed: List[GenerationPhase]
    total_files: int
    total_lines: int
    estimated_tokens: int
    generation_time: float
    ai_model_used: str
    preview_url: Optional[str] = None

class RefactorRequest(BaseModel):
    """Request for code refactoring"""
    file_path: str
    code: str
    refactor_type: str  # rename, extract_function, inline, optimize
    target: Optional[str] = None
    new_name: Optional[str] = None

class CompletionRequest(BaseModel):
    """Request for code completion"""
    file_path: str
    code: str
    cursor_position: int
    language: Language
    context_files: List[str] = Field(default_factory=list)

# ============================================================================
# PROJECT TEMPLATES
# ============================================================================

PROJECT_TEMPLATES = {
    ProjectType.REACT_APP: {
        "package.json": {
            "name": "{{project_name}}",
            "version": "1.0.0",
            "private": True,
            "scripts": {
                "dev": "vite",
                "build": "vite build",
                "preview": "vite preview",
                "lint": "eslint src --ext .ts,.tsx",
                "test": "vitest"
            },
            "dependencies": {
                "react": "^18.2.0",
                "react-dom": "^18.2.0"
            },
            "devDependencies": {
                "@types/react": "^18.2.0",
                "@types/react-dom": "^18.2.0",
                "@vitejs/plugin-react": "^4.0.0",
                "typescript": "^5.0.0",
                "vite": "^5.0.0",
                "tailwindcss": "^3.4.0",
                "autoprefixer": "^10.4.0",
                "postcss": "^8.4.0"
            }
        },
        "vite.config.ts": '''import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true
  }
})
''',
        "tailwind.config.js": '''/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
}
''',
        "tsconfig.json": {
            "compilerOptions": {
                "target": "ES2020",
                "useDefineForClassFields": True,
                "lib": ["ES2020", "DOM", "DOM.Iterable"],
                "module": "ESNext",
                "skipLibCheck": True,
                "moduleResolution": "bundler",
                "allowImportingTsExtensions": True,
                "resolveJsonModule": True,
                "isolatedModules": True,
                "noEmit": True,
                "jsx": "react-jsx",
                "strict": True,
                "noUnusedLocals": True,
                "noUnusedParameters": True,
                "noFallthroughCasesInSwitch": True
            },
            "include": ["src"],
            "references": [{"path": "./tsconfig.node.json"}]
        },
        "index.html": '''<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{{project_name}}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
''',
        "src/main.tsx": '''import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
''',
        "src/index.css": '''@tailwind base;
@tailwind components;
@tailwind utilities;
''',
        "src/App.tsx": '''import { useState } from 'react'

function App() {
  const [count, setCount] = useState(0)

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 text-white">
      <div className="container mx-auto px-4 py-16">
        <h1 className="text-4xl font-bold text-center mb-8">
          {{project_name}}
        </h1>
        <div className="flex justify-center">
          <button
            onClick={() => setCount(c => c + 1)}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold transition-colors"
          >
            Count: {count}
          </button>
        </div>
      </div>
    </div>
  )
}

export default App
'''
    },
    
    ProjectType.FASTAPI_BACKEND: {
        "requirements.txt": '''fastapi>=0.104.0
uvicorn[standard]>=0.24.0
pydantic>=2.5.0
python-dotenv>=1.0.0
httpx>=0.25.0
sqlalchemy>=2.0.0
alembic>=1.12.0
python-jose[cryptography]>=3.3.0
passlib[bcrypt]>=1.7.4
''',
        "main.py": '''"""
{{project_name}} - FastAPI Backend
Generated by Infinity Admin Runner
"""

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import os

app = FastAPI(
    title="{{project_name}}",
    description="API generated by Infinity Admin Runner",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class Item(BaseModel):
    id: Optional[int] = None
    name: str
    description: Optional[str] = None

items_db: List[Item] = []

@app.get("/")
async def root():
    return {"message": "Welcome to {{project_name}}"}

@app.get("/health")
async def health():
    return {"status": "healthy"}

@app.get("/items", response_model=List[Item])
async def get_items():
    return items_db

@app.post("/items", response_model=Item)
async def create_item(item: Item):
    item.id = len(items_db) + 1
    items_db.append(item)
    return item

@app.get("/items/{item_id}", response_model=Item)
async def get_item(item_id: int):
    for item in items_db:
        if item.id == item_id:
            return item
    raise HTTPException(status_code=404, detail="Item not found")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
''',
        "Dockerfile": '''FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
''',
        ".env.example": '''DATABASE_URL=sqlite:///./app.db
SECRET_KEY=your-secret-key-here
DEBUG=false
'''
    },
    
    ProjectType.NEXTJS_APP: {
        "package.json": {
            "name": "{{project_name}}",
            "version": "1.0.0",
            "private": True,
            "scripts": {
                "dev": "next dev",
                "build": "next build",
                "start": "next start",
                "lint": "next lint"
            },
            "dependencies": {
                "next": "^14.0.0",
                "react": "^18.2.0",
                "react-dom": "^18.2.0"
            },
            "devDependencies": {
                "@types/node": "^20.0.0",
                "@types/react": "^18.2.0",
                "@types/react-dom": "^18.2.0",
                "typescript": "^5.0.0",
                "tailwindcss": "^3.4.0",
                "autoprefixer": "^10.4.0",
                "postcss": "^8.4.0"
            }
        },
        "next.config.js": '''/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
}

module.exports = nextConfig
''',
        "tailwind.config.js": '''/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
''',
        "app/layout.tsx": '''import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '{{project_name}}',
  description: 'Generated by Infinity Admin Runner',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
''',
        "app/page.tsx": '''export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 text-white">
      <div className="container mx-auto px-4 py-16">
        <h1 className="text-4xl font-bold text-center mb-8">
          {{project_name}}
        </h1>
        <p className="text-center text-gray-400">
          Built with Next.js and Infinity Admin Runner
        </p>
      </div>
    </main>
  )
}
''',
        "app/globals.css": '''@tailwind base;
@tailwind components;
@tailwind utilities;
'''
    }
}

# ============================================================================
# CODE GENERATION ENGINE
# ============================================================================

class CodeGenerationEngine:
    """AI-powered code generation engine"""
    
    def __init__(self, ai_client=None):
        self.ai_client = ai_client
        self.projects: Dict[str, ProjectStructure] = {}
        self.generation_history: List[Dict] = []
        
    async def generate_project(
        self,
        request: CodeGenerationRequest,
        ai_provider: str = "gemini"
    ) -> CodeGenerationResponse:
        """Generate a complete project from description"""
        
        start_time = datetime.now(timezone.utc)
        project_id = hashlib.md5(
            f"{request.description}{datetime.now().isoformat()}".encode()
        ).hexdigest()[:12]
        
        # Sanitize project name from description
        project_name = self._sanitize_project_name(request.description)
        
        # Get base template
        template = PROJECT_TEMPLATES.get(request.project_type, {})
        
        # Generate files from template
        files = []
        for file_path, content in template.items():
            if isinstance(content, dict):
                content = json.dumps(content, indent=2)
            
            # Replace template variables
            content = content.replace("{{project_name}}", project_name)
            
            file_node = FileNode(
                path=file_path,
                content=content,
                language=self._detect_language(file_path),
                size=len(content),
                checksum=hashlib.md5(content.encode()).hexdigest()
            )
            files.append(file_node)
        
        # Generate AI-enhanced code based on description
        if self.ai_client and request.description:
            ai_files = await self._generate_ai_code(request, project_name)
            files.extend(ai_files)
        
        # Create project structure
        project = ProjectStructure(
            name=project_name,
            type=request.project_type,
            files={f.path: f for f in files}
        )
        self.projects[project_id] = project
        
        # Calculate metrics
        total_lines = sum(f.content.count('\n') + 1 for f in files)
        total_chars = sum(len(f.content) for f in files)
        
        generation_time = (datetime.now(timezone.utc) - start_time).total_seconds()
        
        return CodeGenerationResponse(
            project_id=project_id,
            project_name=project_name,
            files=files,
            current_phase=GenerationPhase.CORE,
            phases_completed=[GenerationPhase.PLANNING, GenerationPhase.FOUNDATION, GenerationPhase.CORE],
            total_files=len(files),
            total_lines=total_lines,
            estimated_tokens=total_chars // 4,
            generation_time=generation_time,
            ai_model_used=ai_provider
        )
    
    async def _generate_ai_code(
        self,
        request: CodeGenerationRequest,
        project_name: str
    ) -> List[FileNode]:
        """Generate additional code using AI"""
        
        files = []
        
        # Generate README
        readme_content = f"""# {project_name}

{request.description}

## Features

{chr(10).join(f'- {feature}' for feature in request.features) if request.features else '- Core functionality'}

## Getting Started

### Prerequisites

- Node.js 18+ (for frontend)
- Python 3.11+ (for backend)

### Installation

```bash
# Install dependencies
npm install  # or pnpm install

# Start development server
npm run dev
```

## Project Structure

```
{project_name}/
├── src/
│   ├── components/
│   ├── pages/
│   └── styles/
├── public/
├── package.json
└── README.md
```

## Built With

- Generated by [Infinity Admin Runner](https://github.com/Trancendos/infinity-worker)
- Powered by AI

## License

MIT
"""
        files.append(FileNode(
            path="README.md",
            content=readme_content,
            language=None,
            size=len(readme_content),
            checksum=hashlib.md5(readme_content.encode()).hexdigest()
        ))
        
        # Generate .gitignore
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
*.swo

# OS
.DS_Store
Thumbs.db

# Logs
*.log
npm-debug.log*

# Testing
coverage/
.pytest_cache/
"""
        files.append(FileNode(
            path=".gitignore",
            content=gitignore_content,
            language=None,
            size=len(gitignore_content),
            checksum=hashlib.md5(gitignore_content.encode()).hexdigest()
        ))
        
        return files
    
    def _sanitize_project_name(self, description: str) -> str:
        """Convert description to valid project name"""
        import re
        # Take first few words
        words = description.split()[:3]
        name = "-".join(words).lower()
        # Remove special characters
        name = re.sub(r'[^a-z0-9-]', '', name)
        # Limit length
        return name[:30] or "my-project"
    
    def _detect_language(self, file_path: str) -> Optional[Language]:
        """Detect language from file extension"""
        ext_map = {
            ".py": Language.PYTHON,
            ".js": Language.JAVASCRIPT,
            ".ts": Language.TYPESCRIPT,
            ".tsx": Language.REACT,
            ".jsx": Language.REACT,
            ".html": Language.HTML,
            ".css": Language.CSS,
            ".sql": Language.SQL,
            ".rs": Language.RUST,
            ".go": Language.GO
        }
        ext = Path(file_path).suffix.lower()
        return ext_map.get(ext)
    
    async def get_completion(
        self,
        request: CompletionRequest
    ) -> List[Dict[str, Any]]:
        """Get AI-powered code completions"""
        
        # Basic completions based on context
        completions = []
        
        code_before_cursor = request.code[:request.cursor_position]
        last_line = code_before_cursor.split('\n')[-1]
        
        # Simple keyword completions
        if request.language in [Language.PYTHON, Language.FASTAPI]:
            if last_line.strip().startswith("def "):
                completions.append({
                    "label": "function_template",
                    "insertText": "function_name(self):\n    pass",
                    "kind": "function"
                })
            elif last_line.strip().startswith("class "):
                completions.append({
                    "label": "class_template",
                    "insertText": "ClassName:\n    def __init__(self):\n        pass",
                    "kind": "class"
                })
        
        elif request.language in [Language.TYPESCRIPT, Language.JAVASCRIPT, Language.REACT]:
            if "import" in last_line:
                completions.append({
                    "label": "import_react",
                    "insertText": "import React from 'react'",
                    "kind": "module"
                })
            elif last_line.strip().startswith("const "):
                completions.append({
                    "label": "arrow_function",
                    "insertText": "functionName = () => {\n  \n}",
                    "kind": "function"
                })
        
        return completions
    
    async def refactor_code(
        self,
        request: RefactorRequest
    ) -> Dict[str, Any]:
        """Refactor code using AI"""
        
        result = {
            "original": request.code,
            "refactored": request.code,
            "changes": [],
            "success": True
        }
        
        if request.refactor_type == "rename" and request.target and request.new_name:
            # Simple rename refactoring
            result["refactored"] = request.code.replace(request.target, request.new_name)
            result["changes"].append({
                "type": "rename",
                "from": request.target,
                "to": request.new_name,
                "occurrences": request.code.count(request.target)
            })
        
        return result
    
    def export_project_zip(self, project_id: str) -> bytes:
        """Export project as ZIP file"""
        
        project = self.projects.get(project_id)
        if not project:
            raise ValueError(f"Project {project_id} not found")
        
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
            for file_path, file_node in project.files.items():
                zf.writestr(f"{project.name}/{file_path}", file_node.content)
        
        zip_buffer.seek(0)
        return zip_buffer.getvalue()


# ============================================================================
# FILE SYSTEM MANAGER
# ============================================================================

class FileSystemManager:
    """Virtual file system for project management"""
    
    def __init__(self, base_path: str = "/tmp/infinity-projects"):
        self.base_path = Path(base_path)
        self.base_path.mkdir(parents=True, exist_ok=True)
        self.open_files: Dict[str, str] = {}  # path -> content
    
    def create_project_directory(self, project_id: str) -> Path:
        """Create a directory for a project"""
        project_path = self.base_path / project_id
        project_path.mkdir(parents=True, exist_ok=True)
        return project_path
    
    def write_file(self, project_id: str, file_path: str, content: str) -> bool:
        """Write a file to the project"""
        try:
            full_path = self.base_path / project_id / file_path
            full_path.parent.mkdir(parents=True, exist_ok=True)
            full_path.write_text(content)
            return True
        except Exception as e:
            return False
    
    def read_file(self, project_id: str, file_path: str) -> Optional[str]:
        """Read a file from the project"""
        try:
            full_path = self.base_path / project_id / file_path
            return full_path.read_text()
        except Exception:
            return None
    
    def delete_file(self, project_id: str, file_path: str) -> bool:
        """Delete a file from the project"""
        try:
            full_path = self.base_path / project_id / file_path
            full_path.unlink()
            return True
        except Exception:
            return False
    
    def list_files(self, project_id: str) -> List[str]:
        """List all files in a project"""
        project_path = self.base_path / project_id
        if not project_path.exists():
            return []
        
        files = []
        for path in project_path.rglob("*"):
            if path.is_file():
                files.append(str(path.relative_to(project_path)))
        return files
    
    def get_file_tree(self, project_id: str) -> Dict:
        """Get file tree structure"""
        project_path = self.base_path / project_id
        if not project_path.exists():
            return {}
        
        def build_tree(path: Path) -> Dict:
            tree = {}
            for item in sorted(path.iterdir()):
                if item.is_dir():
                    tree[item.name] = {
                        "type": "directory",
                        "children": build_tree(item)
                    }
                else:
                    tree[item.name] = {
                        "type": "file",
                        "size": item.stat().st_size
                    }
            return tree
        
        return build_tree(project_path)


# Singleton instances
code_engine = CodeGenerationEngine()
file_manager = FileSystemManager()

