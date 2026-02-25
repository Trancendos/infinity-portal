# {{AGENT_NAME}}

> {{AGENT_DESCRIPTION}}

**Tier:** {{AGENT_TIER}} | **Deployment:** {{DEPLOYMENT_TARGET}} | **Status:** 🟢 Active

## Capabilities

{{CAPABILITIES_LIST}}

## Dependencies

{{DEPENDENCIES_LIST}}

## Quick Start

```bash
npm install
npm run build
npm start
```

## Development

```bash
npm run dev     # Watch mode
npm test        # Run tests
npm run lint    # Lint check
```

## Architecture

This agent extends `BaseAgent` from `@trancendos/agent-sdk` and follows the Trancendos Agent Communication Protocol.

### Events Published
| Event Type | Description |
|------------|-------------|
| `agent.started` | Emitted when agent initializes |
| `agent.stopped` | Emitted on shutdown |
| `agent.health_check` | Periodic health status |

### Events Subscribed
| Event Type | Handler | Description |
|------------|---------|-------------|
| *None yet* | — | Add subscriptions in `registerHandlers()` |

## Health Check

```bash
# Health status is published to event bus every 30s
# Or call programmatically:
const health = agent.getHealth();
```

## Testing

```bash
npm test                    # All tests
npm test -- --watch         # Watch mode
npm test -- --coverage      # Coverage report
```

## License

MIT © Trancendos
