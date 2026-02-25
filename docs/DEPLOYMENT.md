# Infinity OS — Deployment Guide

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Infinity OS v3.0                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  Shell UI     │  │  Backend API │  │  Identity Worker │  │
│  │  React+TS     │  │  FastAPI     │  │  Cloudflare      │  │
│  │  Port 5173    │  │  Port 8000   │  │  Workers         │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────────┘  │
│         │                  │                  │              │
│         └──────────┬───────┘──────────────────┘              │
│                    │                                         │
│         ┌──────────┴──────────┐                              │
│         │   PostgreSQL 16     │                              │
│         │   + pgvector        │                              │
│         │   + RLS enabled     │                              │
│         └──────────┬──────────┘                              │
│                    │                                         │
│         ┌──────────┴──────────┐                              │
│         │   Valkey (Redis)    │                              │
│         │   Cache + Sessions  │                              │
│         └─────────────────────┘                              │
└─────────────────────────────────────────────────────────────┘
```

## Quick Start (Development)

### Prerequisites
- Docker & Docker Compose
- Node.js 20+
- Python 3.12+
- Git

### 1. Clone & Setup

```bash
git clone https://github.com/Trancendos/infinity-portal.git
cd infinity-portal
cp backend/.env.example backend/.env
# Edit backend/.env with your values
```

### 2. Start with Docker Compose

```bash
cd backend
docker compose up -d
```

This starts:
- PostgreSQL on port 5432
- Valkey (Redis) on port 6379
- Backend API on port 8000
- Frontend Shell on port 5173

### 3. Run Migrations

```bash
docker compose --profile migrate run migrate
```

### 4. Access

- **Shell UI:** http://localhost:5173
- **API Docs:** http://localhost:8000/docs
- **Health Check:** http://localhost:8000/health

## Manual Setup (Without Docker)

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r requirements.txt

# Set environment variables
export DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/infinity_os
export JWT_SECRET_KEY=$(python -c "import secrets; print(secrets.token_urlsafe(64))")

# Run migrations
alembic upgrade head

# Start server
uvicorn main:app --reload --port 8000
```

### Frontend

```bash
cd apps/shell
npm install
VITE_BACKEND_API_URL=http://localhost:8000 npm run dev
```

## Production Deployment

### Environment Variables (Required)

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql+asyncpg://...` |
| `JWT_SECRET_KEY` | 64+ char random string | `openssl rand -base64 64` |
| `CORS_ORIGINS` | Allowed frontend origins | `https://app.infinity-os.dev` |
| `ENVIRONMENT` | Runtime environment | `production` |

### Environment Variables (Optional)

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | `INFO` | Logging level |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `30` | JWT access token TTL |
| `REFRESH_TOKEN_EXPIRE_DAYS` | `7` | Refresh token TTL |
| `REDIS_URL` | `redis://localhost:6379` | Redis/Valkey URL |
| `FILE_STORAGE_ROOT` | `/data/files` | File storage path |
| `GIT_STORAGE_ROOT` | `/data/repos` | Git repo storage path |
| `BUILD_OUTPUT_ROOT` | `/data/builds` | Build artifacts path |
| `GITHUB_TOKEN` | - | GitHub PAT for repo sync |
| `GITHUB_ORG` | `Trancendos` | GitHub organisation |

### Zero-Cost Deployment Stack

| Service | Provider | Tier |
|---------|----------|------|
| Database | Neon | Free (0.5GB) |
| Compute | Koyeb | Free (1 instance) |
| Edge/CDN | Cloudflare | Free |
| Redis | Upstash | Free (10K/day) |
| Container Registry | GHCR | Free (public) |
| CI/CD | GitHub Actions | Free (2K min/month) |

### Terraform Deployment

```bash
cd infrastructure/terraform
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars

terraform init
terraform plan
terraform apply
```

## API Endpoints

### Authentication
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/auth/register` | Register new user |
| POST | `/api/v1/auth/login` | Login |
| POST | `/api/v1/auth/refresh` | Refresh token |
| POST | `/api/v1/auth/logout` | Logout |
| GET | `/api/v1/auth/me` | Current user info |
| PUT | `/api/v1/auth/change-password` | Change password |

### Users
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/users` | List users |
| GET | `/api/v1/users/{id}` | Get user |
| PATCH | `/api/v1/users/{id}` | Update user |
| PUT | `/api/v1/users/{id}/role` | Change role |
| POST | `/api/v1/users/{id}/deactivate` | Deactivate |
| POST | `/api/v1/users/invite` | Invite user |

### Organisations
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/organisations` | List orgs |
| GET | `/api/v1/organisations/current` | Current org |
| POST | `/api/v1/organisations` | Create org |
| PATCH | `/api/v1/organisations/current` | Update org |

### AI Generation
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/ai/generate` | Generate content |
| GET | `/api/v1/ai/hitl/pending` | Pending reviews |
| POST | `/api/v1/ai/hitl/{id}/review` | Review task |

### Compliance
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/compliance/ai-systems` | Register system |
| GET | `/api/v1/compliance/risk-assessment/{id}` | Risk assessment |
| GET | `/api/v1/compliance/audit-log` | Audit logs |
| GET/POST | `/api/v1/compliance/dpia` | DPIAs |
| GET | `/api/v1/compliance/dashboard` | Dashboard |

### Files
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/files` | List files |
| POST | `/api/v1/files` | Create file |
| GET | `/api/v1/files/{id}/content` | Get content |
| PUT | `/api/v1/files/{id}/content` | Update content |
| DELETE | `/api/v1/files/{id}` | Delete file |

### Repositories
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/repos` | List repos |
| POST | `/api/v1/repos` | Create repo |
| GET | `/api/v1/repos/{id}/commits` | Commits |
| GET | `/api/v1/repos/{id}/branches` | Branches |
| GET | `/api/v1/repos/{id}/tree` | File tree |
| POST | `/api/v1/repos/{id}/github/push` | Push to GitHub |
| POST | `/api/v1/repos/{id}/github/pull` | Pull from GitHub |

### Builds
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/builds` | Trigger build |
| GET | `/api/v1/builds` | List builds |
| GET | `/api/v1/builds/{id}` | Build status |
| POST | `/api/v1/builds/{id}/cancel` | Cancel build |

### Federation
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/federation/ecosystem` | Ecosystem map |
| GET | `/api/v1/federation/services` | Connected services |
| POST | `/api/v1/federation/services` | Register service |
| POST | `/api/v1/federation/services/{id}/invoke` | Invoke capability |

### WebSocket
| Path | Description |
|------|-------------|
| `ws://host/ws?token=JWT` | Real-time events |

## Security

### Role Hierarchy (5-Tier)
1. **super_admin** (Level 5) — Platform-wide administration
2. **org_admin** (Level 4) — Organisation management
3. **auditor** (Level 3) — Read-only compliance access
4. **power_user** (Level 2) — Advanced features
5. **user** (Level 1) — Standard access

### Security Features
- JWT with JTI for token revocation
- bcrypt password hashing (12 rounds)
- 12-character minimum passwords with complexity
- Brute force protection (5 attempts, 15-min lockout)
- Security headers (CSP, HSTS, X-Frame-Options)
- Request correlation IDs for tracing
- Audit logging on all operations
- Soft deletes for GDPR compliance

## Compliance

- **EU AI Act** — Risk classification, HITL governance, C2PA provenance
- **GDPR** — Consent management, soft deletes, data subject rights
- **ISO 27001** — Control mapping, audit trails, access management
- **SOC 2** — Audit logging, access controls, encryption