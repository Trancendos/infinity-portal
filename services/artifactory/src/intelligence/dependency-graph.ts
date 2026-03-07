/**
 * THE ARTIFACTORY — Dependency Graph Engine
 * Builds and queries the artifact dependency graph for impact analysis,
 * vulnerability propagation, and upgrade path recommendations.
 * Part of the Trancendos Ecosystem.
 *
 * @module intelligence/dependency-graph
 * @version 1.0.0
 */

import { createModuleLogger } from '../utils/logger.js';

const logger = createModuleLogger('dependency-graph');

// ─── Types ───────────────────────────────────────────────────────────

export interface DependencyNode {
  id: string;
  name: string;
  version: string;
  type: string;
  tenantId: string;
  repositoryId: string;
  publishedAt: string;
  scanStatus: 'clean' | 'vulnerable' | 'quarantined' | 'pending';
  metadata: Record<string, unknown>;
}

export interface DependencyEdge {
  sourceId: string;
  targetId: string;
  dependencyType: 'runtime' | 'dev' | 'peer' | 'optional' | 'build';
  versionConstraint: string;
  resolved: boolean;
}

export interface ImpactAnalysis {
  rootArtifactId: string;
  rootArtifactName: string;
  directDependents: DependencyNode[];
  transitiveDependents: DependencyNode[];
  totalImpacted: number;
  impactedTenants: Set<string>;
  maxDepth: number;
  criticalPaths: string[][];
}

export interface UpgradePath {
  from: { name: string; version: string };
  to: { name: string; version: string };
  breakingChanges: boolean;
  affectedDependents: number;
  steps: Array<{
    artifact: string;
    currentVersion: string;
    targetVersion: string;
    order: number;
  }>;
}

export interface VulnerabilityPropagation {
  sourceArtifactId: string;
  vulnerabilityId: string;
  severity: string;
  affectedNodes: DependencyNode[];
  propagationPaths: string[][];
  totalExposure: number;
}

// ─── Database Interface ──────────────────────────────────────────────

export interface GraphDatabase {
  getNode(artifactId: string): Promise<DependencyNode | null>;
  getNodeByName(name: string, version: string, tenantId: string): Promise<DependencyNode | null>;
  upsertNode(node: DependencyNode): Promise<void>;
  deleteNode(artifactId: string): Promise<void>;
  addEdge(edge: DependencyEdge): Promise<void>;
  removeEdge(sourceId: string, targetId: string): Promise<void>;
  getDependencies(artifactId: string): Promise<Array<DependencyEdge & { target: DependencyNode }>>;
  getDependents(artifactId: string): Promise<Array<DependencyEdge & { source: DependencyNode }>>;
  getAllNodes(tenantId: string, options?: { limit: number; offset: number }): Promise<DependencyNode[]>;
  getNodeCount(tenantId: string): Promise<number>;
}

// ─── Dependency Graph Engine ─────────────────────────────────────────

export class DependencyGraphEngine {
  private readonly db: GraphDatabase;

  constructor(db: GraphDatabase) {
    this.db = db;
  }

  /**
   * Register or update an artifact node in the graph.
   */
  async registerArtifact(node: DependencyNode): Promise<void> {
    await this.db.upsertNode(node);
    logger.info(
      { artifactId: node.id, name: node.name, version: node.version },
      'Artifact registered in dependency graph'
    );
  }

  /**
   * Record a dependency relationship between two artifacts.
   */
  async addDependency(edge: DependencyEdge): Promise<void> {
    await this.db.addEdge(edge);
    logger.debug(
      { source: edge.sourceId, target: edge.targetId, type: edge.dependencyType },
      'Dependency edge added'
    );
  }

