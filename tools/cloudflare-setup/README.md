# Cloudflare Setup Runner — Trancendos Ecosystem

One-click deployment tool for setting up `trancendos.com` and all subdomains via Cloudflare Tunnel.

## Overview

This standalone web tool provides:

- **Setup Wizard** — Enter Cloudflare credentials, review subdomain mappings, deploy everything in one click
- **Subdomain Manager** — Visual editor for all 21+ subdomain → service mappings
- **Script Generator** — Auto-generates `tunnel.yml`, `setup.sh`, and `dns-records.json`
- **DNS Management** — Create/delete DNS records via Cloudflare API
- **SSL/TLS Config** — Auto-configures Full (Strict) SSL, HSTS, Always HTTPS

## Usage

### Option A: Open Locally
```bash
cd tools/cloudflare-setup
open index.html
# or
python -m http.server 5174
```

### Option B: GitHub Pages
Deploy this directory to GitHub Pages for a hosted setup runner:
```bash
# From infinity-portal root
gh-pages -d tools/cloudflare-setup
```

### Option C: Infinity Admin OS
The `CloudflareDashboard.tsx` component in `apps/portal/src/components/cloudflare/` provides the same functionality integrated into the Infinity OS desktop environment.

## Prerequisites

1. **Cloudflare Account** with `trancendos.com` domain added
2. **API Token** with permissions:
   - Zone: DNS Edit
   - Account: Cloudflare Tunnel Edit
   - Account: Access: Apps and Policies Edit
3. **Account ID** and **Zone ID** (found in Cloudflare Dashboard → trancendos.com → Overview → API section)

## Subdomain Mappings

| Subdomain | Service | Port | Access |
|-----------|---------|------|--------|
| `infinity-os.trancendos.com` | Infinity OS Shell | 5173 | Public |
| `api.trancendos.com` | API Marketplace Gateway | 3033 | Public |
| `identity.trancendos.com` | Infinity One IAM | 8787 | Public |
| `nexus.trancendos.com` | The Nexus (AI Mesh) | 3029 | Service Token |
| `hive.trancendos.com` | The Hive (Data Mesh) | 3027 | Internal |
| `observatory.trancendos.com` | The Observatory | 3028 | Admin |
| `void.trancendos.com` | The Void (Secrets) | 8200 | Owner Only |
| `grid.trancendos.com` | The DigitalGrid (CI/CD) | 3032 | Admin |
| `chaos.trancendos.com` | Chaos Party (Testing) | 3031 | Admin |
| `marketplace.trancendos.com` | API Marketplace | 3033 | Public |
| `guardian.trancendos.com` | Guardian AI | 3001 | Service Token |
| `oracle.trancendos.com` | Oracle AI | 3002 | Service Token |
| `prometheus.trancendos.com` | Prometheus AI | 3003 | Service Token |
| `sentinel.trancendos.com` | Sentinel AI | 3004 | Service Token |
| `filesystem.trancendos.com` | Filesystem Worker | 8788 | Internal |
| `admin.trancendos.com` | Cloudflare Console | 5174 | Owner Only |
| `agora.trancendos.com` | The Agora | 3020 | Public |
| `library.trancendos.com` | The Library | 3021 | Public |
| `citadel.trancendos.com` | The Citadel | 3022 | Admin |
| `treasury.trancendos.com` | The Treasury | 3023 | Admin |
| `workshop.trancendos.com` | The Workshop | 3024 | Internal |

## Security

- API tokens are used **client-side only** and never stored or transmitted to third parties
- In the Infinity Admin OS version, tokens are stored in **The Void** (quantum-safe vault)
- All access policies use Cloudflare Access for zero-trust authentication
- Owner-only subdomains (void, admin) require explicit email verification

## Architecture

```
Cloudflare Setup Runner (this tool)
    │
    ├── Cloudflare API v4 (direct calls)
    │   ├── Zone settings (SSL, HSTS, HTTPS)
    │   ├── DNS records (CNAME → tunnel)
    │   ├── Tunnel management
    │   └── Access policies
    │
    ├── Script Generation
    │   ├── tunnel.yml (Cloudflare Tunnel config)
    │   ├── setup.sh (server install script)
    │   └── dns-records.json (DNS record definitions)
    │
    └── Infinity Admin OS Integration
        └── CloudflareDashboard.tsx (portal component)
```

## Related Files

- `infrastructure/cloudflare/tunnel.yml` — Existing tunnel config template
- `apps/portal/src/components/cloudflare/CloudflareDashboard.tsx` — Admin OS component
- `packages/void/src/VoidService.ts` — Secrets storage for API tokens
- `packages/kernel/src/os/service-discovery.ts` — Service discovery for subdomain routing