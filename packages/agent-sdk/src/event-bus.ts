// src/event-bus.ts - Event bus implementations

import { v4 as uuidv4 } from "uuid";
import { EventBus, AgentEvent, EventHandler } from "./types";

/**
 * In-memory event bus for local development and testing.
 * Replace with NATS/Kafka/Cloudflare Queues adapter in production.
 */
export class InMemoryEventBus implements EventBus {
  private handlers: Map<string, Set<EventHandler>> = new Map();
  private connected = false;

  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.handlers.clear();
    this.connected = false;
  }

  subscribe(eventType: string, handler: EventHandler): void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    this.handlers.get(eventType)!.add(handler);
  }

  unsubscribe(eventType: string): void {
    this.handlers.delete(eventType);
  }

  async publish(event: AgentEvent): Promise<void> {
    if (!this.connected) {
      throw new Error("EventBus not connected. Call connect() first.");
    }

    // Deliver to specific type handlers
    const typeHandlers = this.handlers.get(event.type);
    if (typeHandlers) {
      const promises = Array.from(typeHandlers).map((handler) =>
        handler(event).catch((err) => ({
          success: false,
          error: String(err),
          durationMs: 0,
        }))
      );
      await Promise.all(promises);
    }

    // Deliver to wildcard handlers
    const wildcardHandlers = this.handlers.get("*");
    if (wildcardHandlers) {
      const promises = Array.from(wildcardHandlers).map((handler) =>
        handler(event).catch((err) => ({
          success: false,
          error: String(err),
          durationMs: 0,
        }))
      );
      await Promise.all(promises);
    }
  }
}

/**
 * Create an AgentEvent with all required fields populated
 */
export function createEvent<T = unknown>(
  type: string,
  source: string,
  data: T,
  options?: {
    target?: string;
    correlationId?: string;
    metadata?: Record<string, string>;
    schemaVersion?: string;
  }
): AgentEvent<T> {
  return {
    id: uuidv4(),
    type,
    source,
    target: options?.target ?? null,
    data,
    timestamp: new Date().toISOString(),
    correlationId: options?.correlationId ?? uuidv4(),
    schemaVersion: options?.schemaVersion ?? "1.0.0",
    metadata: options?.metadata ?? {},
  };
}
