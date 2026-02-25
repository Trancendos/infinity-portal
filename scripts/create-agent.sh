#!/usr/bin/env bash
# create-agent.sh - Trancendos Agent Scaffolding Tool
# Generates a complete agent repository from the agent-template
#
# Usage:
#   ./create-agent.sh \
#     --id "norman-ai" \
#     --name "Norman AI" \
#     --role "Security Guardian" \
#     --description "Autonomous security monitoring and threat response" \
#     --capabilities "threat-detection,incident-response,vulnerability-scanning" \
#     --tier "T1_CRITICAL" \
#     --target "docker-container" \
#     --dependencies "guardian-ai,sentinel-ai"
#
# Or interactive mode:
#   ./create-agent.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE_DIR="${SCRIPT_DIR}/../agent-template"
OUTPUT_BASE="${SCRIPT_DIR}/../../"  # Parent of agent-development-kit

# ── Colors ────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
GOLD='\033[0;33m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

print_banner() {
  echo -e "${PURPLE}"
  echo "╔══════════════════════════════════════════════════╗"
  echo "║        Trancendos Agent Development Kit          ║"
  echo "║              Agent Scaffolding Tool               ║"
  echo "╚══════════════════════════════════════════════════╝"
  echo -e "${NC}"
}

# ── Parse Arguments ───────────────────────────────────────────────
AGENT_ID=""
AGENT_NAME=""
AGENT_ROLE=""
AGENT_DESCRIPTION=""
AGENT_CAPABILITIES=""
AGENT_TIER="T2_IMPORTANT"
DEPLOYMENT_TARGET="STANDALONE"
AGENT_DEPENDENCIES=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --id) AGENT_ID="$2"; shift 2 ;;
    --name) AGENT_NAME="$2"; shift 2 ;;
    --role) AGENT_ROLE="$2"; shift 2 ;;
    --description) AGENT_DESCRIPTION="$2"; shift 2 ;;
    --capabilities) AGENT_CAPABILITIES="$2"; shift 2 ;;
    --tier) AGENT_TIER="$2"; shift 2 ;;
    --target) DEPLOYMENT_TARGET="$2"; shift 2 ;;
    --dependencies) AGENT_DEPENDENCIES="$2"; shift 2 ;;
    *) echo -e "${RED}Unknown option: $1${NC}"; exit 1 ;;
  esac
done

# ── Interactive Mode ──────────────────────────────────────────────
print_banner

if [ -z "$AGENT_ID" ]; then
  echo -e "${GOLD}Interactive Mode${NC}"
  echo ""

  read -rp "Agent ID (e.g., norman-ai): " AGENT_ID
  read -rp "Agent Name (e.g., Norman AI): " AGENT_NAME
  read -rp "Agent Role (e.g., Security Guardian): " AGENT_ROLE
  read -rp "Description: " AGENT_DESCRIPTION
  read -rp "Capabilities (comma-separated, e.g., threat-detection,response): " AGENT_CAPABILITIES
  
  echo ""
  echo "Tier options: T1_CRITICAL, T2_IMPORTANT, T3_NICE_TO_HAVE"
  read -rp "Tier [T2_IMPORTANT]: " AGENT_TIER
  AGENT_TIER="${AGENT_TIER:-T2_IMPORTANT}"
  
  echo ""
  echo "Deployment targets: CLOUDFLARE_WORKER, K3S_POD, BROWSER_MODULE, DOCKER_CONTAINER, STANDALONE"
  read -rp "Deployment Target [STANDALONE]: " DEPLOYMENT_TARGET
  DEPLOYMENT_TARGET="${DEPLOYMENT_TARGET:-STANDALONE}"
  
  read -rp "Dependencies (comma-separated agent IDs, or empty): " AGENT_DEPENDENCIES
fi

# ── Validation ────────────────────────────────────────────────────
if [ -z "$AGENT_ID" ] || [ -z "$AGENT_NAME" ]; then
  echo -e "${RED}ERROR: --id and --name are required${NC}"
  exit 1
fi

# ── Derive Values ─────────────────────────────────────────────────
# Convert agent-id to AgentClass (e.g., "norman-ai" → "NormanAI")
AGENT_CLASS=$(echo "$AGENT_ID" | sed -E 's/(^|-)([a-z])/\U\2/g' | sed 's/-//g')

