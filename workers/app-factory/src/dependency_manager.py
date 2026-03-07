"""
Dependency Manager - Auto-Update with Rollback
Infinity Worker v5.4

Features:
- Multi-ecosystem dependency parsing
- Version comparison and update detection
- Auto-update with rollback capability
- Breaking change detection
- Scheduled update policies
- Update history tracking
"""

import json
import hashlib
import re
import httpx
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional, Any, Tuple
from enum import Enum
from dataclasses import dataclass, field
from collections import defaultdict
import asyncio


class UpdatePolicy(Enum):
    """Update policy options"""
    IMMEDIATE = "immediate"
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    MANUAL = "manual"


class UpdateType(Enum):
    """Type of version update"""
    MAJOR = "major"
    MINOR = "minor"
    PATCH = "patch"
    PRERELEASE = "prerelease"


class UpdateStatus(Enum):
    """Status of an update"""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    ROLLED_BACK = "rolled_back"


@dataclass
class Dependency:
    """A dependency record"""
    name: str
    current_version: str
    latest_version: Optional[str]
    ecosystem: str
    update_available: bool
    update_type: Optional[UpdateType]
    breaking_changes: bool
    changelog_url: Optional[str]
    last_checked: str
    
    def to_dict(self) -> Dict:
        return {
            "name": self.name,
            "current_version": self.current_version,
            "latest_version": self.latest_version,
            "ecosystem": self.ecosystem,
            "update_available": self.update_available,
            "update_type": self.update_type.value if self.update_type else None,
            "breaking_changes": self.breaking_changes,
            "changelog_url": self.changelog_url,
            "last_checked": self.last_checked
        }


@dataclass
class UpdateRecord:
    """Record of a dependency update"""
    id: str
    dependency: str
    ecosystem: str
    from_version: str
    to_version: str
    update_type: UpdateType
    status: UpdateStatus
    started_at: str
    completed_at: Optional[str]
    rollback_available: bool
    error: Optional[str]
    
    def to_dict(self) -> Dict:
        return {
            "id": self.id,
            "dependency": self.dependency,
            "ecosystem": self.ecosystem,
            "from_version": self.from_version,
            "to_version": self.to_version,
            "update_type": self.update_type.value,
            "status": self.status.value,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
            "rollback_available": self.rollback_available,
            "error": self.error
        }


@dataclass
class DependencySnapshot:
    """Snapshot of dependencies at a point in time"""
    id: str
    created_at: str
    ecosystem: str
    dependencies: Dict[str, str]  # name -> version
    file_content: str
    
    def to_dict(self) -> Dict:
        return {
            "id": self.id,
            "created_at": self.created_at,
            "ecosystem": self.ecosystem,
            "dependencies": self.dependencies,
            "file_content": self.file_content
        }


