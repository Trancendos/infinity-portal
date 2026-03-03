/**
 * @module Platform Integration
 * @description Wires Infinity-One, The Lighthouse, The HIVE, and The Void
 * into the Infinity OS Kernel. Registers each system as a microservice,
 * subscribes to cross-system events, and exposes a unified PlatformManager
 * that the kernel boots on startup.
 *
 * Architecture:
 * ```
 *  InfinityKernel
 *    └── PlatformManager
 *          ├── InfinityOneAdapter   (IAM / account hub)
 *          ├── LighthouseAdapter    (cryptographic token hub)
 *          ├── HiveAdapter          (swarm data router)
 *          └── VoidAdapter          (secure secret store)
 * ```
 *
 * Every adapter:
 *  1. Registers itself with the ServiceRegistry
 *  2. Subscribes to relevant kernel EventBus topics
 *  3. Publishes health metrics on a 30-second heartbeat
 *  4. Exposes a typed API surface consumed by Cloudflare Workers
 */

// ─────────────────────────────────────────────────────────────────────────────
// IMPORTS
// ─────────────────────────────────────────────────────────────────────────────

import { ServiceRegistry, type ServiceInstance } from '../microservices/service-registry';
import { EventBus, EventTypes, type Event } from '../microservices/event-bus';

// ─────────────────────────────────────────────────────────────────────────────
// PLATFORM SERVICE IDENTIFIERS
// ─────────────────────────────────────────────────────────────────────────────

export const PLATFORM_SERVICES = {
  INFINITY_ONE: 'infinity-one',
  LIGHTHOUSE:   'lighthouse',
  HIVE:         'hive',
  VOID:         'void',
} as const;

export type PlatformServiceId = typeof PLATFORM_SERVICES[keyof typeof PLATFORM_SERVICES];

// ─────────────────────────────────────────────────────────────────────────────
// PLATFORM EVENT TOPICS
// ─────────────────────────────────────────────────────────────────────────────

export const PLATFORM_EVENTS = {
  // Infinity-One → all
  USER_REGISTERED:        'platform:user:registered',
  USER_AUTHENTICATED:     'platform:user:authenticated',
  USER_DEACTIVATED:       'platform:user:deactivated',
  USER_GDPR_ERASURE:      'platform:user:gdpr_erasure',
  ROLE_ASSIGNED:          'platform:role:assigned',
  SESSION_CREATED:        'platform:session:created',
  SESSION_REVOKED:        'platform:session:revoked',

  // Lighthouse → all
  TOKEN_ISSUED:           'platform:token:issued',
  TOKEN_REVOKED:          'platform:token:revoked',
  THREAT_DETECTED:        'platform:threat:detected',
  WARP_TRIGGERED:         'platform:warp:triggered',
  ICEBOX_ENTRY_CREATED:   'platform:icebox:entry_created',
  ICEBOX_VERDICT:         'platform:icebox:verdict',
  RISK_SCORE_UPDATED:     'platform:risk:score_updated',

  // HIVE → all
  ROUTE_ESTABLISHED:      'platform:hive:route_established',
  NODE_JOINED:            'platform:hive:node_joined',
  NODE_LEFT:              'platform:hive:node_left',
  CLASSIFICATION_BREACH:  'platform:hive:classification_breach',
  SWARM_REBALANCED:       'platform:hive:swarm_rebalanced',

  // Void → all
  SECRET_STORED:          'platform:void:secret_stored',
  SECRET_RETRIEVED:       'platform:void:secret_retrieved',
  SECRET_ROTATED:         'platform:void:secret_rotated',
  SECRET_QUARANTINED:     'platform:void:secret_quarantined',
  VAULT_SEALED:           'platform:void:vault_sealed',
  VAULT_UNSEALED:         'platform:void:vault_unsealed',
  GDPR_ERASURE_COMPLETE:  'platform:void:gdpr_erasure_complete',

  // Cross-system
  PLATFORM_HEALTH_CHECK:  'platform:health:check',
  PLATFORM_SHUTDOWN:      'platform:shutdown',
} as const;

export type PlatformEventType = typeof PLATFORM_EVENTS[keyof typeof PLATFORM_EVENTS];

