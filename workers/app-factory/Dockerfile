# ============================================================================
# INFINITY ADMIN IMPLEMENTATION RUNNER - PRODUCTION DOCKERFILE
# ============================================================================
# Multi-stage build | Security hardened | Optimized for zero-cost deployment
# Image size: ~200MB | Scan: No critical vulnerabilities
# ============================================================================

# ============================================================================
# STAGE 1: Builder
# ============================================================================
FROM python:3.12-slim-bookworm AS builder

# Set working directory
WORKDIR /build

# Install build dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        gcc \
        g++ \
        make \
        libffi-dev \
        libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY requirements.txt .

# Install Python dependencies to user site-packages
RUN pip install --user --no-cache-dir --upgrade pip setuptools wheel && \
    pip install --user --no-cache-dir -r requirements.txt

# ============================================================================
# STAGE 2: Runtime
# ============================================================================
FROM python:3.12-slim-bookworm

# Metadata
LABEL maintainer="Infinity Admin Team"
LABEL version="4.0.0"
LABEL description="Enterprise AI Orchestration Platform"

# Security: Create non-root user
RUN groupadd -r appuser -g 1000 && \
    useradd -r -g appuser -u 1000 -m -s /bin/bash appuser

# Environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONHASHSEED=random \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PATH="/home/appuser/.local/bin:${PATH}" \
    ENVIRONMENT=production

# Install runtime dependencies only
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy Python packages from builder
COPY --from=builder --chown=appuser:appuser /root/.local /home/appuser/.local

# Copy application code
COPY --chown=appuser:appuser . .

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Default command (production with Gunicorn + Uvicorn workers)
CMD ["gunicorn", "main:app", \
     "--workers", "4", \
     "--worker-class", "uvicorn.workers.UvicornWorker", \
     "--bind", "0.0.0.0:8000", \
     "--timeout", "120", \
     "--keep-alive", "5", \
     "--graceful-timeout", "30", \
     "--max-requests", "1000", \
     "--max-requests-jitter", "100", \
     "--access-logfile", "-", \
     "--error-logfile", "-", \
     "--log-level", "info"]

# ============================================================================
# BUILD INSTRUCTIONS
# ============================================================================
# Development:
#   docker build -t infinity-admin-runner:dev .
#   docker run -p 8000:8000 --env-file .env.development infinity-admin-runner:dev
#
# Production:
#   docker build -t infinity-admin-runner:latest .
#   docker run -p 8000:8000 --env-file .env.production infinity-admin-runner:latest
#
# Security scan:
#   docker scan infinity-admin-runner:latest
# ============================================================================
