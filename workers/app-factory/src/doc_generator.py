"""
Infinity Worker - Documentation Generation System
Auto-generates README, API docs, code comments, and technical documentation
"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime
import json
import re
import os


@dataclass
class FunctionDoc:
    """Documentation for a function/method"""
    name: str
    description: str
    parameters: List[Dict[str, str]]
    returns: Dict[str, str]
    examples: List[str] = field(default_factory=list)
    raises: List[Dict[str, str]] = field(default_factory=list)
    deprecated: bool = False
    since_version: str = "1.0.0"


@dataclass
class ClassDoc:
    """Documentation for a class"""
    name: str
    description: str
    attributes: List[Dict[str, str]]
    methods: List[FunctionDoc]
    examples: List[str] = field(default_factory=list)
    inherits: List[str] = field(default_factory=list)


@dataclass
class APIEndpoint:
    """Documentation for an API endpoint"""
    path: str
    method: str
    summary: str
    description: str
    parameters: List[Dict[str, Any]]
    request_body: Optional[Dict[str, Any]] = None
    responses: Dict[str, Dict[str, Any]] = field(default_factory=dict)
    tags: List[str] = field(default_factory=list)
    auth_required: bool = False
    rate_limit: Optional[str] = None


@dataclass
class ProjectMetadata:
    """Project metadata for documentation"""
    name: str
    description: str
    version: str
    author: str = ""
    license: str = "MIT"
    repository: str = ""
    homepage: str = ""
    keywords: List[str] = field(default_factory=list)
    dependencies: Dict[str, str] = field(default_factory=dict)


class DocumentationGenerator:
    """Generates comprehensive documentation for projects"""
    
    def __init__(self, project: ProjectMetadata):
        self.project = project
        self.endpoints: List[APIEndpoint] = []
        self.classes: List[ClassDoc] = []
        self.functions: List[FunctionDoc] = []
        self.changelog: List[Dict[str, Any]] = []
    
    def add_endpoint(self, endpoint: APIEndpoint) -> None:
        self.endpoints.append(endpoint)
    
    def add_class(self, class_doc: ClassDoc) -> None:
        self.classes.append(class_doc)
    
    def add_function(self, func_doc: FunctionDoc) -> None:
        self.functions.append(func_doc)
    
    def add_changelog_entry(
        self,
        version: str,
        date: str,
        changes: List[Dict[str, str]]
    ) -> None:
        self.changelog.append({
            "version": version,
            "date": date,
            "changes": changes
        })
    
    def generate_readme(self) -> str:
        """Generate comprehensive README.md"""
        readme = f'''# {self.project.name}

{self.project.description}

![Version](https://img.shields.io/badge/version-{self.project.version}-blue.svg)
![License](https://img.shields.io/badge/license-{self.project.license}-green.svg)

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Features](#features)
- [API Reference](#api-reference)
- [Configuration](#configuration)
- [Examples](#examples)
- [Contributing](#contributing)
- [License](#license)

## Installation

```bash
# Clone the repository
git clone {self.project.repository or "https://github.com/your-org/your-repo.git"}

# Install dependencies
npm install  # or pip install -r requirements.txt
```

## Quick Start

```bash
# Start the development server
npm run dev  # or python main.py
```

## Features

'''
        for keyword in self.project.keywords:
            readme += f"- **{keyword.title()}**: Comprehensive {keyword} support\n"
        
        if self.endpoints:
            readme += '''
## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
'''
            for ep in self.endpoints:
                auth = "🔒" if ep.auth_required else ""
                readme += f"| {ep.method} | `{ep.path}` | {ep.summary} {auth} |\n"
        
        readme += f'''
## Configuration

Create a `.env` file with the following variables:

```env
# Required
API_KEY=your-api-key

# Optional
DEBUG=false
PORT=3000
```

## Examples

### Basic Usage

```javascript
import {{ {self.project.name.replace("-", "").replace(" ", "")} }} from '{self.project.name}';

const client = new {self.project.name.replace("-", "").replace(" ", "")}({{
  apiKey: process.env.API_KEY
}});

// Make a request
const result = await client.execute({{
  action: 'example'
}});
```

## Dependencies

| Package | Version | Description |
|---------|---------|-------------|
'''
        for dep, version in self.project.dependencies.items():
            readme += f"| {dep} | {version} | - |\n"
        
        readme += f'''
## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the {self.project.license} License - see the [LICENSE](LICENSE) file for details.

---

Generated by Infinity Worker Documentation Generator
{datetime.now().strftime("%Y-%m-%d %H:%M:%S")}
'''
        return readme
    
    def generate_api_docs(self) -> str:
        """Generate API documentation in Markdown"""
        doc = f'''# API Documentation - {self.project.name}

Version: {self.project.version}
Generated: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}

## Base URL

```
https://api.example.com/v1
```

## Authentication

All authenticated endpoints require a Bearer token:

```
Authorization: Bearer <your-api-key>
```

## Rate Limiting

- Standard: 100 requests/minute
- Premium: 1000 requests/minute

## Endpoints

'''
        # Group endpoints by tag
        by_tag: Dict[str, List[APIEndpoint]] = {}
        for ep in self.endpoints:
            for tag in ep.tags or ["General"]:
                if tag not in by_tag:
                    by_tag[tag] = []
                by_tag[tag].append(ep)
        
        for tag, endpoints in by_tag.items():
            doc += f'''### {tag}

'''
            for ep in endpoints:
                auth_badge = "🔒 **Requires Authentication**" if ep.auth_required else ""
                doc += f'''#### {ep.method} {ep.path}

{ep.summary}

{auth_badge}

{ep.description}

'''
                if ep.parameters:
                    doc += '''**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
'''
                    for param in ep.parameters:
                        required = "✅" if param.get("required") else "❌"
                        doc += f"| {param['name']} | {param.get('type', 'string')} | {required} | {param.get('description', '')} |\n"
                    doc += "\n"
                
                if ep.request_body:
                    doc += f'''**Request Body:**

```json
{json.dumps(ep.request_body.get("example", {}), indent=2)}
```

'''
                
                if ep.responses:
                    doc += "**Responses:**\n\n"
                    for status, response in ep.responses.items():
                        doc += f'''<details>
<summary>{status} - {response.get("description", "")}</summary>

```json
{json.dumps(response.get("example", {}), indent=2)}
```

</details>

'''
                doc += "---\n\n"
        
        return doc
    
    def generate_changelog(self) -> str:
        """Generate CHANGELOG.md"""
        doc = f'''# Changelog

All notable changes to {self.project.name} will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

'''
        for entry in sorted(self.changelog, key=lambda x: x["version"], reverse=True):
            doc += f'''## [{entry["version"]}] - {entry["date"]}

'''
            # Group changes by type
            by_type: Dict[str, List[str]] = {}
            for change in entry["changes"]:
                change_type = change.get("type", "Changed")
                if change_type not in by_type:
                    by_type[change_type] = []
                by_type[change_type].append(change.get("description", ""))
            
            for change_type, changes in by_type.items():
                doc += f"### {change_type}\n\n"
                for change in changes:
                    doc += f"- {change}\n"
                doc += "\n"
        
        return doc
    
    def generate_openapi_spec(self) -> Dict[str, Any]:
        """Generate OpenAPI 3.0 specification"""
        spec = {
            "openapi": "3.0.3",
            "info": {
                "title": self.project.name,
                "description": self.project.description,
                "version": self.project.version,
                "license": {"name": self.project.license}
            },
            "servers": [
                {"url": "https://api.example.com/v1", "description": "Production"},
                {"url": "http://localhost:8000", "description": "Development"}
            ],
            "paths": {},
            "components": {
                "securitySchemes": {
                    "bearerAuth": {
                        "type": "http",
                        "scheme": "bearer"
                    }
                }
            }
        }
        
        for ep in self.endpoints:
            if ep.path not in spec["paths"]:
                spec["paths"][ep.path] = {}
            
            operation = {
                "summary": ep.summary,
                "description": ep.description,
                "tags": ep.tags,
                "responses": {}
            }
            
            if ep.auth_required:
                operation["security"] = [{"bearerAuth": []}]
            
            if ep.parameters:
                operation["parameters"] = [
                    {
                        "name": p["name"],
                        "in": p.get("in", "query"),
                        "required": p.get("required", False),
                        "schema": {"type": p.get("type", "string")},
                        "description": p.get("description", "")
                    }
                    for p in ep.parameters
                ]
            
            if ep.request_body:
                operation["requestBody"] = {
                    "required": True,
                    "content": {
                        "application/json": {
                            "schema": ep.request_body.get("schema", {}),
                            "example": ep.request_body.get("example", {})
                        }
                    }
                }
            
            for status, response in ep.responses.items():
                operation["responses"][status] = {
                    "description": response.get("description", ""),
                    "content": {
                        "application/json": {
                            "example": response.get("example", {})
                        }
                    }
                }
            
            spec["paths"][ep.path][ep.method.lower()] = operation
        
        return spec
    
    def generate_typescript_types(self) -> str:
        """Generate TypeScript type definitions"""
        types = f'''/**
 * Type definitions for {self.project.name}
 * Version: {self.project.version}
 * Generated: {datetime.now().isoformat()}
 */

'''
        for class_doc in self.classes:
            types += f'''/**
 * {class_doc.description}
 */
export interface {class_doc.name} {{
'''
            for attr in class_doc.attributes:
                optional = "?" if not attr.get("required", True) else ""
                types += f'  /** {attr.get("description", "")} */\n'
                types += f'  {attr["name"]}{optional}: {attr.get("type", "unknown")};\n'
            types += "}\n\n"
        
        return types
    
    def generate_jsdoc_comments(self, code: str) -> str:
        """Add JSDoc comments to JavaScript/TypeScript code"""
        # Simple pattern matching for functions
        function_pattern = r'(export\s+)?(async\s+)?function\s+(\w+)\s*\(([^)]*)\)'
        
        def add_jsdoc(match):
            export = match.group(1) or ""
            async_kw = match.group(2) or ""
            func_name = match.group(3)
            params = match.group(4)
            
            jsdoc = f'''/**
 * {func_name.replace("_", " ").title()}
'''
            if params:
                for param in params.split(","):
                    param = param.strip()
                    if param:
                        param_name = param.split(":")[0].strip()
                        jsdoc += f' * @param {{{param_name}}} - Parameter description\n'
            
            jsdoc += f''' * @returns {{Promise<unknown>}} - Return description
 */
{export}{async_kw}function {func_name}({params})'''
            return jsdoc
        
        return re.sub(function_pattern, add_jsdoc, code)
    
    def generate_python_docstrings(self, code: str) -> str:
        """Add docstrings to Python code"""
        # Pattern for function definitions
        function_pattern = r'(def\s+(\w+)\s*\(([^)]*)\)\s*(?:->\s*[^:]+)?:)\s*\n(\s*)'
        
        def add_docstring(match):
            full_def = match.group(1)
            func_name = match.group(2)
            params = match.group(3)
            indent = match.group(4)
            
            docstring = f'{full_def}\n{indent}"""\n{indent}{func_name.replace("_", " ").title()}.\n{indent}\n'
            
            if params:
                docstring += f'{indent}Args:\n'
                for param in params.split(","):
                    param = param.strip()
                    if param and param != "self":
                        param_name = param.split(":")[0].strip()
                        docstring += f'{indent}    {param_name}: Parameter description\n'
            
            docstring += f'{indent}\n{indent}Returns:\n{indent}    Description of return value\n{indent}"""\n{indent}'
            return docstring
        
        return re.sub(function_pattern, add_docstring, code)


