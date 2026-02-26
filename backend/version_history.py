"""
Infinity Worker - Historical Timeline and Rollback System
Tracks all changes with full version history and rollback capability
"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any, Callable
from datetime import datetime
from enum import Enum
import json
import hashlib
import copy
import uuid
import difflib


class ChangeType(str, Enum):
    """Types of changes that can be tracked"""
    CREATE = "create"
    UPDATE = "update"
    DELETE = "delete"
    RENAME = "rename"
    MOVE = "move"
    RESTORE = "restore"
    MERGE = "merge"
    REVERT = "revert"


class EntityType(str, Enum):
    """Types of entities that can be versioned"""
    FILE = "file"
    PROJECT = "project"
    CONFIG = "config"
    DEPLOYMENT = "deployment"
    USER_SETTING = "user_setting"
    API_KEY = "api_key"
    TEMPLATE = "template"


@dataclass
class Snapshot:
    """A point-in-time snapshot of content"""
    id: str
    content: Any
    content_hash: str
    size_bytes: int
    created_at: str
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    @staticmethod
    def create(content: Any, metadata: Dict[str, Any] = None) -> "Snapshot":
        """Create a new snapshot from content"""
        content_str = json.dumps(content, sort_keys=True, default=str)
        return Snapshot(
            id=str(uuid.uuid4())[:8],
            content=content,
            content_hash=hashlib.sha256(content_str.encode()).hexdigest()[:16],
            size_bytes=len(content_str.encode()),
            created_at=datetime.utcnow().isoformat(),
            metadata=metadata or {}
        )
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "content_hash": self.content_hash,
            "size_bytes": self.size_bytes,
            "created_at": self.created_at,
            "metadata": self.metadata
        }


@dataclass
class HistoryEntry:
    """A single entry in the version history"""
    id: str
    version: int
    change_type: ChangeType
    entity_type: EntityType
    entity_id: str
    entity_name: str
    timestamp: str
    author: str
    message: str
    snapshot_id: str
    previous_snapshot_id: Optional[str]
    tags: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "version": self.version,
            "change_type": self.change_type.value,
            "entity_type": self.entity_type.value,
            "entity_id": self.entity_id,
            "entity_name": self.entity_name,
            "timestamp": self.timestamp,
            "author": self.author,
            "message": self.message,
            "snapshot_id": self.snapshot_id,
            "previous_snapshot_id": self.previous_snapshot_id,
            "tags": self.tags,
            "metadata": self.metadata
        }


@dataclass
class Timeline:
    """A complete timeline of changes for an entity"""
    entity_id: str
    entity_type: EntityType
    entity_name: str
    created_at: str
    entries: List[HistoryEntry] = field(default_factory=list)
    current_version: int = 0
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "entity_id": self.entity_id,
            "entity_type": self.entity_type.value,
            "entity_name": self.entity_name,
            "created_at": self.created_at,
            "current_version": self.current_version,
            "total_entries": len(self.entries),
            "entries": [e.to_dict() for e in self.entries[-10:]]  # Last 10 entries
        }


class VersionHistoryManager:
    """Manages version history and rollback for all entities"""
    
    def __init__(self, storage_backend: Optional[Callable] = None):
        self.timelines: Dict[str, Timeline] = {}
        self.snapshots: Dict[str, Snapshot] = {}
        self.storage_backend = storage_backend
        self._hooks: Dict[str, List[Callable]] = {
            "before_save": [],
            "after_save": [],
            "before_rollback": [],
            "after_rollback": []
        }
    
    def register_hook(self, event: str, callback: Callable) -> None:
        """Register a hook for version events"""
        if event in self._hooks:
            self._hooks[event].append(callback)
    
    def _trigger_hooks(self, event: str, **kwargs) -> None:
        """Trigger all hooks for an event"""
        for callback in self._hooks.get(event, []):
            try:
                callback(**kwargs)
            except Exception:
                pass  # Don't let hook errors break the flow
    
    def _get_timeline_key(self, entity_type: EntityType, entity_id: str) -> str:
        """Generate unique key for timeline"""
        return f"{entity_type.value}:{entity_id}"
    
    def get_or_create_timeline(
        self,
        entity_type: EntityType,
        entity_id: str,
        entity_name: str
    ) -> Timeline:
        """Get existing timeline or create new one"""
        key = self._get_timeline_key(entity_type, entity_id)
        
        if key not in self.timelines:
            self.timelines[key] = Timeline(
                entity_id=entity_id,
                entity_type=entity_type,
                entity_name=entity_name,
                created_at=datetime.utcnow().isoformat()
            )
        
        return self.timelines[key]
    
    def save_version(
        self,
        entity_type: EntityType,
        entity_id: str,
        entity_name: str,
        content: Any,
        change_type: ChangeType,
        author: str = "system",
        message: str = "",
        tags: List[str] = None,
        metadata: Dict[str, Any] = None
    ) -> HistoryEntry:
        """Save a new version of an entity"""
        self._trigger_hooks("before_save", entity_id=entity_id, content=content)
        
        # Get or create timeline
        timeline = self.get_or_create_timeline(entity_type, entity_id, entity_name)
        
        # Create snapshot
        snapshot = Snapshot.create(content, metadata)
        self.snapshots[snapshot.id] = snapshot
        
        # Get previous snapshot ID
        previous_snapshot_id = None
        if timeline.entries:
            previous_snapshot_id = timeline.entries[-1].snapshot_id
        
        # Increment version
        timeline.current_version += 1
        
        # Create history entry
        entry = HistoryEntry(
            id=str(uuid.uuid4())[:12],
            version=timeline.current_version,
            change_type=change_type,
            entity_type=entity_type,
            entity_id=entity_id,
            entity_name=entity_name,
            timestamp=datetime.utcnow().isoformat(),
            author=author,
            message=message or f"{change_type.value.title()} {entity_name}",
            snapshot_id=snapshot.id,
            previous_snapshot_id=previous_snapshot_id,
            tags=tags or [],
            metadata=metadata or {}
        )
        
        timeline.entries.append(entry)
        
        self._trigger_hooks("after_save", entry=entry, snapshot=snapshot)
        
        return entry
    
    def get_version(
        self,
        entity_type: EntityType,
        entity_id: str,
        version: Optional[int] = None
    ) -> Optional[Snapshot]:
        """Get a specific version of an entity"""
        key = self._get_timeline_key(entity_type, entity_id)
        timeline = self.timelines.get(key)
        
        if not timeline or not timeline.entries:
            return None
        
        if version is None:
            # Get latest version
            entry = timeline.entries[-1]
        else:
            # Find specific version
            entry = next(
                (e for e in timeline.entries if e.version == version),
                None
            )
        
        if not entry:
            return None
        
        return self.snapshots.get(entry.snapshot_id)
    
    def get_history(
        self,
        entity_type: EntityType,
        entity_id: str,
        limit: int = 50,
        offset: int = 0
    ) -> List[HistoryEntry]:
        """Get version history for an entity"""
        key = self._get_timeline_key(entity_type, entity_id)
        timeline = self.timelines.get(key)
        
        if not timeline:
            return []
        
        # Return entries in reverse chronological order
        entries = list(reversed(timeline.entries))
        return entries[offset:offset + limit]
    
    def rollback(
        self,
        entity_type: EntityType,
        entity_id: str,
        target_version: int,
        author: str = "system",
        message: str = ""
    ) -> Optional[HistoryEntry]:
        """Rollback to a specific version"""
        key = self._get_timeline_key(entity_type, entity_id)
        timeline = self.timelines.get(key)
        
        if not timeline:
            return None
        
        # Find target version entry
        target_entry = next(
            (e for e in timeline.entries if e.version == target_version),
            None
        )
        
        if not target_entry:
            return None
        
        # Get target snapshot
        target_snapshot = self.snapshots.get(target_entry.snapshot_id)
        if not target_snapshot:
            return None
        
        self._trigger_hooks(
            "before_rollback",
            entity_id=entity_id,
            target_version=target_version
        )
        
        # Create new version with rollback
        rollback_entry = self.save_version(
            entity_type=entity_type,
            entity_id=entity_id,
            entity_name=timeline.entity_name,
            content=target_snapshot.content,
            change_type=ChangeType.REVERT,
            author=author,
            message=message or f"Rollback to version {target_version}",
            tags=["rollback"],
            metadata={
                "rollback_from_version": timeline.current_version - 1,
                "rollback_to_version": target_version,
                "original_entry_id": target_entry.id
            }
        )
        
        self._trigger_hooks(
            "after_rollback",
            entry=rollback_entry,
            target_version=target_version
        )
        
        return rollback_entry
    
    def compare_versions(
        self,
        entity_type: EntityType,
        entity_id: str,
        version_a: int,
        version_b: int
    ) -> Dict[str, Any]:
        """Compare two versions and return diff"""
        snapshot_a = self.get_version(entity_type, entity_id, version_a)
        snapshot_b = self.get_version(entity_type, entity_id, version_b)
        
        if not snapshot_a or not snapshot_b:
            return {"error": "One or both versions not found"}
        
        # Convert to strings for diff
        content_a = json.dumps(snapshot_a.content, indent=2, sort_keys=True, default=str)
        content_b = json.dumps(snapshot_b.content, indent=2, sort_keys=True, default=str)
        
        # Generate diff
        diff = list(difflib.unified_diff(
            content_a.splitlines(keepends=True),
            content_b.splitlines(keepends=True),
            fromfile=f"version_{version_a}",
            tofile=f"version_{version_b}"
        ))
        
        # Calculate statistics
        lines_added = sum(1 for line in diff if line.startswith('+') and not line.startswith('+++'))
        lines_removed = sum(1 for line in diff if line.startswith('-') and not line.startswith('---'))
        
        return {
            "version_a": version_a,
            "version_b": version_b,
            "diff": "".join(diff),
            "statistics": {
                "lines_added": lines_added,
                "lines_removed": lines_removed,
                "total_changes": lines_added + lines_removed
            },
            "snapshot_a": snapshot_a.to_dict(),
            "snapshot_b": snapshot_b.to_dict()
        }
    
    def get_timeline_summary(
        self,
        entity_type: EntityType,
        entity_id: str
    ) -> Optional[Dict[str, Any]]:
        """Get summary of timeline for an entity"""
        key = self._get_timeline_key(entity_type, entity_id)
        timeline = self.timelines.get(key)
        
        if not timeline:
            return None
        
        # Calculate statistics
        change_counts = {}
        authors = set()
        tags = set()
        
        for entry in timeline.entries:
            change_type = entry.change_type.value
            change_counts[change_type] = change_counts.get(change_type, 0) + 1
            authors.add(entry.author)
            tags.update(entry.tags)
        
        return {
            "entity_id": entity_id,
            "entity_type": entity_type.value,
            "entity_name": timeline.entity_name,
            "created_at": timeline.created_at,
            "current_version": timeline.current_version,
            "total_versions": len(timeline.entries),
            "change_counts": change_counts,
            "unique_authors": list(authors),
            "all_tags": list(tags),
            "first_version": timeline.entries[0].to_dict() if timeline.entries else None,
            "latest_version": timeline.entries[-1].to_dict() if timeline.entries else None
        }
    
    def search_history(
        self,
        query: str = "",
        entity_type: Optional[EntityType] = None,
        change_type: Optional[ChangeType] = None,
        author: Optional[str] = None,
        tags: Optional[List[str]] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        limit: int = 50
    ) -> List[HistoryEntry]:
        """Search across all history entries"""
        results = []
        
        for timeline in self.timelines.values():
            for entry in timeline.entries:
                # Apply filters
                if entity_type and entry.entity_type != entity_type:
                    continue
                if change_type and entry.change_type != change_type:
                    continue
                if author and entry.author != author:
                    continue
                if tags and not any(t in entry.tags for t in tags):
                    continue
                if start_date and entry.timestamp < start_date:
                    continue
                if end_date and entry.timestamp > end_date:
                    continue
                if query and query.lower() not in entry.message.lower():
                    continue
                
                results.append(entry)
        
        # Sort by timestamp descending
        results.sort(key=lambda x: x.timestamp, reverse=True)
        
        return results[:limit]
    
    def create_branch(
        self,
        entity_type: EntityType,
        entity_id: str,
        branch_name: str,
        from_version: Optional[int] = None
    ) -> Dict[str, Any]:
        """Create a branch from a specific version"""
        source_snapshot = self.get_version(entity_type, entity_id, from_version)
        
        if not source_snapshot:
            return {"error": "Source version not found"}
        
        # Create new entity ID for branch
        branch_entity_id = f"{entity_id}:branch:{branch_name}"
        
        key = self._get_timeline_key(entity_type, entity_id)
        source_timeline = self.timelines.get(key)
        
        # Save initial version for branch
        entry = self.save_version(
            entity_type=entity_type,
            entity_id=branch_entity_id,
            entity_name=f"{source_timeline.entity_name} ({branch_name})",
            content=source_snapshot.content,
            change_type=ChangeType.CREATE,
            author="system",
            message=f"Branch '{branch_name}' created from version {from_version or 'latest'}",
            tags=["branch", branch_name],
            metadata={
                "source_entity_id": entity_id,
                "source_version": from_version or source_timeline.current_version,
                "branch_name": branch_name
            }
        )
        
        return {
            "branch_entity_id": branch_entity_id,
            "branch_name": branch_name,
            "source_version": from_version or source_timeline.current_version,
            "entry": entry.to_dict()
        }
    
    def export_timeline(
        self,
        entity_type: EntityType,
        entity_id: str,
        include_snapshots: bool = False
    ) -> Dict[str, Any]:
        """Export complete timeline for backup/transfer"""
        key = self._get_timeline_key(entity_type, entity_id)
        timeline = self.timelines.get(key)
        
        if not timeline:
            return {"error": "Timeline not found"}
        
        export_data = {
            "exported_at": datetime.utcnow().isoformat(),
            "timeline": timeline.to_dict(),
            "entries": [e.to_dict() for e in timeline.entries]
        }
        
        if include_snapshots:
            snapshot_ids = [e.snapshot_id for e in timeline.entries]
            export_data["snapshots"] = {
                sid: self.snapshots[sid].to_dict()
                for sid in snapshot_ids
                if sid in self.snapshots
            }
            # Include actual content for full backup
            export_data["snapshot_contents"] = {
                sid: self.snapshots[sid].content
                for sid in snapshot_ids
                if sid in self.snapshots
            }
        
        return export_data
    
    def get_all_timelines(self) -> List[Dict[str, Any]]:
        """Get summary of all timelines"""
        return [
            {
                "key": key,
                "entity_id": timeline.entity_id,
                "entity_type": timeline.entity_type.value,
                "entity_name": timeline.entity_name,
                "current_version": timeline.current_version,
                "total_entries": len(timeline.entries),
                "created_at": timeline.created_at,
                "last_modified": timeline.entries[-1].timestamp if timeline.entries else None
            }
            for key, timeline in self.timelines.items()
        ]


# Global instance for the application
_history_manager: Optional[VersionHistoryManager] = None


def get_history_manager() -> VersionHistoryManager:
    """Get or create the global history manager"""
    global _history_manager
    if _history_manager is None:
        _history_manager = VersionHistoryManager()
    return _history_manager


def track_change(
    entity_type: EntityType,
    entity_id: str,
    entity_name: str,
    content: Any,
    change_type: ChangeType = ChangeType.UPDATE,
    author: str = "system",
    message: str = ""
) -> HistoryEntry:
    """Convenience function to track a change"""
    manager = get_history_manager()
    return manager.save_version(
        entity_type=entity_type,
        entity_id=entity_id,
        entity_name=entity_name,
        content=content,
        change_type=change_type,
        author=author,
        message=message
    )


def rollback_to_version(
    entity_type: EntityType,
    entity_id: str,
    version: int,
    author: str = "system"
) -> Optional[HistoryEntry]:
    """Convenience function to rollback"""
    manager = get_history_manager()
    return manager.rollback(
        entity_type=entity_type,
        entity_id=entity_id,
        target_version=version,
        author=author
    )

