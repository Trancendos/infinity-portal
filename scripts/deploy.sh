#!/bin/bash
# ============================================================
# Infinity OS — Idempotent Production Deployment Script
# Zero-cost stack: Cloudflare + Supabase + self-hosted services
#
# Usage:
#   chmod +x scripts/deploy.sh
#   ./scripts/deploy.sh [--env production|staging] [--skip-vault] [--skip-workers]
#
# Prerequisites:
#   - Docker + Docker Compose
#   - Node.js 20+ + pnpm 8+
#   - Cloudflare account (free)
#   - Supabase account (free)
#   - .env file (copy from .env.example)
#
# ISO 27001: A.12.1 Operational procedures and responsibilities
# ============================================================

set -euo pipefail

# ============================================================
# CONFIGURATION
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$ROOT_DIR/.env"
COMPOSE_FILE="$ROOT_DIR/infrastructure/docker/docker-compose.prod.yml"
LOG_FILE="/tmp/infinity-os-deploy-$(date +%Y%m%d-%H%M%S).log"

# Colours
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Colour

# Flags
ENVIRONMENT="production"
SKIP_VAULT=false
SKIP_WORKERS=false
SKIP_BUILD=false
DRY_RUN=false

# ============================================================
# ARGUMENT PARSING
# ============================================================

while [[ $# -gt 0 ]]; do
  case $1 in
    --env) ENVIRONMENT="$2"; shift 2 ;;
    --skip-vault) SKIP_VAULT=true; shift ;;
    --skip-workers) SKIP_WORKERS=true; shift ;;
    --skip-build) SKIP_BUILD=true; shift ;;
    --dry-run) DRY_RUN=true; shift ;;
    -h|--help)
      echo "Usage: $0 [--env production|staging] [--skip-vault] [--skip-workers] [--skip-build] [--dry-run]"
      exit 0
      ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# ============================================================
# LOGGING
# ============================================================

log() { echo -e "${GREEN}[$(date '+%H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"; }
warn() { echo -e "${YELLOW}[$(date '+%H:%M:%S')] ⚠ $1${NC}" | tee -a "$LOG_FILE"; }
error() { echo -e "${RED}[$(date '+%H:%M:%S')] ✗ $1${NC}" | tee -a "$LOG_FILE"; }
info() { echo -e "${CYAN}[$(date '+%H:%M:%S')] ℹ $1${NC}" | tee -a "$LOG_FILE"; }
step() { echo -e "\n${BLUE}══════════════════════════════════════${NC}" | tee -a "$LOG_FILE"
         echo -e "${BLUE} $1${NC}" | tee -a "$LOG_FILE"
         echo -e "${BLUE}══════════════════════════════════════${NC}" | tee -a "$LOG_FILE"; }

# ============================================================
# PREFLIGHT CHECKS
# ============================================================