class DependencyManager:
    """
    Dependency manager with auto-update and rollback capabilities.
    Supports multiple ecosystems and update policies.
    """
    
    # Registry APIs for version checking
    PYPI_API = "https://pypi.org/pypi/{package}/json"
    NPM_API = "https://registry.npmjs.org/{package}"
    CRATES_API = "https://crates.io/api/v1/crates/{package}"
    
    def __init__(self):
        self.dependencies: Dict[str, Dict[str, Dependency]] = defaultdict(dict)
        self.update_history: List[UpdateRecord] = []
        self.snapshots: List[DependencySnapshot] = []
        self.update_policy = UpdatePolicy.MANUAL
        self.auto_update_enabled = False
        self.exclude_patterns: List[str] = []
    
    def parse_version(self, version: str) -> Tuple[int, int, int, str]:
        """Parse semantic version into components"""
        # Remove leading v or = signs
        version = version.lstrip("v=^~<>")
        
        # Handle prerelease
        prerelease = ""
        if "-" in version:
            version, prerelease = version.split("-", 1)
        
        parts = version.split(".")
        major = int(parts[0]) if len(parts) > 0 and parts[0].isdigit() else 0
        minor = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else 0
        patch = int(parts[2].split("+")[0]) if len(parts) > 2 and parts[2].split("+")[0].isdigit() else 0
        
        return major, minor, patch, prerelease
    
    def compare_versions(self, current: str, latest: str) -> Optional[UpdateType]:
        """Compare two versions and determine update type"""
        try:
            curr_major, curr_minor, curr_patch, curr_pre = self.parse_version(current)
            lat_major, lat_minor, lat_patch, lat_pre = self.parse_version(latest)
            
            if lat_major > curr_major:
                return UpdateType.MAJOR
            elif lat_minor > curr_minor:
                return UpdateType.MINOR
            elif lat_patch > curr_patch:
                return UpdateType.PATCH
            elif lat_pre != curr_pre and lat_pre == "":
                return UpdateType.PRERELEASE
            
            return None
        except:
            return None
    
    def is_breaking_change(self, update_type: Optional[UpdateType]) -> bool:
        """Determine if update type is likely a breaking change"""
        return update_type == UpdateType.MAJOR
    
    async def get_latest_pypi_version(self, package: str) -> Optional[Tuple[str, str]]:
        """Get latest version from PyPI"""
        async with httpx.AsyncClient(timeout=10.0) as client:
            try:
                response = await client.get(self.PYPI_API.format(package=package))
                if response.status_code == 200:
                    data = response.json()
                    version = data.get("info", {}).get("version")
                    project_url = data.get("info", {}).get("project_url")
                    return version, project_url
            except:
                pass
        return None, None
    
    async def get_latest_npm_version(self, package: str) -> Optional[Tuple[str, str]]:
        """Get latest version from npm"""
        async with httpx.AsyncClient(timeout=10.0) as client:
            try:
                response = await client.get(self.NPM_API.format(package=package))
                if response.status_code == 200:
                    data = response.json()
                    version = data.get("dist-tags", {}).get("latest")
                    homepage = data.get("homepage")
                    return version, homepage
            except:
                pass
        return None, None
    
    async def get_latest_crates_version(self, package: str) -> Optional[Tuple[str, str]]:
        """Get latest version from crates.io"""
        async with httpx.AsyncClient(timeout=10.0) as client:
            try:
                response = await client.get(
                    self.CRATES_API.format(package=package),
                    headers={"User-Agent": "InfinityWorker/5.4"}
                )
                if response.status_code == 200:
                    data = response.json()
                    crate = data.get("crate", {})
                    version = crate.get("newest_version")
                    homepage = crate.get("homepage") or crate.get("repository")
                    return version, homepage
            except:
                pass
        return None, None
    
    async def check_updates(self, ecosystem: str, dependencies: Dict[str, str]) -> List[Dependency]:
        """Check for updates for a list of dependencies"""
        results = []
        now = datetime.now(timezone.utc).isoformat()
        
        for name, current_version in dependencies.items():
            # Skip excluded patterns
            if any(re.match(pattern, name) for pattern in self.exclude_patterns):
                continue
            
            latest_version = None
            changelog_url = None
            
            if ecosystem == "PyPI":
                latest_version, changelog_url = await self.get_latest_pypi_version(name)
            elif ecosystem == "npm":
                latest_version, changelog_url = await self.get_latest_npm_version(name)
            elif ecosystem == "crates.io":
                latest_version, changelog_url = await self.get_latest_crates_version(name)
            
            update_type = None
            update_available = False
            breaking_changes = False
            
            if latest_version and latest_version != current_version:
                update_type = self.compare_versions(current_version, latest_version)
                if update_type:
                    update_available = True
                    breaking_changes = self.is_breaking_change(update_type)
            
            dep = Dependency(
                name=name,
                current_version=current_version,
                latest_version=latest_version,
                ecosystem=ecosystem,
                update_available=update_available,
                update_type=update_type,
                breaking_changes=breaking_changes,
                changelog_url=changelog_url,
                last_checked=now
            )
            
            results.append(dep)
            self.dependencies[ecosystem][name] = dep
        
        return results
    
    def parse_requirements_txt(self, content: str) -> Dict[str, str]:
        """Parse requirements.txt into dependency dict"""
        dependencies = {}
        
        for line in content.strip().split("\n"):
            line = line.strip()
            if not line or line.startswith("#") or line.startswith("-"):
                continue
            
            # Handle different version specifiers
            for sep in ["==", ">=", "<=", "~=", "!="]:
                if sep in line:
                    parts = line.split(sep)
                    name = parts[0].strip()
                    version = parts[1].strip().split(";")[0].split(",")[0].strip()
                    dependencies[name] = version
                    break
            else:
                # No version specified
                if line and not line.startswith("["):
                    dependencies[line] = "0.0.0"
        
        return dependencies
    
    def parse_package_json(self, content: str) -> Dict[str, str]:
        """Parse package.json into dependency dict"""
        dependencies = {}
        
        try:
            data = json.loads(content)
            
            for dep_type in ["dependencies", "devDependencies", "peerDependencies"]:
                deps = data.get(dep_type, {})
                for name, version in deps.items():
                    # Clean version string
                    clean_version = version.lstrip("^~>=<")
                    dependencies[name] = clean_version
        except json.JSONDecodeError:
            pass
        
        return dependencies
    
    def parse_cargo_toml(self, content: str) -> Dict[str, str]:
        """Parse Cargo.toml into dependency dict"""
        dependencies = {}
        in_deps = False
        
        for line in content.strip().split("\n"):
            line = line.strip()
            
            if line == "[dependencies]" or line == "[dev-dependencies]":
                in_deps = True
                continue
            elif line.startswith("["):
                in_deps = False
                continue
            
            if in_deps and "=" in line:
                parts = line.split("=", 1)
                name = parts[0].strip()
                version_part = parts[1].strip().strip('"\'')
                
                # Handle inline table syntax
                if version_part.startswith("{"):
                    match = re.search(r'version\s*=\s*["\']([^"\']+)["\']', version_part)
                    if match:
                        version_part = match.group(1)
                    else:
                        continue
                
                dependencies[name] = version_part
        
        return dependencies
    
    def generate_updated_requirements_txt(
        self,
        original: str,
        updates: Dict[str, str]
    ) -> str:
        """Generate updated requirements.txt with new versions"""
        lines = []
        
        for line in original.strip().split("\n"):
            stripped = line.strip()
            if not stripped or stripped.startswith("#") or stripped.startswith("-"):
                lines.append(line)
                continue
            
            # Find package name
            for sep in ["==", ">=", "<=", "~=", "!="]:
                if sep in stripped:
                    name = stripped.split(sep)[0].strip()
                    if name in updates:
                        lines.append(f"{name}=={updates[name]}")
                    else:
                        lines.append(line)
                    break
            else:
                lines.append(line)
        
        return "\n".join(lines)
    
    def generate_updated_package_json(
        self,
        original: str,
        updates: Dict[str, str]
    ) -> str:
        """Generate updated package.json with new versions"""
        try:
            data = json.loads(original)
            
            for dep_type in ["dependencies", "devDependencies", "peerDependencies"]:
                if dep_type in data:
                    for name in data[dep_type]:
                        if name in updates:
                            # Preserve prefix if present
                            old_version = data[dep_type][name]
                            prefix = ""
                            if old_version.startswith("^"):
                                prefix = "^"
                            elif old_version.startswith("~"):
                                prefix = "~"
                            data[dep_type][name] = f"{prefix}{updates[name]}"
            
            return json.dumps(data, indent=2)
        except json.JSONDecodeError:
            return original
    
    def create_snapshot(self, ecosystem: str, dependencies: Dict[str, str], file_content: str) -> DependencySnapshot:
        """Create a snapshot of current dependencies"""
        snapshot_id = hashlib.md5(
            f"{datetime.now(timezone.utc).isoformat()}_{ecosystem}".encode()
        ).hexdigest()[:12]
        
        snapshot = DependencySnapshot(
            id=snapshot_id,
            created_at=datetime.now(timezone.utc).isoformat(),
            ecosystem=ecosystem,
            dependencies=dependencies,
            file_content=file_content
        )
        
        self.snapshots.append(snapshot)
        return snapshot
    
    def get_snapshot(self, snapshot_id: str) -> Optional[DependencySnapshot]:
        """Get a snapshot by ID"""
        for snapshot in self.snapshots:
            if snapshot.id == snapshot_id:
                return snapshot
        return None
    
    def rollback_to_snapshot(self, snapshot_id: str) -> Optional[str]:
        """Rollback to a previous snapshot, returns the file content"""
        snapshot = self.get_snapshot(snapshot_id)
        if snapshot:
            return snapshot.file_content
        return None
    
    async def apply_updates(
        self,
        ecosystem: str,
        file_content: str,
        updates: List[str],
        create_backup: bool = True
    ) -> Dict:
        """Apply updates to dependencies"""
        # Parse current dependencies
        if ecosystem == "PyPI":
            current_deps = self.parse_requirements_txt(file_content)
        elif ecosystem == "npm":
            current_deps = self.parse_package_json(file_content)
        elif ecosystem == "crates.io":
            current_deps = self.parse_cargo_toml(file_content)
        else:
            return {"error": f"Unsupported ecosystem: {ecosystem}"}
        
        # Create backup snapshot
        if create_backup:
            snapshot = self.create_snapshot(ecosystem, current_deps, file_content)
        
        # Get latest versions for requested updates
        update_versions = {}
        update_records = []
        
        for pkg_name in updates:
            if pkg_name not in current_deps:
                continue
            
            dep = self.dependencies.get(ecosystem, {}).get(pkg_name)
            if dep and dep.latest_version:
                update_versions[pkg_name] = dep.latest_version
                
                # Create update record
                record_id = hashlib.md5(
                    f"{pkg_name}_{datetime.now(timezone.utc).isoformat()}".encode()
                ).hexdigest()[:12]
                
                record = UpdateRecord(
                    id=record_id,
                    dependency=pkg_name,
                    ecosystem=ecosystem,
                    from_version=current_deps[pkg_name],
                    to_version=dep.latest_version,
                    update_type=dep.update_type or UpdateType.PATCH,
                    status=UpdateStatus.COMPLETED,
                    started_at=datetime.now(timezone.utc).isoformat(),
                    completed_at=datetime.now(timezone.utc).isoformat(),
                    rollback_available=create_backup,
                    error=None
                )
                
                update_records.append(record)
                self.update_history.append(record)
        
        # Generate updated file
        if ecosystem == "PyPI":
            updated_content = self.generate_updated_requirements_txt(file_content, update_versions)
        elif ecosystem == "npm":
            updated_content = self.generate_updated_package_json(file_content, update_versions)
        else:
            updated_content = file_content
        
        return {
            "success": True,
            "updated_content": updated_content,
            "updates_applied": [r.to_dict() for r in update_records],
            "snapshot_id": snapshot.id if create_backup else None,
            "rollback_available": create_backup
        }
    
    async def auto_update_safe(
        self,
        ecosystem: str,
        file_content: str
    ) -> Dict:
        """Auto-update only non-breaking (patch/minor) updates"""
        # Parse and check updates
        if ecosystem == "PyPI":
            current_deps = self.parse_requirements_txt(file_content)
        elif ecosystem == "npm":
            current_deps = self.parse_package_json(file_content)
        else:
            return {"error": f"Unsupported ecosystem: {ecosystem}"}
        
        # Check for updates
        deps = await self.check_updates(ecosystem, current_deps)
        
        # Filter to safe updates only
        safe_updates = [
            d.name for d in deps
            if d.update_available and not d.breaking_changes
        ]
        
        if not safe_updates:
            return {
                "success": True,
                "message": "No safe updates available",
                "updated_content": file_content,
                "updates_applied": []
            }
        
        return await self.apply_updates(ecosystem, file_content, safe_updates)
    
    def set_update_policy(self, policy: UpdatePolicy):
        """Set the update policy"""
        self.update_policy = policy
    
    def set_auto_update(self, enabled: bool):
        """Enable or disable auto-updates"""
        self.auto_update_enabled = enabled
    
    def add_exclude_pattern(self, pattern: str):
        """Add a pattern to exclude from updates"""
        self.exclude_patterns.append(pattern)
    
    def get_update_history(self) -> List[Dict]:
        """Get update history"""
        return [r.to_dict() for r in self.update_history]
    
    def get_snapshots(self) -> List[Dict]:
        """Get all snapshots"""
        return [s.to_dict() for s in self.snapshots]
    
    def get_outdated_summary(self) -> Dict:
        """Get summary of outdated dependencies"""
        summary = {
            "total": 0,
            "outdated": 0,
            "major_updates": 0,
            "minor_updates": 0,
            "patch_updates": 0,
            "breaking_changes": 0,
            "by_ecosystem": {}
        }
        
        for ecosystem, deps in self.dependencies.items():
            eco_summary = {
                "total": len(deps),
                "outdated": 0,
                "major": 0,
                "minor": 0,
                "patch": 0
            }
            
            for dep in deps.values():
                summary["total"] += 1
                eco_summary["total"] = len(deps)
                
                if dep.update_available:
                    summary["outdated"] += 1
                    eco_summary["outdated"] += 1
                    
                    if dep.breaking_changes:
                        summary["breaking_changes"] += 1
                    
                    if dep.update_type == UpdateType.MAJOR:
                        summary["major_updates"] += 1
                        eco_summary["major"] += 1
                    elif dep.update_type == UpdateType.MINOR:
                        summary["minor_updates"] += 1
                        eco_summary["minor"] += 1
                    elif dep.update_type == UpdateType.PATCH:
                        summary["patch_updates"] += 1
                        eco_summary["patch"] += 1
            
            summary["by_ecosystem"][ecosystem] = eco_summary
        
        return summary