# Build capabilities array string: "cap1","cap2"
IFS=',' read -ra CAP_ARRAY <<< "$AGENT_CAPABILITIES"
CAPABILITIES_ARRAY_STR=""
CAPABILITIES_LIST=""
FIRST_CAP=""
for cap in "${CAP_ARRAY[@]}"; do
  cap=$(echo "$cap" | xargs) # trim
  if [ -n "$cap" ]; then
    [ -n "$CAPABILITIES_ARRAY_STR" ] && CAPABILITIES_ARRAY_STR+=", "
    CAPABILITIES_ARRAY_STR+="\"${cap}\""
    CAPABILITIES_LIST+="- ${cap}\n"
    [ -z "$FIRST_CAP" ] && FIRST_CAP="\"${cap}\""
  fi
done

# Build dependencies array string
IFS=',' read -ra DEP_ARRAY <<< "$AGENT_DEPENDENCIES"
DEPENDENCIES_ARRAY_STR=""
DEPENDENCIES_LIST=""
for dep in "${DEP_ARRAY[@]}"; do
  dep=$(echo "$dep" | xargs)
  if [ -n "$dep" ]; then
    [ -n "$DEPENDENCIES_ARRAY_STR" ] && DEPENDENCIES_ARRAY_STR+=", "
    DEPENDENCIES_ARRAY_STR+="\"${dep}\""
    DEPENDENCIES_LIST+="- ${dep}\n"
  fi
done
[ -z "$DEPENDENCIES_LIST" ] && DEPENDENCIES_LIST="*None*\n"

# ── Scaffold ──────────────────────────────────────────────────────
OUTPUT_DIR="${OUTPUT_BASE}/${AGENT_ID}"

if [ -d "$OUTPUT_DIR" ]; then
  echo -e "${RED}ERROR: Directory already exists: ${OUTPUT_DIR}${NC}"
  exit 1
fi

echo -e "\n${GREEN}Scaffolding ${AGENT_NAME} (${AGENT_ID})...${NC}\n"

# Copy template
cp -r "$TEMPLATE_DIR" "$OUTPUT_DIR"

# ── Replace Placeholders ─────────────────────────────────────────
find "$OUTPUT_DIR" -type f \( -name "*.ts" -o -name "*.json" -o -name "*.md" -o -name "*.yml" \) | while read -r file; do
  sed -i "s|{{AGENT_ID}}|${AGENT_ID}|g" "$file"
  sed -i "s|{{AGENT_NAME}}|${AGENT_NAME}|g" "$file"
  sed -i "s|{{AGENT_CLASS}}|${AGENT_CLASS}|g" "$file"
  sed -i "s|{{AGENT_ROLE}}|${AGENT_ROLE}|g" "$file"
  sed -i "s|{{AGENT_DESCRIPTION}}|${AGENT_DESCRIPTION}|g" "$file"
  sed -i "s|{{AGENT_TIER}}|${AGENT_TIER}|g" "$file"
  sed -i "s|{{DEPLOYMENT_TARGET}}|${DEPLOYMENT_TARGET}|g" "$file"
  sed -i "s|{{AGENT_CAPABILITIES}}|${AGENT_CAPABILITIES}|g" "$file"
  sed -i "s|{{AGENT_CAPABILITIES_ARRAY}}|${CAPABILITIES_ARRAY_STR}|g" "$file"
  sed -i "s|{{AGENT_DEPENDENCIES_ARRAY}}|${DEPENDENCIES_ARRAY_STR}|g" "$file"
  sed -i "s|{{FIRST_CAPABILITY}}|${FIRST_CAP}|g" "$file"
  sed -i "s|{{CAPABILITIES_LIST}}|$(echo -e "${CAPABILITIES_LIST}")|g" "$file"
  sed -i "s|{{DEPENDENCIES_LIST}}|$(echo -e "${DEPENDENCIES_LIST}")|g" "$file"
done

# Copy the README template to root
cp "$OUTPUT_DIR/docs/README.md" "$OUTPUT_DIR/README.md"

echo -e "${GREEN}✅ Agent scaffolded successfully!${NC}"
echo ""
echo "  Directory: ${OUTPUT_DIR}"
echo ""
echo "  Next steps:"
echo "    cd ${OUTPUT_DIR}"
echo "    npm install"
echo "    npm test"
echo "    npm run build"
echo "    npm start"
echo ""
echo -e "${PURPLE}Happy building! 🚀${NC}"