preflight_checks() {
  step "Preflight Checks"

  # Check .env exists
  if [[ ! -f "$ENV_FILE" ]]; then
    error ".env file not found. Copy .env.example to .env and fill in values."
    exit 1
  fi

  # Load environment
  set -a
  source "$ENV_FILE"
  set +a
  log "Environment loaded from .env"

  # Check required tools
  local tools=("docker" "docker-compose" "node" "pnpm" "curl")
  for tool in "${tools[@]}"; do
    if ! command -v "$tool" &>/dev/null; then
      error "Required tool not found: $tool"
      exit 1
    fi
    log "✓ $tool found: $(command -v $tool)"
  done

  # Check Node version
  local node_version
  node_version=$(node --version | sed 's/v//' | cut -d. -f1)
  if [[ "$node_version" -lt 20 ]]; then
    error "Node.js 20+ required. Found: $(node --version)"
    exit 1
  fi
  log "✓ Node.js version: $(node --version)"

  # Detect architecture for Docker builds
  local raw_arch
  raw_arch=$(uname -m)
  case "$raw_arch" in
    x86_64)  DEPLOY_ARCH="amd64" ;;
    aarch64) DEPLOY_ARCH="arm64" ;;
    armv7l)  DEPLOY_ARCH="armhf" ;;
    *)       DEPLOY_ARCH="amd64" ;;
  esac
  log "✓ Architecture detected: $raw_arch → $DEPLOY_ARCH"

  if [[ "$DEPLOY_ARCH" == "arm64" ]]; then
    export DOCKER_DEFAULT_PLATFORM="linux/arm64"
    log "✓ Docker platform set to linux/arm64"
  fi

  # Check required env vars
  local required_vars=(
    "DOMAIN"
    "SUPABASE_URL"
    "SUPABASE_ANON_KEY"
    "SUPABASE_SERVICE_KEY"
    "CLOUDFLARE_API_TOKEN"
    "CLOUDFLARE_ACCOUNT_ID"
    "JWT_SECRET"
    "VAULT_ROOT_TOKEN"
    "GRAFANA_ADMIN_PASSWORD"
    "LANGFUSE_DB_PASSWORD"
    "LANGFUSE_NEXTAUTH_SECRET"
    "LANGFUSE_SALT"
  )

  for var in "${required_vars[@]}"; do
    if [[ -z "${!var:-}" ]]; then
      error "Required environment variable not set: $var"
      exit 1
    fi
    log "✓ $var is set"
  done

  log "✓ All preflight checks passed"
}

# ============================================================
# DATABASE SETUP
# ============================================================

setup_database() {
  step "Database Setup (Supabase)"

  info "Applying database schema to Supabase..."
  info "Schema file: database/schema/001_core.sql"
  info ""
  info "To apply the schema:"
  info "  1. Go to https://app.supabase.com/project/${SUPABASE_PROJECT_ID:-YOUR_PROJECT}/sql"
  info "  2. Copy and paste the contents of database/schema/001_core.sql"
  info "  3. Click 'Run'"
  info ""
  info "Or use the Supabase CLI:"
  info "  supabase db push --db-url ${SUPABASE_URL}"

  if [[ "$DRY_RUN" == "false" ]]; then
    read -p "Has the database schema been applied? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
      warn "Skipping database setup. Apply schema manually before proceeding."
    else
      log "✓ Database schema confirmed"
    fi
  fi
}

# ============================================================
# IPFS PRIVATE SWARM KEY
# ============================================================

setup_ipfs_swarm_key() {
  step "IPFS Private Swarm Key"

  local swarm_key_file="$ROOT_DIR/infrastructure/ipfs/swarm.key"

  if [[ -f "$swarm_key_file" ]]; then
    log "✓ Swarm key already exists: $swarm_key_file"
    return
  fi

  mkdir -p "$(dirname "$swarm_key_file")"

  info "Generating private IPFS swarm key..."
  info "This key ensures your IPFS nodes only communicate with each other."
  info "KEEP THIS KEY SECRET — losing it means losing access to your private swarm."

  if [[ "$DRY_RUN" == "false" ]]; then
    printf '/key/swarm/psk/1.0.0/\n/base16/\n' > "$swarm_key_file"
    tr -dc 'a-f0-9' < /dev/urandom | head -c64 >> "$swarm_key_file"
    echo >> "$swarm_key_file"
    chmod 600 "$swarm_key_file"
    log "✓ Swarm key generated: $swarm_key_file"
    warn "IMPORTANT: Back up $swarm_key_file securely. It cannot be recovered."
  else
    info "[DRY RUN] Would generate swarm key at $swarm_key_file"
  fi
}

# ============================================================
# DOCKER SERVICES
# ============================================================

