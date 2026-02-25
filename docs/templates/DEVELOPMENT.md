# Development Guide

> Setup, testing, and deployment instructions for [Repository Name].

## Prerequisites

- Node.js >= 18.0.0 (TypeScript repos) or Python >= 3.11 (Python repos)
- Git
- Docker (optional, for local services)

## Setup

```bash
# Clone
git clone https://github.com/Trancendos/[repo-name].git
cd [repo-name]

# Install dependencies
npm install        # TypeScript
pip install -r requirements.txt  # Python

# Configure environment
cp .env.example .env
# Edit .env with your values
```

## Development

```bash
# TypeScript
npm run dev        # Watch mode with hot reload
npm run lint       # ESLint check
npm run build      # Production build

# Python
uvicorn main:app --reload  # FastAPI dev server
black .                    # Format code
flake8 .                   # Lint check
```

## Testing

```bash
# TypeScript
npm test                    # Run all tests
npm test -- --watch         # Watch mode
npm test -- --coverage      # With coverage report

# Python
pytest                      # Run all tests
pytest --cov=. --cov-report=html  # With coverage
pytest tests/test_specific.py -v  # Specific file
```

### Coverage Requirements
- Minimum 75% line coverage
- All new features must include tests
- All bug fixes must include regression tests

## Code Style

- **TypeScript:** ESLint + Prettier, strict mode, no `any`
- **Python:** Black + isort + flake8, type hints required
- **Commits:** Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`)

## Branch Strategy

```
main          ← production-ready code
├── feature/* ← new features (PR to main)
├── fix/*     ← bug fixes (PR to main)
└── docs/*    ← documentation updates (PR to main)
```

All PRs require:
- CI pipeline passing (lint, test, build, security scan)
- Code review from CODEOWNERS
- No unresolved security findings

## Deployment

Automated via GitHub Actions on merge to `main`:

1. CI runs: lint → test → build → security scan
2. Docker image built and pushed to GHCR
3. Deployed to target environment (Cloudflare Workers / K3s)
4. Post-deploy health check validates

### Manual deployment (if needed)
```bash
# Cloudflare Worker
npx wrangler deploy

# Docker
docker build -t [image-name] .
docker push [registry]/[image-name]:latest
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `npm install` fails | Delete `node_modules` and `package-lock.json`, retry |
| Database connection error | Check `DATABASE_URL` in `.env`, ensure DB is running |
| Test failures | Run `npm test -- --verbose` for detailed output |
| Port already in use | `lsof -i :[port]` then `kill -9 [PID]` |

## Related Docs

- [ECOSYSTEM.md](https://github.com/Trancendos/the-foundation/ECOSYSTEM.md) — How this repo fits in the ecosystem
- [Agent SDK](https://github.com/Trancendos/agent-development-kit) — For agent repos
- [Architecture Decision Records](https://github.com/Trancendos/the-foundation/adr/) — Why decisions were made