  /**
   * Bulk update dependencies for an artifact (replaces existing edges).
   */
  async updateDependencies(
    artifactId: string,
    dependencies: Array<{
      targetId: string;
      dependencyType: DependencyEdge['dependencyType'];
      versionConstraint: string;
    }>
  ): Promise<void> {
    // Remove existing outgoing edges
    const existing = await this.db.getDependencies(artifactId);
    for (const edge of existing) {
      await this.db.removeEdge(edge.sourceId, edge.targetId);
    }

    // Add new edges
    for (const dep of dependencies) {
      await this.db.addEdge({
        sourceId: artifactId,
        targetId: dep.targetId,
        dependencyType: dep.dependencyType,
        versionConstraint: dep.versionConstraint,
        resolved: true,
      });
    }

    logger.info(
      { artifactId, dependencyCount: dependencies.length },
      'Dependencies updated'
    );
  }

  /**
   * Perform impact analysis — find all artifacts affected if this one changes.
   */
  async analyzeImpact(artifactId: string, maxDepth = 10): Promise<ImpactAnalysis> {
    const rootNode = await this.db.getNode(artifactId);
    if (!rootNode) {
      throw new GraphError(`Artifact not found in graph: ${artifactId}`);
    }

    const directDependents: DependencyNode[] = [];
    const transitiveDependents: DependencyNode[] = [];
    const visited = new Set<string>();
    const impactedTenants = new Set<string>();
    const criticalPaths: string[][] = [];
    let maxDepthReached = 0;

    // BFS traversal of reverse dependency graph
    const queue: Array<{ nodeId: string; depth: number; path: string[] }> = [
      { nodeId: artifactId, depth: 0, path: [rootNode.name] },
    ];

    visited.add(artifactId);

    while (queue.length > 0) {
      const current = queue.shift()!;

      if (current.depth > maxDepth) continue;
      if (current.depth > maxDepthReached) maxDepthReached = current.depth;

      const dependents = await this.db.getDependents(current.nodeId);

      for (const dep of dependents) {
        if (visited.has(dep.source.id)) continue;
        visited.add(dep.source.id);

        const path = [...current.path, dep.source.name];
        impactedTenants.add(dep.source.tenantId);

        if (current.depth === 0) {
          directDependents.push(dep.source);
        } else {
          transitiveDependents.push(dep.source);
        }

        // Track critical paths (paths through vulnerable or quarantined nodes)
        if (dep.source.scanStatus === 'vulnerable' || dep.source.scanStatus === 'quarantined') {
          criticalPaths.push(path);
        }

        queue.push({
          nodeId: dep.source.id,
          depth: current.depth + 1,
          path,
        });
      }
    }

    const analysis: ImpactAnalysis = {
      rootArtifactId: artifactId,
      rootArtifactName: rootNode.name,
      directDependents,
      transitiveDependents,
      totalImpacted: directDependents.length + transitiveDependents.length,
      impactedTenants,
      maxDepth: maxDepthReached,
      criticalPaths,
    };

    logger.info(
      {
        artifactId,
        directDependents: directDependents.length,
        transitiveDependents: transitiveDependents.length,
        totalImpacted: analysis.totalImpacted,
        impactedTenants: impactedTenants.size,
      },
      'Impact analysis completed'
    );

    return analysis;
  }

  /**
   * Trace vulnerability propagation through the dependency graph.
   */
  async traceVulnerabilityPropagation(
    artifactId: string,
    vulnerabilityId: string,
    severity: string
  ): Promise<VulnerabilityPropagation> {
    const impact = await this.analyzeImpact(artifactId);

    const affectedNodes = [
      ...impact.directDependents,
      ...impact.transitiveDependents,
    ];

    const propagationPaths = impact.criticalPaths.length > 0
      ? impact.criticalPaths
      : [[impact.rootArtifactName]];

    logger.warn(
      {
        vulnerabilityId,
        severity,
        artifactId,
        totalExposure: affectedNodes.length,
      },
      'Vulnerability propagation traced'
    );

    return {
      sourceArtifactId: artifactId,
      vulnerabilityId,
      severity,
      affectedNodes,
      propagationPaths,
      totalExposure: affectedNodes.length,
    };
  }