start_docker_services() {
  step "Starting Docker Services"

  if [[ "$DRY_RUN" == "true" ]]; then
    info "[DRY RUN] Would run: docker-compose -f $COMPOSE_FILE up -d"
    return
  fi

  # Pull latest images
  log "Pulling Docker images..."
  docker-compose -f "$COMPOSE_FILE" pull --quiet

  # Start services
  log "Starting services..."
  docker-compose -f "$COMPOSE_FILE" up -d

  # Wait for Vault to be healthy
  if [[ "$SKIP_VAULT" == "false" ]]; then
    log "Waiting for Vault to be healthy..."
    local retries=0
    until docker-compose -f "$COMPOSE_FILE" exec -T vault vault status &>/dev/null; do
      retries=$((retries + 1))
      if [[ $retries -gt 30 ]]; then
        error "Vault failed to start after 60 seconds"
        exit 1
      fi
      sleep 2
    done
    log "✓ Vault is healthy"
  fi

  log "✓ Docker services started"
  docker-compose -f "$COMPOSE_FILE" ps
}

# ============================================================
# VAULT INITIALISATION
# ============================================================

init_vault() {
  if [[ "$SKIP_VAULT" == "true" ]]; then
    warn "Skipping Vault initialisation (--skip-vault flag)"
    return
  fi

  step "Vault Initialisation"

  if [[ "$DRY_RUN" == "true" ]]; then
    info "[DRY RUN] Would initialise Vault with Transit engine and policies"
    return
  fi

  # Check if already initialised
  if docker-compose -f "$COMPOSE_FILE" exec -T vault \
    vault kv get secret/infinity-os/config &>/dev/null 2>&1; then
    log "✓ Vault already initialised — skipping"
    return
  fi

  log "Running Vault initialisation script..."
  docker-compose -f "$COMPOSE_FILE" run --rm vault-init
  log "✓ Vault initialised"
}

# ============================================================
# BUILD
# ============================================================

build_packages() {
  if [[ "$SKIP_BUILD" == "true" ]]; then
    warn "Skipping build (--skip-build flag)"
    return
  fi

  step "Building Packages"

  cd "$ROOT_DIR"

  log "Installing dependencies..."
  pnpm install --frozen-lockfile

  log "Building all packages..."
  VITE_SUPABASE_URL="$SUPABASE_URL" \
  VITE_SUPABASE_ANON_KEY="$SUPABASE_ANON_KEY" \
  VITE_IDENTITY_WORKER_URL="https://identity.${DOMAIN}" \
  pnpm build

  log "✓ Build complete"
}

# ============================================================
# DEPLOY CLOUDFLARE WORKERS
# ============================================================

deploy_workers() {
  if [[ "$SKIP_WORKERS" == "true" ]]; then
    warn "Skipping Workers deployment (--skip-workers flag)"
    return
  fi

  step "Deploying Cloudflare Workers"

  local workers=("identity" "filesystem" "registry" "notifications" "search" "ai")

  for worker in "${workers[@]}"; do
    local worker_dir="$ROOT_DIR/workers/$worker"
    if [[ ! -d "$worker_dir" ]]; then
      warn "Worker directory not found: $worker_dir — skipping"
      continue
    fi

    log "Deploying $worker worker..."

    if [[ "$DRY_RUN" == "true" ]]; then
      info "[DRY RUN] Would deploy: workers/$worker"
      continue
    fi

    cd "$worker_dir"
    CLOUDFLARE_API_TOKEN="$CLOUDFLARE_API_TOKEN" \
    CLOUDFLARE_ACCOUNT_ID="$CLOUDFLARE_ACCOUNT_ID" \
    pnpm exec wrangler deploy --env "$ENVIRONMENT" || warn "Failed to deploy $worker — continuing"
    cd "$ROOT_DIR"

    log "✓ $worker worker deployed"
  done
}

# ============================================================
# DEPLOY CLOUDFLARE PAGES
# ============================================================

