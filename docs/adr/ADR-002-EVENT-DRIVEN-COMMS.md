# ADR-002: Event-Driven Agent Communication Protocol

**Status:** Accepted
**Date:** 2026-02-25
**Author:** Drew (Trancendos)

## Context

The Trancendos ecosystem includes 27+ specialized AI agents that must communicate reliably. We need a communication pattern that supports loose coupling, service discovery, and scales from a single-machine development setup to a distributed production cluster. The pattern must work within zero-cost infrastructure constraints.

## Decision

We will use an event-driven pub/sub architecture with a pluggable EventBus interface. The default implementation is an in-memory bus for development. Production deployments can swap in NATS (self-hosted on Oracle Always Free) or Cloudflare Queues (free tier: 1M messages/month) without code changes.

All events follow a standardized schema (see `@trancendos/agent-sdk` types) with UUID identification, dot-notation type naming, W3C Trace Context correlation IDs, and semver schema versioning.

## Consequences

### Positive
- Agents are fully decoupled — can be developed, tested, and deployed independently
- In-memory bus enables zero-cost local development and testing
- EventBus interface allows production adapter without changing agent code
- Correlation IDs enable distributed tracing across agent chains
- Dead-letter queues prevent message loss

### Negative
- At-least-once delivery means handlers must be idempotent
- Event ordering only guaranteed within a single channel (not globally)
- In-memory bus provides no persistence (acceptable for dev, not production)
- Adds complexity vs direct HTTP calls for simple request/response patterns

## Alternatives Considered

| Alternative | Pros | Cons | Why Rejected |
|------------|------|------|-------------|
| Direct HTTP/REST | Simple, well-understood | Tight coupling, no broadcast, harder to trace | Doesn't scale to 27+ agents |
| gRPC | Type-safe, efficient | Complex setup, requires proto definitions, no pub/sub native | Over-engineered for current scale |
| Redis Pub/Sub | Fast, simple | No persistence, no dead-letter, Redis costs money at scale | Not zero-cost |
| Kafka | Enterprise-grade, durable | Heavy resource requirements, not suitable for free tier | Too heavy for zero-cost |

## References

- [Agent SDK EventBus interface](../agent-development-kit/packages/agent-sdk/src/types.ts)
- [ECOSYSTEM.md — Communication Protocol](../documentation-framework/ecosystem/ECOSYSTEM.md)
