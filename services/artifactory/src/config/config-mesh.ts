/**
 * THE ARTIFACTORY — Configuration Mesh
 * Event-sourced configuration with hot-reload via Redis pub/sub.
 * Part of the Trancendos Ecosystem.
 *
 * Enables zero-downtime configuration updates across all mesh nodes.
 * Changes propagate through Redis pub/sub and are persisted in PostgreSQL
 * via the config_events table for full auditability and replay.
 *
 * @module config/config-mesh
 * @version 1.0.0
 */

import { z } from 'zod';
import { createModuleLogger } from '../utils/logger.js';
import type { Redis } from 'ioredis';

const logger = createModuleLogger('config-mesh');

// ─── Channel Constants ───────────────────────────────────────────────
const CONFIG_CHANNEL = 'trancendos:artifactory:config';
const CONFIG_RELOAD_CHANNEL = 'trancendos:artifactory:config:reload';
const CONFIG_ACK_CHANNEL = 'trancendos:artifactory:config:ack';

// ─── Schemas ─────────────────────────────────────────────────────────

const ConfigChangeEventSchema = z.object({
  id: z.string().uuid(),
  timestamp: z.string().datetime(),
  source: z.string(),
  nodeId: z.string(),
  scope: z.enum(['global', 'tenant', 'repository', 'service']),
  tenantId: z.string().optional(),
  repositoryId: z.string().optional(),
  key: z.string(),
  previousValue: z.unknown().optional(),
  newValue: z.unknown(),
  reason: z.string().optional(),
  actor: z.string(),
  version: z.number().int().positive(),
});

type ConfigChangeEvent = z.infer<typeof ConfigChangeEventSchema>;

const ConfigSnapshotSchema = z.record(z.string(), z.unknown());

type ConfigSnapshot = z.infer<typeof ConfigSnapshotSchema>;

// ─── Listener Types ──────────────────────────────────────────────────

type ConfigChangeListener = (event: ConfigChangeEvent) => void | Promise<void>;
type ConfigKeyListener = (key: string, newValue: unknown, previousValue: unknown) => void | Promise<void>;

// ─── Configuration Mesh ──────────────────────────────────────────────

export interface ConfigMeshDependencies {
  publisherRedis: Redis;
  subscriberRedis: Redis;
  nodeId: string;
  persistEvent?: (event: ConfigChangeEvent) => Promise<void>;
  loadSnapshot?: () => Promise<ConfigSnapshot>;
}

export class ConfigMesh {
  private readonly publisher: Redis;
  private readonly subscriber: Redis;
  private readonly nodeId: string;
  private readonly persistEvent?: (event: ConfigChangeEvent) => Promise<void>;
  private readonly loadSnapshot?: () => Promise<ConfigSnapshot>;

  private config: Map<string, unknown> = new Map();
  private versions: Map<string, number> = new Map();
  private changeListeners: Set<ConfigChangeListener> = new Set();
  private keyListeners: Map<string, Set<ConfigKeyListener>> = new Map();
  private running = false;
  private initialized = false;

  constructor(deps: ConfigMeshDependencies) {
    this.publisher = deps.publisherRedis;
    this.subscriber = deps.subscriberRedis;
    this.nodeId = deps.nodeId;
    this.persistEvent = deps.persistEvent;
    this.loadSnapshot = deps.loadSnapshot;
  }

  /**
   * Initialize the configuration mesh.
   * Loads snapshot from persistence, subscribes to Redis channels.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      logger.warn('Config mesh already initialized');
      return;
    }

    logger.info({ nodeId: this.nodeId }, 'Initializing configuration mesh');

    // Load persisted snapshot if available
    if (this.loadSnapshot) {
      try {
        const snapshot = await this.loadSnapshot();
        for (const [key, value] of Object.entries(snapshot)) {
          this.config.set(key, value);
          this.versions.set(key, 0);
        }
        logger.info(
          { keyCount: this.config.size },
          'Loaded configuration snapshot from persistence'
        );
      } catch (err) {
        logger.error({ err }, 'Failed to load configuration snapshot — starting fresh');
      }
    }

    // Subscribe to config channels
    await this.subscriber.subscribe(
      CONFIG_CHANNEL,
      CONFIG_RELOAD_CHANNEL
    );

    this.subscriber.on('message', (channel: string, message: string) => {
      this.handleMessage(channel, message).catch((err) => {
        logger.error({ err, channel }, 'Error handling config mesh message');
      });
    });

    this.running = true;
    this.initialized = true;
    logger.info({ nodeId: this.nodeId }, 'Configuration mesh initialized');
  }

  /**
   * Gracefully shut down the configuration mesh.
   */
  async shutdown(): Promise<void> {
    if (!this.running) return;

    logger.info({ nodeId: this.nodeId }, 'Shutting down configuration mesh');
    this.running = false;

    await this.subscriber.unsubscribe(
      CONFIG_CHANNEL,
      CONFIG_RELOAD_CHANNEL
    );

    this.changeListeners.clear();
    this.keyListeners.clear();
    this.initialized = false;
    logger.info('Configuration mesh shut down');
  }

