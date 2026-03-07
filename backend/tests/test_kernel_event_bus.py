# tests/test_kernel_event_bus.py — Kernel Event Bus unit tests
import pytest
import asyncio
from kernel_event_bus import (
    KernelEventBus,
    KernelEvent,
    EventLane,
    EventPriority,
)


@pytest.fixture(autouse=True)
def reset_bus():
    """Reset singleton between tests."""
    KernelEventBus.reset()
    yield
    KernelEventBus.reset()


@pytest.mark.asyncio
async def test_singleton():
    """Bus is a singleton."""
    bus1 = await KernelEventBus.get_instance()
    bus2 = await KernelEventBus.get_instance()
    assert bus1 is bus2


@pytest.mark.asyncio
async def test_publish_stores_history():
    """Published events are stored in history."""
    bus = await KernelEventBus.get_instance()
    await bus.start()
    try:
        event = KernelEvent(
            topic="test.event",
            payload={"key": "value"},
            source="test",
            lane=EventLane.SYSTEM,
        )
        event_id = await bus.publish(event)
        assert event_id == event.id

        history = bus.get_event_history(topic="test.event")
        assert len(history) >= 1
        assert history[-1]["topic"] == "test.event"
    finally:
        await bus.stop()


@pytest.mark.asyncio
async def test_subscribe_and_deliver():
    """Subscribers receive matching events."""
    bus = await KernelEventBus.get_instance()
    await bus.start()
    received = []

    async def handler(event: KernelEvent):
        received.append(event)

    try:
        await bus.subscribe("test.*", handler, "test_subscriber")

        await bus.publish(KernelEvent(
            topic="test.hello",
            payload={"msg": "world"},
            source="test",
        ))

        # Give the dispatch loop time to process
        await asyncio.sleep(0.5)

        assert len(received) == 1
        assert received[0].topic == "test.hello"
        assert received[0].payload["msg"] == "world"
    finally:
        await bus.stop()


@pytest.mark.asyncio
async def test_wildcard_matching():
    """Wildcard patterns match correctly."""
    bus = await KernelEventBus.get_instance()
    await bus.start()
    received = []

    async def handler(event: KernelEvent):
        received.append(event.topic)

    try:
        await bus.subscribe("security.*", handler, "security_watcher")

        await bus.publish(KernelEvent(topic="security.alert", source="test"))
        await bus.publish(KernelEvent(topic="security.scan", source="test"))
        await bus.publish(KernelEvent(topic="data.sync", source="test"))  # should NOT match

        await asyncio.sleep(0.5)

        assert "security.alert" in received
        assert "security.scan" in received
        assert "data.sync" not in received
    finally:
        await bus.stop()


@pytest.mark.asyncio
async def test_unsubscribe():
    """Unsubscribed handlers stop receiving events."""
    bus = await KernelEventBus.get_instance()
    await bus.start()
    received = []

    async def handler(event: KernelEvent):
        received.append(event)

    try:
        sub_id = await bus.subscribe("unsub.*", handler, "unsub_test")

        await bus.publish(KernelEvent(topic="unsub.before", source="test"))
        await asyncio.sleep(0.3)
        assert len(received) == 1

        result = await bus.unsubscribe(sub_id)
        assert result is True

        await bus.publish(KernelEvent(topic="unsub.after", source="test"))
        await asyncio.sleep(0.3)
        assert len(received) == 1  # no new events
    finally:
        await bus.stop()


@pytest.mark.asyncio
async def test_lane_filter():
    """Lane-filtered subscriptions only receive matching lane events."""
    bus = await KernelEventBus.get_instance()
    await bus.start()
    received = []

    async def handler(event: KernelEvent):
        received.append(event)

    try:
        await bus.subscribe(
            "filtered.*", handler, "lane_filter_test",
            lane_filter=EventLane.AI,
        )

        await bus.publish(KernelEvent(topic="filtered.ai", source="test", lane=EventLane.AI))
        await bus.publish(KernelEvent(topic="filtered.data", source="test", lane=EventLane.DATA))

        await asyncio.sleep(0.5)

        assert len(received) == 1
        assert received[0].lane == EventLane.AI
    finally:
        await bus.stop()


@pytest.mark.asyncio
async def test_dead_letter_on_failure():
    """Failed deliveries go to dead letter queue."""
    bus = await KernelEventBus.get_instance()
    bus._max_retries = 1
    bus._retry_delay = 0.05
    await bus.start()

    async def failing_handler(event: KernelEvent):
        raise RuntimeError("Handler crashed")

    try:
        await bus.subscribe("fail.*", failing_handler, "failing_sub")

        await bus.publish(KernelEvent(topic="fail.test", source="test"))
        await asyncio.sleep(1.0)

        dead_letters = bus.get_dead_letters()
        assert len(dead_letters) >= 1
        assert dead_letters[0]["event"]["topic"] == "fail.test"
    finally:
        await bus.stop()


@pytest.mark.asyncio
async def test_metrics():
    """Metrics are tracked correctly."""
    bus = await KernelEventBus.get_instance()
    await bus.start()

    try:
        await bus.publish(KernelEvent(topic="metrics.test", source="test", lane=EventLane.DATA))
        await asyncio.sleep(0.3)

        metrics = bus.get_metrics()
        assert metrics["events_published"] >= 1
        assert metrics["running"] is True
        assert "metrics.test" in metrics["top_topics"]
    finally:
        await bus.stop()


@pytest.mark.asyncio
async def test_convenience_publishers():
    """Convenience methods publish to correct topics and lanes."""
    bus = await KernelEventBus.get_instance()
    await bus.start()

    try:
        await bus.emit_security_event("alert", {"severity": "high"}, "norman")
        await bus.emit_data_event("sync_complete", {"records": 100}, "hive")
        await bus.emit_user_event("login", {"user": "drew"}, "guardian")
        await bus.emit_system_event("startup", {"version": "3.0"}, "kernel")

        await asyncio.sleep(0.3)

        history = bus.get_event_history()
        topics = [e["topic"] for e in history]
        assert "security.alert" in topics
        assert "data.sync_complete" in topics
        assert "user.login" in topics
        assert "system.startup" in topics
    finally:
        await bus.stop()


@pytest.mark.asyncio
async def test_get_subscriptions():
    """Can list active subscriptions."""
    bus = await KernelEventBus.get_instance()

    async def noop(e):
        pass

    await bus.subscribe("sub1.*", noop, "subscriber_1")
    await bus.subscribe("sub2.*", noop, "subscriber_2")

    subs = bus.get_subscriptions()
    assert len(subs) == 2
    names = [s["subscriber_name"] for s in subs]
    assert "subscriber_1" in names
    assert "subscriber_2" in names