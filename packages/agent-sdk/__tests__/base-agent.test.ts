// __tests__/base-agent.test.ts

import {
  BaseAgent,
  InMemoryEventBus,
  createEvent,
  AgentState,
  AgentTier,
  DeploymentTarget,
} from "../src";
import type { AgentConfig, AgentEvent, EventResult } from "../src";

// ── Test Agent Implementation ────────────────────────────────────

class TestAgent extends BaseAgent {
  public initCalled = false;
  public shutdownCalled = false;
  public lastProcessedEvent: AgentEvent | null = null;

  protected async onInitialize(): Promise<void> {
    this.initCalled = true;
  }

  protected async onShutdown(): Promise<void> {
    this.shutdownCalled = true;
  }

  protected getCustomHealthChecks() {
    return {
      model: { status: "pass" as const, message: "Model loaded" },
    };
  }
}

const createTestConfig = (overrides?: Partial<AgentConfig>): AgentConfig => ({
  id: "test-agent",
  name: "Test Agent",
  version: "1.0.0",
  description: "Test agent for unit testing",
  tier: AgentTier.T1_CRITICAL,
  deploymentTarget: DeploymentTarget.STANDALONE,
  capabilities: ["testing"],
  dependencies: [],
  settings: {},
  healthCheckIntervalMs: 0, // disable for tests
  maxConcurrency: 5,
  ...overrides,
});

// ── Tests ────────────────────────────────────────────────────────

