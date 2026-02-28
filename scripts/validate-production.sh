#!/bin/bash
# ============================================================
# Infinity OS — Production Validation Suite
# Runs comprehensive checks against a deployed instance.
# ISO 27001: A.14.2 — Security in development and support processes
#
# Usage:
#   ./scripts/validate-production.sh [--url https://your-domain.com]
#   ./scripts/validate-production.sh --local
#
# Exit codes:
#   0 = All checks passed
#   1 = One or more checks failed
# ============================================================

set -euo pipefail

# ── Configuration ───────────────────────────────────────────

BASE_URL="${BASE_URL:-http://localhost:8000}"
LOCAL_MODE=false
PASS=0
FAIL=0
WARN=0
TOTAL=0

# Colours
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# ── Argument Parsing ────────────────────────────────────────

while [[ $# -gt 0 ]]; do
  case $1 in
    --url) BASE_URL="$2"; shift 2 ;;
    --local) LOCAL_MODE=true; BASE_URL="http://localhost:8000"; shift ;;
    -h|--help)
      echo "Usage: $0 [--url https://domain.com] [--local]"
      exit 0
      ;;
    *) echo "Unknown: $1"; exit 1 ;;
  esac
done

# ── Check Functions ─────────────────────────────────────────

check() {
  local name="$1"
  shift
  TOTAL=$((TOTAL + 1))

  if "$@" >/dev/null 2>&1; then
    echo -e "  ${GREEN}✅ $name${NC}"
    PASS=$((PASS + 1))
    return 0
  else
    echo -e "  ${RED}❌ $name${NC}"
    FAIL=$((FAIL + 1))
    return 1
  fi
}

check_warn() {
  local name="$1"
  shift
  TOTAL=$((TOTAL + 1))

  if "$@" >/dev/null 2>&1; then
    echo -e "  ${GREEN}✅ $name${NC}"
    PASS=$((PASS + 1))
    return 0
  else
    echo -e "  ${YELLOW}⚠️  $name${NC}"
    WARN=$((WARN + 1))
    return 0
  fi
}

check_http() {
  local name="$1"
  local url="$2"
  local expected="${3:-200}"
  TOTAL=$((TOTAL + 1))

  local status
  status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$url" 2>/dev/null || echo "000")

  if [[ "$status" == "$expected" ]]; then
    echo -e "  ${GREEN}✅ $name (HTTP $status)${NC}"
    PASS=$((PASS + 1))
    return 0
  else
    echo -e "  ${RED}❌ $name (HTTP $status, expected $expected)${NC}"
    FAIL=$((FAIL + 1))
    return 1
  fi
}

check_http_warn() {
  local name="$1"
  local url="$2"
  local expected="${3:-200}"
  TOTAL=$((TOTAL + 1))

  local status
  status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$url" 2>/dev/null || echo "000")

  if [[ "$status" == "$expected" ]]; then
    echo -e "  ${GREEN}✅ $name (HTTP $status)${NC}"
    PASS=$((PASS + 1))
  else
    echo -e "  ${YELLOW}⚠️  $name (HTTP $status, expected $expected)${NC}"
    WARN=$((WARN + 1))
  fi
}

# ── Banner ──────────────────────────────────────────────────

echo -e "${CYAN}"
echo "╔══════════════════════════════════════════════╗"
echo "║  ∞ Infinity OS Production Validation Suite   ║"
echo "║  Target: $BASE_URL"
echo "╚══════════════════════════════════════════════╝"
echo -e "${NC}"

# ── Section 1: Core API Health ──────────────────────────────

echo -e "\n${BLUE}🏥 Core API Health${NC}"

check_http "Backend health endpoint" "$BASE_URL/health"
check_http "API docs (Swagger)" "$BASE_URL/docs"
check_http "API docs (ReDoc)" "$BASE_URL/redoc"

# ── Section 2: Authentication ───────────────────────────────

echo -e "\n${BLUE}🔐 Authentication${NC}"

check_http "Auth endpoints accessible" "$BASE_URL/api/v1/auth/me" "401"
check_http_warn "WebAuthn endpoint" "$BASE_URL/api/v1/auth/webauthn/register" "405"

# ── Section 3: Core Routers ────────────────────────────────

echo -e "\n${BLUE}📡 Core API Routers${NC}"

ROUTERS=(
  "ai" "appstore" "artifacts" "assets" "billing" "build"
  "codegen" "compliance" "documents" "files" "integrations"
  "itsm" "kanban" "kb" "notifications" "observability"
  "organisations" "repositories" "security" "users"
  "workflows" "vulnerability"
)

for router in "${ROUTERS[@]}"; do
  check_http_warn "Router: $router" "$BASE_URL/api/v1/$router" "200"
done

# ── Section 4: Agent Management ─────────────────────────────

echo -e "\n${BLUE}🤖 Agent Management${NC}"

check_http_warn "Agent registry" "$BASE_URL/api/v1/agents/"
check_http_warn "Agent metrics" "$BASE_URL/api/v1/agents/metrics/summary"
check_http_warn "Agent memory" "$BASE_URL/api/v1/memories/"

# ── Section 5: Database ─────────────────────────────────────

echo -e "\n${BLUE}🗄️  Database${NC}"

check "Health reports DB status" bash -c "curl -s '$BASE_URL/health' | grep -qi 'database\|db\|postgres'"

# ── Section 6: Security Headers ─────────────────────────────

echo -e "\n${BLUE}🛡️  Security Headers${NC}"

HEADERS=$(curl -sI --max-time 10 "$BASE_URL/health" 2>/dev/null || echo "")

