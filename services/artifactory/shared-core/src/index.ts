/**
 * @trancendos/shared-core
 * Shared core utilities, types, and constants for the Trancendos Ecosystem.
 *
 * This package provides the foundational building blocks used across
 * all Trancendos microservices. It is the single source of truth for
 * shared types, validation schemas, error classes, and logging.
 *
 * @module @trancendos/shared-core
 * @version 1.0.0
 */

export { createLogger, createModuleLogger, createRequestLogger } from './logger.js';
export type { Logger, LoggerOptions } from './logger.js';

export {
  MeshEventSchema,
  HealthCheckSchema,
  PaginationSchema,
  SortSchema,
  TenantContextSchema,
  ServiceRegistrationSchema,
} from './schemas.js';
export type {
  MeshEvent,
  HealthCheck,
  Pagination,
  Sort,
  TenantContext,
  ServiceRegistration,
} from './schemas.js';

export {
  AppError,
  NotFoundError,
  ConflictError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  RateLimitError,
  ServiceUnavailableError,
  IntegrityError,
} from './errors.js';

export {
  MESH_PORTS,
  MESH_SERVICES,
  HTTP_STATUS,
  ARTIFACT_TYPES,
  ENVIRONMENTS,
  ROLES,
  HEADERS,
} from './constants.js';