# Infinity OS — Production Deployment Guide

## Prerequisites

- Docker & Docker Compose v2+
- At least one LLM API key (Groq is free)
- (Optional) C2PA certificate for content provenance signing

## Quick Start

```bash
cd backend/

# 1. Create environment file
cp .env.example .env

# 2. Generate a secure JWT secret
python -c "import secrets; print(secrets.token_urlsafe(48))"
# Paste the output into .env as JWT_SECRET_KEY=<value>

# 3. Set your LLM API key (at least one)
# Groq (free): https://console.groq.com/keys
echo "GROQ_API_KEY=gsk_your_key_here" >> .env

# 4. Run database migrations
docker compose --profile migrate up migrate

# 5. Start the full stack
docker compose up -d

# 6. Verify
curl http://localhost:8000/health
```

The API will be at `http://localhost:8000` and the frontend shell at `http://localhost:5173`.

---

## LLM API Key Configuration

Infinity OS supports 5 LLM providers with automatic fallback:

| Provider | Env Variable | Free Tier | Get Key |
|----------|-------------|-----------|---------|
| **Groq** | `GROQ_API_KEY` | ✅ 30 req/min | [console.groq.com/keys](https://console.groq.com/keys) |
| **OpenAI** | `OPENAI_API_KEY` | ❌ Pay-per-use | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| **Anthropic** | `ANTHROPIC_API_KEY` | ❌ Pay-per-use | [console.anthropic.com](https://console.anthropic.com/settings/keys) |
| **HuggingFace** | `HF_API_KEY` | ✅ Rate limited | [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens) |
| **Local (Ollama)** | `LOCAL_LLM_URL` | ✅ Free | [ollama.ai](https://ollama.ai) |

### Fallback Chain
If no `LLM_PROVIDER` is set, the system tries providers in this order:
`groq → openai → anthropic → huggingface → local → stub`

### Force a Specific Provider
```env
LLM_PROVIDER=groq
```

### Secure Key Management

**Development:**
- Store keys in `.env` file (never commit to git)
- `.env` is in `.gitignore`

**Production:**
- Use Docker secrets or Kubernetes secrets
- Use a vault service (HashiCorp Vault, AWS Secrets Manager)
- Rotate keys regularly
- Set `ENVIRONMENT=production` to enforce strict validation

---

## C2PA Content Provenance (EU AI Act)

C2PA cryptographic signing ensures all AI-generated content carries verifiable provenance metadata, as required by EU AI Act Article 50 (deadline: August 2, 2026).

### Generate a Self-Signed Certificate (Development)

```bash
# Generate EC key pair
openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:P-256 \
  -keyout c2pa-key.pem -out c2pa-cert.pem -days 365 -nodes \
  -subj "/CN=InfinityOS C2PA Signer/O=Trancendos"

# (Optional) Convert to PKCS#12
openssl pkcs12 -export -in c2pa-cert.pem -inkey c2pa-key.pem \
  -out c2pa.p12 -passout pass:your_password
```

### Configure C2PA

```env
C2PA_ENABLED=true
C2PA_CERT_PATH=/path/to/c2pa-cert.pem
C2PA_KEY_PATH=/path/to/c2pa-key.pem
C2PA_CLAIM_GENERATOR=InfinityOS/3.0.0
```

### Production Certificate
For production, obtain a certificate from a C2PA-approved Certificate Authority:
- DigiCert
- GlobalSign
- Entrust

### What Gets Signed
Every AI generation request creates a C2PA manifest containing:
- **c2pa.actions**: AI generation disclosure with `algorithmicMedia` source type
- **cawg.training-mining**: Training/mining restriction assertions
- **org.infinityos.ai-provenance**: Model, prompt hash, risk level, timestamps

---

## Database Migrations

### Run Migrations
```bash
# Via Docker Compose
docker compose --profile migrate up migrate

# Or directly with Alembic
cd backend/
alembic upgrade head
```

### Current Schema: 30 Tables
- **Core**: organisations, users, permissions, api_keys, revoked_tokens
- **AI/Governance**: ai_systems, audit_logs, provenance_manifests, dpia_records, hitl_tasks
- **Content**: file_nodes, file_versions, notifications, consent_records
- **Modules**: module_manifests, app_store_listings, module_installations
- **DevOps**: repositories, build_jobs, federated_services
- **Kanban**: boards, board_columns, tasks, task_labels, task_comments, task_history, task_attachments
- **Integrations**: integration_connectors, webhook_endpoints, webhook_deliveries

### Generate New Migration
```bash
cd backend/
alembic revision --autogenerate -m "description of changes"
alembic upgrade head
```

---

## Docker Compose Services

| Service | Port | Description |
|---------|------|-------------|
| `api` | 8000 | FastAPI backend (122 routes) |
| `db` | 5432 | PostgreSQL 16 |
| `redis` | 6379 | Valkey (Redis-compatible) |
| `shell` | 5173 | React frontend (dev mode) |
| `migrate` | — | One-shot Alembic migration |

### Commands
```bash
# Start all services
docker compose up -d

# View logs
docker compose logs -f api

# Run migrations
docker compose --profile migrate up migrate

# Stop all
docker compose down

# Reset database
docker compose down -v  # WARNING: deletes all data
```

---

## Health Check

```bash
curl http://localhost:8000/health
```

Returns:
```json
{
  "status": "healthy",
  "version": "3.0.0",
  "database": "connected",
  "services": {
    "api": "operational",
    "auth": "operational",
    "ai": "operational",
    "compliance": "operational",
    "integrations": "operational",
    "appstore": "operational",
    "notifications": "operational"
  }
}
```

---

## API Documentation

Once running, access interactive API docs at:
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc
