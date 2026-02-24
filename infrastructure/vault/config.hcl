# ============================================================
# HashiCorp Vault Configuration — Infinity OS
# Production mode with file storage backend
# ISO 27001: A.10.1 Cryptographic controls
# ============================================================

ui = true

storage "file" {
  path = "/vault/data"
}

listener "tcp" {
  address       = "0.0.0.0:8200"
  tls_disable   = "true"   # TLS handled by Traefik reverse proxy
  # In production with direct TLS:
  # tls_cert_file = "/vault/tls/vault.crt"
  # tls_key_file  = "/vault/tls/vault.key"
}

api_addr     = "http://0.0.0.0:8200"
cluster_addr = "http://0.0.0.0:8201"

# Disable mlock for containerised environments
# In bare-metal: set disable_mlock = false for security
disable_mlock = true

# Audit logging — ISO 27001: A.8.15
# All Vault operations are logged for compliance
audit {
  type = "file"
  path = "/vault/logs/audit.log"
  options = {
    log_raw = "false"   # Don't log raw secrets
  }
}

# Telemetry for Prometheus
telemetry {
  prometheus_retention_time = "30s"
  disable_hostname          = true
}