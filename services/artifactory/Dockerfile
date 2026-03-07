# ═══════════════════════════════════════════════════════════════════════════
# TRANCENDOS ARTIFACTORY — Production Dockerfile
# Part of the Trancendos Ecosystem | Port 3041
# Multi-stage build for minimal attack surface and optimal image size.
# ═══════════════════════════════════════════════════════════════════════════

# ── Stage 1: Build ────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /build

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy package files first for layer caching
COPY package.json package-lock.json* .npmrc* ./

# Install all dependencies (including devDependencies for build)
RUN npm ci --ignore-scripts 2>/dev/null || npm install --ignore-scripts

# Copy source code
COPY tsconfig.json ./
COPY src/ ./src/

# Build TypeScript
RUN npx tsc --project tsconfig.json

# Prune devDependencies
RUN npm prune --production

# ── Stage 2: Production Runtime ───────────────────────────────────────────
FROM node:20-alpine AS runtime

# Security: Run as non-root user
RUN addgroup -g 1001 -S trancendos && \
    adduser -S artifactory -u 1001 -G trancendos

# Install runtime dependencies
RUN apk add --no-cache \
    tini \
    curl \
    ca-certificates \
    && rm -rf /var/cache/apk/*

WORKDIR /app

# Copy built application
COPY --from=builder /build/dist/ ./dist/
COPY --from=builder /build/node_modules/ ./node_modules/
COPY --from=builder /build/package.json ./

# Create required directories
RUN mkdir -p /app/data /app/logs /app/tmp /app/cache && \
    chown -R artifactory:trancendos /app

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3041/health || exit 1

# Switch to non-root user
USER artifactory

# Expose port
EXPOSE 3041

# Environment defaults
ENV NODE_ENV=production \
    PORT=3041 \
    LOG_LEVEL=info \
    SERVICE_NAME=artifactory \
    SERVICE_VERSION=2.0.0 \
    MESH_ROUTING_PROTOCOL=static_port \
    TRANCENDOS_2060_COMPLIANCE=active \
    SMART_RESILIENCE_LAYER=enabled

# Use tini as init system for proper signal handling
ENTRYPOINT ["/sbin/tini", "--"]

# Start the application
CMD ["node", "--enable-source-maps", "--max-old-space-size=512", "dist/index.js"]

# ── Labels ────────────────────────────────────────────────────────────────
LABEL org.opencontainers.image.title="trancendos-artifactory" \
      org.opencontainers.image.description="Trancendos Ecosystem Artifact Registry — Multi-Protocol Package Management" \
      org.opencontainers.image.vendor="Trancendos" \
      org.opencontainers.image.source="https://github.com/Trancendos/infinity-portal" \
      org.opencontainers.image.version="2.0.0" \
      org.opencontainers.image.licenses="MIT"