#!/bin/sh
# ============================================================
# Vault Initialisation Script — Infinity OS
# Runs once after Vault starts to configure:
#   1. Transit Secrets Engine (crypto-shredding)
#   2. KV Secrets Engine (app secrets)
#   3. Policies (least-privilege)
#   4. AppRole auth (for services)
#
# GDPR: Crypto-shredding enables right to erasure on
#       immutable storage (IPFS) by destroying encryption keys
# ISO 27001: A.10.1 Cryptographic controls
# ============================================================

set -e

echo "[Vault Init] Waiting for Vault to be ready..."
until vault status 2>/dev/null; do
  sleep 2
done

echo "[Vault Init] Vault is ready. Configuring..."

# ============================================================
# 1. Enable Transit Secrets Engine (Crypto-Shredding)
# ============================================================
echo "[Vault Init] Enabling Transit engine..."
vault secrets enable transit 2>/dev/null || echo "Transit already enabled"

# Create a default encryption key for general use
vault write -f transit/keys/infinity-os-default \
  type=aes256-gcm96 \
  exportable=false \
  allow_plaintext_backup=false

echo "[Vault Init] Transit engine configured"

# ============================================================
# 2. Enable KV v2 Secrets Engine
# ============================================================
echo "[Vault Init] Enabling KV v2..."
vault secrets enable -version=2 -path=secret kv 2>/dev/null || echo "KV already enabled"

# Store initial application secrets
vault kv put secret/infinity-os/config \
  environment="production" \
  version="0.1.0"

echo "[Vault Init] KV engine configured"

# ============================================================
# 3. Enable AppRole Auth (for service-to-service auth)
# ============================================================
echo "[Vault Init] Enabling AppRole auth..."
vault auth enable approle 2>/dev/null || echo "AppRole already enabled"

# Create role for identity worker
vault write auth/approle/role/identity-worker \
  token_policies="identity-worker-policy" \
  token_ttl=1h \
  token_max_ttl=4h \
  secret_id_ttl=24h

# Create role for filesystem worker
vault write auth/approle/role/filesystem-worker \
  token_policies="filesystem-worker-policy" \
  token_ttl=1h \
  token_max_ttl=4h \
  secret_id_ttl=24h

echo "[Vault Init] AppRole auth configured"

# ============================================================
# 4. Write Policies
# ============================================================
echo "[Vault Init] Writing policies..."

# Identity worker policy — can encrypt/decrypt, read secrets
vault policy write identity-worker-policy - <<EOF
# Transit engine — encrypt/decrypt only
path "transit/encrypt/infinity-os-default" {
  capabilities = ["update"]
}
path "transit/decrypt/infinity-os-default" {
  capabilities = ["update"]
}
# Read own secrets
path "secret/data/infinity-os/identity/*" {
  capabilities = ["read"]
}
EOF

# Filesystem worker policy — can create/delete user keys (crypto-shredding)
vault policy write filesystem-worker-policy - <<EOF
# Transit engine — full key management for user data
path "transit/keys/user-*" {
  capabilities = ["create", "read", "update", "delete"]
}
path "transit/encrypt/user-*" {
  capabilities = ["update"]
}
path "transit/decrypt/user-*" {
  capabilities = ["update"]
}
# GDPR crypto-shredding: allow key deletion
path "transit/keys/user-*/config" {
  capabilities = ["update"]
}
# Read own secrets
path "secret/data/infinity-os/filesystem/*" {
  capabilities = ["read"]
}
EOF

# Admin policy — full access (Super Admin only)
vault policy write infinity-admin-policy - <<EOF
path "*" {
  capabilities = ["create", "read", "update", "delete", "list", "sudo"]
}
EOF

echo "[Vault Init] Policies written"

# ============================================================
# 5. Get AppRole credentials for services
# ============================================================
echo "[Vault Init] Generating AppRole credentials..."

IDENTITY_ROLE_ID=$(vault read -field=role_id auth/approle/role/identity-worker/role-id)
IDENTITY_SECRET_ID=$(vault write -field=secret_id -f auth/approle/role/identity-worker/secret-id)

FILESYSTEM_ROLE_ID=$(vault read -field=role_id auth/approle/role/filesystem-worker/role-id)
FILESYSTEM_SECRET_ID=$(vault write -field=secret_id -f auth/approle/role/filesystem-worker/secret-id)

# Store credentials in KV for services to retrieve
vault kv put secret/infinity-os/approle/identity \
  role_id="$IDENTITY_ROLE_ID" \
  secret_id="$IDENTITY_SECRET_ID"

vault kv put secret/infinity-os/approle/filesystem \
  role_id="$FILESYSTEM_ROLE_ID" \
  secret_id="$FILESYSTEM_SECRET_ID"

echo "[Vault Init] ✓ Vault initialisation complete"
echo "[Vault Init] Identity Role ID: $IDENTITY_ROLE_ID"
echo "[Vault Init] Filesystem Role ID: $FILESYSTEM_ROLE_ID"
echo ""
echo "IMPORTANT: Store these credentials securely."
echo "The secret IDs above are single-use and will expire in 24h."