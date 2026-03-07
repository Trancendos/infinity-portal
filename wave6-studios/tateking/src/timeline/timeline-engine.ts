/**
 * TateKing — Timeline-as-Code Engine
 * Ista: Benji & Sam (The Movistas)
 *
 * Video files are not saved. The timeline is written in YAML/JSON
 * (camera angles, actor models, lighting, dialog). Video is
 * reconstructed dynamically on the viewer's device.
 */

import { v4 as uuid } from 'uuid';
import { logger } from '../utils/logger';

export interface TimelineTrack {
  id: string;
  type: 'camera' | 'actor' | 'lighting' | 'audio' | 'effect' | 'dialog';
  name: string;
  keyframes: Array<{
    time: number;          // seconds
    properties: Record<string, number | string | boolean>;
    easing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'spring';
  }>;
  startTime: number;
  endTime: number;
  locked: boolean;
}

export interface Scene {
  id: string;
  name: string;
  description: string;
  tracks: string[];
  duration: number;
  environment: {
    skybox: string;
    ambientColor: string;
    fogDensity: number;
    timeOfDay: number;     // 0-24
  };
  empathySettings: {
    maxFrameRate: number;
    transitionSoftness: number;
    audioSpikeDamping: number;
  };
  status: 'draft' | 'preview' | 'final';
}

export interface Production {
  id: string;
  title: string;
  scenes: string[];
  totalDuration: number;
  format: 'short' | 'episode' | 'feature' | 'interactive';
  jsonSeed: Record<string, unknown>;
  gitCommitHash: string | null;
  status: 'pre-production' | 'production' | 'post-production' | 'published';
  createdAt: string;
}

export class TimelineEngine {
  private tracks: Map<string, TimelineTrack> = new Map();
  private scenes: Map<string, Scene> = new Map();
  private productions: Map<string, Production> = new Map();

  createTrack(input: {
    type: TimelineTrack['type']; name: string;
    keyframes?: TimelineTrack['keyframes'];
  }): TimelineTrack {
    const keyframes = input.keyframes ?? [];
    const track: TimelineTrack = {
      id: uuid(), type: input.type, name: input.name, keyframes,
      startTime: keyframes.length > 0 ? Math.min(...keyframes.map(k => k.time)) : 0,
      endTime: keyframes.length > 0 ? Math.max(...keyframes.map(k => k.time)) : 0,
      locked: false,
    };
    this.tracks.set(track.id, track);
    return track;
  }

  addKeyframe(trackId: string, keyframe: TimelineTrack['keyframes'][0]): TimelineTrack | null {
    const track = this.tracks.get(trackId);
    if (!track || track.locked) return null;
    track.keyframes.push(keyframe);
    track.keyframes.sort((a, b) => a.time - b.time);
    track.startTime = track.keyframes[0]?.time ?? 0;
    track.endTime = track.keyframes[track.keyframes.length - 1]?.time ?? 0;
    return track;
  }

  createScene(input: {
    name: string; description?: string; trackIds: string[];
    environment?: Partial<Scene['environment']>;
  }): Scene {
    const trackDurations = input.trackIds.map(id => this.tracks.get(id)?.endTime ?? 0);
    const scene: Scene = {
      id: uuid(), name: input.name, description: input.description ?? '',
      tracks: input.trackIds, duration: Math.max(0, ...trackDurations),
      environment: {
        skybox: 'default-studio', ambientColor: '#404060', fogDensity: 0,
        timeOfDay: 12, ...input.environment,
      },
      empathySettings: { maxFrameRate: 24, transitionSoftness: 0.8, audioSpikeDamping: 0.6 },
      status: 'draft',
    };
    this.scenes.set(scene.id, scene);
    logger.info({ sceneId: scene.id, name: scene.name, tracks: scene.tracks.length },
      'TateKing: Scene created — Benji & Sam are framing the shot');
    return scene;
  }

  createProduction(input: {
    title: string; sceneIds: string[]; format?: Production['format'];
  }): Production {
    const totalDuration = input.sceneIds.reduce((a, id) => a + (this.scenes.get(id)?.duration ?? 0), 0);
    const prod: Production = {
      id: uuid(), title: input.title, scenes: input.sceneIds,
      totalDuration, format: input.format ?? 'short',
      jsonSeed: {
        generator: 'tateking-timeline-engine', version: '2060.1',
        format: input.format ?? 'short', sceneCount: input.sceneIds.length,
        totalDuration, renderMode: 'client-side-declarative',
      },
      gitCommitHash: null, status: 'pre-production',
      createdAt: new Date().toISOString(),
    };
    this.productions.set(prod.id, prod);
    logger.info({ prodId: prod.id, title: prod.title }, 'TateKing: Production created');
    return prod;
  }

  getTrack(id: string): TimelineTrack | undefined { return this.tracks.get(id); }
  getScene(id: string): Scene | undefined { return this.scenes.get(id); }
  getProduction(id: string): Production | undefined { return this.productions.get(id); }
  getAllProductions(): Production[] { return [...this.productions.values()]; }

  getStats(): { tracks: number; scenes: number; productions: number; totalDuration: number } {
    return {
      tracks: this.tracks.size, scenes: this.scenes.size, productions: this.productions.size,
      totalDuration: [...this.productions.values()].reduce((a, p) => a + p.totalDuration, 0),
    };
  }
}
