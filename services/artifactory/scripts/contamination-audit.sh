#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# THE ARTIFACTORY — Contamination Audit Script
# Part of the Trancendos Ecosystem
#
# Scans the codebase for contamination from external AI agents,
# unauthorized tooling, and known problematic patterns.
#
# Usage: ./scripts/contamination-audit.sh [--fix]
# ═══════════════════════════════════════════════════════════════════════

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

FOUND=0
FIXED=0
FIX_MODE=false

if [[ "${1:-}" == "--fix" ]]; then
  FIX_MODE=true
  echo -e "${YELLOW}Running in FIX mode — will attempt to remove contamination${NC}"
fi

echo "═══════════════════════════════════════════════════"
echo "  Trancendos Contamination Audit"
echo "  $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "═══════════════════════════════════════════════════"
echo ""

# ── Check 1: .manus directories ────────────────────────────────────
echo "▸ Checking for .manus directories..."
MANUS_DIRS=$(find . -name ".manus" -type d -not -path "*/node_modules/*" 2>/dev/null || true)
if [[ -n "$MANUS_DIRS" ]]; then
  echo -e "  ${RED}CRITICAL: .manus directories found:${NC}"
  echo "$MANUS_DIRS" | while read -r dir; do
    echo "    - $dir"
    if $FIX_MODE; then
      rm -rf "$dir"
      echo -e "    ${GREEN}REMOVED${NC}"
      ((FIXED++)) || true
    fi
  done
  ((FOUND++)) || true
else
  echo -e "  ${GREEN}CLEAN${NC}"
fi

# ── Check 2: Manus references in source ────────────────────────────
echo "▸ Checking for manus references in source files..."
MANUS_REFS=$(grep -rl "manus" --include="*.ts" --include="*.js" --include="*.json" \
  --include="*.yml" --include="*.yaml" --include="*.md" \
  . 2>/dev/null | grep -v node_modules | grep -v ".git/" | \
  grep -v "contamination-audit" | grep -v ".gitignore" | \
  grep -v "GOVERNANCE.md" | grep -v "ci-standard.yml" | \
  grep -v "SECURITY.md" | grep -v "README.md" || true)
if [[ -n "$MANUS_REFS" ]]; then
  echo -e "  ${RED}WARNING: Manus references found in:${NC}"
  echo "$MANUS_REFS" | while read -r file; do
    LINES=$(grep -n "manus" "$file" 2>/dev/null || true)
    echo "    - $file"
    echo "$LINES" | while read -r line; do
      echo "      $line"
    done
  done
  ((FOUND++)) || true
else
  echo -e "  ${GREEN}CLEAN${NC}"
fi

# ── Check 3: Suspicious AI agent artifacts ─────────────────────────
echo "▸ Checking for suspicious AI agent artifacts..."
SUSPICIOUS_PATTERNS=(
  ".cursor"
  ".windsurf"
  ".bolt"
  ".aider"
  ".continue"
  ".copilot-instructions"
)
for pattern in "${SUSPICIOUS_PATTERNS[@]}"; do
  FOUND_FILES=$(find . -name "$pattern" -not -path "*/node_modules/*" 2>/dev/null || true)
  if [[ -n "$FOUND_FILES" ]]; then
    echo -e "  ${YELLOW}NOTICE: Found $pattern artifacts${NC}"
    echo "$FOUND_FILES" | while read -r f; do echo "    - $f"; done
  fi
done
echo -e "  ${GREEN}SCAN COMPLETE${NC}"

# ── Check 4: Hardcoded secrets ─────────────────────────────────────
echo "▸ Checking for hardcoded secrets..."
SECRET_PATTERNS="(password|secret|api_key|apikey|token|private_key)\\s*[:=]\\s*['&quot;][^'&quot;]{8,}"
SECRET_HITS=$(grep -rlEi "$SECRET_PATTERNS" --include="*.ts" --include="*.js" --include="*.json" \
  . 2>/dev/null | grep -v node_modules | grep -v ".git/" | \
  grep -v "package-lock" | grep -v ".example" | grep -v "test" || true)
if [[ -n "$SECRET_HITS" ]]; then
  echo -e "  ${RED}WARNING: Potential hardcoded secrets in:${NC}"
  echo "$SECRET_HITS" | while read -r file; do
    echo "    - $file"
  done
  ((FOUND++)) || true
else
  echo -e "  ${GREEN}CLEAN${NC}"
fi

# ── Check 5: Package integrity ─────────────────────────────────────
echo "▸ Checking package.json integrity..."
if [[ -f "package.json" ]]; then
  # Verify @trancendos scope
  NON_TRANCENDOS=$(node -e "
    const pkg = require('./package.json');
    const name = pkg.name || '';
    if (!name.startsWith('@trancendos/')) {
      console.log('Package not in @trancendos scope: ' + name);
    }
  " 2>/dev/null || true)
  if [[ -n "$NON_TRANCENDOS" ]]; then
    echo -e "  ${YELLOW}NOTICE: $NON_TRANCENDOS${NC}"
  else
    echo -e "  ${GREEN}CLEAN${NC}"
  fi
else
  echo -e "  ${YELLOW}NOTICE: No package.json found${NC}"
fi

# ── Summary ────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════"
if [[ $FOUND -eq 0 ]]; then
  echo -e "  ${GREEN}ALL CHECKS PASSED — No contamination detected${NC}"
  exit 0
else
  echo -e "  ${RED}CONTAMINATION DETECTED — $FOUND issue(s) found${NC}"
  if $FIX_MODE; then
    echo -e "  ${GREEN}$FIXED issue(s) auto-fixed${NC}"
  fi
  echo "  Review findings above and remediate."
  exit 1
fi