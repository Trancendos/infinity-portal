/**
 * The DigitalGrid — Self-Healing Webhook Matrix
 * Ista: Tyler Towncroft (The DevOpsista)
 *
 * If an external API endpoint fails, auto-splices in a zero-cost
 * fallback loop (cached JSON) until primary is restored.
 */

import { v4 as uuid } from 'uuid';
import { logger } from '../utils/logger';

export interface WebhookEndpoint {
  id: string;
  name: string;
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers: Record<string, string>;
  status: 'active' | 'failing' | 'fallback' | 'disabled';
  fallbackResponse: Record<string, unknown> | null;
  successCount: number;
  failureCount: number;
  consecutiveFailures: number;
  lastSuccess: string | null;
  lastFailure: string | null;
  healCount: number;
  createdAt: string;
}

export class WebhookMatrix {
  private endpoints: Map<string, WebhookEndpoint> = new Map();
  private readonly MAX_CONSECUTIVE_FAILURES = 3;

  registerEndpoint(input: {
    name: string; url: string; method?: WebhookEndpoint['method'];
    headers?: Record<string, string>;
    fallbackResponse?: Record<string, unknown>;
  }): WebhookEndpoint {
    const endpoint: WebhookEndpoint = {
      id: uuid(), name: input.name, url: input.url,
      method: input.method ?? 'POST', headers: input.headers ?? {},
      status: 'active', fallbackResponse: input.fallbackResponse ?? { status: 'cached', source: 'digitalgrid-fallback' },
      successCount: 0, failureCount: 0, consecutiveFailures: 0,
      lastSuccess: null, lastFailure: null, healCount: 0,
      createdAt: new Date().toISOString(),
    };
    this.endpoints.set(endpoint.id, endpoint);
    logger.info({ endpointId: endpoint.id, name: endpoint.name }, 'DigitalGrid Webhook: Endpoint registered');
    return endpoint;
  }

  recordSuccess(endpointId: string): WebhookEndpoint | null {
    const ep = this.endpoints.get(endpointId);
    if (!ep) return null;
    ep.successCount++;
    ep.consecutiveFailures = 0;
    ep.lastSuccess = new Date().toISOString();
    if (ep.status === 'fallback') {
      ep.status = 'active';
      ep.healCount++;
      logger.info({ endpointId, name: ep.name }, 'DigitalGrid Webhook: Self-healed — primary restored');
    }
    return ep;
  }

  recordFailure(endpointId: string): WebhookEndpoint | null {
    const ep = this.endpoints.get(endpointId);
    if (!ep) return null;
    ep.failureCount++;
    ep.consecutiveFailures++;
    ep.lastFailure = new Date().toISOString();
    if (ep.consecutiveFailures >= this.MAX_CONSECUTIVE_FAILURES) {
      ep.status = 'fallback';
      logger.warn({ endpointId, name: ep.name, failures: ep.consecutiveFailures },
        `DigitalGrid Webhook: ${ep.name} switched to fallback — Tyler: "Another one bites the dust."`);
    } else {
      ep.status = 'failing';
    }
    return ep;
  }

  getFallbackResponse(endpointId: string): Record<string, unknown> | null {
    const ep = this.endpoints.get(endpointId);
    return ep?.fallbackResponse ?? null;
  }

  getEndpoint(id: string): WebhookEndpoint | undefined { return this.endpoints.get(id); }
  getAllEndpoints(): WebhookEndpoint[] { return [...this.endpoints.values()]; }

  getStats(): { total: number; active: number; fallback: number; failing: number; totalHeals: number } {
    const all = [...this.endpoints.values()];
    return {
      total: all.length, active: all.filter(e => e.status === 'active').length,
      fallback: all.filter(e => e.status === 'fallback').length,
      failing: all.filter(e => e.status === 'failing').length,
      totalHeals: all.reduce((a, e) => a + e.healCount, 0),
    };
  }
}
