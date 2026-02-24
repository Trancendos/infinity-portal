#!/bin/bash
# ============================================================
# Infinity OS — K3s Cluster Bootstrap
# Fluid hardware deployment: Oracle Cloud Always Free + local
#
# Oracle Cloud Always Free tier provides:
#   - 4 ARM Ampere A1 cores
#   - 24 GB RAM
#   - 200 GB block storage
#   - Completely FREE forever
#
# Usage:
#   # On primary node (Oracle Cloud or local):
#   ./k3s-bootstrap.sh --role server
#
#   # On additional nodes (any hardware):
#   K3S_SERVER_IP=<primary-ip> ./k3s-bootstrap.sh --role agent
#
# ISO 27001: A.8.9 Configuration management
# Zero Cost: K3s + Oracle Always Free + Cloudflare Tunnel
# ============================================================

set -euo pipefail

ROLE="server"
K3S_SERVER_IP="${K3S_SERVER_IP:-}"
K3S_VERSION="v1.28.4+k3s2"

# Parse args
while [[ $# -gt 0 ]]; do
  case $1 in
    --role) ROLE="$2"; shift 2 ;;
    --server-ip) K3S_SERVER_IP="$2"; shift 2 ;;
    *) echo "Unknown: $1"; exit 1 ;;
  esac
done

echo "╔══════════════════════════════════════╗"
echo "║  Infinity OS K3s Bootstrap           ║"
echo "║  Role: $ROLE                         ║"
echo "╚══════════════════════════════════════╝"

# ============================================================
# COMMON SETUP
# ============================================================
setup_common() {
  echo "[K3s] Installing prerequisites..."
  sudo apt-get update -qq
  sudo apt-get install -y -qq curl wget git jq

  # Disable swap (required for K3s)
  sudo swapoff -a
  sudo sed -i '/ swap / s/^\(.*\)$/#\1/g' /etc/fstab

  # Set kernel parameters
  cat <<EOF | sudo tee /etc/sysctl.d/99-k3s.conf
net.bridge.bridge-nf-call-iptables = 1
net.bridge.bridge-nf-call-ip6tables = 1
net.ipv4.ip_forward = 1
EOF
  sudo sysctl --system -q
}

# ============================================================
# SERVER NODE (Primary)
# ============================================================
setup_server() {
  echo "[K3s] Installing K3s server..."

  curl -sfL https://get.k3s.io | \
    INSTALL_K3S_VERSION="$K3S_VERSION" \
    sh -s - server \
      --disable traefik \
      --disable servicelb \
      --write-kubeconfig-mode 644 \
      --tls-san "$(curl -s ifconfig.me)" \
      --node-label "infinity-os/role=server"

  # Wait for K3s to be ready
  echo "[K3s] Waiting for K3s to be ready..."
  until kubectl get nodes &>/dev/null 2>&1; do sleep 2; done

  echo "[K3s] ✓ Server node ready"
  echo ""
  echo "Node token (share with agent nodes):"
  sudo cat /var/lib/rancher/k3s/server/node-token
  echo ""
  echo "Kubeconfig:"
  sudo cat /etc/rancher/k3s/k3s.yaml
}

# ============================================================
# AGENT NODE (Additional hardware)
# ============================================================
setup_agent() {
  if [[ -z "$K3S_SERVER_IP" ]]; then
    echo "ERROR: K3S_SERVER_IP required for agent setup"
    exit 1
  fi

  if [[ -z "${K3S_TOKEN:-}" ]]; then
    echo "ERROR: K3S_TOKEN required for agent setup"
    echo "Get it from the server: sudo cat /var/lib/rancher/k3s/server/node-token"
    exit 1
  fi

  echo "[K3s] Joining cluster at $K3S_SERVER_IP..."

  curl -sfL https://get.k3s.io | \
    INSTALL_K3S_VERSION="$K3S_VERSION" \
    K3S_URL="https://${K3S_SERVER_IP}:6443" \
    K3S_TOKEN="$K3S_TOKEN" \
    sh -s - agent \
      --node-label "infinity-os/role=agent"

  echo "[K3s] ✓ Agent node joined cluster"
}

# ============================================================
# CLOUDFLARE TUNNEL (Zero-cost secure ingress)
# ============================================================
setup_cloudflare_tunnel() {
  echo "[Tunnel] Installing cloudflared..."

  curl -L --output cloudflared.deb \
    "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb"
  sudo dpkg -i cloudflared.deb
  rm cloudflared.deb

  echo "[Tunnel] ✓ cloudflared installed"
  echo ""
  echo "Next steps:"
  echo "  1. cloudflared tunnel login"
  echo "  2. cloudflared tunnel create infinity-os"
  echo "  3. Copy tunnel ID to infrastructure/cloudflare/tunnel.yml"
  echo "  4. kubectl apply -f infrastructure/k3s/manifests/cloudflare-tunnel.yaml"
}

# ============================================================
# DEPLOY INFINITY OS MANIFESTS
# ============================================================
deploy_manifests() {
  echo "[K3s] Deploying Infinity OS manifests..."

  local manifests_dir="$(dirname "$0")/manifests"

  if [[ ! -d "$manifests_dir" ]]; then
    echo "[K3s] No manifests directory found — skipping"
    return
  fi

  kubectl apply -f "$manifests_dir/" --recursive
  echo "[K3s] ✓ Manifests applied"
}

# ============================================================
# MAIN
# ============================================================
setup_common

case "$ROLE" in
  server)
    setup_server
    setup_cloudflare_tunnel
    deploy_manifests
    ;;
  agent)
    setup_agent
    ;;
  *)
    echo "Unknown role: $ROLE (use 'server' or 'agent')"
    exit 1
    ;;
esac

echo ""
echo "╔══════════════════════════════════════╗"
echo "║  K3s Bootstrap Complete ✓            ║"
echo "╚══════════════════════════════════════╝"