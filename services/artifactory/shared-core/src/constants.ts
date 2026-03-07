/**
 * @trancendos/shared-core — Constants
 * Ecosystem-wide constants and enumerations.
 */

export const MESH_PORTS = {
  'cornelius-ai': 3000,
  'the-observatory': 3012,
  'the-nexus': 3014,
  'the-lighthouse': 3016,
  'the-agora': 3017,
  'the-treasury': 3018,
  'the-ice-box': 3019,
  'the-artifactory': 3020,
} as const;

export const MESH_SERVICES = Object.keys(MESH_PORTS) as Array<keyof typeof MESH_PORTS>;

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

export const ARTIFACT_TYPES = [
  'npm',
  'docker',
  'helm',
  'terraform',
  'pypi',
  'generic',
  'wasm',
  'docs',
  'migration',
  'config',
] as const;

export const ENVIRONMENTS = ['development', 'staging', 'production'] as const;

export const ROLES = {
  SYSTEM_ADMIN: 'system-admin',
  TENANT_ADMIN: 'tenant-admin',
  ARTIFACT_ADMIN: 'artifact-admin',
  PUBLISHER: 'artifact-publisher',
  READER: 'artifact-reader',
  AUDITOR: 'auditor',
} as const;

export const HEADERS = {
  TRACE_ID: 'x-trace-id',
  TENANT_ID: 'x-tenant-id',
  CORRELATION_ID: 'x-correlation-id',
  SOURCE_SERVICE: 'x-source-service',
  MESH_PROTOCOL: 'x-mesh-protocol',
  REQUEST_ID: 'x-request-id',
} as const;