#!/usr/bin/env bash
# ============================================================
# Infinity Portal — Cloudflare Setup Guide
# ============================================================
# Interactive setup script for Cloudflare deployment.
# Creates KV namespaces, configures Pages, and validates tokens.
#
# Prerequisites:
#   - Cloudflare account
#   - Wrangler CLI: npm install -g wrangler
#   - Authenticated: wrangler login
#
# Usage:
#   ./scripts/setup-cloudflare.sh
#   ./scripts/setup-cloudflare.sh --check   # Validate only
# ============================================================

set -euo pipefail

# Colours
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${BLUE}[∞]${NC} $1"; }
ok()   { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; }

banner() {
  echo -e "${CYAN}"
  echo "  ╔══════════════════════════════════════════╗"
  echo "  ║       ∞  INFINITY PORTAL  ∞              ║"
  echo "  ║       Cloudflare Setup Guide             ║"
  echo "  ╚══════════════════════════════════════════╝"
  echo -e "${NC}"
}

# ── Check Prerequisites ───────────────────────────────────
check_prerequisites() {
  log "Checking prerequisites..."

  if ! command -v wrangler &>/dev/null; then
    err "Wrangler CLI not found. Install with: npm install -g wrangler"
    exit 1
  fi
  ok "Wrangler CLI installed ($(wrangler --version 2>/dev/null || echo 'unknown'))"

  if ! wrangler whoami &>/dev/null 2>&1; then
    err "Not authenticated with Cloudflare. Run: wrangler login"
    exit 1
  fi
  ok "Authenticated with Cloudflare"

  if ! command -v jq &>/dev/null; then
    warn "jq not found — some features may be limited"
  fi
}

# ── Create KV Namespaces ──────────────────────────────────
setup_kv_namespaces() {
  log "Setting up KV namespaces..."

  echo ""
  echo -e "  ${CYAN}Creating KV namespaces for the API Gateway worker:${NC}"
  echo ""

  # Rate Limit KV
  local rl_id
  rl_id=$(wrangler kv:namespace create "RATE_LIMIT" 2>/dev/null | grep -oP 'id = "\K[^"]+' || echo "")
  if [ -n "$rl_id" ]; then
    ok "Created RATE_LIMIT namespace: $rl_id"
  else
    warn "RATE_LIMIT namespace may already exist. Check with: wrangler kv:namespace list"
  fi

  # Cache KV
  local cache_id
  cache_id=$(wrangler kv:namespace create "CACHE" 2>/dev/null | grep -oP 'id = "\K[^"]+' || echo "")
  if [ -n "$cache_id" ]; then
    ok "Created CACHE namespace: $cache_id"
  else
    warn "CACHE namespace may already exist. Check with: wrangler kv:namespace list"
  fi

  echo ""
  echo -e "  ${YELLOW}ACTION REQUIRED:${NC}"
  echo -e "  Update ${CYAN}workers/api-gateway/wrangler.toml${NC} with the KV namespace IDs:"
  if [ -n "$rl_id" ]; then
    echo -e "    RATE_LIMIT id = &quot;${GREEN}$rl_id${NC}&quot;"
  fi
  if [ -n "$cache_id" ]; then
    echo -e "    CACHE id = &quot;${GREEN}$cache_id${NC}&quot;"
  fi
  echo ""
}

# ── Setup Pages Project ───────────────────────────────────
setup_pages() {
  log "Setting up Cloudflare Pages project..."

  echo ""
  echo -e "  ${CYAN}To create the Pages project:${NC}"
  echo ""
  echo "  1. Go to: https://dash.cloudflare.com → Pages → Create a project"
  echo "  2. Connect your GitHub repository"
  echo "  3. Configure build settings:"
  echo "     • Build command:    cd apps/shell && npm ci && npx vite build"
  echo "     • Build output:     apps/shell/dist"
  echo "     • Root directory:   / (repository root)"
  echo "  4. Add environment variables:"
  echo "     • VITE_BACKEND_API_URL = https://api.infinity-portal.com"
  echo "     • VITE_WS_URL = wss://api.infinity-portal.com/ws"
  echo "     • VITE_APP_NAME = Infinity Portal"
  echo "     • NODE_VERSION = 20"
  echo ""
  echo -e "  ${YELLOW}Or deploy via CLI:${NC}"
  echo "  cd apps/shell && npx vite build"
  echo "  wrangler pages deploy dist --project-name=infinity-portal"
  echo ""
}

# ── Setup GitHub Secrets ──────────────────────────────────
setup_github_secrets() {
  log "GitHub Actions secrets required..."

  echo ""
  echo -e "  ${CYAN}Add these secrets to your GitHub repository:${NC}"
  echo "  Settings → Secrets and variables → Actions → New repository secret"
  echo ""
  echo "  ┌─────────────────────────┬──────────────────────────────────────┐"
  echo "  │ Secret Name             │ Description                          │"
  echo "  ├─────────────────────────┼──────────────────────────────────────┤"
  echo "  │ CLOUDFLARE_API_TOKEN    │ API token with Workers/Pages perms   │"
  echo "  │ CLOUDFLARE_ACCOUNT_ID   │ Your Cloudflare account ID           │"
  echo "  └─────────────────────────┴──────────────────────────────────────┘"
  echo ""
  echo -e "  ${YELLOW}To create an API token:${NC}"
  echo "  1. Go to: https://dash.cloudflare.com/profile/api-tokens"
  echo "  2. Create Token → Custom Token"
  echo "  3. Permissions needed:"
  echo "     • Account → Cloudflare Pages → Edit"
  echo "     • Account → Workers Scripts → Edit"
  echo "     • Account → Workers KV Storage → Edit"
  echo "     • Zone → DNS → Edit (if using custom domain)"
  echo ""
}

# ── Validate Setup ────────────────────────────────────────
validate() {
  log "Validating Cloudflare setup..."

  # Check wrangler config
  if [ -f "workers/api-gateway/wrangler.toml" ]; then
    ok "API Gateway wrangler.toml exists"

    if grep -q "placeholder" workers/api-gateway/wrangler.toml; then
      warn "wrangler.toml still has placeholder KV namespace IDs"
    else
      ok "KV namespace IDs configured"
    fi
  else
    err "workers/api-gateway/wrangler.toml not found"
  fi

  # Check CI workflow
  if [ -f ".github/workflows/deploy-cloudflare.yml" ]; then
    ok "Deploy workflow exists"
  else
    err ".github/workflows/deploy-cloudflare.yml not found"
  fi

  # List KV namespaces
  echo ""
  log "Current KV namespaces:"
  wrangler kv:namespace list 2>/dev/null || warn "Could not list KV namespaces"

  echo ""
  ok "Validation complete"
}

# ── Main ───────────────────────────────────────────────────
main() {
  banner

  case "${1:-}" in
    --check)
      check_prerequisites
      validate
      ;;
    *)
      check_prerequisites
      setup_kv_namespaces
      setup_pages
      setup_github_secrets
      validate

      echo ""
      echo -e "${GREEN}════════════════════════════════════════════${NC}"
      echo -e "${GREEN}  Cloudflare setup guide complete!${NC}"
      echo -e "${GREEN}════════════════════════════════════════════${NC}"
      echo ""
      echo -e "  ${CYAN}Next steps:${NC}"
      echo "  1. Update KV namespace IDs in wrangler.toml"
      echo "  2. Add GitHub secrets (CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID)"
      echo "  3. Create Pages project in Cloudflare dashboard"
      echo "  4. Push to main branch to trigger deployment"
      echo ""
      ;;
  esac
}

main "$@"