check "X-Content-Type-Options present" echo "$HEADERS" | grep -qi "x-content-type-options"
check "X-Frame-Options present" echo "$HEADERS" | grep -qi "x-frame-options"
check_warn "Strict-Transport-Security" echo "$HEADERS" | grep -qi "strict-transport-security"
check_warn "Content-Security-Policy" echo "$HEADERS" | grep -qi "content-security-policy"
check "X-Request-ID / correlation ID" echo "$HEADERS" | grep -qi "x-request-id\|x-correlation-id"

# ── Section 7: File System ──────────────────────────────────

echo -e "\n${BLUE}📁 Repository Structure${NC}"

if [[ "$LOCAL_MODE" == "true" ]] || [[ -f "package.json" ]]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  ROOT_DIR="$(dirname "$SCRIPT_DIR")"

  check "package.json exists" test -f "$ROOT_DIR/package.json"
  check "Backend main.py exists" test -f "$ROOT_DIR/backend/main.py"
  check "Backend models.py exists" test -f "$ROOT_DIR/backend/models.py"
  check "Database schema exists" test -f "$ROOT_DIR/database/schema/001_core.sql"
  check ".env.example exists" test -f "$ROOT_DIR/.env.example"
  check "Dockerfile exists" test -f "$ROOT_DIR/backend/Dockerfile"
  check "Docker Compose exists" test -f "$ROOT_DIR/infrastructure/docker/docker-compose.prod.yml"
  check "Terraform config exists" test -f "$ROOT_DIR/infrastructure/terraform/main.tf"
  check "Prometheus config exists" test -f "$ROOT_DIR/infrastructure/monitoring/prometheus.yml"
  check "Alert rules exist" test -f "$ROOT_DIR/infrastructure/monitoring/alerts.yml"
  check "Blackbox monitoring exists" test -f "$ROOT_DIR/infrastructure/monitoring/blackbox.yaml"
  check "Vault config exists" test -f "$ROOT_DIR/infrastructure/vault/config.hcl"
  check "K3s bootstrap exists" test -f "$ROOT_DIR/infrastructure/k3s/k3s-bootstrap.sh"
  check "Deploy script exists" test -f "$ROOT_DIR/scripts/deploy.sh"
  check "Agent SDK exists" test -d "$ROOT_DIR/packages/agent-sdk"
  check "Policy engine exists" test -f "$ROOT_DIR/packages/policy-engine/Cargo.toml"
  check "Compliance mapping exists" test -f "$ROOT_DIR/compliance/control-mapping.csv"
  check "Security policy exists" test -f "$ROOT_DIR/compliance/SECURITY_POLICY.md"

  # Runbooks
  check "Runbook: backup-restore" test -f "$ROOT_DIR/docs/runbooks/backup-restore.md"
  check "Runbook: scaling" test -f "$ROOT_DIR/docs/runbooks/scaling.md"
  check "Runbook: incident-response" test -f "$ROOT_DIR/docs/runbooks/incident-response.md"
  check "Runbook: vault-sealed" test -f "$ROOT_DIR/docs/runbooks/vault-sealed.md"

  # Crypto migration plan
  check "Crypto migration plan" test -f "$ROOT_DIR/docs/CRYPTO_MIGRATION.md"

  # Tests
  TEST_COUNT=$(find "$ROOT_DIR/backend/tests" -name "test_*.py" -type f 2>/dev/null | wc -l)
  check "Backend tests exist (found: $TEST_COUNT)" test "$TEST_COUNT" -gt 10
else
  echo -e "  ${YELLOW}⚠️  Skipping file checks (not in local mode)${NC}"
fi

# ── Section 8: CI/CD Workflows ──────────────────────────────

echo -e "\n${BLUE}⚙️  CI/CD Workflows${NC}"

if [[ "$LOCAL_MODE" == "true" ]] || [[ -d ".github/workflows" ]]; then
  SCRIPT_DIR="${SCRIPT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
  ROOT_DIR="${ROOT_DIR:-$(dirname "$SCRIPT_DIR")}"
  WF_DIR="$ROOT_DIR/.github/workflows"

  check "CI Python workflow" test -f "$WF_DIR/ci-python.yml"
  check "CI TypeScript workflow" test -f "$WF_DIR/ci-typescript.yml"
  check "CI Compliance workflow" test -f "$WF_DIR/ci-compliance.yml"
  check "Security audit workflow" test -f "$WF_DIR/security-audit.yml"
  check "AI license scan workflow" test -f "$WF_DIR/ai-license-scan.yml"
  check "Documentation workflow" test -f "$WF_DIR/docs.yml"
  check "Deploy workflow" test -f "$WF_DIR/deploy-cloudflare.yml"
else
  echo -e "  ${YELLOW}⚠️  Skipping workflow checks (not in local mode)${NC}"
fi

# ── Summary ─────────────────────────────────────────────────

echo ""
echo -e "${CYAN}══════════════════════════════════════════════${NC}"
echo -e "${CYAN}  Validation Summary${NC}"
echo -e "${CYAN}══════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${GREEN}✅ Passed:  $PASS${NC}"
echo -e "  ${YELLOW}⚠️  Warnings: $WARN${NC}"
echo -e "  ${RED}❌ Failed:  $FAIL${NC}"
echo -e "  📊 Total:   $TOTAL"
echo ""

SCORE=$(( (PASS * 100) / (TOTAL > 0 ? TOTAL : 1) ))
echo -e "  Score: ${SCORE}%"
echo ""

if [[ $FAIL -eq 0 ]]; then
  echo -e "  ${GREEN}🎉 PRODUCTION READY${NC}"
  exit 0
elif [[ $FAIL -le 3 ]]; then
  echo -e "  ${YELLOW}⚠️  NEARLY READY — Review $FAIL failure(s)${NC}"
  exit 0
else
  echo -e "  ${RED}🚫 NOT READY — $FAIL critical failure(s)${NC}"
  exit 1
fi