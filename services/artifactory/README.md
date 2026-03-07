# 📦 Trancendos Artifactory v2.0.0

> Enterprise artifact registry, multi-protocol package management, and intelligent asset storage for the Trancendos Ecosystem mesh.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    TRANCENDOS ARTIFACTORY                       │
│                    Port 3041 | Wave 5                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │  API Layer   │  │  Registry   │  │  Protocol Handlers      │ │
│  │  Express +   │  │  Engine     │  │  ├── npm               │ │
│  │  Helmet +    │──│  (Core)     │──│  ├── Docker/OCI        │ │
│  │  Morgan      │  │             │  │  ├── Helm              │ │
│  │  Keycloak    │  │             │  │  ├── Terraform         │ │
│  │  JWT Auth    │  │             │  │  ├── PyPI              │ │
│  └─────────────┘  └─────────────┘  │  └── Generic           │ │
│                                     └─────────────────────────┘ │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │  Security    │  │ Intelligence│  │  Mesh Connectors        │ │
│  │  ├── Scanner │  │  ├── Anomaly│  │  ├── Nexus             │ │
│  │  ├── Policy  │  │  ├── Deps   │  │  ├── Agora             │ │
│  │  ├── SBOM    │  │  ├── Cache  │  │  ├── Observatory       │ │
│  │  ├── Signer  │  │  └──────────┘  │  ├── Lighthouse        │ │
│  │  └── Prove.  │  │               │  ├── Treasury           │ │
│  └─────────────┘  │               │  ├── IceBox             │ │
│                    │               │  └── Cornelius           │ │
│  ┌─────────────┐  │  ┌──────────┐ └─────────────────────────┘ │
│  │  Storage     │  │  │  Tenant  │                              │
│  │  ├── R2/S3   │  │  │  Manager │  ┌─────────────────────────┐ │
│  │  ├── Lifecy. │  │  └──────────┘  │  2060 Resilience Layer  │ │
│  │  └── Backend │  │               │  SmartEventBus + Breaker │ │
│  └─────────────┘  │               └─────────────────────────┘ │
│                    │                                            │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  Config: Environment + Database + Config Mesh (Redis)       ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

## Modules

| Module | Files | Description |
|--------|-------|-------------|
| `registry/` | 8 | Multi-protocol engine with npm, Docker, Helm, Terraform, PyPI, generic handlers |
| `security/` | 5 | Scanner orchestrator, policy engine, SBOM generator, artifact signer, provenance tracker |
| `intelligence/` | 3 | Anomaly detection, dependency graph analysis, predictive caching |
| `mesh/` | 8 | Base connector + 7 ecosystem connectors (Agora, Cornelius, IceBox, Lighthouse, Nexus, Observatory, Treasury) |
| `storage/` | 3 | Abstract backend, R2/S3 implementation, lifecycle manager |
| `tenant/` | 1 | Multi-tenant isolation and management |
| `config/` | 3 | Zod-validated environment, Drizzle ORM database schema, Redis config mesh |
| `api/` | 2 | Express server with Keycloak JWT auth, RBAC, rate limiting, Zod validation |
| `middleware/` | 1 | 2060 Smart Resilience Layer (circuit breaker, event bus, telemetry) |

## Quick Start

```bash
# Development
cp .env.example .env
npm install
npm run dev

# With infrastructure (PostgreSQL, Redis, Meilisearch)
docker-compose up -d
npm run db:push
npm run dev

# Production
npm run build
npm start
```

## API Endpoints

### Health (No Auth)
- `GET /health` — Service health
- `GET /readiness` — Component readiness
- `GET /liveness` — Process liveness

### Registry Protocols
- `GET/PUT /npm/*` — npm registry (anonymous read for public)
- `GET/PUT /v2/*` — Docker/OCI registry
- `GET/PUT /api/v1/helm/*` — Helm chart repository
- `GET /api/v1/terraform/*` — Terraform module registry
- `GET/PUT /api/v1/pypi/*` — PyPI package index
- `GET/PUT /api/v1/generic/*` — Generic artifact storage

### Management API (Auth Required)
- `GET /api/v1/artifacts/:id` — Get artifact metadata
- `POST /api/v1/artifacts/:id/promote` — Promote artifact
- `POST /api/v1/artifacts/:id/quarantine` — Quarantine artifact
- `POST /api/v1/artifacts/:id/scan` — Trigger security scan
- `DELETE /api/v1/artifacts/:id` — Delete artifact (admin)
- `GET /api/v1/search?q=` — Search artifacts
- `GET /api/v1/policies` — List security policies
- `GET /api/v1/tenants` — List tenants (admin)

## Ecosystem Integration

| Service | Connection | Purpose |
|---------|-----------|---------|
| Nexus (3030) | Mesh connector | Service discovery |
| Agora (3040) | Mesh connector | API marketplace |
| Observatory (3042) | Mesh connector | Monitoring & telemetry |
| Lighthouse (3043) | Mesh connector | Governance & compliance |
| Treasury (3044) | Mesh connector | Billing & usage |
| IceBox (3045) | Mesh connector | Cold storage & archival |
| Cornelius (3046) | Mesh connector | AI/ML pipeline |

## 2060 Compliance

- ✅ Smart Resilience Layer (circuit breaker, event bus, adaptive telemetry)
- ✅ Keycloak JWT + RBAC authentication
- ✅ Zod schema validation on all inputs
- ✅ Distributed tracing (X-Trace-Id propagation)
- ✅ Adaptive rate limiting per tenant
- ✅ Graceful shutdown with connection draining
- ✅ Multi-stage Docker build with non-root user
- ✅ SBOM generation and artifact signing
- ✅ Provenance tracking (SLSA Level 3)

## License

MIT — Part of the Trancendos Ecosystem