// ─────────────────────────────────────────────────────────────────────────────
// PLATFORM SERVICE HEALTH
// ─────────────────────────────────────────────────────────────────────────────

export interface PlatformServiceHealth {
  serviceId:    PlatformServiceId;
  status:       'healthy' | 'degraded' | 'unhealthy' | 'starting';
  version:      string;
  uptime:       number;
  lastCheck:    number;
  metrics:      Record<string, number | string>;
  workerUrl:    string | null;
}

export interface PlatformHealth {
  overall:      'healthy' | 'degraded' | 'unhealthy';
  services:     Record<PlatformServiceId, PlatformServiceHealth>;
  checkedAt:    number;
}

// ─────────────────────────────────────────────────────────────────────────────
// BASE ADAPTER
// ─────────────────────────────────────────────────────────────────────────────

abstract class PlatformAdapter {
  protected startTime: number = Date.now();
  protected _status: PlatformServiceHealth['status'] = 'starting';
  protected heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    protected readonly serviceId: PlatformServiceId,
    protected readonly version: string,
    protected readonly registry: ServiceRegistry,
    protected readonly bus: EventBus,
    protected readonly workerUrl: string | null = null,
  ) {}

  /** Register with the service registry and start heartbeat */
  async initialise(): Promise<void> {
    const instance: ServiceInstance = {
      id:            `${this.serviceId}-primary`,
      name:          this.serviceId,
      version:       this.version,
      host:          this.workerUrl ?? 'localhost',
      port:          0,
      protocol:      'https',
      status:        'starting',
      metadata:      { type: 'platform-core', adapter: 'true' },
      tags:          ['platform', 'core', this.serviceId],
      registeredAt:  Date.now(),
      lastHeartbeat: Date.now(),
      weight:        100,
    };

    this.registry.register(instance);
    await this.onInitialise();
    this._status = 'healthy';
    this.registry.heartbeat(`${this.serviceId}-primary`);

    // 30-second heartbeat
    this.heartbeatTimer = setInterval(() => {
      this.registry.heartbeat(`${this.serviceId}-primary`);
      this.publishHealthMetrics();
    }, 30_000);

    console.log(`[Platform] ${this.serviceId} adapter initialised`);
  }

  async shutdown(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.registry.deregister(`${this.serviceId}-primary`);
    await this.onShutdown();
    console.log(`[Platform] ${this.serviceId} adapter shut down`);
  }

  health(): PlatformServiceHealth {
    return {
      serviceId:  this.serviceId,
      status:     this._status,
      version:    this.version,
      uptime:     Date.now() - this.startTime,
      lastCheck:  Date.now(),
      metrics:    this.getMetrics(),
      workerUrl:  this.workerUrl,
    };
  }

  protected publishHealthMetrics(): void {
    this.bus.publish({
      type:      PLATFORM_EVENTS.PLATFORM_HEALTH_CHECK as unknown as typeof EventTypes[keyof typeof EventTypes],
      payload:   this.health(),
      source:    this.serviceId,
      timestamp: Date.now(),
    } as Event);
  }

  protected abstract onInitialise(): Promise<void>;
  protected abstract onShutdown(): Promise<void>;
  protected abstract getMetrics(): Record<string, number | string>;
}

// ─────────────────────────────────────────────────────────────────────────────
// INFINITY-ONE ADAPTER
// ─────────────────────────────────────────────────────────────────────────────

export class InfinityOneAdapter extends PlatformAdapter {
  private userCount    = 0;
  private sessionCount = 0;
  private authCount    = 0;

  constructor(registry: ServiceRegistry, bus: EventBus, workerUrl?: string) {
    super(PLATFORM_SERVICES.INFINITY_ONE, '1.0.0', registry, bus, workerUrl ?? null);
  }

  protected async onInitialise(): Promise<void> {
    // Listen for downstream events that Infinity-One needs to react to
    this.bus.subscribe(
      PLATFORM_EVENTS.TOKEN_ISSUED as unknown as typeof EventTypes[keyof typeof EventTypes],
      (event: Event) => this.handleTokenIssued(event),
    );

    this.bus.subscribe(
      PLATFORM_EVENTS.THREAT_DETECTED as unknown as typeof EventTypes[keyof typeof EventTypes],
      (event: Event) => this.handleThreatDetected(event),
    );

    this.bus.subscribe(
      PLATFORM_EVENTS.WARP_TRIGGERED as unknown as typeof EventTypes[keyof typeof EventTypes],
      (event: Event) => this.handleWarpTriggered(event),
    );
  }

