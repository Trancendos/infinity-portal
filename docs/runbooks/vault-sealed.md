# Runbook: Vault Sealed

**Alert:** `VaultSealed`  
**Severity:** Critical  
**ISO 27001:** A.10.1 — Cryptographic controls  
**Last Updated:** 2025-01-09

---

## Symptoms

- Alert `VaultSealed` fires in Prometheus/Grafana
- `vault_core_unsealed == 0` metric detected
- Services unable to access secrets or perform crypto operations
- JWT signing failures, encryption/decryption errors

## Impact

- **Critical:** All secret access is blocked
- Crypto-shredding operations unavailable
- New JWT tokens cannot be signed
- File encryption/decryption fails
- Agent-to-agent mTLS may degrade

## Diagnosis

```bash
# Check Vault status
vault status

# If using Docker Compose
docker-compose -f infrastructure/docker/docker-compose.prod.yml exec vault vault status

# If using K3s
kubectl exec -n infinity-os vault-0 -- vault status
```

**Expected output when sealed:**
```
Sealed: true
```

## Resolution

### Step 1: Unseal Vault

```bash
# Using unseal key (stored securely — never in Git)
vault operator unseal <UNSEAL_KEY>

# If using Docker Compose
docker-compose -f infrastructure/docker/docker-compose.prod.yml exec vault vault operator unseal <UNSEAL_KEY>

# If using K3s
kubectl exec -n infinity-os vault-0 -- vault operator unseal <UNSEAL_KEY>
```

### Step 2: Verify Unsealed

```bash
vault status
# Expected: Sealed: false
```

### Step 3: Verify Services Recovering

```bash
# Check backend health
curl -s https://<DOMAIN>/health | jq .

# Check identity worker
curl -s https://identity.<DOMAIN>/health | jq .
```

### Step 4: Investigate Root Cause

Common causes:
1. **Pod restart** — Vault auto-seals on restart; configure auto-unseal
2. **Memory pressure** — Check node resources
3. **Storage corruption** — Check Vault storage backend
4. **Manual seal** — Check audit logs for `vault operator seal` commands

```bash
# Check Vault audit logs
vault audit list
docker logs vault 2>&1 | grep -i "seal"
```

## Prevention

1. **Configure auto-unseal** using cloud KMS (Oracle Cloud Vault, Cloudflare):
   ```hcl
   seal "ocikms" {
     crypto_endpoint = "..."
     management_endpoint = "..."
     key_id = "..."
   }
   ```
2. **Monitor Vault health** — ensure `VaultSealed` alert is active
3. **Regular backup** — `vault operator raft snapshot save backup.snap`
4. **Document unseal keys** — store in separate secure location (not same infra)

## Escalation

If Vault cannot be unsealed:
1. Contact platform team lead
2. Retrieve unseal keys from secure backup
3. If keys are lost, initiate disaster recovery procedure (see `backup-restore.md`)