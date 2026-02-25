// src/index.ts - Entry point for {{AGENT_NAME}}

import { {{AGENT_CLASS}} } from "./agent";

export { {{AGENT_CLASS}} };

// ── Standalone execution ─────────────────────────────────────────

async function main(): Promise<void> {
  const agent = new {{AGENT_CLASS}}();

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\nReceived ${signal}, shutting down gracefully...`);
    await agent.shutdown();
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  try {
    await agent.initialize();
    console.log(`✅ {{AGENT_NAME}} is running (${agent.config.id} v${agent.config.version})`);
  } catch (err) {
    console.error("❌ Failed to start agent:", err);
    process.exit(1);
  }
}

// Only run if executed directly (not imported)
if (require.main === module) {
  main();
}