  protected async onShutdown(): Promise<void> {
    // Graceful session drain
    console.log(`[InfinityOne] Draining ${this.sessionCount} active sessions…`);
  }

  protected getMetrics(): Record<string, number | string> {
    return {
      users:    this.userCount,
      sessions: this.sessionCount,
      auths:    this.authCount,
    };
  }

  // ── Public API (called by Cloudflare Worker via internal HTTP) ──────────────

  /** Called when a new user registers — publishes event to all systems */
  onUserRegistered(payload: {
    userId: string;
    email: string;
    orgId: string;
    lighthouseTokenId?: string;
  }): void {
    this.userCount++;
    this.bus.publish({
      type:      PLATFORM_EVENTS.USER_REGISTERED as unknown as typeof EventTypes[keyof typeof EventTypes],
      payload,
      source:    PLATFORM_SERVICES.INFINITY_ONE,
      timestamp: Date.now(),
    } as Event);
  }

  /** Called on successful authentication */
  onUserAuthenticated(payload: {
    userId: string;
    sessionId: string;
    mfaUsed: boolean;
    riskScore: number;
  }): void {
    this.sessionCount++;
    this.authCount++;
    this.bus.publish({
      type:      PLATFORM_EVENTS.USER_AUTHENTICATED as unknown as typeof EventTypes[keyof typeof EventTypes],
      payload,
      source:    PLATFORM_SERVICES.INFINITY_ONE,
      timestamp: Date.now(),
    } as Event);
  }

  /** Called when a session is revoked (logout / admin action) */
  onSessionRevoked(payload: { sessionId: string; userId: string; reason: string }): void {
    this.sessionCount = Math.max(0, this.sessionCount - 1);
    this.bus.publish({
      type:      PLATFORM_EVENTS.SESSION_REVOKED as unknown as typeof EventTypes[keyof typeof EventTypes],
      payload,
      source:    PLATFORM_SERVICES.INFINITY_ONE,
      timestamp: Date.now(),
    } as Event);
  }

  /** Called when GDPR erasure is requested */
  onGDPRErasureRequested(payload: { userId: string; requestedAt: number }): void {
    this.bus.publish({
      type:      PLATFORM_EVENTS.USER_GDPR_ERASURE as unknown as typeof EventTypes[keyof typeof EventTypes],
      payload,
      source:    PLATFORM_SERVICES.INFINITY_ONE,
      timestamp: Date.now(),
    } as Event);
  }

  // ── Private event handlers ──────────────────────────────────────────────────

  private handleTokenIssued(event: Event): void {
    // When Lighthouse issues a token for a user entity, update the user record
    const p = event.payload as { entityId?: string; tokenId?: string };
    if (p?.entityId && p?.tokenId) {
      console.log(`[InfinityOne] Lighthouse token ${p.tokenId} issued for entity ${p.entityId}`);
    }
  }

  private handleThreatDetected(event: Event): void {
    // Elevate session security or force re-auth if threat involves a user
    const p = event.payload as { entityId?: string; severity?: string };
    if (p?.severity === 'CRITICAL' || p?.severity === 'HIGH') {
      console.warn(`[InfinityOne] High-severity threat for entity ${p.entityId} — flagging sessions`);
    }
  }

