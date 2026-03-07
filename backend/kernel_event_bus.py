# kernel_event_bus.py — Trancendos Kernel Event Bus
# ═══════════════════════════════════════════════════════════════
# Async pub/sub backbone connecting all Three-Lane Mesh services.
# Provides topic-based routing, wildcard subscriptions, event
# history, dead-letter handling, and cross-lane event propagation.
#
# Architecture:
#   Lane 1 (AI/Nexus)   ──┐
#   Lane 2 (User/Infinity) ├── Kernel Event Bus ── subscribers
#   Lane 3 (Data/Hive)  ──┘
#
# Production: Replace in-memory queues with Redis Streams / NATS.
# ═══════════════════════════════════════════════════════════════

import asyncio
import fnmatch
import logging
import uuid
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Callable, Coroutine, Dict, List, Optional, Set

logger = logging.getLogger("kernel_event_bus")


# ── Enums ──────────────────────────────────────────────────────

class EventPriority(str, Enum):
    CRITICAL = "critical"
    HIGH = "high"
    NORMAL = "normal"
    LOW = "low"


class EventLane(str, Enum):
    AI = "lane1_ai"
    USER = "lane2_user"
    DATA = "lane3_data"
    CROSS = "cross_lane"
    SYSTEM = "system"


# ── Data Classes ───────────────────────────────────────────────

@dataclass
class KernelEvent:
    """Immutable event envelope for the Kernel Event Bus."""
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    topic: str = ""
    payload: Dict[str, Any] = field(default_factory=dict)
    source: str = ""
    lane: EventLane = EventLane.SYSTEM
    priority: EventPriority = EventPriority.NORMAL
    correlation_id: Optional[str] = None
    timestamp: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "topic": self.topic,
            "payload": self.payload,
            "source": self.source,
            "lane": self.lane.value if isinstance(self.lane, EventLane) else self.lane,
            "priority": self.priority.value if isinstance(self.priority, EventPriority) else self.priority,
            "correlation_id": self.correlation_id,
            "timestamp": self.timestamp,
            "metadata": self.metadata,
        }


@dataclass
class Subscription:
    """A registered subscriber on the bus."""
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    topic_pattern: str = ""
    handler: Optional[Callable[[KernelEvent], Coroutine]] = None
    subscriber_name: str = ""
    lane_filter: Optional[EventLane] = None
    priority_filter: Optional[EventPriority] = None
    created_at: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    active: bool = True


@dataclass
class DeadLetterEntry:
    """Events that failed delivery after max retries."""
    event: KernelEvent
    error: str
    subscriber_id: str
    failed_at: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    retry_count: int = 0


# ── Kernel Event Bus (Singleton) ──────────────────────────────

