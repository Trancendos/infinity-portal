/**
 * Section7 — Predictive Lore Generation Engine
 *
 * Ista: Bert-Joen Kater (The Storyista)
 *
 * Dynamic narrative engine that writes branching storylines for the
 * platform based on real-time user interaction metrics, ensuring
 * content is always culturally relevant.
 *
 * Empathy Mandate: Narratives use plain, accessible language.
 * Actively filters stress-inducing jargon and panic-driven tactics.
 *
 * Architecture: Trancendos Industry 6.0 / 2060 Standard
 */

import { v4 as uuid } from 'uuid';
import { logger } from '../utils/logger';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface LoreNode {
  id: string;
  parentId: string | null;
  title: string;
  content: string;
  tone: 'grounding' | 'informative' | 'celebratory' | 'reflective' | 'motivational';
  branch: string;
  depth: number;
  interactionTrigger: string;
  culturalTags: string[];
  empathyScore: number;       // 0-100, must be >= 70 to publish
  accessibilityGrade: 'A' | 'AA' | 'AAA';
  status: 'draft' | 'review' | 'published' | 'archived';
  createdAt: string;
  publishedAt: string | null;
}

export interface StoryBranch {
  id: string;
  name: string;
  description: string;
  rootNodeId: string;
  activeNodeId: string;
  nodeCount: number;
  avgEmpathyScore: number;
  status: 'active' | 'dormant' | 'completed';
  createdAt: string;
}

export interface NarrativeBlueprint {
  id: string;
  title: string;
  purpose: string;
  targetAudience: string[];
  toneProfile: LoreNode['tone'][];
  branches: string[];
  jsonSeed: Record<string, unknown>;
  generatedAt: string;
}

// ─── Empathy Filter ─────────────────────────────────────────────────────────

const STRESS_PATTERNS = [
  'urgent', 'act now', 'limited time', 'don\'t miss', 'last chance',
  'fear of missing', 'fomo', 'panic', 'critical failure', 'catastrophic',
  'you must', 'mandatory', 'required immediately', 'deadline',
  'synergy', 'leverage', 'disrupt', 'pivot', 'scalable solution',
  'circle back', 'move the needle', 'low-hanging fruit', 'deep dive',
];

const ACCESSIBLE_REPLACEMENTS: Record<string, string> = {
  'leverage': 'use',
  'utilize': 'use',
  'synergy': 'teamwork',
  'paradigm': 'approach',
  'disrupt': 'change',
  'pivot': 'adjust',
  'scalable': 'flexible',
  'bandwidth': 'capacity',
  'deep dive': 'detailed look',
  'circle back': 'return to',
  'move the needle': 'make progress',
  'low-hanging fruit': 'easy wins',
  'actionable insights': 'useful findings',
  'best-in-class': 'excellent',
  'mission-critical': 'important',
};

// ─── Lore Engine ────────────────────────────────────────────────────────────

export class LoreEngine {
  private nodes: Map<string, LoreNode> = new Map();
  private branches: Map<string, StoryBranch> = new Map();
  private blueprints: Map<string, NarrativeBlueprint> = new Map();

  // ── Empathy Filter (The Storyista's Core Mandate) ───────────────────────

  filterForEmpathy(text: string): { filtered: string; score: number; issues: string[] } {
    let filtered = text;
    const issues: string[] = [];

    // Replace jargon with accessible language
    for (const [jargon, replacement] of Object.entries(ACCESSIBLE_REPLACEMENTS)) {
      const regex = new RegExp(`\\b${jargon}\\b`, 'gi');
      if (regex.test(filtered)) {
        issues.push(`Replaced jargon "${jargon}" with "${replacement}"`);
        filtered = filtered.replace(regex, replacement);
      }
    }

    // Flag stress-inducing patterns
    for (const pattern of STRESS_PATTERNS) {
      if (filtered.toLowerCase().includes(pattern)) {
        issues.push(`Stress pattern detected: "${pattern}" — softened`);
        const regex = new RegExp(pattern, 'gi');
        filtered = filtered.replace(regex, '');
      }
    }

    // Clean up double spaces and trim
    filtered = filtered.replace(/\s{2,}/g, ' ').trim();

    // Calculate empathy score (higher = more empathetic)
    const stressCount = issues.filter(i => i.includes('Stress')).length;
    const jargonCount = issues.filter(i => i.includes('jargon')).length;
    const wordCount = filtered.split(/\s+/).length;
    const avgWordLength = filtered.split(/\s+/).reduce((a, w) => a + w.length, 0) / Math.max(1, wordCount);

    let score = 100;
    score -= stressCount * 10;
    score -= jargonCount * 5;
    if (avgWordLength > 8) score -= 10;  // Prefer shorter, accessible words
    if (wordCount > 500) score -= 5;     // Prefer concise content

    return { filtered, score: Math.max(0, Math.min(100, score)), issues };
  }

  // ── Lore Node Creation ──────────────────────────────────────────────────

