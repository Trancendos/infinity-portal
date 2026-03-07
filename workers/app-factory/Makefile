.PHONY: help build up down logs restart clean test deploy health stats format lint security-scan

# Default target
.DEFAULT_GOAL := help

# Colors
CYAN := \033[0;36m
GREEN := \033[0;32m
YELLOW := \033[1;33m
RED := \033[0;31m
NC := \033[0m

help: ## Show this help message
	@echo "$(CYAN)╔═══════════════════════════════════════════════════════════════╗$(NC)"
	@echo "$(CYAN)║    Infinity Admin Implementation Runner v4.0 - Commands      ║$(NC)"
	@echo "$(CYAN)╚═══════════════════════════════════════════════════════════════╝$(NC)"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(GREEN)%-20s$(NC) %s\n", $$1, $$2}'
	@echo ""

build: ## Build Docker images
	@echo "$(CYAN)🔨 Building Docker images...$(NC)"
	docker-compose build --no-cache

up: ## Start all services
	@echo "$(CYAN)🚀 Starting services...$(NC)"
	docker-compose up -d
	@echo "$(GREEN)✅ Services started!$(NC)"
	@echo "API: http://localhost:8000"
	@echo "Docs: http://localhost:8000/docs"
	@echo "Health: http://localhost:8000/health"

down: ## Stop all services
	@echo "$(YELLOW)🛑 Stopping services...$(NC)"
	docker-compose down
	@echo "$(GREEN)✅ Services stopped!$(NC)"

logs: ## View service logs
	@echo "$(CYAN)📋 Viewing logs (Ctrl+C to exit)...$(NC)"
	docker-compose logs -f

restart: down up ## Restart all services

clean: ## Remove containers, volumes, and images
	@echo "$(RED)🧹 Cleaning up...$(NC)"
	docker-compose down -v --rmi all
	@echo "$(GREEN)✅ Cleanup complete!$(NC)"

# Development Commands

dev-backend: ## Run backend in development mode
	@echo "$(CYAN)🔧 Starting backend development server...$(NC)"
	cd backend && uvicorn main:app --reload --port 8000

dev-frontend: ## Run frontend in development mode
	@echo "$(CYAN)🔧 Starting frontend development server...$(NC)"
	cd frontend && npm run dev

install-backend: ## Install backend dependencies
	@echo "$(CYAN)📦 Installing backend dependencies...$(NC)"
	cd backend && pip install -r requirements.txt

install-frontend: ## Install frontend dependencies
	@echo "$(CYAN)📦 Installing frontend dependencies...$(NC)"
	cd frontend && npm install

# Testing Commands

test: ## Run all tests
	@echo "$(CYAN)🧪 Running tests...$(NC)"
	cd backend && pytest --cov=. --cov-report=term-missing

test-watch: ## Run tests in watch mode
	@echo "$(CYAN)🧪 Running tests in watch mode...$(NC)"
	cd backend && pytest-watch

test-coverage: ## Generate test coverage report
	@echo "$(CYAN)📊 Generating coverage report...$(NC)"
	cd backend && pytest --cov=. --cov-report=html
	@echo "$(GREEN)✅ Report generated at backend/htmlcov/index.html$(NC)"

# Code Quality Commands

format: ## Format code with Black and Prettier
	@echo "$(CYAN)✨ Formatting code...$(NC)"
	cd backend && black .
	cd frontend && npm run format
	@echo "$(GREEN)✅ Code formatted!$(NC)"

lint: ## Lint code with Ruff and ESLint
	@echo "$(CYAN)🔍 Linting code...$(NC)"
	cd backend && ruff check .
	cd frontend && npm run lint
	@echo "$(GREEN)✅ Linting complete!$(NC)"

type-check: ## Run type checking
	@echo "$(CYAN)📝 Type checking...$(NC)"
	cd backend && mypy main.py --ignore-missing-imports
	cd frontend && npm run type-check

# Security Commands

security-scan: ## Run security scans
	@echo "$(CYAN)🔒 Running security scans...$(NC)"
	@echo "Scanning Python dependencies..."
	cd backend && pip-audit || echo "$(YELLOW)⚠️  pip-audit not installed$(NC)"
	@echo "Scanning Docker image..."
	docker scout cves local/infinity-admin-runner:latest || echo "$(YELLOW)⚠️  Docker Scout not available$(NC)"
	@echo "$(GREEN)✅ Security scan complete!$(NC)"

audit: ## Check for dependency vulnerabilities
	@echo "$(CYAN)🔍 Auditing dependencies...$(NC)"
	cd backend && pip-audit
	cd frontend && npm audit
	@echo "$(GREEN)✅ Audit complete!$(NC)"

# Deployment Commands

deploy: ## Deploy using deployment script
	@echo "$(CYAN)🚀 Starting deployment...$(NC)"
	@chmod +x deploy.sh
	./deploy.sh

deploy-local: build up ## Deploy locally

deploy-prod: ## Deploy to production (requires setup)
	@echo "$(CYAN)🚀 Deploying to production...$(NC)"
	docker-compose --env-file backend/.env.production build --no-cache
	docker-compose --env-file backend/.env.production up -d
	@echo "$(GREEN)✅ Production deployment complete!$(NC)"

# Monitoring Commands

health: ## Check service health
	@echo "$(CYAN)💚 Checking health...$(NC)"
	@curl -s http://localhost:8000/health | python -m json.tool

stats: ## View system statistics
	@echo "$(CYAN)📊 Fetching statistics...$(NC)"
	@curl -s http://localhost:8000/v4/stats | python -m json.tool

metrics: ## View Prometheus metrics
	@echo "$(CYAN)📈 Fetching metrics...$(NC)"
	@curl -s http://localhost:8000/metrics | head -n 50

monitor: ## Start monitoring stack
	@echo "$(CYAN)📊 Starting monitoring stack...$(NC)"
	docker-compose --profile monitoring up -d
	@echo "$(GREEN)✅ Monitoring started!$(NC)"
	@echo "Prometheus: http://localhost:9090"
	@echo "Grafana: http://localhost:3001 (admin/admin)"

# Database Commands

redis-cli: ## Connect to Redis CLI
	@echo "$(CYAN)💾 Connecting to Redis...$(NC)"
	docker-compose exec redis redis-cli

redis-flush: ## Flush Redis cache
	@echo "$(RED)⚠️  Flushing Redis cache...$(NC)"
	docker-compose exec redis redis-cli FLUSHALL
	@echo "$(GREEN)✅ Cache flushed!$(NC)"

# Utility Commands

shell-api: ## Open shell in API container
	docker-compose exec api /bin/bash

shell-redis: ## Open shell in Redis container
	docker-compose exec redis /bin/sh

backup: ## Backup Redis data
	@echo "$(CYAN)💾 Creating backup...$(NC)"
	@mkdir -p backups
	docker-compose exec redis redis-cli SAVE
	docker cp $$(docker-compose ps -q redis):/data/dump.rdb backups/redis-$$(date +%Y%m%d-%H%M%S).rdb
	@echo "$(GREEN)✅ Backup created in backups/$(NC)"

restore: ## Restore Redis data (requires backup file)
	@echo "$(CYAN)💾 Restoring from backup...$(NC)"
	@read -p "Enter backup filename: " file; \
	docker cp backups/$$file $$(docker-compose ps -q redis):/data/dump.rdb && \
	docker-compose restart redis
	@echo "$(GREEN)✅ Restore complete!$(NC)"

ps: ## Show running containers
	docker-compose ps

top: ## Show container resource usage
	docker stats $$(docker-compose ps -q)

# CI/CD Commands

ci-test: ## Run CI test suite
	@echo "$(CYAN)🔄 Running CI tests...$(NC)"
	cd backend && pytest --cov=. --cov-report=xml
	cd frontend && npm run test

ci-build: ## Build for CI/CD
	@echo "$(CYAN)🔄 Building for CI/CD...$(NC)"
	docker build -t infinity-admin-runner:ci backend/

ci-lint: lint ## Run CI linting

# Documentation Commands

docs: ## Generate API documentation
	@echo "$(CYAN)📚 Generating documentation...$(NC)"
	@echo "API Docs available at: http://localhost:8000/docs"
	@echo "ReDoc available at: http://localhost:8000/redoc"

docs-serve: up ## Start services and open docs
	@sleep 3
	@echo "$(CYAN)📚 Opening documentation...$(NC)"
	@python -m webbrowser http://localhost:8000/docs || echo "Visit: http://localhost:8000/docs"

# Complete Setup

setup: ## Complete initial setup
	@echo "$(CYAN)⚙️  Running complete setup...$(NC)"
	@if [ ! -f backend/.env.production ]; then \
		cp backend/.env.example backend/.env.production; \
		echo "$(YELLOW)⚠️  Created .env.production - Please add your API keys!$(NC)"; \
	fi
	make install-backend
	make install-frontend
	@echo "$(GREEN)✅ Setup complete!$(NC)"
	@echo "$(YELLOW)Next steps:$(NC)"
	@echo "  1. Add API keys to backend/.env.production"
	@echo "  2. Run: make up"
	@echo "  3. Visit: http://localhost:8000/docs"

# Quick Start

quickstart: setup up ## Quick start (setup + start services)
	@echo "$(GREEN)╔═══════════════════════════════════════════════════════════════╗$(NC)"
	@echo "$(GREEN)║              🎉 INFINITY ADMIN RUNNER STARTED! 🎉             ║$(NC)"
	@echo "$(GREEN)╚═══════════════════════════════════════════════════════════════╝$(NC)"
	@echo ""
	@echo "$(CYAN)📊 Services:$(NC)"
	@echo "  • API:     http://localhost:8000"
	@echo "  • Docs:    http://localhost:8000/docs"
	@echo "  • Health:  http://localhost:8000/health"
	@echo ""
	@echo "$(CYAN)📝 Useful commands:$(NC)"
	@echo "  • make logs      - View logs"
	@echo "  • make health    - Check health"
	@echo "  • make stats     - View statistics"
	@echo "  • make down      - Stop services"
	@echo ""

version: ## Show version information
	@echo "$(CYAN)Infinity Admin Implementation Runner$(NC)"
	@echo "Version: 4.0.0"
	@echo "Backend: FastAPI + Python 3.12"
	@echo "Frontend: Next.js 14 + React 18"
	@echo "Database: Redis 7"
