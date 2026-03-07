# ☁️ Cloudflare Deployment Guide — Infinity OS

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    CLOUDFLARE EDGE                       │
│                                                         │
│  ┌──────────────────┐    ┌──────────────────────────┐   │
│  │  Cloudflare Pages │    │  Cloudflare Workers      │   │
│  │  (Frontend Shell) │    │  (Identity, Orchestrator,│   │
│  │  React + Vite PWA │    │   Royal Bank, Exchange)  │   │
│  └────────┬─────────┘    └────────────┬─────────────┘   │
│           │                           │                  │
│  ┌────────┴───────────────────────────┴─────────────┐   │
│  │            Cloudflare Tunnel (Zero Trust)          │   │
│  └────────────────────────┬─────────────────────────┘   │
└───────────────────────────┼─────────────────────────────┘
                            │
┌───────────────────────────┼─────────────────────────────┐
│                    YOUR SERVER / VPS                      │
│                                                          │
│  ┌────────────────────────┴─────────────────────────┐   │
│  │              Docker Compose Stack                  │   │
│  │                                                    │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────┐    │   │
│  │  │ FastAPI   │  │ Postgres │  │ Valkey/Redis │    │   │
│  │  │ Backend   │  │   16     │  │    8         │    │   │
│  │  │ :8000     │  │  :5432   │  │   :6379      │    │   │
│  │  └──────────┘  └──────────┘  └──────────────┘    │   │
│  └───────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

## Deployment Strategy

| Component | Platform | Cost |
|---|---|---|
| **Frontend Shell** | Cloudflare Pages (free tier) | $0 |
| **Edge Workers** | Cloudflare Workers (free tier: 100K req/day) | $0 |
| **API Backend** | Docker on VPS behind Cloudflare Tunnel | VPS cost only |
| **Database** | PostgreSQL in Docker | Included in VPS |
| **Cache** | Valkey (Redis-compatible) in Docker | Included in VPS |
| **DNS + SSL** | Cloudflare (free tier) | $0 |
| **DDoS Protection** | Cloudflare (free tier) | $0 |
| **CDN** | Cloudflare (free tier) | $0 |

---

## Step 1: Cloudflare Account Setup

