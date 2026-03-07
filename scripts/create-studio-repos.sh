#!/bin/bash
# =============================================================================
# CREATE STANDALONE GITHUB REPOS FOR WAVE 6 STUDIOS
# =============================================================================
# This script creates the 7 standalone GitHub repositories under the
# Trancendos organization that were scaffolded locally in Session 4.
#
# PREREQUISITES:
#   - GitHub CLI (gh) installed and authenticated
#   - Owner/admin access to the Trancendos GitHub organization
#
# USAGE:
#   chmod +x create-studio-repos.sh
#   ./create-studio-repos.sh
# =============================================================================

set -e

ORG="Trancendos"

REPOS=(
  "section7:Section7 — The Intelligence, Narrative & Research Layer (Wave 6 Studio)"
  "style-and-shoot:Style&Shoot Studios — The Empathy-Driven UX/UI & Visual Engine (Wave 6 Studio)"
  "fabulousa:Fabulousa Studio's — The Generative Fashion & Style Engine (Wave 6 Studio)"
  "tranceflow:TranceFlow Studio's — The 3D Spatial & Avatar Engine (Wave 6 Studio)"
  "tateking:TateKing Studios — The Serverless Cinematic Rendering Engine (Wave 6 Studio)"
  "the-digitalgrid:The DigitalGrid — The Infrastructure & CI/CD Automation Matrix (Wave 6 Studio)"
  "artifactory:The Artifactory — Multi-Protocol Registry & Intelligence Layer"
)

echo "🏗️  Creating standalone GitHub repositories for Trancendos Wave 6 Studios..."
echo ""

for entry in "${REPOS[@]}"; do
  REPO_NAME="${entry%%:*}"
  REPO_DESC="${entry#*:}"
  
  echo "📦 Creating: $ORG/$REPO_NAME"
  echo "   Description: $REPO_DESC"
  
  # Check if repo already exists
  if gh repo view "$ORG/$REPO_NAME" &>/dev/null; then
    echo "   ✅ Already exists — skipping creation"
  else
    gh repo create "$ORG/$REPO_NAME" \
      --private \
      --description "$REPO_DESC" \
      --disable-wiki \
      --disable-issues=false
    echo "   ✅ Created successfully"
  fi
  
  echo ""
done

echo "🎯 All repositories created. Now push local repos:"
echo ""
echo "For each studio, run:"
echo "  cd repos/<studio-name>"
echo "  git remote set-url origin https://github.com/$ORG/<studio-name>.git"
echo "  git push -u origin main"
echo ""
echo "Or use the push-all-studios.sh script."