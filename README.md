# ∞ Infinity OS

> **A browser-native, AI-augmented, modular Virtual Operating System Platform**  
> Built on the 2060 Modular Standard · Zero Cost · Fully Compliant · Future-Proof

[![License: MIT](https://img.shields.io/badge/License-MIT-6c63ff.svg)](LICENSE)
[![Zero Cost](https://img.shields.io/badge/Infrastructure_Cost-$0%2Fmonth-00ff88.svg)](#zero-cost-stack)
[![GDPR Compliant](https://img.shields.io/badge/GDPR-Compliant-00b4d8.svg)](#compliance)
[![WCAG 2.2 AA](https://img.shields.io/badge/WCAG-2.2_AA-ff6b9d.svg)](#accessibility)

---

## What Is Infinity OS?

Infinity OS is a complete Virtual Operating System delivered entirely through the browser. It provides a desktop metaphor with a window manager, taskbar, universal search, notification centre, and a modular application ecosystem — all running at zero infrastructure cost using Cloudflare's and Supabase's free tiers.

Think ChromeOS meets macOS meets Linux — but open, free, and running in any browser tab.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│  L5  App Store — Infinity Market                            │
├─────────────────────────────────────────────────────────────┤
│  L4  Data Layer — Supabase (PostgreSQL) + Cloudflare R2/KV  │
├─────────────────────────────────────────────────────────────┤
│  L3  Module System — Micro-Frontend Applications            │
├─────────────────────────────────────────────────────────────┤
│  L2  Shell — React 18 PWA + Infinity Design System          │
├─────────────────────────────────────────────────────────────┤
│  L1  Core Services — 6 Cloudflare Workers (Hono.js)         │
├─────────────────────────────────────────────────────────────┤
│  L0  Infinity Kernel — Service Worker + WebAssembly         │
└─────────────────────────────────────────────────────────────┘
```

---

## Repository Structure

```
infinity-os/
├── apps/
│   ├── shell/              # Main OS shell (React 18 PWA)
│   ├── admin/              # Admin dashboard
│   └── developer-portal/   # App Store developer portal
├── packages/
│   ├── kernel/             # Service Worker kernel (IPC, processes, permissions)
│   ├── ui/                 # Infinity Design System (IDS)
│   ├── types/              # Shared TypeScript types
│   ├── auth/               # Authentication utilities
│   ├── ipc/                # Inter-Process Communication
│   ├── storage/            # Storage abstraction layer
│   └── permissions/        # RBAC permission system
├── workers/
│   ├── identity/           # Identity Service (Cloudflare Worker)
│   ├── filesystem/         # File System Service (Cloudflare Worker)
│   ├── registry/           # Module Registry (Cloudflare Worker)
│   ├── notifications/      # Notification Service (Cloudflare Worker)
│   ├── search/             # Search Service (Cloudflare Worker)
│   └── ai/                 # AI Orchestration (Cloudflare Worker)
├── modules/
│   ├── file-manager/       # Built-in file manager
│   ├── text-editor/        # Built-in text editor
│   ├── settings/           # System settings
│   ├── app-store/          # Infinity Market
│   └── terminal/           # Web terminal
├── database/
│   ├── schema/             # PostgreSQL schema (Supabase)
│   └── migrations/         # Drizzle migration files
└── infinity-os/
    ├── architecture.html   # Interactive architecture diagram
    └── docs/               # Full transformation strategy document
```

---

## Zero-Cost Stack

| Service | Provider | Free Tier |
|---------|----------|-----------|
| Frontend Hosting | Cloudflare Pages | Unlimited bandwidth |
| Edge Computing | Cloudflare Workers | 100K req/day |
| Database | Supabase | 500MB PostgreSQL, 50K MAU |
| File Storage | Cloudflare R2 | 10GB, zero egress |
| Edge Cache | Cloudflare KV | 100K reads/day |
| Email | Resend | 3K emails/month |
| CI/CD | GitHub Actions | 2K min/month |
| AI Features | Cloudflare AI Workers | 10K neurons/day |
| **Total** | | **$0.00/month** |

---

## Role Hierarchy

| Role | Description |
|------|-------------|
| 👑 Super Admin | Platform owner (Trancendos) — unrestricted access |
| 🛡️ Org Admin | Manages organisation users, modules, settings |
| ⚡ Power User | Can install modules, create shared workspaces |
| 👤 Standard User | Personal files, approved modules, settings |

---

## Compliance

- ✅ **GDPR** — All 8 data subject rights, consent management, DPA available
- ✅ **CCPA** — Do Not Sell, right to know/delete/opt-out
- ✅ **SOC 2 Type II** — All 5 Trust Service Criteria covered
- ✅ **ISO 27001** — ISMS aligned with 2022 standard
- ✅ **WCAG 2.2 AA** — Full accessibility compliance
- ✅ **Zero Trust** — Never trust, always verify at every layer

---

## 2025–2060 Roadmap

| Phase | Timeline | Milestone |
|-------|----------|-----------|
| 1 — Foundation | Months 1–3 | Core OS: Shell, Kernel, Identity, File System |
| 2 — Ecosystem | Months 4–6 | App Store, Collaboration, Admin Dashboard |
| 3 — Intelligence | Months 7–12 | AI-native platform integration |
| 4 — Developer Platform | Year 2 | Public SDK, developer portal |
| 5 — Spatial Computing | Years 3–5 | WebXR, voice, gesture interfaces |
| 6 — Decentralisation | Years 5–10 | Self-hosting, federation, data sovereignty |
| 7 — Quantum Readiness | Years 10–15 | Post-quantum cryptography migration |
| 8 — Neural Interface | Years 15–35 | Brain-computer interface (2040–2060) |

---

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 8+
- A Cloudflare account (free)
- A Supabase account (free)

### Installation

```bash
# Clone the repository
git clone https://github.com/Trancendos/infinity-portal.git
cd infinity-portal

# Install dependencies
pnpm install

# Set up environment variables
cp apps/shell/.env.example apps/shell/.env.local
# Edit .env.local with your Supabase and Cloudflare credentials

# Run the database schema
# Copy database/schema/001_core.sql into your Supabase SQL editor and run it

# Start development
pnpm dev
```

### Environment Variables

```env
# apps/shell/.env.local
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_IDENTITY_WORKER_URL=http://localhost:8787
VITE_FILESYSTEM_WORKER_URL=http://localhost:8788
VITE_REGISTRY_WORKER_URL=http://localhost:8789
```

### Deploy to Cloudflare Pages (Free)

```bash
# Build the shell
pnpm build

# Deploy to Cloudflare Pages
npx wrangler pages deploy apps/shell/dist --project-name infinity-os
```

---

## Documentation

- 📋 [Full Transformation Strategy](infinity-os/docs/INFINITY_OS_TRANSFORMATION_STRATEGY.md)
- 🏗️ [Interactive Architecture Diagram](infinity-os/architecture.html)
- 🗄️ [Database Schema](database/schema/001_core.sql)

---

## Part of the Luminous-MastermindAI Ecosystem

Infinity OS is the central platform of the Luminous-MastermindAI ecosystem, providing the operating environment for all AI-augmented applications and services.

---

## License

MIT © Trancendos

---

*The train wreck is over. Infinity OS begins now.*