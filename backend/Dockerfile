# ============================================================
# Infinity Portal — Backend (FastAPI) Dockerfile
# ============================================================
# Targets:
#   development  — hot-reload with uvicorn, dev deps
#   production   — gunicorn with uvicorn workers, minimal image
# ============================================================

# ── Base Stage ─────────────────────────────────────────────
FROM python:3.11-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# System dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# ── Development Stage ──────────────────────────────────────
FROM base AS development

# Install dev dependencies
COPY requirements-dev.txt* ./
RUN if [ -f requirements-dev.txt ]; then pip install --no-cache-dir -r requirements-dev.txt; fi

# Copy source (will be overridden by volume mount in dev)
COPY . .

EXPOSE 8000

# Hot-reload with uvicorn
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload", "--log-level", "debug"]

# ── Production Stage ───────────────────────────────────────
FROM base AS production

# Create non-root user
RUN groupadd -r appuser && useradd -r -g appuser -d /app -s /sbin/nologin appuser

# Install gunicorn for production
RUN pip install --no-cache-dir gunicorn

# Copy source
COPY . .

# Change ownership
RUN chown -R appuser:appuser /app

USER appuser

EXPOSE 8000

# Production server with gunicorn + uvicorn workers
CMD ["gunicorn", "main:app", \
     "--bind", "0.0.0.0:8000", \
     "--worker-class", "uvicorn.workers.UvicornWorker", \
     "--workers", "4", \
     "--timeout", "120", \
     "--graceful-timeout", "30", \
     "--keep-alive", "5", \
     "--access-logfile", "-", \
     "--error-logfile", "-"]