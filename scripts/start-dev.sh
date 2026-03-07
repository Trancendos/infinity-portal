#!/usr/bin/env bash
# ============================================================
# Infinity Portal — Development Environment Launcher
# ============================================================
# Usage:
#   ./scripts/start-dev.sh          # Start all services
#   ./scripts/start-dev.sh --tools  # Include pgAdmin & Redis UI
#   ./scripts/start-dev.sh --reset  # Reset volumes and restart
#   ./scripts/start-dev.sh --stop   # Stop all services
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
  echo "  ║       Development Environment            ║"
  echo "  ╚══════════════════════════════════════════╝"
  echo -e "${NC}"
}

# ── Preflight Checks ──────────────────────────────────────
preflight() {
  log "Running preflight checks..."

  if ! command -v docker &>/dev/null; then
    err "Docker is not installed. Please install Docker Desktop."
    exit 1
  fi

  if ! docker info &>/dev/null; then
    err "Docker daemon is not running. Please start Docker."
    exit 1
  fi

  if ! command -v docker compose &>/dev/null && ! command -v docker-compose &>/dev/null; then
    err "Docker Compose is not available."
    exit 1
  fi

  ok "Docker is ready"
}

# ── Environment Setup ─────────────────────────────────────
setup_env() {
  local env_file="$PROJECT_ROOT/.env"

  if [ ! -f "$env_file" ]; then
    warn ".env file not found — creating from .env.example"
    if [ -f "$PROJECT_ROOT/.env.example" ]; then
      cp "$PROJECT_ROOT/.env.example" "$env_file"
    else
      cat > "$env_file" << 'ENV'
# Infinity Portal — Development Environment
POSTGRES_DB=infinity
POSTGRES_USER=infinity
POSTGRES_PASSWORD=infinity_dev_2024
SECRET_KEY=dev-secret-key-change-in-production
CORS_ORIGINS=http://localhost:5173,http://localhost:3000

# Ports
DB_PORT=5432
REDIS_PORT=6379
BACKEND_PORT=8000
FRONTEND_PORT=5173
PGADMIN_PORT=5050
REDIS_UI_PORT=8081

# pgAdmin
PGADMIN_EMAIL=admin@infinity.local
PGADMIN_PASSWORD=admin
ENV
    fi
    ok "Created .env file"
  else
    ok ".env file exists"
  fi
}

# ── Start Services ─────────────────────────────────────────
start() {
  local profiles="--profile dev"

  if [[ "${1:-}" == "--tools" ]]; then
    profiles="--profile dev --profile tools"
    log "Starting with dev tools (pgAdmin, Redis Commander)..."
  fi

  log "Building and starting services..."
  docker compose -f "$COMPOSE_FILE" $profiles up --build -d

  echo ""
  log "Waiting for services to be healthy..."
  sleep 5

  # Check health
  local services=("infinity-db" "infinity-redis" "infinity-backend-dev")
  local all_healthy=true

  for svc in "${services[@]}"; do
    if docker ps --filter "name=$svc" --filter "status=running" -q | grep -q .; then
      ok "$svc is running"
    else
      warn "$svc is not running yet"
      all_healthy=false
    fi
  done

  echo ""
  echo -e "${GREEN}════════════════════════════════════════════${NC}"
  echo -e "${GREEN}  Development environment is ready!${NC}"
  echo -e "${GREEN}════════════════════════════════════════════${NC}"
  echo ""
  echo -e "  ${CYAN}Frontend:${NC}    http://localhost:${FRONTEND_PORT:-5173}"
  echo -e "  ${CYAN}Backend:${NC}     http://localhost:${BACKEND_PORT:-8000}"
  echo -e "  ${CYAN}API Docs:${NC}    http://localhost:${BACKEND_PORT:-8000}/docs"
  echo -e "  ${CYAN}Health:${NC}      http://localhost:${BACKEND_PORT:-8000}/health"

  if [[ "${1:-}" == "--tools" ]]; then
    echo -e "  ${CYAN}pgAdmin:${NC}     http://localhost:${PGADMIN_PORT:-5050}"
    echo -e "  ${CYAN}Redis UI:${NC}    http://localhost:${REDIS_UI_PORT:-8081}"
  fi

  echo ""
  echo -e "  ${YELLOW}Logs:${NC}  docker compose -f docker-compose.yml --profile dev logs -f"
  echo -e "  ${YELLOW}Stop:${NC}  ./scripts/start-dev.sh --stop"
  echo ""
}

# ── Stop Services ──────────────────────────────────────────
stop() {
  log "Stopping all services..."
  docker compose -f "$COMPOSE_FILE" --profile dev --profile tools down
  ok "All services stopped"
}

# ── Reset ──────────────────────────────────────────────────
reset() {
  warn "This will destroy all data volumes. Continue? (y/N)"
  read -r confirm
  if [[ "$confirm" =~ ^[Yy]$ ]]; then
    log "Stopping services and removing volumes..."
    docker compose -f "$COMPOSE_FILE" --profile dev --profile tools down -v
    ok "Volumes removed"
    start "${1:-}"
  else
    log "Reset cancelled"
  fi
}

# ── Main ───────────────────────────────────────────────────
main() {
  cd "$PROJECT_ROOT"
  banner

  case "${1:-}" in
    --stop)
      stop
      ;;
    --reset)
      preflight
      setup_env
      reset "${2:-}"
      ;;
    *)
      preflight
      setup_env
      start "${1:-}"
      ;;
  esac
}

main "$@"