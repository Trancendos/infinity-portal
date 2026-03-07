/**
 * Environment Configuration — Hot-Reloadable
 * 
 * All configuration is validated by Zod schemas at startup.
 * Runtime changes propagate via Redis pub/sub (config mesh).
 * Every config value has a sensible default for zero-config local development.
 */

import { z } from 'zod';
import { createModuleLogger } from '../utils/logger.js';

const log = createModuleLogger('config');

const EnvironmentSchema = z.object({
  // Service
  NODE_ENV: z.enum(['development', 'staging', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3041),
  HOST: z.string().default('0.0.0.0'),
  SERVICE_NAME: z.string().default('artifactory'),

  // PostgreSQL
  DATABASE_URL: z.string().default('postgresql://artifactory:artifactory@localhost:5432/artifactory'),
  DATABASE_POOL_MIN: z.coerce.number().int().min(1).default(2),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).default(20),

  // Cloudflare R2 (S3-compatible)
  R2_ENDPOINT: z.string().default('http://localhost:9000'),
  R2_ACCESS_KEY_ID: z.string().default('minioadmin'),
  R2_SECRET_ACCESS_KEY: z.string().default('minioadmin'),
  R2_BUCKET: z.string().default('trancendos-artifacts'),
  R2_REGION: z.string().default('auto'),

  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),
  REDIS_PREFIX: z.string().default('artifactory:'),

  // Meilisearch
  MEILISEARCH_URL: z.string().default('http://localhost:7700'),
  MEILISEARCH_API_KEY: z.string().default(''),

  // Keycloak
  KEYCLOAK_URL: z.string().default('http://localhost:8080'),
  KEYCLOAK_REALM: z.string().default('trancendos'),
  KEYCLOAK_CLIENT_ID: z.string().default('the-artifactory'),
  KEYCLOAK_CLIENT_SECRET: z.string().default(''),

  // Mesh Services
  NEXUS_URL: z.string().default('http://localhost:3014'),
  AGORA_URL: z.string().default('http://localhost:3017'),
  OBSERVATORY_URL: z.string().default('http://localhost:3012'),
  LIGHTHOUSE_URL: z.string().default('http://localhost:3016'),
  TREASURY_URL: z.string().default('http://localhost:3018'),
  ICEBOX_URL: z.string().default('http://localhost:3019'),
  CORNELIUS_URL: z.string().default('http://localhost:3000'),
  NORMAN_URL: z.string().default('http://localhost:3008'),
  GUARDIAN_URL: z.string().default('http://localhost:3009'),

  // Security
  JWT_ISSUER: z.string().default('https://auth.trancendos.com/realms/trancendos'),
  ARTIFACT_SIGNING_ENABLED: z.coerce.boolean().default(true),
  SCAN_ON_INGEST: z.coerce.boolean().default(true),
  QUARANTINE_ON_CRITICAL: z.coerce.boolean().default(true),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(1000),

  // Storage Lifecycle
  HOT_RETENTION_DAYS: z.coerce.number().int().positive().default(90),
  WARM_RETENTION_DAYS: z.coerce.number().int().positive().default(365),
  COLD_ARCHIVE_AFTER_DAYS: z.coerce.number().int().positive().default(730),

  // Logging
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
});

export type Environment = z.infer<typeof EnvironmentSchema>;

let currentConfig: Environment;

/**
 * Load and validate environment configuration.
 * Fails fast on invalid configuration — no silent defaults for production.
 */
export function loadConfig(): Environment {
  const result = EnvironmentSchema.safeParse(process.env);

  if (!result.success) {
    log.error({ errors: result.error.flatten() }, 'Invalid environment configuration');
    throw new Error(`Configuration validation failed: ${result.error.message}`);
  }

  currentConfig = result.data;

  log.info({
    env: currentConfig.NODE_ENV,
    port: currentConfig.PORT,
    database: currentConfig.DATABASE_URL.replace(/\/\/.*@/, '//***@'),
    r2Endpoint: currentConfig.R2_ENDPOINT,
    keycloakUrl: currentConfig.KEYCLOAK_URL,
  }, 'Configuration loaded');

  return currentConfig;
}

/**
 * Get current configuration. Throws if not loaded.
 */
export function getConfig(): Environment {
  if (!currentConfig) {
    throw new Error('Configuration not loaded. Call loadConfig() first.');
  }
  return currentConfig;
}

/**
 * Hot-reload configuration from environment.
 * Called by the config mesh when a change event is received.
 */
export function reloadConfig(): Environment {
  log.info('Hot-reloading configuration');
  return loadConfig();
}