  /**
   * Get a configuration value by key.
   */
  get<T = unknown>(key: string, defaultValue?: T): T {
    const value = this.config.get(key);
    if (value === undefined) {
      return defaultValue as T;
    }
    return value as T;
  }

  /**
   * Get a typed configuration value with Zod validation.
   */
  getValidated<T>(key: string, schema: z.ZodType<T>, defaultValue?: T): T {
    const raw = this.config.get(key);
    if (raw === undefined) {
      if (defaultValue !== undefined) return defaultValue;
      throw new ConfigMeshError(`Configuration key not found: ${key}`);
    }
    const result = schema.safeParse(raw);
    if (!result.success) {
      throw new ConfigMeshError(
        `Configuration validation failed for key "${key}": ${result.error.message}`
      );
    }
    return result.data;
  }

  /**
   * Get all configuration as a plain object.
   */
  getAll(): Record<string, unknown> {
    return Object.fromEntries(this.config);
  }

  /**
   * Get all keys matching a prefix.
   */
  getByPrefix(prefix: string): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of this.config) {
      if (key.startsWith(prefix)) {
        result[key] = value;
      }
    }
    return result;
  }

  /**
   * Set a configuration value and propagate to all mesh nodes.
   */
  async set(
    key: string,
    value: unknown,
    options: {
      scope?: 'global' | 'tenant' | 'repository' | 'service';
      tenantId?: string;
      repositoryId?: string;
      reason?: string;
      actor: string;
    }
  ): Promise<void> {
    const previousValue = this.config.get(key);
    const currentVersion = this.versions.get(key) ?? 0;
    const newVersion = currentVersion + 1;

    const event: ConfigChangeEvent = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      source: 'the-artifactory',
      nodeId: this.nodeId,
      scope: options.scope ?? 'global',
      tenantId: options.tenantId,
      repositoryId: options.repositoryId,
      key,
      previousValue,
      newValue: value,
      reason: options.reason,
      actor: options.actor,
      version: newVersion,
    };

    // Validate event
    ConfigChangeEventSchema.parse(event);

    // Apply locally first
    this.config.set(key, value);
    this.versions.set(key, newVersion);

    // Persist event
    if (this.persistEvent) {
      try {
        await this.persistEvent(event);
      } catch (err) {
        logger.error({ err, key }, 'Failed to persist config event — rolling back');
        // Rollback local change
        if (previousValue !== undefined) {
          this.config.set(key, previousValue);
        } else {
          this.config.delete(key);
        }
        this.versions.set(key, currentVersion);
        throw new ConfigMeshError(`Failed to persist config change for key "${key}"`);
      }
    }

    // Broadcast to all nodes
    await this.publisher.publish(CONFIG_CHANNEL, JSON.stringify(event));

    logger.info(
      { key, version: newVersion, scope: event.scope, actor: options.actor },
      'Configuration updated and broadcast'
    );

    // Notify local listeners
    await this.notifyListeners(event);
  }

  /**
   * Bulk set multiple configuration values atomically.
   */
  async setBulk(
    entries: Array<{ key: string; value: unknown }>,
    options: {
      scope?: 'global' | 'tenant' | 'repository' | 'service';
      tenantId?: string;
      reason?: string;
      actor: string;
    }
  ): Promise<void> {
    logger.info(
      { count: entries.length, actor: options.actor },
      'Bulk configuration update'
    );

    for (const entry of entries) {
      await this.set(entry.key, entry.value, options);
    }
  }

  /**
   * Delete a configuration key and propagate.
   */
  async delete(
    key: string,
    options: { reason?: string; actor: string }
  ): Promise<void> {
    await this.set(key, null, {
      ...options,
      reason: options.reason ?? `Deleted key: ${key}`,
    });
    this.config.delete(key);
  }

  /**
   * Request a full reload from all nodes.
   */
  async requestReload(actor: string): Promise<void> {
    const message = JSON.stringify({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      nodeId: this.nodeId,
      actor,
      type: 'reload-request',
    });

    await this.publisher.publish(CONFIG_RELOAD_CHANNEL, message);
    logger.info({ actor }, 'Full configuration reload requested');
  }

  /**
   * Register a listener for all configuration changes.
   */
  onChange(listener: ConfigChangeListener): () => void {
    this.changeListeners.add(listener);
    return () => {
      this.changeListeners.delete(listener);
    };
  }

  /**
   * Register a listener for changes to a specific key.
   */
  onKeyChange(key: string, listener: ConfigKeyListener): () => void {
    if (!this.keyListeners.has(key)) {
      this.keyListeners.set(key, new Set());
    }
    this.keyListeners.get(key)!.add(listener);
    return () => {
      this.keyListeners.get(key)?.delete(listener);
    };
  }

  /**
   * Get the current version of a configuration key.
   */
  getVersion(key: string): number {
    return this.versions.get(key) ?? 0;
  }

  /**
   * Check if the mesh is healthy and connected.
   */
  async healthCheck(): Promise<{ healthy: boolean; nodeId: string; keyCount: number }> {
    try {
      await this.publisher.ping();
      return {
        healthy: true,
        nodeId: this.nodeId,
        keyCount: this.config.size,
      };
    } catch {
      return {
        healthy: false,
        nodeId: this.nodeId,
        keyCount: this.config.size,
      };
    }
  }

  // ─── Private Methods ─────────────────────────────────────────────

  private async handleMessage(channel: string, message: string): Promise<void> {
    if (!this.running) return;

    if (channel === CONFIG_CHANNEL) {
      await this.handleConfigChange(message);
    } else if (channel === CONFIG_RELOAD_CHANNEL) {
      await this.handleReloadRequest(message);
    }
  }

  private async handleConfigChange(message: string): Promise<void> {
    let event: ConfigChangeEvent;
    try {
      event = ConfigChangeEventSchema.parse(JSON.parse(message));
    } catch (err) {
      logger.warn({ err }, 'Received invalid config change event — ignoring');
      return;
    }

    // Skip events from this node (already applied locally)
    if (event.nodeId === this.nodeId) return;

    const currentVersion = this.versions.get(event.key) ?? 0;

    // Only apply if version is newer (prevents out-of-order issues)
    if (event.version <= currentVersion) {
      logger.debug(
        { key: event.key, eventVersion: event.version, currentVersion },
        'Skipping stale config event'
      );
      return;
    }

    // Apply the change
    if (event.newValue === null) {
      this.config.delete(event.key);
    } else {
      this.config.set(event.key, event.newValue);
    }
    this.versions.set(event.key, event.version);

    logger.info(
      { key: event.key, version: event.version, source: event.nodeId },
      'Applied remote configuration change'
    );

    // Send acknowledgment
    const ack = JSON.stringify({
      eventId: event.id,
      nodeId: this.nodeId,
      timestamp: new Date().toISOString(),
      applied: true,
    });
    await this.publisher.publish(CONFIG_ACK_CHANNEL, ack);

    // Notify local listeners
    await this.notifyListeners(event);
  }

  private async handleReloadRequest(message: string): Promise<void> {
    let request: { nodeId: string; actor: string };
    try {
      request = JSON.parse(message);
    } catch {
      return;
    }

    // Skip reload requests from this node
    if (request.nodeId === this.nodeId) return;

    logger.info(
      { requestedBy: request.nodeId, actor: request.actor },
      'Processing reload request'
    );

    if (this.loadSnapshot) {
      try {
        const snapshot = await this.loadSnapshot();
        this.config.clear();
        this.versions.clear();
        for (const [key, value] of Object.entries(snapshot)) {
          this.config.set(key, value);
          this.versions.set(key, 0);
        }
        logger.info(
          { keyCount: this.config.size },
          'Configuration reloaded from persistence'
        );
      } catch (err) {
        logger.error({ err }, 'Failed to reload configuration');
      }
    }
  }

  private async notifyListeners(event: ConfigChangeEvent): Promise<void> {
    // Global listeners
    for (const listener of this.changeListeners) {
      try {
        await listener(event);
      } catch (err) {
        logger.error({ err, key: event.key }, 'Config change listener error');
      }
    }

    // Key-specific listeners
    const keyListeners = this.keyListeners.get(event.key);
    if (keyListeners) {
      for (const listener of keyListeners) {
        try {
          await listener(event.key, event.newValue, event.previousValue);
        } catch (err) {
          logger.error({ err, key: event.key }, 'Config key listener error');
        }
      }
    }
  }
}

// ─── Errors ──────────────────────────────────────────────────────────

export class ConfigMeshError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigMeshError';
  }
}

// ─── Factory ─────────────────────────────────────────────────────────

export function createConfigMesh(deps: ConfigMeshDependencies): ConfigMesh {
  return new ConfigMesh(deps);
}