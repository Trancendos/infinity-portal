# ADR-001: Cloudflare Workers for Edge Compute

**Status:** Accepted
**Date:** 2025-01-15
**Author:** Drew (Trancendos)

## Context

The Trancendos platform requires an edge compute layer for API routing, authentication, rate limiting, and security enforcement. The primary constraint is maintaining a $0/month infrastructure cost while achieving global performance. The compute layer must support TypeScript/JavaScript, provide sub-50ms cold starts, and integrate with storage (KV, R2) and AI inference.

## Decision

We will use Cloudflare Workers as the primary edge compute platform for all request-handling services, backed by Cloudflare KV for caching and R2 for object storage.

## Consequences

### Positive
- 100K requests/day free tier covers initial growth
- Global edge deployment (300+ cities) without configuration
- Sub-5ms cold starts (V8 isolates, not containers)
- Native integration with KV, R2, Durable Objects, AI
- Zero egress costs on R2
- Built-in WAF and DDoS protection at no cost

### Negative
- 10ms CPU time limit per request on free tier (sufficient for routing, tight for heavy computation)
- No persistent connections (WebSockets require Durable Objects)
- Vendor-specific APIs (wrangler, Miniflare) add migration friction
- Limited to JavaScript/TypeScript runtime (no Python, Rust WASM partial)

### Neutral
- Requires separate compute (Oracle Always Free K3s) for long-running agent workloads
- Establishes a dual-compute architecture: edge (Cloudflare) + backend (K3s)

## Alternatives Considered

| Alternative | Pros | Cons | Why Rejected |
|------------|------|------|-------------|
| Vercel Edge Functions | Great DX, Next.js native | 100K/month limit (vs 100K/day), no KV/R2 equivalent | Lower free tier |
| Fly.io | Full Docker support, generous free tier | More ops overhead, no native edge CDN | Higher complexity |
| Deno Deploy | Modern runtime, great TS support | Smaller ecosystem, less mature | Less proven at scale |
| AWS Lambda@Edge | Massive ecosystem | Cold starts 200ms+, costs accumulate quickly | Not zero-cost |

## References

- [Cloudflare Workers Free Tier](https://developers.cloudflare.com/workers/platform/limits/)
- [ECOSYSTEM.md — Deployment Topology](../ecosystem/ECOSYSTEM.md)