  /**
   * Find circular dependencies in a tenant's graph.
   */
  async findCircularDependencies(tenantId: string): Promise<string[][]> {
    const nodes = await this.db.getAllNodes(tenantId, { limit: 10_000, offset: 0 });
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const dfs = async (nodeId: string, path: string[]): Promise<void> => {
      visited.add(nodeId);
      recursionStack.add(nodeId);

      const deps = await this.db.getDependencies(nodeId);
      for (const dep of deps) {
        if (recursionStack.has(dep.target.id)) {
          // Found a cycle
          const cycleStart = path.indexOf(dep.target.name);
          if (cycleStart >= 0) {
            cycles.push([...path.slice(cycleStart), dep.target.name]);
          }
        } else if (!visited.has(dep.target.id)) {
          await dfs(dep.target.id, [...path, dep.target.name]);
        }
      }

      recursionStack.delete(nodeId);
    };

    for (const node of nodes) {
      if (!visited.has(node.id)) {
        await dfs(node.id, [node.name]);
      }
    }

    if (cycles.length > 0) {
      logger.warn(
        { tenantId, cycleCount: cycles.length },
        'Circular dependencies detected'
      );
    }

    return cycles;
  }

  /**
   * Get dependency tree for an artifact (depth-limited).
   */
  async getDependencyTree(
    artifactId: string,
    maxDepth = 5
  ): Promise<{
    root: DependencyNode;
    children: Array<{
      node: DependencyNode;
      edge: DependencyEdge;
      children: unknown[];
    }>;
    totalNodes: number;
  }> {
    const root = await this.db.getNode(artifactId);
    if (!root) {
      throw new GraphError(`Artifact not found: ${artifactId}`);
    }

    let totalNodes = 1;

    const buildTree = async (
      nodeId: string,
      depth: number
    ): Promise<Array<{ node: DependencyNode; edge: DependencyEdge; children: unknown[] }>> => {
      if (depth >= maxDepth) return [];

      const deps = await this.db.getDependencies(nodeId);
      const children = [];

      for (const dep of deps) {
        totalNodes++;
        const subChildren = await buildTree(dep.target.id, depth + 1);
        children.push({
          node: dep.target,
          edge: { sourceId: dep.sourceId, targetId: dep.targetId, dependencyType: dep.dependencyType, versionConstraint: dep.versionConstraint, resolved: dep.resolved },
          children: subChildren,
        });
      }

      return children;
    };

    const children = await buildTree(artifactId, 0);

    return { root, children, totalNodes };
  }

  /**
   * Get graph statistics for a tenant.
   */
  async getGraphStats(tenantId: string): Promise<{
    totalNodes: number;
    totalEdges: number;
    avgDependencies: number;
    maxDependencies: number;
    orphanedNodes: number;
  }> {
    const nodes = await this.db.getAllNodes(tenantId, { limit: 100_000, offset: 0 });
    let totalEdges = 0;
    let maxDeps = 0;
    let orphaned = 0;

    for (const node of nodes) {
      const deps = await this.db.getDependencies(node.id);
      const dependents = await this.db.getDependents(node.id);
      totalEdges += deps.length;
      if (deps.length > maxDeps) maxDeps = deps.length;
      if (deps.length === 0 && dependents.length === 0) orphaned++;
    }

    return {
      totalNodes: nodes.length,
      totalEdges,
      avgDependencies: nodes.length > 0 ? totalEdges / nodes.length : 0,
      maxDependencies: maxDeps,
      orphanedNodes: orphaned,
    };
  }

  /**
   * Remove an artifact and all its edges from the graph.
   */
  async removeArtifact(artifactId: string): Promise<void> {
    const deps = await this.db.getDependencies(artifactId);
    const dependents = await this.db.getDependents(artifactId);

    for (const dep of deps) {
      await this.db.removeEdge(dep.sourceId, dep.targetId);
    }
    for (const dep of dependents) {
      await this.db.removeEdge(dep.sourceId, dep.targetId);
    }

    await this.db.deleteNode(artifactId);
    logger.info({ artifactId }, 'Artifact removed from dependency graph');
  }
}

// ─── Errors ──────────────────────────────────────────────────────────

export class GraphError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GraphError';
  }
}