class KernelEventBus:
    """
    Async pub/sub event bus for the Trancendos Kernel.

    Features:
    - Topic-based routing with wildcard support (fnmatch)
    - Lane-scoped and priority-filtered subscriptions
    - Event history with configurable retention
    - Dead-letter queue for failed deliveries
    - Metrics collection for observability
    - Graceful startup/shutdown lifecycle

    Usage:
        bus = KernelEventBus.get_instance()
        sub_id = await bus.subscribe("security.*", handler, "norman")
        await bus.publish(KernelEvent(topic="security.alert", ...))
        await bus.unsubscribe(sub_id)
    """

    _instance: Optional["KernelEventBus"] = None
    _lock = asyncio.Lock()

    def __init__(self):
        # Subscriptions
        self._subscriptions: Dict[str, Subscription] = {}
        self._topic_index: Dict[str, Set[str]] = defaultdict(set)

        # Event storage
        self._event_history: List[KernelEvent] = []
        self._max_history: int = 10_000
        self._dead_letter_queue: List[DeadLetterEntry] = []
        self._max_dead_letters: int = 1_000

        # Delivery config
        self._max_retries: int = 3
        self._retry_delay: float = 0.5  # seconds

        # Metrics
        self._metrics = {
            "events_published": 0,
            "events_delivered": 0,
            "events_failed": 0,
            "events_dead_lettered": 0,
            "subscriptions_active": 0,
            "subscriptions_total": 0,
            "by_topic": defaultdict(int),
            "by_lane": defaultdict(int),
            "by_source": defaultdict(int),
        }

        # State
        self._running: bool = False
        self._queue: asyncio.Queue = asyncio.Queue()
        self._worker_task: Optional[asyncio.Task] = None

    @classmethod
    async def get_instance(cls) -> "KernelEventBus":
        """Thread-safe singleton accessor."""
        if cls._instance is None:
            async with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    @classmethod
    def get_instance_sync(cls) -> "KernelEventBus":
        """Synchronous singleton accessor (for module-level wiring)."""
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    @classmethod
    def reset(cls):
        """Reset singleton — for testing only."""
        cls._instance = None

    # ── Lifecycle ──────────────────────────────────────────────

    async def start(self):
        """Start the event bus worker loop."""
        if self._running:
            logger.warning("Kernel Event Bus already running")
            return
        self._running = True
        self._worker_task = asyncio.create_task(self._dispatch_loop())
        logger.info("✅ Kernel Event Bus started — listening for events")

    async def stop(self):
        """Gracefully stop the event bus."""
        if not self._running:
            return
        self._running = False
        # Drain remaining events
        if self._worker_task:
            self._queue.put_nowait(None)  # sentinel
            try:
                await asyncio.wait_for(self._worker_task, timeout=5.0)
            except asyncio.TimeoutError:
                self._worker_task.cancel()
                logger.warning("Kernel Event Bus worker timed out — cancelled")
        logger.info("🛑 Kernel Event Bus stopped")

    # ── Publish ────────────────────────────────────────────────

    async def publish(self, event: KernelEvent) -> str:
        """
        Publish an event to the bus.
        Returns the event ID.
        """
        if not event.id:
            event.id = str(uuid.uuid4())
        if not event.timestamp:
            event.timestamp = datetime.now(timezone.utc).isoformat()

        # Store in history
        self._event_history.append(event)
        if len(self._event_history) > self._max_history:
            self._event_history = self._event_history[-self._max_history:]

        # Update metrics
        self._metrics["events_published"] += 1
        self._metrics["by_topic"][event.topic] += 1
        lane_key = event.lane.value if isinstance(event.lane, EventLane) else event.lane
        self._metrics["by_lane"][lane_key] += 1
        self._metrics["by_source"][event.source] += 1

        # Enqueue for async dispatch
        await self._queue.put(event)

        logger.debug(
            "Event published: topic=%s source=%s lane=%s id=%s",
            event.topic, event.source, lane_key, event.id,
        )
        return event.id

    def publish_sync(self, event: KernelEvent) -> str:
        """
        Synchronous publish — schedules onto the event loop.
        Use when calling from sync code paths.
        """
        if not event.id:
            event.id = str(uuid.uuid4())
        self._event_history.append(event)
        if len(self._event_history) > self._max_history:
            self._event_history = self._event_history[-self._max_history:]
        self._metrics["events_published"] += 1
        self._metrics["by_topic"][event.topic] += 1
        try:
            loop = asyncio.get_running_loop()
            loop.call_soon_threadsafe(self._queue.put_nowait, event)
        except RuntimeError:
            # No running loop — store for later dispatch
            pass
        return event.id

    # ── Subscribe / Unsubscribe ────────────────────────────────

    async def subscribe(
        self,
        topic_pattern: str,
        handler: Callable[[KernelEvent], Coroutine],
        subscriber_name: str = "",
        lane_filter: Optional[EventLane] = None,
        priority_filter: Optional[EventPriority] = None,
    ) -> str:
        """
        Subscribe to events matching a topic pattern.

        Supports wildcards:
          - "security.*"     matches "security.alert", "security.scan"
          - "*.completed"    matches "build.completed", "scan.completed"
          - "*"              matches everything

        Returns subscription ID.
        """
        sub = Subscription(
            topic_pattern=topic_pattern,
            handler=handler,
            subscriber_name=subscriber_name,
            lane_filter=lane_filter,
            priority_filter=priority_filter,
        )
        self._subscriptions[sub.id] = sub
        self._topic_index[topic_pattern].add(sub.id)
        self._metrics["subscriptions_active"] += 1
        self._metrics["subscriptions_total"] += 1

        logger.info(
            "Subscription registered: pattern=%s subscriber=%s id=%s",
            topic_pattern, subscriber_name, sub.id,
        )
        return sub.id

    async def unsubscribe(self, subscription_id: str) -> bool:
        """Remove a subscription by ID."""
        sub = self._subscriptions.pop(subscription_id, None)
        if sub is None:
            return False
        self._topic_index[sub.topic_pattern].discard(subscription_id)
        if not self._topic_index[sub.topic_pattern]:
            del self._topic_index[sub.topic_pattern]
        self._metrics["subscriptions_active"] -= 1
        logger.info("Subscription removed: id=%s", subscription_id)
        return True

    # ── Dispatch Loop ──────────────────────────────────────────

    async def _dispatch_loop(self):
        """Background worker that dispatches events to subscribers."""
        while self._running:
            try:
                event = await asyncio.wait_for(self._queue.get(), timeout=1.0)
            except asyncio.TimeoutError:
                continue

            if event is None:  # shutdown sentinel
                break

            matching_subs = self._find_matching_subscriptions(event)
            tasks = []
            for sub in matching_subs:
                tasks.append(self._deliver_event(event, sub))

            if tasks:
                await asyncio.gather(*tasks, return_exceptions=True)

    def _find_matching_subscriptions(self, event: KernelEvent) -> List[Subscription]:
        """Find all subscriptions matching an event's topic, lane, and priority."""
        matches = []
        for pattern, sub_ids in self._topic_index.items():
            if fnmatch.fnmatch(event.topic, pattern):
                for sub_id in sub_ids:
                    sub = self._subscriptions.get(sub_id)
                    if sub and sub.active and sub.handler:
                        # Lane filter
                        if sub.lane_filter and event.lane != sub.lane_filter:
                            continue
                        # Priority filter
                        if sub.priority_filter and event.priority != sub.priority_filter:
                            continue
                        matches.append(sub)
        return matches

    async def _deliver_event(self, event: KernelEvent, sub: Subscription):
        """Deliver an event to a subscriber with retry logic."""
        for attempt in range(1, self._max_retries + 1):
            try:
                await sub.handler(event)
                self._metrics["events_delivered"] += 1
                return
            except Exception as exc:
                logger.warning(
                    "Delivery failed (attempt %d/%d): topic=%s subscriber=%s error=%s",
                    attempt, self._max_retries, event.topic, sub.subscriber_name, str(exc),
                )
                if attempt < self._max_retries:
                    await asyncio.sleep(self._retry_delay * attempt)

        # All retries exhausted — dead letter
        self._metrics["events_failed"] += 1
        self._metrics["events_dead_lettered"] += 1
        dle = DeadLetterEntry(
            event=event,
            error=f"Max retries ({self._max_retries}) exhausted",
            subscriber_id=sub.id,
            retry_count=self._max_retries,
        )
        self._dead_letter_queue.append(dle)
        if len(self._dead_letter_queue) > self._max_dead_letters:
            self._dead_letter_queue = self._dead_letter_queue[-self._max_dead_letters:]
        logger.error(
            "Event dead-lettered: topic=%s subscriber=%s event_id=%s",
            event.topic, sub.subscriber_name, event.id,
        )

    # ── Query API ──────────────────────────────────────────────

    def get_event_history(
        self,
        topic: Optional[str] = None,
        lane: Optional[EventLane] = None,
        source: Optional[str] = None,
        limit: int = 100,
    ) -> List[Dict[str, Any]]:
        """Query event history with optional filters."""
        events = self._event_history
        if topic:
            events = [e for e in events if fnmatch.fnmatch(e.topic, topic)]
        if lane:
            events = [e for e in events if e.lane == lane]
        if source:
            events = [e for e in events if e.source == source]
        return [e.to_dict() for e in events[-limit:]]

    def get_dead_letters(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Retrieve dead-lettered events."""
        return [
            {
                "event": dle.event.to_dict(),
                "error": dle.error,
                "subscriber_id": dle.subscriber_id,
                "failed_at": dle.failed_at,
                "retry_count": dle.retry_count,
            }
            for dle in self._dead_letter_queue[-limit:]
        ]

    def get_subscriptions(self) -> List[Dict[str, Any]]:
        """List all active subscriptions."""
        return [
            {
                "id": sub.id,
                "topic_pattern": sub.topic_pattern,
                "subscriber_name": sub.subscriber_name,
                "lane_filter": sub.lane_filter.value if sub.lane_filter else None,
                "priority_filter": sub.priority_filter.value if sub.priority_filter else None,
                "active": sub.active,
                "created_at": sub.created_at,
            }
            for sub in self._subscriptions.values()
        ]

    def get_metrics(self) -> Dict[str, Any]:
        """Return bus metrics for observability."""
        return {
            "events_published": self._metrics["events_published"],
            "events_delivered": self._metrics["events_delivered"],
            "events_failed": self._metrics["events_failed"],
            "events_dead_lettered": self._metrics["events_dead_lettered"],
            "subscriptions_active": self._metrics["subscriptions_active"],
            "subscriptions_total": self._metrics["subscriptions_total"],
            "event_history_size": len(self._event_history),
            "dead_letter_size": len(self._dead_letter_queue),
            "queue_size": self._queue.qsize(),
            "running": self._running,
            "top_topics": dict(
                sorted(
                    self._metrics["by_topic"].items(),
                    key=lambda x: x[1],
                    reverse=True,
                )[:20]
            ),
            "by_lane": dict(self._metrics["by_lane"]),
            "by_source": dict(self._metrics["by_source"]),
        }

    # ── Convenience Publishers ─────────────────────────────────

    async def emit_security_event(
        self, event_type: str, payload: Dict[str, Any], source: str = "system"
    ) -> str:
        """Convenience: emit a security event on Lane 1."""
        return await self.publish(KernelEvent(
            topic=f"security.{event_type}",
            payload=payload,
            source=source,
            lane=EventLane.AI,
            priority=EventPriority.HIGH,
        ))

    async def emit_data_event(
        self, event_type: str, payload: Dict[str, Any], source: str = "system"
    ) -> str:
        """Convenience: emit a data event on Lane 3."""
        return await self.publish(KernelEvent(
            topic=f"data.{event_type}",
            payload=payload,
            source=source,
            lane=EventLane.DATA,
            priority=EventPriority.NORMAL,
        ))

    async def emit_user_event(
        self, event_type: str, payload: Dict[str, Any], source: str = "system"
    ) -> str:
        """Convenience: emit a user event on Lane 2."""
        return await self.publish(KernelEvent(
            topic=f"user.{event_type}",
            payload=payload,
            source=source,
            lane=EventLane.USER,
            priority=EventPriority.NORMAL,
        ))

    async def emit_system_event(
        self, event_type: str, payload: Dict[str, Any], source: str = "system"
    ) -> str:
        """Convenience: emit a system/cross-lane event."""
        return await self.publish(KernelEvent(
            topic=f"system.{event_type}",
            payload=payload,
            source=source,
            lane=EventLane.SYSTEM,
            priority=EventPriority.NORMAL,
        ))


# ── Module-level singleton accessor ───────────────────────────

def get_event_bus() -> KernelEventBus:
    """Get the singleton event bus instance (sync accessor)."""
    return KernelEventBus.get_instance_sync()