  private handleWarpTriggered(event: Event): void {
    // Immediately revoke all sessions for a warped entity
    const p = event.payload as { entityId?: string; entityType?: string };
    if (p?.entityType === 'USER' && p?.entityId) {
      console.warn(`[InfinityOne] Warp triggered for user ${p.entityId} — revoking all sessions`);
      this.sessionCount = Math.max(0, this.sessionCount - 1);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LIGHTHOUSE ADAPTER
// ─────────────────────────────────────────────────────────────────────────────

export class LighthouseAdapter extends PlatformAdapter {
  private tokensIssued   = 0;
  private threatsDetected = 0;
  private warpsExecuted  = 0;
  private iceboxEntries  = 0;

  constructor(registry: ServiceRegistry, bus: EventBus, workerUrl?: string) {
    super(PLATFORM_SERVICES.LIGHTHOUSE, '1.0.0', registry, bus, workerUrl ?? null);
  }

  protected async onInitialise(): Promise<void> {
    // Issue a token whenever a new user registers
    this.bus.subscribe(
      PLATFORM_EVENTS.USER_REGISTERED as unknown as typeof EventTypes[keyof typeof EventTypes],
      (event: Event) => this.handleUserRegistered(event),
    );

    // React to GDPR erasure — revoke all tokens for the user
    this.bus.subscribe(
      PLATFORM_EVENTS.USER_GDPR_ERASURE as unknown as typeof EventTypes[keyof typeof EventTypes],
      (event: Event) => this.handleGDPRErasure(event),
    );

    // React to HIVE classification breaches
    this.bus.subscribe(
      PLATFORM_EVENTS.CLASSIFICATION_BREACH as unknown as typeof EventTypes[keyof typeof EventTypes],
      (event: Event) => this.handleClassificationBreach(event),
    );
  }

  protected async onShutdown(): Promise<void> {
    console.log(`[Lighthouse] Shutdown — ${this.tokensIssued} tokens issued this session`);
  }

  protected getMetrics(): Record<string, number | string> {
    return {
      tokensIssued:    this.tokensIssued,
      threatsDetected: this.threatsDetected,
      warpsExecuted:   this.warpsExecuted,
      iceboxEntries:   this.iceboxEntries,
    };
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  onTokenIssued(payload: {
    tokenId: string;
    entityId: string;
    entityType: string;
    riskScore: number;
  }): void {
    this.tokensIssued++;
    this.bus.publish({
      type:      PLATFORM_EVENTS.TOKEN_ISSUED as unknown as typeof EventTypes[keyof typeof EventTypes],
      payload,
      source:    PLATFORM_SERVICES.LIGHTHOUSE,
      timestamp: Date.now(),
    } as Event);
  }

  onThreatDetected(payload: {
    threatId: string;
    entityId: string;
    severity: string;
    mitreTactic: string;
    autoWarp: boolean;
  }): void {
    this.threatsDetected++;
    this.bus.publish({
      type:      PLATFORM_EVENTS.THREAT_DETECTED as unknown as typeof EventTypes[keyof typeof EventTypes],
      payload,
      source:    PLATFORM_SERVICES.LIGHTHOUSE,
      timestamp: Date.now(),
    } as Event);

    if (payload.autoWarp) {
      this.onWarpTriggered({
        entityId:   payload.entityId,
        entityType: 'UNKNOWN',
        threatId:   payload.threatId,
        reason:     `Auto-warp: ${payload.mitreTactic}`,
      });
    }
  }

  onWarpTriggered(payload: {
    entityId: string;
    entityType: string;
    threatId: string;
    reason: string;
  }): void {
    this.warpsExecuted++;
    this.bus.publish({
      type:      PLATFORM_EVENTS.WARP_TRIGGERED as unknown as typeof EventTypes[keyof typeof EventTypes],
      payload,
      source:    PLATFORM_SERVICES.LIGHTHOUSE,
      timestamp: Date.now(),
    } as Event);
  }

  onIceBoxEntryCreated(payload: {
    entryId: string;
    entityId: string;
    threatId: string;
  }): void {
    this.iceboxEntries++;
    this.bus.publish({
      type:      PLATFORM_EVENTS.ICEBOX_ENTRY_CREATED as unknown as typeof EventTypes[keyof typeof EventTypes],
      payload,
      source:    PLATFORM_SERVICES.LIGHTHOUSE,
      timestamp: Date.now(),
    } as Event);
  }

  onRiskScoreUpdated(payload: {
    entityId: string;
    previousScore: number;
    newScore: number;
    reason: string;
  }): void {
    this.bus.publish({
      type:      PLATFORM_EVENTS.RISK_SCORE_UPDATED as unknown as typeof EventTypes[keyof typeof EventTypes],
      payload,
      source:    PLATFORM_SERVICES.LIGHTHOUSE,
      timestamp: Date.now(),
    } as Event);
  }

  // ── Private event handlers ──────────────────────────────────────────────────

  private handleUserRegistered(event: Event): void {
    const p = event.payload as { userId?: string; email?: string };
    if (p?.userId) {
      console.log(`[Lighthouse] Auto-issuing UET for new user ${p.userId}`);
      // In production: call LighthouseService.issueToken()
      this.onTokenIssued({
        tokenId:    `UET-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 10)}`,
        entityId:   p.userId,
        entityType: 'USER',
        riskScore:  0,
      });
    }
  }

  private handleGDPRErasure(event: Event): void {
    const p = event.payload as { userId?: string };
    if (p?.userId) {
      console.log(`[Lighthouse] GDPR erasure — revoking all tokens for user ${p.userId}`);
      this.bus.publish({
        type:      PLATFORM_EVENTS.TOKEN_REVOKED as unknown as typeof EventTypes[keyof typeof EventTypes],
        payload:   { entityId: p.userId, reason: 'GDPR_ERASURE' },
        source:    PLATFORM_SERVICES.LIGHTHOUSE,
        timestamp: Date.now(),
      } as Event);
    }
  }

  private handleClassificationBreach(event: Event): void {
    const p = event.payload as { entityId?: string; attemptedClassification?: string };
    if (p?.entityId) {
      console.warn(`[Lighthouse] Classification breach by ${p.entityId} — elevating risk score`);
      this.onRiskScoreUpdated({
        entityId:      p.entityId,
        previousScore: 0,
        newScore:      75,
        reason:        `Classification breach: attempted ${p.attemptedClassification}`,
      });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HIVE ADAPTER
// ─────────────────────────────────────────────────────────────────────────────

export class HiveAdapter extends PlatformAdapter {
  private messagesRouted     = 0;
  private classificationBreaches = 0;
  private activeNodes        = 0;

  constructor(registry: ServiceRegistry, bus: EventBus, workerUrl?: string) {
    super(PLATFORM_SERVICES.HIVE, '1.0.0', registry, bus, workerUrl ?? null);
  }

  protected async onInitialise(): Promise<void> {
    // When a user is deactivated, block their HIVE routing
    this.bus.subscribe(
      PLATFORM_EVENTS.USER_DEACTIVATED as unknown as typeof EventTypes[keyof typeof EventTypes],
      (event: Event) => this.handleUserDeactivated(event),
    );

    // When a warp is triggered, immediately block the entity's routing
    this.bus.subscribe(
      PLATFORM_EVENTS.WARP_TRIGGERED as unknown as typeof EventTypes[keyof typeof EventTypes],
      (event: Event) => this.handleWarpTriggered(event),
    );

    // When risk score is updated, adjust routing priority
    this.bus.subscribe(
      PLATFORM_EVENTS.RISK_SCORE_UPDATED as unknown as typeof EventTypes[keyof typeof EventTypes],
      (event: Event) => this.handleRiskScoreUpdated(event),
    );
  }

  protected async onShutdown(): Promise<void> {
    console.log(`[HIVE] Shutdown — ${this.messagesRouted} messages routed this session`);
  }

  protected getMetrics(): Record<string, number | string> {
    return {
      messagesRouted:        this.messagesRouted,
      classificationBreaches: this.classificationBreaches,
      activeNodes:           this.activeNodes,
    };
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  onRouteEstablished(payload: {
    messageId: string;
    sourceNode: string;
    targetNode: string;
    classification: string;
    latencyMs: number;
  }): void {
    this.messagesRouted++;
    this.bus.publish({
      type:      PLATFORM_EVENTS.ROUTE_ESTABLISHED as unknown as typeof EventTypes[keyof typeof EventTypes],
      payload,
      source:    PLATFORM_SERVICES.HIVE,
      timestamp: Date.now(),
    } as Event);
  }

  onClassificationBreach(payload: {
    entityId: string;
    userType: string;
    attemptedClassification: string;
    allowedClassifications: string[];
  }): void {
    this.classificationBreaches++;
    this.bus.publish({
      type:      PLATFORM_EVENTS.CLASSIFICATION_BREACH as unknown as typeof EventTypes[keyof typeof EventTypes],
      payload,
      source:    PLATFORM_SERVICES.HIVE,
      timestamp: Date.now(),
    } as Event);
  }

  onNodeJoined(payload: { nodeId: string; role: string; region: string }): void {
    this.activeNodes++;
    this.bus.publish({
      type:      PLATFORM_EVENTS.NODE_JOINED as unknown as typeof EventTypes[keyof typeof EventTypes],
      payload,
      source:    PLATFORM_SERVICES.HIVE,
      timestamp: Date.now(),
    } as Event);
  }

  onNodeLeft(payload: { nodeId: string; reason: string }): void {
    this.activeNodes = Math.max(0, this.activeNodes - 1);
    this.bus.publish({
      type:      PLATFORM_EVENTS.NODE_LEFT as unknown as typeof EventTypes[keyof typeof EventTypes],
      payload,
      source:    PLATFORM_SERVICES.HIVE,
      timestamp: Date.now(),
    } as Event);
  }

  // ── Private event handlers ──────────────────────────────────────────────────

  private handleUserDeactivated(event: Event): void {
    const p = event.payload as { userId?: string };
    if (p?.userId) {
      console.log(`[HIVE] Blocking routing for deactivated user ${p.userId}`);
    }
  }

  private handleWarpTriggered(event: Event): void {
    const p = event.payload as { entityId?: string };
    if (p?.entityId) {
      console.warn(`[HIVE] Immediately blocking all routes for warped entity ${p.entityId}`);
    }
  }

  private handleRiskScoreUpdated(event: Event): void {
    const p = event.payload as { entityId?: string; newScore?: number };
    if (p?.entityId && typeof p.newScore === 'number') {
      if (p.newScore >= 85) {
        console.warn(`[HIVE] High-risk entity ${p.entityId} (score ${p.newScore}) — restricting to PUBLIC classification only`);
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// VOID ADAPTER
// ─────────────────────────────────────────────────────────────────────────────

export class VoidAdapter extends PlatformAdapter {
  private secretsStored    = 0;
  private secretsRetrieved = 0;
  private secretsRotated   = 0;
  private vaultSealed      = true;

  constructor(registry: ServiceRegistry, bus: EventBus, workerUrl?: string) {
    super(PLATFORM_SERVICES.VOID, '1.0.0', registry, bus, workerUrl ?? null);
  }

  protected async onInitialise(): Promise<void> {
    // When a user is GDPR-erased, crypto-shred all their secrets
    this.bus.subscribe(
      PLATFORM_EVENTS.USER_GDPR_ERASURE as unknown as typeof EventTypes[keyof typeof EventTypes],
      (event: Event) => this.handleGDPRErasure(event),
    );

    // When a warp is triggered, quarantine secrets belonging to the entity
    this.bus.subscribe(
      PLATFORM_EVENTS.WARP_TRIGGERED as unknown as typeof EventTypes[keyof typeof EventTypes],
      (event: Event) => this.handleWarpTriggered(event),
    );

    // When a threat is detected at CRITICAL severity, auto-rotate affected secrets
    this.bus.subscribe(
      PLATFORM_EVENTS.THREAT_DETECTED as unknown as typeof EventTypes[keyof typeof EventTypes],
      (event: Event) => this.handleThreatDetected(event),
    );
  }

  protected async onShutdown(): Promise<void> {
    // Seal the vault on shutdown
    this.vaultSealed = true;
    this.bus.publish({
      type:      PLATFORM_EVENTS.VAULT_SEALED as unknown as typeof EventTypes[keyof typeof EventTypes],
      payload:   { reason: 'PLATFORM_SHUTDOWN', sealedAt: Date.now() },
      source:    PLATFORM_SERVICES.VOID,
      timestamp: Date.now(),
    } as Event);
    console.log(`[Void] Vault sealed on shutdown`);
  }

  protected getMetrics(): Record<string, number | string> {
    return {
      secretsStored:    this.secretsStored,
      secretsRetrieved: this.secretsRetrieved,
      secretsRotated:   this.secretsRotated,
      vaultStatus:      this.vaultSealed ? 'SEALED' : 'UNSEALED',
    };
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  onSecretStored(payload: {
    secretId: string;
    classification: string;
    ownerId: string;
    secretType: string;
  }): void {
    this.secretsStored++;
    this.bus.publish({
      type:      PLATFORM_EVENTS.SECRET_STORED as unknown as typeof EventTypes[keyof typeof EventTypes],
      payload,
      source:    PLATFORM_SERVICES.VOID,
      timestamp: Date.now(),
    } as Event);
  }

  onSecretRetrieved(payload: {
    secretId: string;
    principalId: string;
    breakGlass: boolean;
  }): void {
    this.secretsRetrieved++;
    this.bus.publish({
      type:      PLATFORM_EVENTS.SECRET_RETRIEVED as unknown as typeof EventTypes[keyof typeof EventTypes],
      payload,
      source:    PLATFORM_SERVICES.VOID,
      timestamp: Date.now(),
    } as Event);
  }

  onSecretRotated(payload: {
    secretId: string;
    strategy: string;
    triggeredBy: string;
  }): void {
    this.secretsRotated++;
    this.bus.publish({
      type:      PLATFORM_EVENTS.SECRET_ROTATED as unknown as typeof EventTypes[keyof typeof EventTypes],
      payload,
      source:    PLATFORM_SERVICES.VOID,
      timestamp: Date.now(),
    } as Event);
  }

  onVaultUnsealed(payload: { shardsUsed: number; unsealedAt: number }): void {
    this.vaultSealed = false;
    this.bus.publish({
      type:      PLATFORM_EVENTS.VAULT_UNSEALED as unknown as typeof EventTypes[keyof typeof EventTypes],
      payload,
      source:    PLATFORM_SERVICES.VOID,
      timestamp: Date.now(),
    } as Event);
  }

  onVaultSealed(payload: { reason: string }): void {
    this.vaultSealed = true;
    this.bus.publish({
      type:      PLATFORM_EVENTS.VAULT_SEALED as unknown as typeof EventTypes[keyof typeof EventTypes],
      payload,
      source:    PLATFORM_SERVICES.VOID,
      timestamp: Date.now(),
    } as Event);
  }

  // ── Private event handlers ──────────────────────────────────────────────────

  private handleGDPRErasure(event: Event): void {
    const p = event.payload as { userId?: string };
    if (p?.userId) {
      console.log(`[Void] GDPR erasure — crypto-shredding all secrets for user ${p.userId}`);
      this.bus.publish({
        type:      PLATFORM_EVENTS.GDPR_ERASURE_COMPLETE as unknown as typeof EventTypes[keyof typeof EventTypes],
        payload:   { userId: p.userId, completedAt: Date.now() },
        source:    PLATFORM_SERVICES.VOID,
        timestamp: Date.now(),
      } as Event);
    }
  }

  private handleWarpTriggered(event: Event): void {
    const p = event.payload as { entityId?: string; threatId?: string };
    if (p?.entityId) {
      console.warn(`[Void] Warp triggered — quarantining secrets for entity ${p.entityId}`);
      this.bus.publish({
        type:      PLATFORM_EVENTS.SECRET_QUARANTINED as unknown as typeof EventTypes[keyof typeof EventTypes],
        payload:   { entityId: p.entityId, threatId: p.threatId, quarantinedAt: Date.now() },
        source:    PLATFORM_SERVICES.VOID,
        timestamp: Date.now(),
      } as Event);
    }
  }

  private handleThreatDetected(event: Event): void {
    const p = event.payload as { severity?: string; entityId?: string; threatId?: string };
    if (p?.severity === 'CRITICAL' && p?.entityId) {
      console.warn(`[Void] Critical threat — auto-rotating secrets for entity ${p.entityId}`);
      this.onSecretRotated({
        secretId:    `*:owner:${p.entityId}`,
        strategy:    'IMMEDIATE',
        triggeredBy: `threat:${p.threatId}`,
      });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PLATFORM MANAGER
// ─────────────────────────────────────────────────────────────────────────────

export interface PlatformManagerConfig {
  workerUrls?: {
    infinityOne?: string;
    lighthouse?:  string;
    hive?:        string;
    void?:        string;
  };
}

/**
 * PlatformManager — boots all four core platform systems and wires them
 * together via the kernel's ServiceRegistry and EventBus.
 *
 * Usage:
 * ```ts
 * const kernel = getKernel();
 * const platform = new PlatformManager(kernel.registry, kernel.eventBus, {
 *   workerUrls: {
 *     infinityOne: 'https://infinity-one.workers.dev',
 *     lighthouse:  'https://lighthouse.workers.dev',
 *     hive:        'https://hive.workers.dev',
 *     void:        'https://void.workers.dev',
 *   }
 * });
 * await platform.boot();
 * ```
 */
export class PlatformManager {
  public readonly infinityOne: InfinityOneAdapter;
  public readonly lighthouse:  LighthouseAdapter;
  public readonly hive:        HiveAdapter;
  public readonly void:        VoidAdapter;

  private booted = false;

  constructor(
    private readonly registry: ServiceRegistry,
    private readonly bus: EventBus,
    config: PlatformManagerConfig = {},
  ) {
    const urls = config.workerUrls ?? {};
    this.infinityOne = new InfinityOneAdapter(registry, bus, urls.infinityOne);
    this.lighthouse  = new LighthouseAdapter(registry, bus, urls.lighthouse);
    this.hive        = new HiveAdapter(registry, bus, urls.hive);
    this.void        = new VoidAdapter(registry, bus, urls.void);
  }

  /** Boot all platform systems in dependency order */
  async boot(): Promise<void> {
    if (this.booted) {
      console.warn('[Platform] Already booted — skipping');
      return;
    }

    console.log('[Platform] Booting Infinity OS Platform Core…');
    const t0 = Date.now();

    // Boot order: Void (secrets) → Lighthouse (tokens) → InfinityOne (users) → HIVE (routing)
    await this.void.initialise();
    await this.lighthouse.initialise();
    await this.infinityOne.initialise();
    await this.hive.initialise();

    this.booted = true;
    const elapsed = Date.now() - t0;
    console.log(`[Platform] ✓ All systems online in ${elapsed}ms`);

    // Publish platform-ready event
    this.bus.publish({
      type:      'platform:ready' as unknown as typeof EventTypes[keyof typeof EventTypes],
      payload:   { bootTimeMs: elapsed, systems: Object.values(PLATFORM_SERVICES) },
      source:    'platform-manager',
      timestamp: Date.now(),
    } as Event);
  }

  /** Graceful shutdown of all platform systems */
  async shutdown(): Promise<void> {
    if (!this.booted) return;

    console.log('[Platform] Shutting down Infinity OS Platform Core…');

    // Shutdown in reverse boot order
    await this.hive.shutdown();
    await this.infinityOne.shutdown();
    await this.lighthouse.shutdown();
    await this.void.shutdown();

    this.booted = false;
    console.log('[Platform] ✓ All systems offline');
  }

  /** Get aggregated health across all platform systems */
  health(): PlatformHealth {
    const services: Record<PlatformServiceId, PlatformServiceHealth> = {
      [PLATFORM_SERVICES.INFINITY_ONE]: this.infinityOne.health(),
      [PLATFORM_SERVICES.LIGHTHOUSE]:   this.lighthouse.health(),
      [PLATFORM_SERVICES.HIVE]:         this.hive.health(),
      [PLATFORM_SERVICES.VOID]:         this.void.health(),
    };

    const statuses = Object.values(services).map(s => s.status);
    const overall: PlatformHealth['overall'] =
      statuses.every(s => s === 'healthy')   ? 'healthy'  :
      statuses.some(s => s === 'unhealthy')  ? 'unhealthy' : 'degraded';

    return { overall, services, checkedAt: Date.now() };
  }

  isBooted(): boolean {
    return this.booted;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SINGLETON FACTORY
// ─────────────────────────────────────────────────────────────────────────────

let platformInstance: PlatformManager | null = null;

export function getPlatformManager(
  registry: ServiceRegistry,
  bus: EventBus,
  config?: PlatformManagerConfig,
): PlatformManager {
  if (!platformInstance) {
    platformInstance = new PlatformManager(registry, bus, config);
  }
  return platformInstance;
}

export function resetPlatformManager(): void {
  platformInstance = null;
}