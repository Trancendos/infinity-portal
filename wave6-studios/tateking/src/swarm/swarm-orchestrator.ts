/**
 * TateKing — Serverless Swarm Orchestration
 * Ista: Benji & Sam (The Movistas)
 *
 * Renders thousands of background elements using lightweight boids algorithms.
 * Massive scale without backend strain.
 */

import { v4 as uuid } from 'uuid';
import { logger } from '../utils/logger';

export interface Boid {
  id: string;
  position: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  type: string;
  group: string;
}

export interface SwarmConfig {
  id: string;
  name: string;
  boidCount: number;
  boidType: string;
  rules: {
    separation: number; alignment: number; cohesion: number;
    maxSpeed: number; perceptionRadius: number;
  };
  bounds: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number };
  boids: Boid[];
  tickCount: number;
  createdAt: string;
}

export class SwarmOrchestrator {
  private swarms: Map<string, SwarmConfig> = new Map();

  createSwarm(input: {
    name: string; boidCount: number; boidType?: string;
    rules?: Partial<SwarmConfig['rules']>;
  }): SwarmConfig {
    const boids: Boid[] = [];
    for (let i = 0; i < input.boidCount; i++) {
      boids.push({
        id: uuid(), type: input.boidType ?? 'extra',
        group: input.name,
        position: { x: (Math.random() - 0.5) * 100, y: Math.random() * 10, z: (Math.random() - 0.5) * 100 },
        velocity: { x: (Math.random() - 0.5) * 2, y: 0, z: (Math.random() - 0.5) * 2 },
      });
    }

    const swarm: SwarmConfig = {
      id: uuid(), name: input.name, boidCount: input.boidCount,
      boidType: input.boidType ?? 'extra',
      rules: {
        separation: 1.5, alignment: 1.0, cohesion: 1.0,
        maxSpeed: 5, perceptionRadius: 10, ...input.rules,
      },
      bounds: { minX: -200, maxX: 200, minY: 0, maxY: 50, minZ: -200, maxZ: 200 },
      boids, tickCount: 0, createdAt: new Date().toISOString(),
    };
    this.swarms.set(swarm.id, swarm);
    logger.info({ swarmId: swarm.id, boids: input.boidCount }, 'TateKing: Swarm created — extras are in position');
    return swarm;
  }

  stepSwarm(swarmId: string): { tickCount: number; boidCount: number } | null {
    const swarm = this.swarms.get(swarmId);
    if (!swarm) return null;

    for (const boid of swarm.boids) {
      let sepX = 0, sepY = 0, sepZ = 0;
      let aliX = 0, aliY = 0, aliZ = 0;
      let cohX = 0, cohY = 0, cohZ = 0;
      let neighbors = 0;

      for (const other of swarm.boids) {
        if (other.id === boid.id) continue;
        const dx = other.position.x - boid.position.x;
        const dy = other.position.y - boid.position.y;
        const dz = other.position.z - boid.position.z;
        const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
        if (dist < swarm.rules.perceptionRadius && dist > 0) {
          neighbors++;
          sepX -= dx / dist; sepY -= dy / dist; sepZ -= dz / dist;
          aliX += other.velocity.x; aliY += other.velocity.y; aliZ += other.velocity.z;
          cohX += other.position.x; cohY += other.position.y; cohZ += other.position.z;
        }
      }

      if (neighbors > 0) {
        boid.velocity.x += (sepX * swarm.rules.separation + (aliX/neighbors - boid.velocity.x) * swarm.rules.alignment + (cohX/neighbors - boid.position.x) * swarm.rules.cohesion * 0.01) * 0.1;
        boid.velocity.y += (sepY * swarm.rules.separation + (aliY/neighbors - boid.velocity.y) * swarm.rules.alignment + (cohY/neighbors - boid.position.y) * swarm.rules.cohesion * 0.01) * 0.1;
        boid.velocity.z += (sepZ * swarm.rules.separation + (aliZ/neighbors - boid.velocity.z) * swarm.rules.alignment + (cohZ/neighbors - boid.position.z) * swarm.rules.cohesion * 0.01) * 0.1;
      }

      const speed = Math.sqrt(boid.velocity.x**2 + boid.velocity.y**2 + boid.velocity.z**2);
      if (speed > swarm.rules.maxSpeed) {
        const scale = swarm.rules.maxSpeed / speed;
        boid.velocity.x *= scale; boid.velocity.y *= scale; boid.velocity.z *= scale;
      }

      boid.position.x += boid.velocity.x;
      boid.position.y = Math.max(swarm.bounds.minY, Math.min(swarm.bounds.maxY, boid.position.y + boid.velocity.y));
      boid.position.z += boid.velocity.z;

      // Wrap around bounds
      if (boid.position.x < swarm.bounds.minX) boid.position.x = swarm.bounds.maxX;
      if (boid.position.x > swarm.bounds.maxX) boid.position.x = swarm.bounds.minX;
      if (boid.position.z < swarm.bounds.minZ) boid.position.z = swarm.bounds.maxZ;
      if (boid.position.z > swarm.bounds.maxZ) boid.position.z = swarm.bounds.minZ;
    }

    swarm.tickCount++;
    return { tickCount: swarm.tickCount, boidCount: swarm.boids.length };
  }

  getSwarm(id: string): SwarmConfig | undefined { return this.swarms.get(id); }
  getAllSwarms(): Array<Omit<SwarmConfig, 'boids'> & { boidCount: number }> {
    return [...this.swarms.values()].map(s => ({ ...s, boids: undefined as any, boidCount: s.boids.length }));
  }

  getStats(): { swarms: number; totalBoids: number; totalTicks: number } {
    let totalBoids = 0, totalTicks = 0;
    for (const s of this.swarms.values()) { totalBoids += s.boids.length; totalTicks += s.tickCount; }
    return { swarms: this.swarms.size, totalBoids, totalTicks };
  }
}