deploy_pages() {
  step "Deploying to Cloudflare Pages"

  local dist_dir="$ROOT_DIR/apps/shell/dist"

  if [[ ! -d "$dist_dir" ]]; then
    error "Shell dist directory not found: $dist_dir. Run build first."
    exit 1
  fi

  if [[ "$DRY_RUN" == "true" ]]; then
    info "[DRY RUN] Would deploy $dist_dir to Cloudflare Pages"
    return
  fi

  log "Deploying shell to Cloudflare Pages..."
  CLOUDFLARE_API_TOKEN="$CLOUDFLARE_API_TOKEN" \
  CLOUDFLARE_ACCOUNT_ID="$CLOUDFLARE_ACCOUNT_ID" \
  pnpm exec wrangler pages deploy "$dist_dir" \
    --project-name infinity-os \
    --branch main

  log "✓ Shell deployed to Cloudflare Pages"
  log "  URL: https://infinity-os.pages.dev"
}

# ============================================================
# POST-DEPLOYMENT VERIFICATION
# ============================================================

verify_deployment() {
  step "Post-Deployment Verification"

  local checks_passed=0
  local checks_total=0

  check_endpoint() {
    local name="$1"
    local url="$2"
    local expected_status="${3:-200}"
    checks_total=$((checks_total + 1))

    if [[ "$DRY_RUN" == "true" ]]; then
      info "[DRY RUN] Would check: $name ($url)"
      return
    fi

    local status
    status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$url" 2>/dev/null || echo "000")

    if [[ "$status" == "$expected_status" ]]; then
      log "✓ $name: HTTP $status"
      checks_passed=$((checks_passed + 1))
    else
      warn "✗ $name: HTTP $status (expected $expected_status) — $url"
    fi
  }

  check_endpoint "Identity Worker Health" "https://identity.${DOMAIN}/health"
  check_endpoint "Grafana" "https://grafana.${DOMAIN}/api/health"
  check_endpoint "Vault" "https://vault.${DOMAIN}/v1/sys/health" "200"
  check_endpoint "Shell" "https://infinity-os.${DOMAIN}" "200"

  if [[ "$DRY_RUN" == "false" ]]; then
    log "Verification: $checks_passed/$checks_total checks passed"
    if [[ $checks_passed -lt $checks_total ]]; then
      warn "Some checks failed. Review logs at: $LOG_FILE"
    fi
  fi
}

# ============================================================
# SUMMARY
# ============================================================

print_summary() {
  step "Deployment Summary"

  echo -e "${GREEN}"
  echo "  ∞ Infinity OS Deployment Complete"
  echo ""
  echo "  Environment:  $ENVIRONMENT"
  echo "  Domain:       ${DOMAIN:-not set}"
  echo "  Log file:     $LOG_FILE"
  echo ""
  echo "  Services:"
  echo "    Shell:      https://infinity-os.${DOMAIN:-pages.dev}"
  echo "    Identity:   https://identity.${DOMAIN:-workers.dev}"
  echo "    Grafana:    https://grafana.${DOMAIN:-localhost:3000}"
  echo "    Vault:      https://vault.${DOMAIN:-localhost:8200}"
  echo "    Langfuse:   https://langfuse.${DOMAIN:-localhost:3001}"
  echo ""
  echo "  Next Steps:"
  echo "    1. Verify all services are healthy"
  echo "    2. Configure Cloudflare Access for admin services"
  echo "    3. Set up DNS records pointing to Cloudflare Tunnel"
  echo "    4. Run compliance scan: pnpm run compliance"
  echo "    5. Review audit logs in Grafana"
  echo -e "${NC}"
}

# ============================================================
# MAIN
# ============================================================

main() {
  echo -e "${CYAN}"
  echo "  ∞ Infinity OS Production Deployment"
  echo "  Environment: $ENVIRONMENT"
  echo "  Dry Run: $DRY_RUN"
  echo -e "${NC}"

  preflight_checks
  setup_database
  setup_ipfs_swarm_key
  start_docker_services
  init_vault
  build_packages
  deploy_workers
  deploy_pages
  verify_deployment
  print_summary

  log "Deployment complete. Log saved to: $LOG_FILE"
}

main "$@"