describe("BaseAgent", () => {
  let agent: TestAgent;
  let eventBus: InMemoryEventBus;

  beforeEach(() => {
    eventBus = new InMemoryEventBus();
    agent = new TestAgent(createTestConfig(), { eventBus });
  });

  afterEach(async () => {
    if (agent.state !== "STOPPED" && agent.state !== "UNINITIALIZED") {
      await agent.shutdown();
    }
  });

  describe("Lifecycle", () => {
    it("starts in UNINITIALIZED state", () => {
      expect(agent.state).toBe(AgentState.UNINITIALIZED);
    });

    it("transitions to READY after initialize()", async () => {
      await agent.initialize();
      expect(agent.state).toBe(AgentState.READY);
      expect(agent.initCalled).toBe(true);
    });

    it("transitions to STOPPED after shutdown()", async () => {
      await agent.initialize();
      await agent.shutdown();
      expect(agent.state).toBe(AgentState.STOPPED);
      expect(agent.shutdownCalled).toBe(true);
    });

    it("throws if initialized twice", async () => {
      await agent.initialize();
      await expect(agent.initialize()).rejects.toThrow("Cannot initialize");
    });

    it("tracks uptime after initialization", async () => {
      await agent.initialize();
      expect(agent.uptime).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Event System", () => {
    it("subscribes to and receives events", async () => {
      let received: AgentEvent | null = null;

      agent.subscribe("test.event", async (event) => {
        received = event;
        return { success: true, durationMs: 0 };
      });

      await agent.initialize();
      await agent.publish("test.event", { message: "hello" });

      // Allow async processing
      await new Promise((r) => setTimeout(r, 50));

      expect(received).not.toBeNull();
      expect(received!.type).toBe("test.event");
      expect(received!.data).toEqual({ message: "hello" });
    });

    it("publishes agent.started event on init", async () => {
      const events: AgentEvent[] = [];

      eventBus.subscribe("agent.started", async (event) => {
        events.push(event);
        return { success: true, durationMs: 0 };
      });

      await eventBus.connect();
      // Reconnect the agent with the pre-subscribed bus
      agent = new TestAgent(createTestConfig(), { eventBus });
      await agent.initialize();

      await new Promise((r) => setTimeout(r, 50));
      expect(events.length).toBeGreaterThanOrEqual(1);
    });

    it("respects concurrency limits", async () => {
      const config = createTestConfig({ maxConcurrency: 1 });
      const limitedAgent = new TestAgent(config, { eventBus });

      let concurrentCount = 0;
      let maxConcurrent = 0;

      limitedAgent.subscribe("slow.event", async () => {
        concurrentCount++;
        maxConcurrent = Math.max(maxConcurrent, concurrentCount);
        await new Promise((r) => setTimeout(r, 50));
        concurrentCount--;
        return { success: true, durationMs: 50 };
      });

      await limitedAgent.initialize();

      // Fire multiple events simultaneously
      await Promise.all([
        limitedAgent.publish("slow.event", {}),
        limitedAgent.publish("slow.event", {}),
        limitedAgent.publish("slow.event", {}),
      ]);

      await new Promise((r) => setTimeout(r, 200));
      expect(maxConcurrent).toBeLessThanOrEqual(1);

      await limitedAgent.shutdown();
    });
  });

  describe("Health Checks", () => {
    it("returns health status", async () => {
      await agent.initialize();
      const health = agent.getHealth();

      expect(health.agentId).toBe("test-agent");
      expect(health.state).toBe(AgentState.READY);
      expect(health.version).toBe("1.0.0");
      expect(health.uptime).toBeGreaterThanOrEqual(0);
      expect(health.checks.model.status).toBe("pass");
    });
  });

  describe("Metrics", () => {
    it("collects metrics during event processing", async () => {
      agent.subscribe("metric.test", async () => {
        return { success: true, durationMs: 1 };
      });

      await agent.initialize();
      await agent.publish("metric.test", {});
      await new Promise((r) => setTimeout(r, 50));

      const metrics = agent.getMetrics();
      expect(metrics.length).toBeGreaterThan(0);

      const publishMetric = metrics.find((m) => m.name.includes("events_published"));
      expect(publishMetric).toBeDefined();
    });

    it("flushes metrics on getMetrics()", async () => {
      await agent.initialize();
      await agent.publish("any.event", {});
      await new Promise((r) => setTimeout(r, 50));

      const first = agent.getMetrics();
      const second = agent.getMetrics();

      expect(first.length).toBeGreaterThan(0);
      expect(second.length).toBe(0);
    });
  });
});

describe("InMemoryEventBus", () => {
  it("delivers events to subscribers", async () => {
    const bus = new InMemoryEventBus();
    await bus.connect();

    let received = false;
    bus.subscribe("test", async () => {
      received = true;
      return { success: true, durationMs: 0 };
    });

    const event = createEvent("test", "source", { foo: "bar" });
    await bus.publish(event);

    expect(received).toBe(true);
  });

  it("throws if publishing before connect", async () => {
    const bus = new InMemoryEventBus();
    const event = createEvent("test", "source", {});
    await expect(bus.publish(event)).rejects.toThrow("not connected");
  });

  it("delivers to wildcard subscribers", async () => {
    const bus = new InMemoryEventBus();
    await bus.connect();

    let received = false;
    bus.subscribe("*", async () => {
      received = true;
      return { success: true, durationMs: 0 };
    });

    const event = createEvent("any.type", "source", {});
    await bus.publish(event);

    expect(received).toBe(true);
  });
});

describe("createEvent", () => {
  it("creates a well-formed event", () => {
    const event = createEvent("test.type", "agent-1", { key: "value" });

    expect(event.id).toBeDefined();
    expect(event.type).toBe("test.type");
    expect(event.source).toBe("agent-1");
    expect(event.target).toBeNull();
    expect(event.data).toEqual({ key: "value" });
    expect(event.timestamp).toBeDefined();
    expect(event.correlationId).toBeDefined();
    expect(event.schemaVersion).toBe("1.0.0");
  });

  it("accepts optional parameters", () => {
    const event = createEvent("test", "src", {}, {
      target: "agent-2",
      correlationId: "corr-123",
      metadata: { trace: "abc" },
    });

    expect(event.target).toBe("agent-2");
    expect(event.correlationId).toBe("corr-123");
    expect(event.metadata.trace).toBe("abc");
  });
});
