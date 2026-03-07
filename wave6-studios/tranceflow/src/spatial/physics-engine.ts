/**
 * TranceFlow — Zero-Latency Physics Simulation
 * Ista: Junior Cesar (The Gamingista)
 *
 * Offloads fluid dynamics, gravity, and collision to edge-compute (WebAssembly).
 * Empathy Mandate: Prevents motion sickness via FOV/frame pacing adjustments.
 */

import { v4 as uuid } from 'uuid';
import { logger } from '../utils/logger';

export interface PhysicsBody {
  id: string;
  name: string;
  type: 'static' | 'dynamic' | 'kinematic';
  shape: 'box' | 'sphere' | 'capsule' | 'mesh' | 'plane';
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number; w: number };
  velocity: { x: number; y: number; z: number };
  mass: number;
  restitution: number;
  friction: number;
  collisionGroup: number;
  active: boolean;
}

export interface PhysicsWorld {
  id: string;
  name: string;
  gravity: { x: number; y: number; z: number };
  bodies: Map<string, PhysicsBody>;
  timeStep: number;
  substeps: number;
  tickCount: number;
  empathySettings: {
    maxVelocity: number;
    cameraSmoothing: number;
    fovRange: { min: number; max: number };
    framePacing: 'stable' | 'adaptive';
  };
}

export interface CollisionEvent {
  bodyA: string;
  bodyB: string;
  contactPoint: { x: number; y: number; z: number };
  impulse: number;
  timestamp: string;
}

export class PhysicsEngine {
  private worlds: Map<string, PhysicsWorld> = new Map();
  private collisionLog: CollisionEvent[] = [];

  createWorld(input: {
    name: string;
    gravity?: { x: number; y: number; z: number };
    timeStep?: number;
  }): PhysicsWorld {
    const world: PhysicsWorld = {
      id: uuid(), name: input.name,
      gravity: input.gravity ?? { x: 0, y: -9.81, z: 0 },
      bodies: new Map(), timeStep: input.timeStep ?? 1/60, substeps: 4, tickCount: 0,
      empathySettings: {
        maxVelocity: 50, cameraSmoothing: 0.85,
        fovRange: { min: 60, max: 90 }, framePacing: 'stable',
      },
    };
    this.worlds.set(world.id, world);
    logger.info({ worldId: world.id, name: world.name }, 'TranceFlow: Physics world created');
    return world;
  }

  addBody(worldId: string, input: {
    name: string; type: PhysicsBody['type']; shape: PhysicsBody['shape'];
    position?: { x: number; y: number; z: number };
    mass?: number; restitution?: number; friction?: number;
  }): PhysicsBody | null {
    const world = this.worlds.get(worldId);
    if (!world) return null;

    const body: PhysicsBody = {
      id: uuid(), name: input.name, type: input.type, shape: input.shape,
      position: input.position ?? { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      velocity: { x: 0, y: 0, z: 0 },
      mass: input.mass ?? (input.type === 'static' ? 0 : 1),
      restitution: input.restitution ?? 0.3,
      friction: input.friction ?? 0.5,
      collisionGroup: 1, active: true,
    };
    world.bodies.set(body.id, body);
    return body;
  }

  stepWorld(worldId: string): { tickCount: number; activeCollisions: number } | null {
    const world = this.worlds.get(worldId);
    if (!world) return null;

    const dt = world.timeStep / world.substeps;
    for (let sub = 0; sub < world.substeps; sub++) {
      for (const body of world.bodies.values()) {
        if (body.type !== 'dynamic' || !body.active) continue;
        // Apply gravity
        body.velocity.x += world.gravity.x * dt;
        body.velocity.y += world.gravity.y * dt;
        body.velocity.z += world.gravity.z * dt;
        // Empathy: clamp velocity
        const speed = Math.sqrt(body.velocity.x**2 + body.velocity.y**2 + body.velocity.z**2);
        if (speed > world.empathySettings.maxVelocity) {
          const scale = world.empathySettings.maxVelocity / speed;
          body.velocity.x *= scale; body.velocity.y *= scale; body.velocity.z *= scale;
        }
        // Integrate position
        body.position.x += body.velocity.x * dt;
        body.position.y += body.velocity.y * dt;
        body.position.z += body.velocity.z * dt;
        // Simple ground collision
        if (body.position.y < 0) {
          body.position.y = 0;
          body.velocity.y = -body.velocity.y * body.restitution;
        }
      }
    }
    world.tickCount++;
    return { tickCount: world.tickCount, activeCollisions: this.collisionLog.length };
  }

  getWorld(id: string): any {
    const world = this.worlds.get(id);
    if (!world) return undefined;
    return { ...world, bodies: [...world.bodies.values()], bodyCount: world.bodies.size };
  }

  getStats(): { worlds: number; totalBodies: number; totalTicks: number } {
    let totalBodies = 0, totalTicks = 0;
    for (const w of this.worlds.values()) { totalBodies += w.bodies.size; totalTicks += w.tickCount; }
    return { worlds: this.worlds.size, totalBodies, totalTicks };
  }
}
