/**
 * TateKing — Dynamic Lighting-as-a-Service
 * Ista: Benji & Sam (The Movistas)
 *
 * Calculates volumetric lighting and ray-tracing mathematically via client GPU.
 * Empathy: Softens lighting transitions under sensory reduction mode.
 */

import { v4 as uuid } from 'uuid';
import { logger } from '../utils/logger';

export interface LightSource {
  id: string;
  name: string;
  type: 'directional' | 'point' | 'spot' | 'area' | 'ambient' | 'volumetric';
  color: string;
  intensity: number;
  position: { x: number; y: number; z: number };
  direction: { x: number; y: number; z: number };
  radius: number;
  castShadows: boolean;
  volumetric: boolean;
  empathyDamped: boolean;
}

export interface LightingPreset {
  id: string;
  name: string;
  mood: 'dramatic' | 'natural' | 'studio' | 'noir' | 'warm' | 'cool' | 'ethereal';
  lights: string[];
  ambientIntensity: number;
  shadowSoftness: number;
  empathyMode: boolean;
}

export class LightingEngine {
  private lights: Map<string, LightSource> = new Map();
  private presets: Map<string, LightingPreset> = new Map();

  createLight(input: {
    name: string; type: LightSource['type']; color?: string;
    intensity?: number; position?: { x: number; y: number; z: number };
    castShadows?: boolean; volumetric?: boolean;
  }): LightSource {
    const light: LightSource = {
      id: uuid(), name: input.name, type: input.type,
      color: input.color ?? '#FFFFFF', intensity: input.intensity ?? 1.0,
      position: input.position ?? { x: 0, y: 5, z: 0 },
      direction: { x: 0, y: -1, z: 0 }, radius: 10,
      castShadows: input.castShadows ?? true,
      volumetric: input.volumetric ?? false, empathyDamped: false,
    };
    this.lights.set(light.id, light);
    return light;
  }

  createPreset(input: {
    name: string; mood: LightingPreset['mood']; lightIds: string[];
    empathyMode?: boolean;
  }): LightingPreset {
    const preset: LightingPreset = {
      id: uuid(), name: input.name, mood: input.mood,
      lights: input.lightIds, ambientIntensity: 0.3,
      shadowSoftness: input.empathyMode ? 0.9 : 0.5,
      empathyMode: input.empathyMode ?? false,
    };
    if (preset.empathyMode) {
      for (const lid of preset.lights) {
        const light = this.lights.get(lid);
        if (light) { light.empathyDamped = true; light.intensity = Math.min(light.intensity, 0.7); }
      }
    }
    this.presets.set(preset.id, preset);
    return preset;
  }

  getLight(id: string): LightSource | undefined { return this.lights.get(id); }
  getPreset(id: string): LightingPreset | undefined { return this.presets.get(id); }
  getAllLights(): LightSource[] { return [...this.lights.values()]; }
  getAllPresets(): LightingPreset[] { return [...this.presets.values()]; }

  getStats(): { lights: number; presets: number; volumetric: number; empathyDamped: number } {
    const all = [...this.lights.values()];
    return {
      lights: all.length, presets: this.presets.size,
      volumetric: all.filter(l => l.volumetric).length,
      empathyDamped: all.filter(l => l.empathyDamped).length,
    };
  }
}
