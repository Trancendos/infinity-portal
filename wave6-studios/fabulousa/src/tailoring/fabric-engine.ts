/**
 * Fabulousa — Algorithmic Tailoring & Physics Engine
 * Ista: Baron Von Hilton (The Styleista)
 *
 * Real-time fabric drape, thread count tension, and light refraction.
 * Zero-Cost: Textures stored as mathematical seeds (JSON), reconstructed
 * client-side via WebGL/Three.js.
 */

import { v4 as uuid } from 'uuid';
import { logger } from '../utils/logger';

export interface FabricSeed {
  id: string;
  name: string;
  material: 'silk' | 'cotton' | 'wool' | 'velvet' | 'denim' | 'leather' | 'linen' | 'satin' | 'chiffon' | 'synthetic';
  threadCount: number;
  weight: number;              // gsm (grams per square meter)
  drapeCoefficient: number;    // 0-1 (0=stiff, 1=fluid)
  elasticity: number;          // 0-1
  sheenFactor: number;         // 0-1 (matte to glossy)
  colorHex: string;
  textureParams: {
    noiseScale: number;
    noiseOctaves: number;
    roughness: number;
    normalStrength: number;
    diffuseIntensity: number;
  };
  physicsParams: {
    gravity: number;
    windResistance: number;
    friction: number;
    bendStiffness: number;
    stretchResistance: number;
  };
  sizeBytes: number;           // JSON seed size (vs MB texture files)
  empathySafe: boolean;
  createdAt: string;
}

export interface FabricComposition {
  id: string;
  name: string;
  layers: Array<{ fabricId: string; opacity: number; blendMode: string }>;
  totalWeight: number;
  overallDrape: number;
  renderReady: boolean;
  jsonSeed: Record<string, unknown>;
  createdAt: string;
}

export class FabricEngine {
  private fabrics: Map<string, FabricSeed> = new Map();
  private compositions: Map<string, FabricComposition> = new Map();

  createFabric(input: {
    name: string;
    material: FabricSeed['material'];
    threadCount?: number;
    weight?: number;
    colorHex: string;
    drapeCoefficient?: number;
    sheenFactor?: number;
  }): FabricSeed {
    const defaults = this.getMaterialDefaults(input.material);
    const seed: FabricSeed = {
      id: uuid(),
      name: input.name,
      material: input.material,
      threadCount: input.threadCount ?? defaults.threadCount,
      weight: input.weight ?? defaults.weight,
      drapeCoefficient: input.drapeCoefficient ?? defaults.drape,
      elasticity: defaults.elasticity,
      sheenFactor: input.sheenFactor ?? defaults.sheen,
      colorHex: input.colorHex,
      textureParams: {
        noiseScale: defaults.noiseScale,
        noiseOctaves: defaults.noiseOctaves,
        roughness: 1 - (input.sheenFactor ?? defaults.sheen),
        normalStrength: defaults.normalStrength,
        diffuseIntensity: 0.8,
      },
      physicsParams: {
        gravity: 9.81,
        windResistance: defaults.drape * 0.5,
        friction: 0.3 + (1 - defaults.drape) * 0.4,
        bendStiffness: 1 - defaults.drape,
        stretchResistance: 1 - defaults.elasticity,
      },
      sizeBytes: 0,
      empathySafe: this.checkEmpathySafe(input.colorHex),
      createdAt: new Date().toISOString(),
    };

    const jsonStr = JSON.stringify(seed);
    seed.sizeBytes = Buffer.byteLength(jsonStr, 'utf8');

    this.fabrics.set(seed.id, seed);
    logger.info({ id: seed.id, name: seed.name, material: seed.material, bytes: seed.sizeBytes },
      'Fabulousa: Fabric seed created — Baron Von Hilton approves the thread count');
    return seed;
  }

