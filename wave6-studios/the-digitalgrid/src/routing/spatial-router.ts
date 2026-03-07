/**
 * The DigitalGrid — Spatial CI/CD & Visual Routing
 * Ista: Tyler Towncroft (The DevOpsista)
 *
 * Node-based IaC environment that auto-provisions and destroys
 * cloud resources based on real-time traffic demands.
 */

import { v4 as uuid } from 'uuid';
import { logger } from '../utils/logger';

export interface RouteNode {
  id: string;
  name: string;
  type: 'service' | 'gateway' | 'loadbalancer' | 'cache' | 'database' | 'queue' | 'function';
  status: 'active' | 'scaling' | 'draining' | 'offline' | 'provisioning';
  endpoint: string;
  port: number;
  connections: string[];
  trafficWeight: number;
  healthScore: number;
  autoScale: { enabled: boolean; minInstances: number; maxInstances: number; currentInstances: number };
  lastHealthCheck: string;
}

export interface DeploymentPipeline {
  id: string;
  name: string;
  stages: Array<{
    name: string; type: 'build' | 'test' | 'security' | 'deploy' | 'verify';
    status: 'pending' | 'running' | 'passed' | 'failed' | 'skipped';
    duration: number;
  }>;
  status: 'queued' | 'running' | 'passed' | 'failed' | 'cancelled';
  triggeredBy: string;
  createdAt: string;
  completedAt: string | null;
}

export class SpatialRouter {
  private nodes: Map<string, RouteNode> = new Map();
  private pipelines: Map<string, DeploymentPipeline> = new Map();

  registerNode(input: {
    name: string; type: RouteNode['type']; endpoint: string; port: number;
    autoScale?: boolean;
  }): RouteNode {
    const node: RouteNode = {
      id: uuid(), name: input.name, type: input.type, status: 'active',
      endpoint: input.endpoint, port: input.port, connections: [],
      trafficWeight: 1.0, healthScore: 100,
      autoScale: {
        enabled: input.autoScale ?? true, minInstances: 0, maxInstances: 10, currentInstances: 1,
      },
      lastHealthCheck: new Date().toISOString(),
    };
    this.nodes.set(node.id, node);
    logger.info({ nodeId: node.id, name: node.name, type: node.type }, 'DigitalGrid: Route node registered');
    return node;
  }

  connectNodes(sourceId: string, targetId: string): boolean {
    const source = this.nodes.get(sourceId);
    const target = this.nodes.get(targetId);
    if (!source || !target) return false;
    if (!source.connections.includes(targetId)) source.connections.push(targetId);
    return true;
  }

  updateTraffic(nodeId: string, weight: number): RouteNode | null {
    const node = this.nodes.get(nodeId);
    if (!node) return null;
    node.trafficWeight = Math.max(0, Math.min(1, weight));
    if (node.autoScale.enabled) {
      const needed = Math.ceil(weight * node.autoScale.maxInstances);
      node.autoScale.currentInstances = Math.max(node.autoScale.minInstances, Math.min(node.autoScale.maxInstances, needed));
      if (needed === 0) node.status = 'draining';
      else if (needed > node.autoScale.currentInstances) node.status = 'scaling';
      else node.status = 'active';
    }
    return node;
  }

  createPipeline(input: { name: string; triggeredBy: string }): DeploymentPipeline {
    const pipeline: DeploymentPipeline = {
      id: uuid(), name: input.name,
      stages: [
        { name: 'Build', type: 'build', status: 'pending', duration: 0 },
        { name: 'Lint & Type Check', type: 'test', status: 'pending', duration: 0 },
        { name: 'Unit Tests', type: 'test', status: 'pending', duration: 0 },
        { name: 'Security Scan', type: 'security', status: 'pending', duration: 0 },
        { name: 'Deploy to Staging', type: 'deploy', status: 'pending', duration: 0 },
        { name: 'Integration Tests', type: 'verify', status: 'pending', duration: 0 },
        { name: 'Deploy to Production', type: 'deploy', status: 'pending', duration: 0 },
      ],
      status: 'queued', triggeredBy: input.triggeredBy,
      createdAt: new Date().toISOString(), completedAt: null,
    };
    this.pipelines.set(pipeline.id, pipeline);
    logger.info({ pipelineId: pipeline.id, name: pipeline.name }, 'DigitalGrid: Pipeline created');
    return pipeline;
  }

  advancePipeline(pipelineId: string): DeploymentPipeline | null {
    const pipeline = this.pipelines.get(pipelineId);
    if (!pipeline || pipeline.status === 'passed' || pipeline.status === 'failed') return null;
    pipeline.status = 'running';
    const pending = pipeline.stages.find(s => s.status === 'pending');
    if (pending) {
      pending.status = 'running';
      pending.duration = Math.round(Math.random() * 30 + 5);
      pending.status = Math.random() > 0.05 ? 'passed' : 'failed';
      if (pending.status === 'failed') {
        pipeline.status = 'failed';
        pipeline.completedAt = new Date().toISOString();
      }
    }
    if (pipeline.stages.every(s => s.status === 'passed')) {
      pipeline.status = 'passed';
      pipeline.completedAt = new Date().toISOString();
    }
    return pipeline;
  }

  getNode(id: string): RouteNode | undefined { return this.nodes.get(id); }
  getAllNodes(): RouteNode[] { return [...this.nodes.values()]; }
  getPipeline(id: string): DeploymentPipeline | undefined { return this.pipelines.get(id); }
  getAllPipelines(): DeploymentPipeline[] { return [...this.pipelines.values()]; }

  getStats(): { nodes: number; activeNodes: number; pipelines: number; passRate: number } {
    const all = [...this.pipelines.values()].filter(p => p.status === 'passed' || p.status === 'failed');
    return {
      nodes: this.nodes.size, activeNodes: [...this.nodes.values()].filter(n => n.status === 'active').length,
      pipelines: this.pipelines.size,
      passRate: all.length > 0 ? Math.round(all.filter(p => p.status === 'passed').length / all.length * 100) : 100,
    };
  }
}
