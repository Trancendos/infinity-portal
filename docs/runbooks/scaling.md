# Runbook: Scaling the Platform

**Category:** Operations  
**ISO 27001:** A.12.1 — Operational procedures  
**Last Updated:** 2025-01-09

---

## Scaling Overview

Infinity OS uses a tiered scaling strategy:

| Tier | Method | Trigger | Response Time |
|------|--------|---------|---------------|
| **Tier 1** | Vertical (resource limits) | CPU/Memory > 80% | Immediate |
| **Tier 2** | Horizontal (replicas) | Request rate > threshold | < 2 minutes |
| **Tier 3** | Node scaling (add hardware) | Cluster capacity > 70% | < 30 minutes |

---

## Backend API Scaling

### Docker Compose (Current)

```bash
# Scale backend replicas
docker-compose -f infrastructure/docker/docker-compose.prod.yml \
  up -d --scale backend=3

# Verify replicas
docker-compose -f infrastructure/docker/docker-compose.prod.yml ps
```

### K3s (When Deployed)

```bash
# Scale deployment
kubectl scale deployment infinity-os-backend \
  -n infinity-os --replicas=3

# Verify
kubectl get pods -n infinity-os -l app=infinity-os-backend

# Configure Horizontal Pod Autoscaler
kubectl autoscale deployment infinity-os-backend \
  -n infinity-os \
  --min=2 --max=10 \
  --cpu-percent=70
```

---

## Database Scaling

### Supabase (Current — Free Tier)

**Free tier limits:**
- 500 MB database
- 2 GB bandwidth
- 50 MB file storage

**When approaching limits:**
1. Monitor usage in Supabase dashboard
2. Optimize queries (see below)
3. Upgrade to Pro ($25/month) if needed

### Query Optimization

```sql
-- Find slow queries
SELECT query, calls, mean_exec_time, total_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 20;

-- Check index usage
SELECT relname, idx_scan, seq_scan, idx_scan::float / (idx_scan + seq_scan) AS idx_ratio
FROM pg_stat_user_tables
WHERE seq_scan + idx_scan > 0
ORDER BY idx_ratio ASC;

-- Add missing indexes
CREATE INDEX CONCURRENTLY idx_audit_events_created
  ON audit_events (created_at DESC);
```

### Connection Pooling

```bash
# PgBouncer configuration (if self-hosted)
# infrastructure/database/pgbouncer.ini
[databases]
infinity_os = host=localhost port=5432 dbname=infinity_os

[pgbouncer]
pool_mode = transaction
max_client_conn = 200
default_pool_size = 20
```

---

## Cloudflare Workers Scaling

Workers scale automatically. Monitor via:

```bash
# Check Worker analytics
curl -s "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/workers/analytics" \
  -H "Authorization: Bearer $CF_API_TOKEN" | jq .
```

**Free tier limits:**
- 100,000 requests/day
- 10ms CPU time per invocation

**If approaching limits:**
1. Optimize Worker code (reduce CPU time)
2. Add caching headers
3. Upgrade to Workers Paid ($5/month for 10M requests)

---

## Node Scaling (K3s)

### Add Oracle Cloud ARM Node

```bash
# 1. Provision new ARM instance (Oracle Cloud Always Free)
#    - Shape: VM.Standard.A1.Flex
#    - OCPUs: 1-4 (free tier allows up to 4 total)
#    - Memory: 6-24 GB (free tier allows up to 24 GB total)

# 2. Join to cluster
K3S_SERVER_IP=<primary-node-ip> \
K3S_TOKEN=<node-token> \
./infrastructure/k3s/k3s-bootstrap.sh --role agent

# 3. Verify node joined
kubectl get nodes -o wide

# 4. Label node for workload scheduling
kubectl label node <new-node> infinity-os/role=agent
kubectl label node <new-node> kubernetes.io/arch=arm64
```

### Add Raspberry Pi Node

```bash
# 1. Flash Ubuntu Server 22.04 ARM64 to SD card
# 2. SSH into Pi and run:
K3S_SERVER_IP=<primary-node-ip> \
K3S_TOKEN=<node-token> \
./infrastructure/k3s/k3s-bootstrap.sh --role agent

# 3. Label node
kubectl label node <pi-hostname> infinity-os/role=edge
kubectl label node <pi-hostname> node-type=raspberry-pi
```

---

## Agent Scaling

### Scale Agent Replicas

```bash
# Docker Compose
docker-compose -f infrastructure/docker/docker-compose.prod.yml \
  up -d --scale agent-manager=2

# K3s
kubectl scale deployment agent-manager -n infinity-os --replicas=3
```

### Monitor Agent Load

```bash
# Check active agents via API
curl -s https://<DOMAIN>/api/v1/agents/metrics | jq .

# Prometheus query for agent count
# infinity_os_active_agents_total
```

---

## Scaling Decision Tree

```
Is response time > 500ms?
├── YES → Check backend CPU/memory
│   ├── CPU > 80% → Scale backend replicas (Tier 2)
│   ├── Memory > 80% → Increase memory limits (Tier 1)
│   └── Both OK → Check database
│       ├── Slow queries → Optimize queries
│       └── Connection limit → Add connection pooling
└── NO → Is error rate > 1%?
    ├── YES → Check logs for errors
    │   ├── 503 errors → Scale replicas
    │   ├── 429 errors → Adjust rate limits
    │   └── 500 errors → Debug application
    └── NO → System healthy ✅
```

---

## Monitoring Scaling Metrics

Key Prometheus queries:

```promql
# Request rate
rate(http_requests_total[5m])

# Response time (p95)
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))

# Error rate
rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m])

# CPU usage
container_cpu_usage_seconds_total{namespace="infinity-os"}

# Memory usage
container_memory_usage_bytes{namespace="infinity-os"}
```

---

## Cost Implications

| Action | Monthly Cost Impact |
|--------|-------------------|
| Scale Docker replicas | $0 (self-hosted) |
| Add Oracle Cloud ARM node | $0 (Always Free tier) |
| Add Raspberry Pi | $0 (one-time hardware cost) |
| Upgrade Supabase to Pro | +$25/month |
| Upgrade Cloudflare Workers | +$5/month |
| Add Cloudflare R2 storage | $0.015/GB/month |