### 1.1 Create Cloudflare Account
1. Go to [dash.cloudflare.com](https://dash.cloudflare.com)
2. Sign up (free tier is sufficient)
3. Note your **Account ID** (Settings → Account)

### 1.2 Add Your Domain
1. Go to **Websites** → **Add a site**
2. Enter your domain (e.g., `infinity-os.dev`)
3. Select **Free** plan
4. Update your domain's nameservers to Cloudflare's

### 1.3 Create API Token
1. Go to **My Profile** → **API Tokens**
2. Click **Create Token**
3. Use template: **Edit Cloudflare Workers**
4. Add permissions:
   - Account → Cloudflare Pages → Edit
   - Account → Cloudflare Workers → Edit
   - Zone → DNS → Edit
5. Save the token as `CLOUDFLARE_API_TOKEN`

---

## Step 2: Deploy Frontend (Cloudflare Pages)

### 2.1 Manual Deploy (First Time)
```bash
# From repo root
cd apps/shell

# Build the frontend
pnpm install
npx vite build

# Deploy to Cloudflare Pages
npx wrangler pages deploy dist --project-name=infinity-os-shell
```

### 2.2 Automatic Deploy (GitHub Actions)
Add these secrets to your GitHub repo:
- `CLOUDFLARE_API_TOKEN` — Your API token from Step 1.3
- `CLOUDFLARE_ACCOUNT_ID` — Your account ID

The workflow `.github/workflows/deploy-cloudflare-pages.yml` will auto-deploy on push to `main`.

### 2.3 Custom Domain for Pages
1. Go to **Workers & Pages** → **infinity-os-shell** → **Custom domains**
2. Add: `app.infinity-os.dev` (or your domain)
3. Cloudflare auto-provisions SSL

---

## Step 3: Deploy Backend (Cloudflare Tunnel)

### 3.1 Install cloudflared on Your Server
```bash
# Debian/Ubuntu
curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared.deb

# Authenticate
cloudflared tunnel login
```

### 3.2 Create Tunnel
```bash
# Create the tunnel
cloudflared tunnel create infinity-os

# Note the Tunnel ID (e.g., abc123-def456-...)
# Credentials file is saved to ~/.cloudflared/<TUNNEL_ID>.json
```

### 3.3 Configure Tunnel
Copy `infrastructure/cloudflare/tunnel.yml` to your server and update:
```yaml
tunnel: YOUR_TUNNEL_ID
credentials-file: /etc/cloudflared/YOUR_TUNNEL_ID.json
```

### 3.4 Create DNS Records
```bash
# Point your API subdomain to the tunnel
cloudflared tunnel route dns infinity-os api.infinity-os.dev
cloudflared tunnel route dns infinity-os admin.infinity-os.dev
```

### 3.5 Start the Stack
```bash
# Clone the repo
git clone https://github.com/Trancendos/infinity-portal.git
cd infinity-portal/backend

# Create .env from template
cp .env.example .env
# Edit .env with your secrets (JWT_SECRET_KEY, DB_PASSWORD, etc.)

# Start everything
docker compose up -d

# Start the tunnel
cloudflared tunnel --config infrastructure/cloudflare/tunnel.yml run
```

---

## Step 4: Deploy Workers (Optional Edge Functions)

### 4.1 Deploy Individual Workers
```bash
# Identity Worker
cd workers/identity
npx wrangler deploy

# Orchestrator Worker
cd workers/orchestrator
npx wrangler deploy

# Royal Bank Worker
cd workers/royal-bank
npx wrangler deploy
```

---

## Step 5: GitHub Secrets Configuration

Add these to your GitHub repo (**Settings → Secrets and variables → Actions**):

| Secret | Description |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token with Workers + Pages + DNS permissions |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID |
| `CLOUDFLARE_TUNNEL_ID` | Tunnel ID for backend access |

### Environment Variables (optional)
| Variable | Default | Description |
|---|---|---|
| `BACKEND_API_URL` | `https://api.infinity-os.dev` | Backend API URL for frontend |
| `WS_URL` | `wss://api.infinity-os.dev` | WebSocket URL for real-time |

---

## Quick Start (TL;DR)

```bash
# 1. Clone
git clone https://github.com/Trancendos/infinity-portal.git
cd infinity-portal

# 2. Install
pnpm install

# 3. Backend (local dev)
cd backend
pip install -r requirements.txt
DATABASE_URL="sqlite+aiosqlite:///./data/infinity_dev.db" uvicorn main:app --reload

# 4. Frontend (local dev)
cd apps/shell
npx vite

# 5. Deploy frontend to Cloudflare
cd apps/shell && npx vite build
npx wrangler pages deploy dist --project-name=infinity-os-shell

# 6. Deploy backend via tunnel
cloudflared tunnel --config infrastructure/cloudflare/tunnel.yml run
```

---

## Environment Files

### Development (.env)
```env
DATABASE_URL=sqlite+aiosqlite:///./data/infinity_dev.db
ENVIRONMENT=development
JWT_SECRET_KEY=dev-secret-change-in-production
CORS_ORIGINS=http://localhost:3000,http://localhost:5173
```

### Production (.env.production)
```env
DATABASE_URL=postgresql+asyncpg://infinity:SECURE_PASSWORD@db:5432/infinity_os
ENVIRONMENT=production
JWT_SECRET_KEY=GENERATE_WITH_openssl_rand_-base64_64
CORS_ORIGINS=https://app.infinity-os.dev,https://infinity-os.dev
CLOUDFLARE_TUNNEL_ID=your-tunnel-id
```