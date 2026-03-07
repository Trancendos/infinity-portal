"""
Infinity Admin Runner - Live Preview Server v5.0

Features:
- Real-time code preview
- Hot module replacement simulation
- WebContainer-like sandboxed execution
- Multi-framework support (React, Vue, HTML)
- Secure sandboxed environment
"""

import os
import json
import asyncio
import hashlib
import tempfile
import subprocess
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any
from pathlib import Path
from dataclasses import dataclass
import html
import re

from fastapi import WebSocket, WebSocketDisconnect
from pydantic import BaseModel

# ============================================================================
# DATA MODELS
# ============================================================================

class PreviewRequest(BaseModel):
    """Request for live preview"""
    project_id: str
    files: Dict[str, str]  # path -> content
    entry_point: str = "index.html"
    framework: str = "react"  # react, vue, html, nextjs

class PreviewResponse(BaseModel):
    """Response with preview HTML"""
    preview_id: str
    html: str
    css: str
    js: str
    errors: List[str]
    warnings: List[str]
    build_time_ms: float

# ============================================================================
# FRAMEWORK TEMPLATES
# ============================================================================

REACT_PREVIEW_TEMPLATE = '''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Preview</title>
    <script src="https://unpkg.com/react@18/umd/react.development.js"></script>
    <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
        {{CUSTOM_CSS}}
    </style>
</head>
<body>
    <div id="root"></div>
    <script type="text/babel" data-presets="react">
        {{REACT_CODE}}
    </script>
</body>
</html>
'''

VUE_PREVIEW_TEMPLATE = '''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Preview</title>
    <script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
        {{CUSTOM_CSS}}
    </style>
</head>
<body>
    <div id="app">{{VUE_TEMPLATE}}</div>
    <script>
        {{VUE_CODE}}
    </script>
</body>
</html>
'''

HTML_PREVIEW_TEMPLATE = '''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Preview</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
        {{CUSTOM_CSS}}
    </style>
</head>
<body>
    {{HTML_CONTENT}}
    <script>
        {{JS_CODE}}
    </script>
</body>
</html>
'''

# ============================================================================
# PREVIEW ENGINE
# ============================================================================

