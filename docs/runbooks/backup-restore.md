# Runbook: Backup & Restore Procedures

**Category:** Disaster Recovery  
**ISO 27001:** A.12.3 — Information backup  
**Last Updated:** 2025-01-09

---

## Automated Backup Schedule

| Component | Method | Frequency | Retention | Storage |
|-----------|--------|-----------|-----------|---------|
| **Database (Supabase)** | `pg_dump` / Supabase dashboard | Daily | 30 days | Cloudflare R2 |
| **Vault** | Raft snapshot | Every 6 hours | 7 days | Cloudflare R2 |
| **File Storage** | R2 replication | Continuous | 90 days | Cloudflare R2 |
| **Configuration** | Git repository | Every commit | Indefinite | GitHub |
| **Secrets** | Vault export (encrypted) | Daily | 30 days | Offline secure storage |

---

## Database Backup

### Manual Backup (Supabase)

```bash
# Option 1: Supabase CLI
supabase db dump --db-url "$SUPABASE_URL" -f backup-$(date +%Y%m%d).sql

# Option 2: pg_dump directly
pg_dump "$DATABASE_URL" \
  --format=custom \
  --compress=9 \
  --file=backup-$(date +%Y%m%d).dump

# Upload to R2
aws s3 cp backup-$(date +%Y%m%d).dump \
  s3://infinity-os-backups/database/ \
  --endpoint-url "$R2_ENDPOINT"
```

### Automated Backup Script

```bash
#!/bin/bash
# scripts/backup-database.sh
set -euo pipefail

BACKUP_FILE="db-backup-$(date +%Y%m%d-%H%M%S).dump"

echo "Starting database backup..."
pg_dump "$DATABASE_URL" \
  --format=custom \
  --compress=9 \
  --file="/tmp/$BACKUP_FILE"

echo "Uploading to R2..."
aws s3 cp "/tmp/$BACKUP_FILE" \
  "s3://infinity-os-backups/database/$BACKUP_FILE" \
  --endpoint-url "$R2_ENDPOINT"

echo "Cleaning up..."
rm -f "/tmp/$BACKUP_FILE"

echo "✅ Database backup complete: $BACKUP_FILE"
```

### Database Restore

```bash
# Option 1: From Supabase dump
supabase db push --db-url "$SUPABASE_URL" < backup.sql

# Option 2: From pg_dump custom format
pg_restore \
  --dbname="$DATABASE_URL" \
  --clean \
  --if-exists \
  --no-owner \
  backup.dump

# Option 3: From SQL file
psql "$DATABASE_URL" < backup.sql
```

### Verify Restore

```bash
# Check table counts
psql "$DATABASE_URL" -c "
  SELECT schemaname, relname, n_live_tup
  FROM pg_stat_user_tables
  ORDER BY n_live_tup DESC;
"

# Check critical tables exist
psql "$DATABASE_URL" -c "\dt"

# Run health check
curl -s https://<DOMAIN>/health | jq .
```

---

## Vault Backup

### Manual Backup

```bash
# Raft snapshot (recommended)
vault operator raft snapshot save vault-backup-$(date +%Y%m%d).snap

# Docker Compose
docker-compose -f infrastructure/docker/docker-compose.prod.yml \
  exec vault vault operator raft snapshot save /tmp/vault-backup.snap

docker cp vault:/tmp/vault-backup.snap ./vault-backup-$(date +%Y%m%d).snap
```

### Vault Restore

```bash
# Restore from Raft snapshot
vault operator raft snapshot restore vault-backup.snap

# Docker Compose
docker cp vault-backup.snap vault:/tmp/vault-backup.snap
docker-compose -f infrastructure/docker/docker-compose.prod.yml \
  exec vault vault operator raft snapshot restore /tmp/vault-backup.snap

# Unseal after restore
vault operator unseal <UNSEAL_KEY>
```

---

## File Storage Backup (Cloudflare R2)

R2 provides built-in durability (11 nines). For additional protection:

```bash
# Sync R2 bucket to local backup
aws s3 sync \
  s3://infinity-os-files/ \
  ./backup-files/ \
  --endpoint-url "$R2_ENDPOINT"

# Sync to secondary R2 bucket
aws s3 sync \
  s3://infinity-os-files/ \
  s3://infinity-os-files-backup/ \
  --endpoint-url "$R2_ENDPOINT"
```

---

## Configuration Backup

All configuration is stored in Git. To restore:

```bash
# Clone repository
gh repo clone Trancendos/infinity-portal

# Restore .env from secure storage
cp /secure-backup/.env .env

# Redeploy
./scripts/deploy.sh --env production
```

---

## Full Disaster Recovery Procedure

### Step 1: Provision Infrastructure

```bash
# Apply Terraform
cd infrastructure/terraform
terraform init
terraform apply

# Bootstrap K3s (if using)
./infrastructure/k3s/k3s-bootstrap.sh --role server
```

### Step 2: Restore Database

```bash
# Download latest backup from R2
aws s3 cp s3://infinity-os-backups/database/latest.dump ./backup.dump \
  --endpoint-url "$R2_ENDPOINT"

# Restore
pg_restore --dbname="$DATABASE_URL" --clean --if-exists backup.dump
```

### Step 3: Restore Vault

```bash
# Start Vault
docker-compose -f infrastructure/docker/docker-compose.prod.yml up -d vault

# Restore from snapshot
vault operator raft snapshot restore vault-backup.snap
vault operator unseal <UNSEAL_KEY>
```

### Step 4: Deploy Application

```bash
./scripts/deploy.sh --env production
```

### Step 5: Verify

```bash
./scripts/validate-production.sh
```

---

## Recovery Time Objectives

| Scenario | RTO | RPO |
|----------|-----|-----|
| **Single service failure** | < 5 minutes | 0 (no data loss) |
| **Database corruption** | < 30 minutes | < 24 hours |
| **Full infrastructure loss** | < 2 hours | < 24 hours |
| **Region failure** | < 4 hours | < 24 hours |

---

## Testing Schedule

- **Monthly:** Restore database backup to test environment
- **Quarterly:** Full DR test (provision new infra, restore everything)
- **Annually:** DR test with simulated region failure