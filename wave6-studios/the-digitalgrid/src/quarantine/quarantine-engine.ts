/**
 * The DigitalGrid — Zero-Cost Quarantine Shunting
 * Ista: Tyler Towncroft (The DevOpsista)
 *
 * If a memory leak or bad commit is detected, traffic is shunted away,
 * broken code isolated in sandbox without dropping user sessions.
 */

import { v4 as uuid } from 'uuid';
import { logger } from '../utils/logger';

export interface QuarantineZone {
  id: string;
  serviceId: string;
  serviceName: string;
  reason: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'active' | 'investigating' | 'resolved' | 'released';
  trafficShunted: boolean;
  fallbackActive: boolean;
  sandboxed: boolean;
  createdAt: string;
  resolvedAt: string | null;
}

export class QuarantineEngine {
  private zones: Map<string, QuarantineZone> = new Map();

  quarantine(input: {
    serviceId: string; serviceName: string; reason: string;
    severity?: QuarantineZone['severity'];
  }): QuarantineZone {
    const zone: QuarantineZone = {
      id: uuid(), serviceId: input.serviceId, serviceName: input.serviceName,
      reason: input.reason, severity: input.severity ?? 'medium',
      status: 'active', trafficShunted: true, fallbackActive: true, sandboxed: true,
      createdAt: new Date().toISOString(), resolvedAt: null,
    };
    this.zones.set(zone.id, zone);
    logger.warn({ zoneId: zone.id, service: zone.serviceName, reason: zone.reason, severity: zone.severity },
      `DigitalGrid Quarantine: ${zone.serviceName} isolated — Tyler says "I told you to write tests."`);
    return zone;
  }

  resolve(zoneId: string): QuarantineZone | null {
    const zone = this.zones.get(zoneId);
    if (!zone || zone.status === 'resolved') return null;
    zone.status = 'resolved'; zone.trafficShunted = false;
    zone.fallbackActive = false; zone.sandboxed = false;
    zone.resolvedAt = new Date().toISOString();
    logger.info({ zoneId, service: zone.serviceName }, 'DigitalGrid Quarantine: Zone resolved — traffic restored');
    return zone;
  }

  getZone(id: string): QuarantineZone | undefined { return this.zones.get(id); }
  getActiveZones(): QuarantineZone[] { return [...this.zones.values()].filter(z => z.status === 'active' || z.status === 'investigating'); }
  getAllZones(): QuarantineZone[] { return [...this.zones.values()]; }

  getStats(): { total: number; active: number; resolved: number; critical: number } {
    const all = [...this.zones.values()];
    return {
      total: all.length, active: all.filter(z => z.status === 'active').length,
      resolved: all.filter(z => z.status === 'resolved').length,
      critical: all.filter(z => z.severity === 'critical' && z.status !== 'resolved').length,
    };
  }
}