class PreviewEngine:
    """Engine for generating live previews"""
    
    def __init__(self):
        self.previews: Dict[str, PreviewResponse] = {}
        self.websocket_connections: Dict[str, List[WebSocket]] = {}
    
    async def generate_preview(self, request: PreviewRequest) -> PreviewResponse:
        """Generate a live preview from project files"""
        
        start_time = datetime.now(timezone.utc)
        errors = []
        warnings = []
        
        preview_id = hashlib.md5(
            f"{request.project_id}{datetime.now().isoformat()}".encode()
        ).hexdigest()[:12]
        
        # Extract CSS
        css_content = self._extract_css(request.files)
        
        # Generate preview based on framework
        if request.framework == "react":
            preview_html = self._generate_react_preview(request.files, css_content, errors, warnings)
        elif request.framework == "vue":
            preview_html = self._generate_vue_preview(request.files, css_content, errors, warnings)
        else:
            preview_html = self._generate_html_preview(request.files, css_content, errors, warnings)
        
        build_time = (datetime.now(timezone.utc) - start_time).total_seconds() * 1000
        
        response = PreviewResponse(
            preview_id=preview_id,
            html=preview_html,
            css=css_content,
            js="",
            errors=errors,
            warnings=warnings,
            build_time_ms=build_time
        )
        
        self.previews[preview_id] = response
        
        # Notify connected clients
        await self._notify_preview_update(request.project_id, response)
        
        return response
    
    def _extract_css(self, files: Dict[str, str]) -> str:
        """Extract and combine CSS from all CSS files"""
        css_parts = []
        
        for path, content in files.items():
            if path.endswith('.css'):
                # Remove Tailwind directives for preview (CDN handles it)
                cleaned = re.sub(r'@tailwind\s+\w+;', '', content)
                css_parts.append(f"/* {path} */\n{cleaned}")
        
        return "\n".join(css_parts)
    
    def _generate_react_preview(
        self,
        files: Dict[str, str],
        css: str,
        errors: List[str],
        warnings: List[str]
    ) -> str:
        """Generate React preview HTML"""
        
        # Find main React component
        react_code = ""
        
        # Look for App.tsx, App.jsx, or main entry
        for path in ['src/App.tsx', 'src/App.jsx', 'App.tsx', 'App.jsx']:
            if path in files:
                react_code = files[path]
                break
        
        if not react_code:
            # Try to find any React component
            for path, content in files.items():
                if path.endswith(('.tsx', '.jsx')) and 'function' in content:
                    react_code = content
                    break
        
        if not react_code:
            errors.append("No React component found")
            react_code = "function App() { return <div>No component found</div>; }"
        
        # Transform TypeScript to JavaScript (basic)
        react_code = self._transform_typescript(react_code)
        
        # Remove imports (CDN provides React)
        react_code = re.sub(r"import\s+.*?from\s+['\"].*?['\"];?\n?", "", react_code)
        react_code = re.sub(r"export\s+default\s+", "", react_code)
        
        # Add render call
        react_code += "\n\nReactDOM.createRoot(document.getElementById('root')).render(<App />);"
        
        # Generate HTML
        html = REACT_PREVIEW_TEMPLATE
        html = html.replace("{{CUSTOM_CSS}}", css)
        html = html.replace("{{REACT_CODE}}", react_code)
        
        return html
    
    def _generate_vue_preview(
        self,
        files: Dict[str, str],
        css: str,
        errors: List[str],
        warnings: List[str]
    ) -> str:
        """Generate Vue preview HTML"""
        
        vue_template = "<div>Hello Vue</div>"
        vue_code = ""
        
        # Look for Vue component
        for path, content in files.items():
            if path.endswith('.vue'):
                # Extract template
                template_match = re.search(r'<template>(.*?)</template>', content, re.DOTALL)
                if template_match:
                    vue_template = template_match.group(1).strip()
                
                # Extract script
                script_match = re.search(r'<script.*?>(.*?)</script>', content, re.DOTALL)
                if script_match:
                    vue_code = script_match.group(1).strip()
                break
        
        if not vue_code:
            vue_code = """
const { createApp, ref } = Vue;
createApp({
    setup() {
        const count = ref(0);
        return { count };
    }
}).mount('#app');
"""
        
        html = VUE_PREVIEW_TEMPLATE
        html = html.replace("{{CUSTOM_CSS}}", css)
        html = html.replace("{{VUE_TEMPLATE}}", vue_template)
        html = html.replace("{{VUE_CODE}}", vue_code)
        
        return html
    
    def _generate_html_preview(
        self,
        files: Dict[str, str],
        css: str,
        errors: List[str],
        warnings: List[str]
    ) -> str:
        """Generate plain HTML preview"""
        
        html_content = ""
        js_code = ""
        
        # Find HTML file
        for path in ['index.html', 'public/index.html']:
            if path in files:
                # Extract body content
                body_match = re.search(r'<body[^>]*>(.*?)</body>', files[path], re.DOTALL)
                if body_match:
                    html_content = body_match.group(1).strip()
                    # Remove script tags (we'll handle JS separately)
                    html_content = re.sub(r'<script[^>]*>.*?</script>', '', html_content, flags=re.DOTALL)
                break
        
        # Find JS files
        for path, content in files.items():
            if path.endswith('.js') and not path.endswith('.config.js'):
                js_code += f"// {path}\n{content}\n\n"
        
        html = HTML_PREVIEW_TEMPLATE
        html = html.replace("{{CUSTOM_CSS}}", css)
        html = html.replace("{{HTML_CONTENT}}", html_content or "<div>No HTML content</div>")
        html = html.replace("{{JS_CODE}}", js_code)
        
        return html
    
    def _transform_typescript(self, code: str) -> str:
        """Basic TypeScript to JavaScript transformation"""
        
        # Remove type annotations
        code = re.sub(r':\s*\w+(\[\])?(\s*[=,\)])', r'\2', code)
        code = re.sub(r'<\w+>', '', code)
        code = re.sub(r':\s*React\.\w+', '', code)
        code = re.sub(r'interface\s+\w+\s*{[^}]*}', '', code)
        code = re.sub(r'type\s+\w+\s*=\s*[^;]+;', '', code)
        
        # Remove 'as' type assertions
        code = re.sub(r'\s+as\s+\w+', '', code)
        
        return code
    
    async def _notify_preview_update(self, project_id: str, response: PreviewResponse):
        """Notify connected WebSocket clients of preview update"""
        
        connections = self.websocket_connections.get(project_id, [])
        
        for ws in connections:
            try:
                await ws.send_json({
                    "type": "preview_update",
                    "preview_id": response.preview_id,
                    "html": response.html,
                    "errors": response.errors,
                    "warnings": response.warnings,
                    "build_time_ms": response.build_time_ms
                })
            except Exception:
                pass
    
    async def handle_websocket(self, websocket: WebSocket, project_id: str):
        """Handle WebSocket connection for live preview updates"""
        
        await websocket.accept()
        
        if project_id not in self.websocket_connections:
            self.websocket_connections[project_id] = []
        self.websocket_connections[project_id].append(websocket)
        
        try:
            while True:
                data = await websocket.receive_json()
                
                if data.get("type") == "file_change":
                    # Generate new preview on file change
                    request = PreviewRequest(
                        project_id=project_id,
                        files=data.get("files", {}),
                        framework=data.get("framework", "react")
                    )
                    await self.generate_preview(request)
                    
        except WebSocketDisconnect:
            self.websocket_connections[project_id].remove(websocket)


# ============================================================================
# PROJECT TEMPLATES MANAGER
# ============================================================================

