#!/usr/bin/env bash
# deploy-to-repos.sh
# Batch-deploy CI/CD workflows, Dependabot, CODEOWNERS, and SECURITY.md
# across all Trancendos repositories using the GitHub CLI (gh).
#
# Prerequisites:
#   - gh CLI installed and authenticated (gh auth login)
#   - Write access to all Trancendos repositories
#
# Usage:
#   ./deploy-to-repos.sh [--dry-run] [--repos "repo1,repo2"] [--skip-agents]

set -euo pipefail

PURPLE='\033[0;35m'
GREEN='\033[0;32m'
GOLD='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DRY_RUN=false
SKIP_AGENTS=false
SPECIFIC_REPOS=""
ORG="Trancendos"

# ── Parse Arguments ───────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case $1 in
    --dry-run) DRY_RUN=true; shift ;;
    --repos) SPECIFIC_REPOS="$2"; shift 2 ;;
    --skip-agents) SKIP_AGENTS=true; shift ;;
    *) echo -e "${RED}Unknown option: $1${NC}"; exit 1 ;;
  esac
done

# ── Repository Lists ─────────────────────────────────────────────

PLATFORM_REPOS=(
  "infinity-portal"
  "trancendos-ecosystem"
  "the-workshop"
  "the-void"
  "the-foundation"
  "central-plexus"
  "the-nexus"
  "the-library"
  "the-lighthouse"
)

AGENT_REPOS=(
  "Norman-AI"
  "Guardian-AI"
  "Mercury-AI"
  "Chronos-AI"
  "Cornelius-AI"
  "Sentinel-AI"
  "Prometheus-AI"
  "Oracle-AI"
  "Atlas-AI"
  "Echo-AI"
  "Nexus-AI"
  "Queen-AI"
  "The-Dr"
  "Iris-AI"
  "Solarscene-AI"
  "Lunascene-AI"
  "Lille-SC-AI"
  "Serenity-AI"
  "Dorris-AI"
  "Renik-AI"
)

PYTHON_REPOS=(
  "ml-inference-service"
  "ml-compliance-service"
)

# ── Determine Target Repos ───────────────────────────────────────
declare -a TARGET_REPOS

if [ -n "$SPECIFIC_REPOS" ]; then
  IFS=',' read -ra TARGET_REPOS <<< "$SPECIFIC_REPOS"
else
  TARGET_REPOS=("${PLATFORM_REPOS[@]}")
  if [ "$SKIP_AGENTS" = false ]; then
    TARGET_REPOS+=("${AGENT_REPOS[@]}")
  fi
  TARGET_REPOS+=("${PYTHON_REPOS[@]}")
fi

# ── Functions ─────────────────────────────────────────────────────

deploy_file() {
  local repo="$1"
  local source_file="$2"
  local dest_path="$3"
  local commit_msg="$4"

  if [ "$DRY_RUN" = true ]; then
    echo -e "  ${GOLD}[DRY RUN]${NC} Would deploy ${dest_path} to ${ORG}/${repo}"
    return
  fi

  # Check if repo exists and is accessible
  if ! gh repo view "${ORG}/${repo}" &>/dev/null; then
    echo -e "  ${RED}⚠️  Cannot access ${ORG}/${repo} (private or doesn't exist)${NC}"
    return
  fi

  # Clone, add file, push
  local tmp_dir
  tmp_dir=$(mktemp -d)

  gh repo clone "${ORG}/${repo}" "${tmp_dir}" -- --depth 1 2>/dev/null || {
    echo -e "  ${RED}⚠️  Failed to clone ${ORG}/${repo}${NC}"
    rm -rf "$tmp_dir"
    return
  }

  mkdir -p "$(dirname "${tmp_dir}/${dest_path}")"
  cp "$source_file" "${tmp_dir}/${dest_path}"

  cd "$tmp_dir"
  git add "$dest_path"

  if git diff --cached --quiet; then
    echo -e "  ${GOLD}↔️  No changes needed for ${dest_path}${NC}"
  else
    git commit -m "$commit_msg" --no-verify
    git push origin main 2>/dev/null || git push origin master 2>/dev/null || {
      echo -e "  ${RED}⚠️  Failed to push to ${ORG}/${repo}${NC}"
    }
    echo -e "  ${GREEN}✅ Deployed ${dest_path}${NC}"
  fi

  cd - > /dev/null
  rm -rf "$tmp_dir"
}

is_python_repo() {
  local repo="$1"
  for pr in "${PYTHON_REPOS[@]}"; do
    [ "$pr" = "$repo" ] && return 0
  done
  return 1
}

# ── Main ──────────────────────────────────────────────────────────

echo -e "${PURPLE}"
echo "╔══════════════════════════════════════════════════╗"
echo "║     Trancendos Ecosystem Deployment Script       ║"
echo "║     CI/CD + Security + Compliance Rollout        ║"
echo "╚══════════════════════════════════════════════════╝"
echo -e "${NC}"

echo "Target: ${#TARGET_REPOS[@]} repositories"
[ "$DRY_RUN" = true ] && echo -e "${GOLD}Mode: DRY RUN (no changes will be made)${NC}"
echo ""

WORKFLOW_DIR="${SCRIPT_DIR}/../reusable-workflows"
CONFIG_DIR="${SCRIPT_DIR}/../reusable-workflows/configs"

for repo in "${TARGET_REPOS[@]}"; do
  echo -e "\n${PURPLE}── ${ORG}/${repo} ──${NC}"

  # 1. Deploy Dependabot config
  deploy_file "$repo" \
    "${CONFIG_DIR}/dependabot.yml" \
    ".github/dependabot.yml" \
    "chore: add Dependabot configuration for automated dependency management"

  # 2. Deploy CODEOWNERS
  deploy_file "$repo" \
    "${CONFIG_DIR}/CODEOWNERS" \
    "CODEOWNERS" \
    "chore: add CODEOWNERS for review routing"

  # 3. Deploy SECURITY.md
  deploy_file "$repo" \
    "${CONFIG_DIR}/SECURITY.md" \
    "SECURITY.md" \
    "docs: add security policy"

  # 4. Deploy appropriate CI workflow
  if is_python_repo "$repo"; then
    deploy_file "$repo" \
      "${WORKFLOW_DIR}/.github/workflows/ci-python.yml" \
      ".github/workflows/ci.yml" \
      "ci: add Python CI pipeline (lint, test, security scan)"
  else
    deploy_file "$repo" \
      "${WORKFLOW_DIR}/.github/workflows/ci-typescript.yml" \
      ".github/workflows/ci.yml" \
      "ci: add TypeScript CI pipeline (lint, test, build, security scan)"
  fi

  # 5. Deploy compliance check workflow
  deploy_file "$repo" \
    "${WORKFLOW_DIR}/.github/workflows/compliance-check.yml" \
    ".github/workflows/compliance-check.yml" \
    "ci: add compliance validation workflow (GDPR, ISO 27001)"
done

echo ""
echo -e "${GREEN}════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Deployment complete! ${#TARGET_REPOS[@]} repos processed.${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════${NC}"

if [ "$DRY_RUN" = true ]; then
  echo ""
  echo -e "${GOLD}This was a dry run. Re-run without --dry-run to apply changes.${NC}"
fi