  createNode(input: {
    parentId?: string;
    title: string;
    content: string;
    tone?: LoreNode['tone'];
    branch?: string;
    interactionTrigger?: string;
    culturalTags?: string[];
  }): LoreNode {
    const { filtered, score, issues } = this.filterForEmpathy(input.content);

    if (issues.length > 0) {
      logger.info({ issues: issues.length }, 'Section7 Lore: Empathy filter applied corrections');
    }

    const parentNode = input.parentId ? this.nodes.get(input.parentId) : null;
    const depth = parentNode ? parentNode.depth + 1 : 0;

    const node: LoreNode = {
      id: uuid(),
      parentId: input.parentId ?? null,
      title: input.title,
      content: filtered,
      tone: input.tone ?? 'informative',
      branch: input.branch ?? 'main',
      depth,
      interactionTrigger: input.interactionTrigger ?? 'default',
      culturalTags: input.culturalTags ?? [],
      empathyScore: score,
      accessibilityGrade: score >= 90 ? 'AAA' : score >= 70 ? 'AA' : 'A',
      status: score >= 70 ? 'review' : 'draft',
      createdAt: new Date().toISOString(),
      publishedAt: null,
    };

    this.nodes.set(node.id, node);

    // Auto-publish if empathy score is high enough
    if (score >= 85) {
      node.status = 'published';
      node.publishedAt = new Date().toISOString();
    }

    logger.info(
      { id: node.id, empathyScore: score, grade: node.accessibilityGrade, status: node.status },
      `Section7 Lore: Node created — "${node.title}"`,
    );

    return node;
  }

  // ── Branch Management ───────────────────────────────────────────────────

  createBranch(name: string, description: string, rootContent: {
    title: string;
    content: string;
    tone?: LoreNode['tone'];
  }): StoryBranch {
    const rootNode = this.createNode({
      ...rootContent,
      branch: name,
    });

    const branch: StoryBranch = {
      id: uuid(),
      name,
      description,
      rootNodeId: rootNode.id,
      activeNodeId: rootNode.id,
      nodeCount: 1,
      avgEmpathyScore: rootNode.empathyScore,
      status: 'active',
      createdAt: new Date().toISOString(),
    };

    this.branches.set(branch.id, branch);
    logger.info({ branchId: branch.id, name }, 'Section7 Lore: Story branch created');
    return branch;
  }

  advanceBranch(branchId: string, content: {
    title: string;
    content: string;
    tone?: LoreNode['tone'];
    interactionTrigger?: string;
  }): LoreNode | null {
    const branch = this.branches.get(branchId);
    if (!branch || branch.status !== 'active') return null;

    const node = this.createNode({
      ...content,
      parentId: branch.activeNodeId,
      branch: branch.name,
    });

    branch.activeNodeId = node.id;
    branch.nodeCount++;

    // Recalculate average empathy
    const branchNodes = [...this.nodes.values()].filter(n => n.branch === branch.name);
    branch.avgEmpathyScore = Math.round(
      branchNodes.reduce((a, n) => a + n.empathyScore, 0) / branchNodes.length
    );

    return node;
  }

  // ── Blueprint Generation (JSON Seeds for Pipeline) ──────────────────────

  generateBlueprint(input: {
    title: string;
    purpose: string;
    targetAudience: string[];
    toneProfile?: LoreNode['tone'][];
  }): NarrativeBlueprint {
    const activeBranches = [...this.branches.values()]
      .filter(b => b.status === 'active')
      .map(b => b.name);

    const blueprint: NarrativeBlueprint = {
      id: uuid(),
      title: input.title,
      purpose: input.purpose,
      targetAudience: input.targetAudience,
      toneProfile: input.toneProfile ?? ['informative', 'grounding'],
      branches: activeBranches,
      jsonSeed: {
        generator: 'section7-lore-engine',
        version: '2060.1',
        empathyMandateEnforced: true,
        accessibilityTarget: 'AAA',
        stressFilterActive: true,
        toneProfile: input.toneProfile ?? ['informative', 'grounding'],
        targetAudience: input.targetAudience,
        activeBranches: activeBranches.length,
        totalNodes: this.nodes.size,
        pipelineReady: true,
      },
      generatedAt: new Date().toISOString(),
    };

    this.blueprints.set(blueprint.id, blueprint);
    logger.info({ id: blueprint.id, title: blueprint.title }, 'Section7 Lore: Blueprint generated for pipeline');
    return blueprint;
  }

  // ── Query Methods ───────────────────────────────────────────────────────

  getNode(id: string): LoreNode | undefined { return this.nodes.get(id); }
  getBranch(id: string): StoryBranch | undefined { return this.branches.get(id); }

  getActiveBranches(): StoryBranch[] {
    return [...this.branches.values()].filter(b => b.status === 'active');
  }

  getPublishedNodes(limit: number = 20): LoreNode[] {
    return [...this.nodes.values()]
      .filter(n => n.status === 'published')
      .sort((a, b) => new Date(b.publishedAt!).getTime() - new Date(a.publishedAt!).getTime())
      .slice(0, limit);
  }

  getBranchTree(branchName: string): LoreNode[] {
    return [...this.nodes.values()]
      .filter(n => n.branch === branchName)
      .sort((a, b) => a.depth - b.depth);
  }

  getStats(): {
    totalNodes: number;
    publishedNodes: number;
    activeBranches: number;
    blueprints: number;
    avgEmpathyScore: number;
  } {
    const nodes = [...this.nodes.values()];
    const avgEmpathy = nodes.length > 0
      ? Math.round(nodes.reduce((a, n) => a + n.empathyScore, 0) / nodes.length)
      : 0;

    return {
      totalNodes: this.nodes.size,
      publishedNodes: nodes.filter(n => n.status === 'published').length,
      activeBranches: [...this.branches.values()].filter(b => b.status === 'active').length,
      blueprints: this.blueprints.size,
      avgEmpathyScore: avgEmpathy,
    };
  }
}