# Phase 26 — Live Deployment Guide & Automation

## A. Fly.io Backend Deployment
- [x] A1. Install Fly CLI — installed but no auth token
- [x] A2. Cannot deploy without Fly.io account credentials — BLOCKED

## B. Cloudflare Pages Configuration
- [x] B1. Cannot deploy without CLOUDFLARE_API_TOKEN — BLOCKED

## C. One-Click Deploy Guide
- [x] C1. Create comprehensive DEPLOY_GUIDE.md
- [x] C2. Create fly.toml for backend
- [x] C3. Create scripts/deploy-live.sh (one-command deploy)
- [x] C4. Commit & push (2a3d7f4)

## D. Fix deploy-cloudflare.yml (pnpm + wrangler)
- [x] D1. Fix build-frontend job: replace npm ci → pnpm install
- [x] D2. Fix deploy-frontend job: install wrangler globally, run wrangler CLI directly (bypass wrangler-action npm install)
- [x] D3. Fix deploy-gateway job: install wrangler globally, run wrangler CLI directly from workers/api-gateway
- [x] D4. Add KV namespace creation step (idempotent)
- [ ] D5. Commit & push fix
- [ ] D6. Trigger workflow run & verify success