# Singleton instance
_manager: Optional[DependencyManager] = None


def get_dependency_manager() -> DependencyManager:
    """Get the singleton dependency manager instance"""
    global _manager
    if _manager is None:
        _manager = DependencyManager()
    return _manager


async def check_dependency_updates(file_type: str, content: str) -> Dict:
    """Check for dependency updates from a file"""
    manager = get_dependency_manager()
    
    if file_type == "requirements.txt":
        deps = manager.parse_requirements_txt(content)
        ecosystem = "PyPI"
    elif file_type == "package.json":
        deps = manager.parse_package_json(content)
        ecosystem = "npm"
    elif file_type == "Cargo.toml":
        deps = manager.parse_cargo_toml(content)
        ecosystem = "crates.io"
    else:
        return {"error": f"Unsupported file type: {file_type}"}
    
    results = await manager.check_updates(ecosystem, deps)
    
    return {
        "ecosystem": ecosystem,
        "total_dependencies": len(deps),
        "dependencies": [d.to_dict() for d in results],
        "updates_available": len([d for d in results if d.update_available]),
        "breaking_changes": len([d for d in results if d.breaking_changes])
    }


async def apply_dependency_updates(
    file_type: str,
    content: str,
    packages: List[str]
) -> Dict:
    """Apply updates to specific packages"""
    manager = get_dependency_manager()
    
    if file_type == "requirements.txt":
        ecosystem = "PyPI"
    elif file_type == "package.json":
        ecosystem = "npm"
    elif file_type == "Cargo.toml":
        ecosystem = "crates.io"
    else:
        return {"error": f"Unsupported file type: {file_type}"}
    
    return await manager.apply_updates(ecosystem, content, packages)


async def auto_update_dependencies(file_type: str, content: str) -> Dict:
    """Auto-update all safe (non-breaking) dependencies"""
    manager = get_dependency_manager()
    
    if file_type == "requirements.txt":
        ecosystem = "PyPI"
    elif file_type == "package.json":
        ecosystem = "npm"
    else:
        return {"error": f"Unsupported file type: {file_type}"}
    
    return await manager.auto_update_safe(ecosystem, content)