class QuickDocGenerator:
    """Quick documentation generation from project files"""
    
    @staticmethod
    def from_package_json(package_json: Dict[str, Any]) -> DocumentationGenerator:
        """Create documentation generator from package.json"""
        project = ProjectMetadata(
            name=package_json.get("name", "Unknown"),
            description=package_json.get("description", ""),
            version=package_json.get("version", "1.0.0"),
            author=package_json.get("author", ""),
            license=package_json.get("license", "MIT"),
            repository=package_json.get("repository", {}).get("url", ""),
            homepage=package_json.get("homepage", ""),
            keywords=package_json.get("keywords", []),
            dependencies={
                **package_json.get("dependencies", {}),
                **package_json.get("devDependencies", {})
            }
        )
        return DocumentationGenerator(project)
    
    @staticmethod
    def from_pyproject_toml(pyproject: Dict[str, Any]) -> DocumentationGenerator:
        """Create documentation generator from pyproject.toml"""
        project_data = pyproject.get("project", pyproject.get("tool", {}).get("poetry", {}))
        project = ProjectMetadata(
            name=project_data.get("name", "Unknown"),
            description=project_data.get("description", ""),
            version=project_data.get("version", "1.0.0"),
            author=", ".join(project_data.get("authors", [])),
            license=project_data.get("license", "MIT"),
            keywords=project_data.get("keywords", []),
            dependencies=project_data.get("dependencies", {})
        )
        return DocumentationGenerator(project)


def generate_project_documentation(
    project_name: str,
    project_description: str,
    version: str = "1.0.0",
    endpoints: List[Dict[str, Any]] = None,
    dependencies: Dict[str, str] = None
) -> Dict[str, str]:
    """Generate complete documentation package for a project"""
    
    project = ProjectMetadata(
        name=project_name,
        description=project_description,
        version=version,
        dependencies=dependencies or {}
    )
    
    generator = DocumentationGenerator(project)
    
    # Add endpoints if provided
    if endpoints:
        for ep in endpoints:
            generator.add_endpoint(APIEndpoint(**ep))
    
    # Add initial changelog
    generator.add_changelog_entry(
        version=version,
        date=datetime.now().strftime("%Y-%m-%d"),
        changes=[
            {"type": "Added", "description": "Initial release"},
            {"type": "Added", "description": "Core functionality"},
            {"type": "Added", "description": "API endpoints"},
            {"type": "Added", "description": "Documentation"}
        ]
    )
    
    return {
        "README.md": generator.generate_readme(),
        "API.md": generator.generate_api_docs(),
        "CHANGELOG.md": generator.generate_changelog(),
        "openapi.json": json.dumps(generator.generate_openapi_spec(), indent=2)
    }