  createComposition(input: {
    name: string;
    layers: Array<{ fabricId: string; opacity: number; blendMode?: string }>;
  }): FabricComposition | null {
    const layers = input.layers.map(l => ({
      fabricId: l.fabricId,
      opacity: Math.max(0, Math.min(1, l.opacity)),
      blendMode: l.blendMode ?? 'normal',
    }));

    // Validate all fabrics exist
    for (const layer of layers) {
      if (!this.fabrics.has(layer.fabricId)) return null;
    }

    const fabricLayers = layers.map(l => this.fabrics.get(l.fabricId)!);
    const totalWeight = fabricLayers.reduce((a, f) => a + f.weight, 0);
    const overallDrape = fabricLayers.reduce((a, f) => a + f.drapeCoefficient, 0) / fabricLayers.length;

    const comp: FabricComposition = {
      id: uuid(),
      name: input.name,
      layers,
      totalWeight,
      overallDrape,
      renderReady: true,
      jsonSeed: {
        generator: 'fabulousa-fabric-engine',
        version: '2060.1',
        layers: layers.map(l => ({ ...l, fabric: this.fabrics.get(l.fabricId) })),
        physics: { totalWeight, overallDrape, gravity: 9.81 },
      },
      createdAt: new Date().toISOString(),
    };

    this.compositions.set(comp.id, comp);
    logger.info({ id: comp.id, layers: layers.length }, 'Fabulousa: Composition created');
    return comp;
  }

  private getMaterialDefaults(material: FabricSeed['material']): {
    threadCount: number; weight: number; drape: number; elasticity: number;
    sheen: number; noiseScale: number; noiseOctaves: number; normalStrength: number;
  } {
    const defaults: Record<string, any> = {
      silk:      { threadCount: 400, weight: 80,  drape: 0.9, elasticity: 0.3, sheen: 0.8, noiseScale: 0.5, noiseOctaves: 4, normalStrength: 0.3 },
      cotton:    { threadCount: 200, weight: 150, drape: 0.5, elasticity: 0.2, sheen: 0.1, noiseScale: 1.0, noiseOctaves: 3, normalStrength: 0.6 },
      wool:      { threadCount: 100, weight: 300, drape: 0.3, elasticity: 0.4, sheen: 0.15, noiseScale: 1.5, noiseOctaves: 5, normalStrength: 0.8 },
      velvet:    { threadCount: 300, weight: 350, drape: 0.6, elasticity: 0.1, sheen: 0.7, noiseScale: 0.8, noiseOctaves: 4, normalStrength: 0.5 },
      denim:     { threadCount: 80,  weight: 400, drape: 0.2, elasticity: 0.15, sheen: 0.05, noiseScale: 2.0, noiseOctaves: 3, normalStrength: 0.9 },
      leather:   { threadCount: 0,   weight: 500, drape: 0.15, elasticity: 0.1, sheen: 0.5, noiseScale: 1.2, noiseOctaves: 6, normalStrength: 1.0 },
      linen:     { threadCount: 150, weight: 180, drape: 0.4, elasticity: 0.1, sheen: 0.1, noiseScale: 1.3, noiseOctaves: 3, normalStrength: 0.7 },
      satin:     { threadCount: 350, weight: 120, drape: 0.85, elasticity: 0.2, sheen: 0.9, noiseScale: 0.3, noiseOctaves: 2, normalStrength: 0.2 },
      chiffon:   { threadCount: 250, weight: 50,  drape: 0.95, elasticity: 0.3, sheen: 0.4, noiseScale: 0.4, noiseOctaves: 3, normalStrength: 0.2 },
      synthetic: { threadCount: 180, weight: 200, drape: 0.5, elasticity: 0.6, sheen: 0.3, noiseScale: 0.8, noiseOctaves: 3, normalStrength: 0.5 },
    };
    return defaults[material] ?? defaults.cotton;
  }

  private checkEmpathySafe(hex: string): boolean {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    if (r > 220 && g < 50 && b < 50) return false;
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    if (brightness < 10 || brightness > 250) return false;
    return true;
  }

  getFabric(id: string): FabricSeed | undefined { return this.fabrics.get(id); }
  getComposition(id: string): FabricComposition | undefined { return this.compositions.get(id); }
  getAllFabrics(): FabricSeed[] { return [...this.fabrics.values()]; }

  getStats(): {
    totalFabrics: number; totalCompositions: number; avgSeedSize: number;
    materialBreakdown: Record<string, number>; empathySafe: number;
  } {
    const all = [...this.fabrics.values()];
    const breakdown: Record<string, number> = {};
    for (const f of all) breakdown[f.material] = (breakdown[f.material] ?? 0) + 1;
    return {
      totalFabrics: all.length, totalCompositions: this.compositions.size,
      avgSeedSize: all.length > 0 ? Math.round(all.reduce((a, f) => a + f.sizeBytes, 0) / all.length) : 0,
      materialBreakdown: breakdown, empathySafe: all.filter(f => f.empathySafe).length,
    };
  }
}
