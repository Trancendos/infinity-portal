/**
 * @trancendos/shared-core — Schemas
 * Ecosystem-wide Zod validation schemas.
 */

import { z } from 'zod';

export const MeshEventSchema = z.object({
  id: z.string().uuid(),
  type: z.string().min(1),
  source: z.string().min(1),
  timestamp: z.string().datetime(),
  tenantId: z.string().optional(),
  correlationId: z.string().uuid().optional(),
  payload: z.record(z.string(), z.unknown()),
});
export type MeshEvent = z.infer<typeof MeshEventSchema>;

export const HealthCheckSchema = z.object({
  status: z.enum(['healthy', 'degraded', 'unhealthy']),
  service: z.string(),
  version: z.string(),
  uptime: z.number(),
  timestamp: z.string().datetime(),
  checks: z.record(z.string(), z.object({
    status: z.enum(['pass', 'fail', 'warn']),
    message: z.string().optional(),
    latencyMs: z.number().optional(),
  })),
});
export type HealthCheck = z.infer<typeof HealthCheckSchema>;

export const PaginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type Pagination = z.infer<typeof PaginationSchema>;

export const SortSchema = z.object({
  sortBy: z.string().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});
export type Sort = z.infer<typeof SortSchema>;

export const TenantContextSchema = z.object({
  tenantId: z.string().uuid(),
  tenantSlug: z.string().optional(),
  plan: z.string().optional(),
  roles: z.array(z.string()).default([]),
});
export type TenantContext = z.infer<typeof TenantContextSchema>;

export const ServiceRegistrationSchema = z.object({
  serviceName: z.string().min(1),
  version: z.string(),
  host: z.string(),
  port: z.number().int().positive(),
  healthEndpoint: z.string().default('/health'),
  capabilities: z.array(z.string()).default([]),
  metadata: z.record(z.string(), z.string()).default({}),
});
export type ServiceRegistration = z.infer<typeof ServiceRegistrationSchema>;