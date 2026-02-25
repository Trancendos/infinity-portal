// tests/agent.test.ts - Tests for {{AGENT_NAME}}

import { {{AGENT_CLASS}} } from "../src/agent";
import { InMemoryEventBus, AgentState } from "@trancendos/agent-sdk";

describe("{{AGENT_NAME}}", () => {
  let agent: {{AGENT_CLASS}};
  let eventBus: InMemoryEventBus;

  beforeEach(() => {
    eventBus = new InMemoryEventBus();
    agent = new {{AGENT_CLASS}}({ eventBus } as any);
  });

  afterEach(async () => {
    if (agent.state !== AgentState.STOPPED && agent.state !== AgentState.UNINITIALIZED) {
      await agent.shutdown();
    }
  });

  it("should initialize successfully", async () => {
    await agent.initialize();
    expect(agent.state).toBe(AgentState.READY);
  });

  it("should report healthy status", async () => {
    await agent.initialize();
    const health = agent.getHealth();
    expect(health.agentId).toBe("{{AGENT_ID}}");
    expect(health.state).toBe(AgentState.READY);
    expect(health.checks.core.status).toBe("pass");
  });

  it("should shut down gracefully", async () => {
    await agent.initialize();
    await agent.shutdown();
    expect(agent.state).toBe(AgentState.STOPPED);
  });

  it("should have correct config", () => {
    expect(agent.config.id).toBe("{{AGENT_ID}}");
    expect(agent.config.name).toBe("{{AGENT_NAME}}");
    expect(agent.config.capabilities).toContain({{FIRST_CAPABILITY}});
  });

  // TODO: Add agent-specific tests
});