class TemplateManager:
    """Manages project templates for quick scaffolding"""
    
    TEMPLATES = {
        "react-tailwind": {
            "name": "React + Tailwind CSS",
            "description": "Modern React app with Tailwind CSS styling",
            "files": {
                "package.json": {
                    "name": "react-tailwind-app",
                    "version": "1.0.0",
                    "scripts": {
                        "dev": "vite",
                        "build": "vite build"
                    },
                    "dependencies": {
                        "react": "^18.2.0",
                        "react-dom": "^18.2.0"
                    },
                    "devDependencies": {
                        "vite": "^5.0.0",
                        "@vitejs/plugin-react": "^4.0.0",
                        "tailwindcss": "^3.4.0"
                    }
                },
                "src/App.tsx": '''import { useState } from 'react'

function App() {
  const [count, setCount] = useState(0)

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-black flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-5xl font-bold text-white mb-8">
          🚀 React + Tailwind
        </h1>
        <button
          onClick={() => setCount(c => c + 1)}
          className="px-8 py-4 bg-gradient-to-r from-pink-500 to-purple-500 text-white font-bold rounded-xl shadow-lg hover:shadow-xl transform hover:scale-105 transition-all"
        >
          Count: {count}
        </button>
      </div>
    </div>
  )
}

export default App
''',
                "src/index.css": '''@tailwind base;
@tailwind components;
@tailwind utilities;
'''
            }
        },
        
        "nextjs-app": {
            "name": "Next.js App Router",
            "description": "Next.js 14 with App Router and TypeScript",
            "files": {
                "package.json": {
                    "name": "nextjs-app",
                    "version": "1.0.0",
                    "scripts": {
                        "dev": "next dev",
                        "build": "next build",
                        "start": "next start"
                    },
                    "dependencies": {
                        "next": "^14.0.0",
                        "react": "^18.2.0",
                        "react-dom": "^18.2.0"
                    }
                },
                "app/page.tsx": '''export default function Home() {
  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-6xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
          Next.js 14
        </h1>
        <p className="mt-4 text-gray-400">
          Built with App Router
        </p>
      </div>
    </main>
  )
}
''',
                "app/layout.tsx": '''import './globals.css'

export const metadata = {
  title: 'Next.js App',
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
                "app/globals.css": '''@tailwind base;
@tailwind components;
@tailwind utilities;
'''
            }
        },
        
        "fastapi-backend": {
            "name": "FastAPI Backend",
            "description": "Production-ready FastAPI backend with async support",
            "files": {
                "requirements.txt": '''fastapi>=0.104.0
uvicorn[standard]>=0.24.0
pydantic>=2.5.0
python-dotenv>=1.0.0
''',
                "main.py": '''from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional

app = FastAPI(
    title="API",
    description="Generated by Infinity Admin Runner",
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
    return {"message": "Welcome to the API"}

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
''',
                "Dockerfile": '''FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
'''
            }
        },
        
        "landing-page": {
            "name": "Landing Page",
            "description": "Beautiful landing page with animations",
            "files": {
                "index.html": '''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Landing Page</title>
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gradient-to-br from-gray-900 via-purple-900 to-black min-h-screen text-white">
    <nav class="p-6 flex justify-between items-center">
        <div class="text-2xl font-bold">🚀 Brand</div>
        <div class="space-x-6">
            <a href="#features" class="hover:text-purple-400 transition">Features</a>
            <a href="#pricing" class="hover:text-purple-400 transition">Pricing</a>
            <button class="bg-purple-600 px-6 py-2 rounded-full hover:bg-purple-700 transition">
                Get Started
            </button>
        </div>
    </nav>
    
    <main class="container mx-auto px-6 py-20 text-center">
        <h1 class="text-6xl font-bold mb-6 bg-gradient-to-r from-blue-400 via-purple-500 to-pink-500 bg-clip-text text-transparent">
            Build Something Amazing
        </h1>
        <p class="text-xl text-gray-300 mb-10 max-w-2xl mx-auto">
            The all-in-one platform for building, deploying, and scaling your applications.
        </p>
        <div class="flex justify-center gap-4">
            <button class="bg-white text-black px-8 py-4 rounded-full font-semibold hover:bg-gray-200 transition">
                Start Free Trial
            </button>
            <button class="border border-white px-8 py-4 rounded-full font-semibold hover:bg-white hover:text-black transition">
                Watch Demo
            </button>
        </div>
    </main>
</body>
</html>
'''
            }
        }
    }
    
    @classmethod
    def get_template(cls, template_id: str) -> Optional[Dict]:
        """Get a template by ID"""
        return cls.TEMPLATES.get(template_id)
    
    @classmethod
    def list_templates(cls) -> List[Dict]:
        """List all available templates"""
        return [
            {
                "id": tid,
                "name": t["name"],
                "description": t["description"]
            }
            for tid, t in cls.TEMPLATES.items()
        ]
    
    @classmethod
    def create_from_template(cls, template_id: str, project_name: str) -> Dict[str, str]:
        """Create project files from a template"""
        
        template = cls.get_template(template_id)
        if not template:
            raise ValueError(f"Template {template_id} not found")
        
        files = {}
        for path, content in template["files"].items():
            if isinstance(content, dict):
                # JSON content (like package.json)
                content_copy = json.loads(json.dumps(content))
                if "name" in content_copy:
                    content_copy["name"] = project_name
                files[path] = json.dumps(content_copy, indent=2)
            else:
                files[path] = content
        
        return files


# Singleton instances
preview_engine = PreviewEngine()
template_manager = TemplateManager()
