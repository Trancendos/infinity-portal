#!/usr/bin/env bash
# ============================================================
# Infinity Portal — Production Launcher
# ============================================================
# Usage:
#   ./scripts/start-prod.sh              # Start production
#   ./scripts/start-prod.sh --check      # Health check only
#   ./scripts/start-prod.sh --stop       # Stop production
#   ./scripts/start-prod.sh --restart    # Rolling restart
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="$PROJECT_ROOT/docker-compose.yml"

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

# ── Banner ─────────────────────────────────────────────────
banner() {
  echo -e "${CYAN}"
  echo "  ╔══════════════════════════════════════════╗"
  echo "  ║       ∞  INFINITY PORTAL  ∞              ║"
  echo "  ║       Production Deployment              ║"
  echo "  ╚══════════════════════════════════════════╝"
  echo -e "${NC}"
}

# ── Preflight Checks ──────────────────────────────────────
preflight() {
  log "Running production preflight checks..."

  # Docker
  if ! command -v docker &>/dev/null; then
    err "Docker is not installed."
    exit 1
  fi

  if ! docker info &>/dev/null; then
    err "Docker daemon is not running."
    exit 1
  fi

  ok "Docker is ready"

  # Environment file
  if [ ! -f "$PROJECT_ROOT/.env" ]; then
    err ".env file not found. Copy .env.production.example and configure."
    exit 1
  fi

  # Required production variables
  local required_vars=("SECRET_KEY" "POSTGRES_PASSWORD" "POSTGRES_USER" "POSTGRES_DB")
  local missing=()

  set -a
  source "$PROJECT_ROOT/.env"
  set +a

  for var in "${required_vars[@]}"; do
    if [ -z "${!var:-}" ]; then
      missing+=("$var")
    fi
  done

  if [ ${#missing[@]} -gt 0 ]; then
    err "Missing required environment variables: ${missing[*]}"
    exit 1
  fi

  # Warn about default secrets
  if [[ "${SECRET_KEY:-}" == *"dev"* ]] || [[ "${SECRET_KEY:-}" == *"change"* ]]; then
    err "SECRET_KEY appears to be a development value. Set a strong production secret."
    exit 1
  fi

  if [[ "${POSTGRES_PASSWORD:-}" == *"dev"* ]]; then
    warn "POSTGRES_PASSWORD appears to be a development value. Use a strong password in production."
  fi

  ok "Environment validated"
}

# ── Start Production ───────────────────────────────────────
start() {
  log "Building production images..."
  docker compose -f "$COMPOSE_FILE" --profile prod build --no-cache

  log "Starting production services..."
  docker compose -f "$COMPOSE_FILE" --profile prod up -d

  echo ""
  log "Waiting for services to become healthy..."

  # Wait for health checks (max 120s)
  local max_wait=120
  local waited=0
  local interval=5

  while [ $waited -lt $max_wait ]; do
    local healthy=0
    local total=0

    for svc in $(docker compose -f "$COMPOSE_FILE" --profile prod ps -q); do
      total=$((total + 1))
      local status
      status=$(docker inspect --format='{{.State.Health.Status}}' "$svc" 2>/dev/null || echo "none")
      if [ "$status" = "healthy" ] || [ "$status" = "none" ]; then
        healthy=$((healthy + 1))
      fi
    done

    if [ "$healthy" -eq "$total" ] && [ "$total" -gt 0 ]; then
      break
    fi

    echo -ne "\r  Waiting... ${waited}s / ${max_wait}s (${healthy}/${total} healthy)"
    sleep $interval
    waited=$((waited + interval))
  done

  echo ""

  if [ $waited -ge $max_wait ]; then
    warn "Some services may not be fully healthy yet. Check logs."
  fi

  health_check

  echo ""
  echo -e "${GREEN}════════════════════════════════════════════${NC}"
  echo -e "${GREEN}  Production environment is live!${NC}"
  echo -e "${GREEN}════════════════════════════════════════════${NC}"
  echo ""
  echo -e "  ${CYAN}Frontend:${NC}    http://localhost:${FRONTEND_PORT:-3000}"
  echo -e "  ${CYAN}Backend:${NC}     http://localhost:${BACKEND_PORT:-8000}"
  echo -e "  ${CYAN}API Docs:${NC}    http://localhost:${BACKEND_PORT:-8000}/docs"
  echo ""
  echo -e "  ${YELLOW}Logs:${NC}     docker compose --profile prod logs -f"
  echo -e "  ${YELLOW}Status:${NC}   ./scripts/start-prod.sh --check"
  echo -e "  ${YELLOW}Stop:${NC}     ./scripts/start-prod.sh --stop"
  echo -e "  ${YELLOW}Restart:${NC}  ./scripts/start-prod.sh --restart"
  echo ""
}

# ── Health Check ───────────────────────────────────────────
health_check() {
  log "Running health checks..."

  local services=("infinity-db" "infinity-redis" "infinity-backend-prod" "infinity-frontend-prod")
  local all_ok=true

  for svc in "${services[@]}"; do
    if docker ps --filter "name=$svc" --filter "status=running" -q 2>/dev/null | grep -q .; then
      local health
      health=$(docker inspect --format='{{.State.Health.Status}}' "$svc" 2>/dev/null || echo "no-healthcheck")
      if [ "$health" = "healthy" ]; then
        ok "$svc — healthy"
      elif [ "$health" = "no-healthcheck" ]; then
        ok "$svc — running (no healthcheck)"
      else
        warn "$svc — $health"
        all_ok=false
      fi
    else
      err "$svc — not running"
      all_ok=false
    fi
  done

  # Backend API check
  if curl -sf http://localhost:${BACKEND_PORT:-8000}/health &>/dev/null; then
    ok "Backend API responding"
  else
    warn "Backend API not responding (may still be starting)"
  fi

  # Frontend check
  if curl -sf http://localhost:${FRONTEND_PORT:-3000}/health &>/dev/null; then
    ok "Frontend responding"
  else
    warn "Frontend not responding (may still be starting)"
  fi

  echo ""
  if $all_ok; then
    ok "All services healthy"
  else
    warn "Some services need attention"
  fi
}

# ── Stop Production ────────────────────────────────────────
stop() {
  log "Stopping production services..."
  docker compose -f "$COMPOSE_FILE" --profile prod down
  ok "Production services stopped"
}

# ── Rolling Restart ────────────────────────────────────────
restart() {
  log "Performing rolling restart..."

  # Restart backend first (stateless)
  log "Restarting backend..."
  docker compose -f "$COMPOSE_FILE" --profile prod up -d --no-deps --build backend-prod
  sleep 10

  # Then frontend
  log "Restarting frontend..."
  docker compose -f "$COMPOSE_FILE" --profile prod up -d --no-deps --build frontend-prod
  sleep 5

  health_check
  ok "Rolling restart complete"
}

# ── Main ───────────────────────────────────────────────────
main() {
  cd "$PROJECT_ROOT"
  banner

  case "${1:-}" in
    --check)
      health_check
      ;;
    --stop)
      stop
      ;;
    --restart)
      preflight
      restart
      ;;
    *)
      preflight
      start
      ;;
  esac
}

main "$@"