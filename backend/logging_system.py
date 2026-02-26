"""
Infinity OS — Structured Logging System
Adapted from infinity-worker v5.0 for Infinity OS v3.0

Enterprise-grade logging with correlation IDs, request tracing, smart filtering,
and FastAPI middleware integration.
"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any, Callable
from datetime import datetime, timezone
from enum import Enum
import json
import uuid
import time
import asyncio
from collections import deque
import traceback
import sys
import os


class LogLevel(str, Enum):
    """Log severity levels"""
    TRACE = "trace"
    DEBUG = "debug"
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"
    FATAL = "fatal"

    @property
    def numeric(self) -> int:
        levels = {
            "trace": 5, "debug": 10, "info": 20,
            "warning": 30, "error": 40, "critical": 50, "fatal": 60
        }
        return levels.get(self.value, 20)


class LogCategory(str, Enum):
    """Log categories for filtering"""
    REQUEST = "request"
    RESPONSE = "response"
    DATABASE = "database"
    CACHE = "cache"
    AUTH = "auth"
    AI = "ai"
    DEPLOYMENT = "deployment"
    SYSTEM = "system"
    SECURITY = "security"
    PERFORMANCE = "performance"
    BUSINESS = "business"
    INTEGRATION = "integration"
    USER_ACTION = "user_action"
    AUDIT = "audit"
    COMPLIANCE = "compliance"
    KERNEL = "kernel"


@dataclass
class LogEntry:
    """A structured log entry"""
    id: str
    timestamp: str
    level: LogLevel
    category: LogCategory
    message: str
    service: str
    organisation_id: Optional[str] = None
    correlation_id: Optional[str] = None
    request_id: Optional[str] = None
    user_id: Optional[str] = None
    session_id: Optional[str] = None
    trace_id: Optional[str] = None
    span_id: Optional[str] = None
    parent_span_id: Optional[str] = None
    duration_ms: Optional[float] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    tags: List[str] = field(default_factory=list)
    error: Optional[Dict[str, Any]] = None
    stack_trace: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "timestamp": self.timestamp,
            "level": self.level.value,
            "category": self.category.value,
            "message": self.message,
            "service": self.service,
            "organisation_id": self.organisation_id,
            "correlation_id": self.correlation_id,
            "request_id": self.request_id,
            "user_id": self.user_id,
            "session_id": self.session_id,
            "trace_id": self.trace_id,
            "span_id": self.span_id,
            "parent_span_id": self.parent_span_id,
            "duration_ms": self.duration_ms,
            "metadata": self.metadata,
            "tags": self.tags,
            "error": self.error,
            "stack_trace": self.stack_trace,
        }

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), default=str)


@dataclass
class RequestContext:
    """Context for request tracing"""
    request_id: str
    correlation_id: str
    trace_id: str
    span_id: str
    parent_span_id: Optional[str] = None
    user_id: Optional[str] = None
    organisation_id: Optional[str] = None
    session_id: Optional[str] = None
    start_time: float = field(default_factory=time.time)
    metadata: Dict[str, Any] = field(default_factory=dict)

    @staticmethod
    def create(
        correlation_id: Optional[str] = None,
        user_id: Optional[str] = None,
        organisation_id: Optional[str] = None,
        session_id: Optional[str] = None,
    ) -> "RequestContext":
        return RequestContext(
            request_id=str(uuid.uuid4())[:12],
            correlation_id=correlation_id or str(uuid.uuid4())[:16],
            trace_id=str(uuid.uuid4())[:16],
            span_id=str(uuid.uuid4())[:8],
            user_id=user_id,
            organisation_id=organisation_id,
            session_id=session_id,
        )

    def create_child_span(self) -> "RequestContext":
        return RequestContext(
            request_id=self.request_id,
            correlation_id=self.correlation_id,
            trace_id=self.trace_id,
            span_id=str(uuid.uuid4())[:8],
            parent_span_id=self.span_id,
            user_id=self.user_id,
            organisation_id=self.organisation_id,
            session_id=self.session_id,
            metadata=self.metadata.copy(),
        )

    @property
    def elapsed_ms(self) -> float:
        return (time.time() - self.start_time) * 1000


# Async-safe context var (works with FastAPI/asyncio)
import contextvars
_context_var: contextvars.ContextVar[Optional[RequestContext]] = contextvars.ContextVar(
    "request_context", default=None
)


def get_current_context() -> Optional[RequestContext]:
    return _context_var.get()


def set_current_context(context: RequestContext) -> contextvars.Token:
    return _context_var.set(context)


def clear_current_context() -> None:
    _context_var.set(None)


class LogBuffer:
    """Async-safe log buffer for batch processing"""

    def __init__(self, max_size: int = 50000):
        self.max_size = max_size
        self._buffer: deque = deque(maxlen=max_size)
        self._lock = asyncio.Lock()

    def append_sync(self, entry: LogEntry) -> None:
        """Synchronous append (safe to call from sync context)"""
        self._buffer.append(entry)

    def get_all(self) -> List[LogEntry]:
        return list(self._buffer)

    def get_recent(self, count: int = 100) -> List[LogEntry]:
        items = list(self._buffer)
        return items[-count:] if len(items) > count else items

    def clear(self) -> int:
        count = len(self._buffer)
        self._buffer.clear()
        return count

    def filter(
        self,
        level: Optional[LogLevel] = None,
        category: Optional[LogCategory] = None,
        correlation_id: Optional[str] = None,
        organisation_id: Optional[str] = None,
        user_id: Optional[str] = None,
        start_time: Optional[str] = None,
        end_time: Optional[str] = None,
        search: Optional[str] = None,
        limit: int = 100,
    ) -> List[LogEntry]:
        results = []
        for entry in reversed(self._buffer):
            if level and entry.level.numeric < level.numeric:
                continue
            if category and entry.category != category:
                continue
            if correlation_id and entry.correlation_id != correlation_id:
                continue
            if organisation_id and entry.organisation_id != organisation_id:
                continue
            if user_id and entry.user_id != user_id:
                continue
            if start_time and entry.timestamp < start_time:
                continue
            if end_time and entry.timestamp > end_time:
                continue
            if search and search.lower() not in entry.message.lower():
                continue
            results.append(entry)
            if len(results) >= limit:
                break
        return results


class StructuredLogger:
    """Enterprise-grade structured logger for Infinity OS"""

    def __init__(
        self,
        service_name: str = "infinity-os",
        min_level: LogLevel = LogLevel.INFO,
        buffer_size: int = 50000,
        output_handlers: List[Callable[[LogEntry], None]] = None,
    ):
        self.service_name = service_name
        self.min_level = min_level
        self.buffer = LogBuffer(buffer_size)
        self.output_handlers = output_handlers or []
        self._default_tags: List[str] = []
        self._default_metadata: Dict[str, Any] = {}

    def set_default_tags(self, tags: List[str]) -> None:
        self._default_tags = tags

    def set_default_metadata(self, metadata: Dict[str, Any]) -> None:
        self._default_metadata = metadata

    def add_handler(self, handler: Callable[[LogEntry], None]) -> None:
        self.output_handlers.append(handler)

    def _create_entry(
        self,
        level: LogLevel,
        category: LogCategory,
        message: str,
        metadata: Optional[Dict[str, Any]] = None,
        tags: Optional[List[str]] = None,
        error: Optional[Exception] = None,
        duration_ms: Optional[float] = None,
    ) -> LogEntry:
        context = get_current_context()

        entry = LogEntry(
            id=str(uuid.uuid4())[:12],
            timestamp=datetime.now(timezone.utc).isoformat(),
            level=level,
            category=category,
            message=message,
            service=self.service_name,
            organisation_id=context.organisation_id if context else None,
            correlation_id=context.correlation_id if context else None,
            request_id=context.request_id if context else None,
            user_id=context.user_id if context else None,
            session_id=context.session_id if context else None,
            trace_id=context.trace_id if context else None,
            span_id=context.span_id if context else None,
            parent_span_id=context.parent_span_id if context else None,
            duration_ms=duration_ms,
            metadata={**self._default_metadata, **(metadata or {})},
            tags=self._default_tags + (tags or []),
        )

        if error:
            entry.error = {
                "type": type(error).__name__,
                "message": str(error),
                "args": [str(a) for a in error.args] if error.args else [],
            }
            entry.stack_trace = traceback.format_exc()

        return entry

    def _log(self, level: LogLevel, category: LogCategory, message: str, **kwargs) -> Optional[LogEntry]:
        if level.numeric < self.min_level.numeric:
            return None

        entry = self._create_entry(level, category, message, **kwargs)
        self.buffer.append_sync(entry)

        # JSON output to stderr for errors, stdout for info
        out = sys.stderr if level.numeric >= LogLevel.ERROR.numeric else sys.stdout
        print(entry.to_json(), file=out)

        for handler in self.output_handlers:
            try:
                handler(entry)
            except Exception:
                pass

        return entry

    def trace(self, message: str, category: LogCategory = LogCategory.SYSTEM, **kwargs) -> Optional[LogEntry]:
        return self._log(LogLevel.TRACE, category, message, **kwargs)

    def debug(self, message: str, category: LogCategory = LogCategory.SYSTEM, **kwargs) -> Optional[LogEntry]:
        return self._log(LogLevel.DEBUG, category, message, **kwargs)

    def info(self, message: str, category: LogCategory = LogCategory.SYSTEM, **kwargs) -> Optional[LogEntry]:
        return self._log(LogLevel.INFO, category, message, **kwargs)

    def warning(self, message: str, category: LogCategory = LogCategory.SYSTEM, **kwargs) -> Optional[LogEntry]:
        return self._log(LogLevel.WARNING, category, message, **kwargs)

    def error(self, message: str, category: LogCategory = LogCategory.SYSTEM, **kwargs) -> Optional[LogEntry]:
        return self._log(LogLevel.ERROR, category, message, **kwargs)

    def critical(self, message: str, category: LogCategory = LogCategory.SYSTEM, **kwargs) -> Optional[LogEntry]:
        return self._log(LogLevel.CRITICAL, category, message, **kwargs)

    def fatal(self, message: str, category: LogCategory = LogCategory.SYSTEM, **kwargs) -> Optional[LogEntry]:
        return self._log(LogLevel.FATAL, category, message, **kwargs)

    # Convenience methods
    def request(self, method: str, path: str, **kwargs) -> Optional[LogEntry]:
        return self.info(
            f"{method} {path}",
            category=LogCategory.REQUEST,
            metadata={"method": method, "path": path, **kwargs.get("metadata", {})},
            **{k: v for k, v in kwargs.items() if k != "metadata"},
        )

    def response(self, status_code: int, duration_ms: float, **kwargs) -> Optional[LogEntry]:
        level = LogLevel.INFO if status_code < 400 else LogLevel.WARNING if status_code < 500 else LogLevel.ERROR
        return self._log(
            level,
            LogCategory.RESPONSE,
            f"Response {status_code}",
            duration_ms=duration_ms,
            metadata={"status_code": status_code, **kwargs.get("metadata", {})},
            **{k: v for k, v in kwargs.items() if k != "metadata"},
        )

    def ai_request(self, provider: str, model: str, **kwargs) -> Optional[LogEntry]:
        return self.info(
            f"AI request to {provider}/{model}",
            category=LogCategory.AI,
            metadata={"provider": provider, "model": model, **kwargs.get("metadata", {})},
            **{k: v for k, v in kwargs.items() if k != "metadata"},
        )

    def ai_response(self, provider: str, model: str, tokens: int, duration_ms: float, **kwargs) -> Optional[LogEntry]:
        return self.info(
            f"AI response from {provider}/{model}",
            category=LogCategory.AI,
            duration_ms=duration_ms,
            metadata={"provider": provider, "model": model, "tokens": tokens, **kwargs.get("metadata", {})},
            **{k: v for k, v in kwargs.items() if k != "metadata"},
        )

    def security_event(self, event_type: str, **kwargs) -> Optional[LogEntry]:
        return self.warning(
            f"Security event: {event_type}",
            category=LogCategory.SECURITY,
            tags=["security", event_type],
            **kwargs,
        )

    def audit(self, action: str, resource: str, **kwargs) -> Optional[LogEntry]:
        return self.info(
            f"Audit: {action} on {resource}",
            category=LogCategory.AUDIT,
            tags=["audit"],
            metadata={"action": action, "resource": resource, **kwargs.get("metadata", {})},
            **{k: v for k, v in kwargs.items() if k != "metadata"},
        )

    def compliance(self, framework: str, control: str, status: str, **kwargs) -> Optional[LogEntry]:
        return self.info(
            f"Compliance [{framework}] {control}: {status}",
            category=LogCategory.COMPLIANCE,
            tags=["compliance", framework],
            metadata={"framework": framework, "control": control, "status": status, **kwargs.get("metadata", {})},
            **{k: v for k, v in kwargs.items() if k != "metadata"},
        )

    def performance(self, operation: str, duration_ms: float, **kwargs) -> Optional[LogEntry]:
        level = LogLevel.INFO if duration_ms < 1000 else LogLevel.WARNING if duration_ms < 5000 else LogLevel.ERROR
        return self._log(
            level,
            LogCategory.PERFORMANCE,
            f"Performance: {operation}",
            duration_ms=duration_ms,
            **kwargs,
        )

    def get_logs(
        self,
        level: Optional[LogLevel] = None,
        category: Optional[LogCategory] = None,
        correlation_id: Optional[str] = None,
        organisation_id: Optional[str] = None,
        user_id: Optional[str] = None,
        start_time: Optional[str] = None,
        end_time: Optional[str] = None,
        search: Optional[str] = None,
        limit: int = 100,
    ) -> List[LogEntry]:
        return self.buffer.filter(
            level=level,
            category=category,
            correlation_id=correlation_id,
            organisation_id=organisation_id,
            user_id=user_id,
            start_time=start_time,
            end_time=end_time,
            search=search,
            limit=limit,
        )

    def get_stats(self) -> Dict[str, Any]:
        logs = self.buffer.get_all()
        level_counts: Dict[str, int] = {}
        category_counts: Dict[str, int] = {}
        hourly_counts: Dict[str, int] = {}
        error_types: Dict[str, int] = {}

        for log in logs:
            level_counts[log.level.value] = level_counts.get(log.level.value, 0) + 1
            category_counts[log.category.value] = category_counts.get(log.category.value, 0) + 1
            hour = log.timestamp[:13]
            hourly_counts[hour] = hourly_counts.get(hour, 0) + 1
            if log.error:
                error_type = log.error.get("type", "Unknown")
                error_types[error_type] = error_types.get(error_type, 0) + 1

        return {
            "total_logs": len(logs),
            "level_distribution": level_counts,
            "category_distribution": category_counts,
            "hourly_distribution": dict(sorted(hourly_counts.items())[-24:]),
            "error_types": error_types,
            "buffer_size": self.buffer.max_size,
            "buffer_usage_pct": round(len(logs) / self.buffer.max_size * 100, 2),
        }


class TimedOperation:
    """Context manager for timing operations"""

    def __init__(
        self,
        logger: StructuredLogger,
        operation: str,
        category: LogCategory = LogCategory.PERFORMANCE,
        metadata: Optional[Dict[str, Any]] = None,
    ):
        self.logger = logger
        self.operation = operation
        self.category = category
        self.metadata = metadata or {}
        self.start_time: Optional[float] = None

    def __enter__(self):
        self.start_time = time.time()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        duration_ms = (time.time() - self.start_time) * 1000
        if exc_type:
            self.logger.error(
                f"Operation failed: {self.operation}",
                category=self.category,
                duration_ms=duration_ms,
                error=exc_val,
                metadata=self.metadata,
            )
        else:
            self.logger.performance(self.operation, duration_ms=duration_ms, metadata=self.metadata)
        return False


# Global singleton
_logger: Optional[StructuredLogger] = None


def get_logger() -> StructuredLogger:
    """Get or create the global Infinity OS logger"""
    global _logger
    if _logger is None:
        _logger = StructuredLogger(
            service_name="infinity-os",
            min_level=LogLevel.DEBUG if os.getenv("DEBUG") else LogLevel.INFO,
        )
    return _logger


# Convenience functions
def log_request(method: str, path: str, **kwargs) -> Optional[LogEntry]:
    return get_logger().request(method, path, **kwargs)


def log_response(status_code: int, duration_ms: float, **kwargs) -> Optional[LogEntry]:
    return get_logger().response(status_code, duration_ms, **kwargs)


def log_error(message: str, error: Optional[Exception] = None, **kwargs) -> Optional[LogEntry]:
    return get_logger().error(message, error=error, **kwargs)


def log_security(event_type: str, **kwargs) -> Optional[LogEntry]:
    return get_logger().security_event(event_type, **kwargs)


def log_audit(action: str, resource: str, **kwargs) -> Optional[LogEntry]:
    return get_logger().audit(action, resource, **kwargs)


def log_compliance(framework: str, control: str, status: str, **kwargs) -> Optional[LogEntry]:
    return get_logger().compliance(framework, control, status, **kwargs)


def timed(operation: str, category: LogCategory = LogCategory.PERFORMANCE):
    """Decorator for timing function execution"""
    def decorator(func):
        def wrapper(*args, **kwargs):
            with TimedOperation(get_logger(), operation, category):
                return func(*args, **kwargs)
        return wrapper
    return decorator