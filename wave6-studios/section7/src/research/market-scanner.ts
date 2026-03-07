/**
 * Section7 — Automated Market Intelligence Scanner
 *
 * Ista: Bert-Joen Kater (The Storyista)
 *
 * Generates continuous background SWOT analyses of competing platforms,
 * outputting findings as actionable JSON intelligence drops for the
 * CI/CD pipeline.
 *
 * Architecture: Trancendos Industry 6.0 / 2060 Standard
 */

import { v4 as uuid } from 'uuid';
import { logger } from '../utils/logger';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SWOTAnalysis {
  id: string;
  target: string;
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  threats: string[];
  overallScore: number;       // -100 to 100 (negative = threat, positive = opportunity)
  recommendation: string;
  generatedAt: string;
}

export interface CompetitorProfile {
  id: string;
  name: string;
  domain: string;
  category: string;
  features: string[];
  pricingModel: 'free' | 'freemium' | 'paid' | 'enterprise' | 'unknown';
  threatLevel: 'none' | 'low' | 'medium' | 'high' | 'critical';
  lastAnalyzed: string;
  swotHistory: string[];      // SWOTAnalysis IDs
}

export interface IntelligenceDrop {
  id: string;
  type: 'swot' | 'competitor_alert' | 'trend_shift' | 'opportunity' | 'risk_assessment';
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  summary: string;
  data: Record<string, unknown>;
  pipelineTarget: string;     // Which CI/CD stage should consume this
  consumed: boolean;
  createdAt: string;
  expiresAt: string;
}

// ─── Market Scanner ─────────────────────────────────────────────────────────

export class MarketScanner {
  private swotAnalyses: Map<string, SWOTAnalysis> = new Map();
  private competitors: Map<string, CompetitorProfile> = new Map();
  private intelligenceDrops: Map<string, IntelligenceDrop> = new Map();

  // ── Competitor Tracking ─────────────────────────────────────────────────

  registerCompetitor(input: {
    name: string;
    domain: string;
    category: string;
    features?: string[];
    pricingModel?: CompetitorProfile['pricingModel'];
  }): CompetitorProfile {
    const profile: CompetitorProfile = {
      id: uuid(),
      name: input.name,
      domain: input.domain,
      category: input.category,
      features: input.features ?? [],
      pricingModel: input.pricingModel ?? 'unknown',
      threatLevel: 'low',
      lastAnalyzed: new Date().toISOString(),
      swotHistory: [],
    };

    this.competitors.set(profile.id, profile);
    logger.info({ id: profile.id, name: profile.name }, 'Section7 Market: Competitor registered');
    return profile;
  }

  // ── SWOT Analysis Generation ────────────────────────────────────────────

  analyzeSWOT(competitorId: string, context?: string): SWOTAnalysis | null {
    const competitor = this.competitors.get(competitorId);
    if (!competitor) return null;

    // Generate SWOT based on competitor profile
    const strengths = this.assessStrengths(competitor);
    const weaknesses = this.assessWeaknesses(competitor);
    const opportunities = this.assessOpportunities(competitor);
    const threats = this.assessThreats(competitor);

    const overallScore = (opportunities.length - threats.length) * 15
      + (weaknesses.length - strengths.length) * 10;

    const swot: SWOTAnalysis = {
      id: uuid(),
      target: competitor.name,
      strengths,
      weaknesses,
      opportunities,
      threats,
      overallScore: Math.max(-100, Math.min(100, overallScore)),
      recommendation: this.generateRecommendation(overallScore, competitor),
      generatedAt: new Date().toISOString(),
    };

    this.swotAnalyses.set(swot.id, swot);
    competitor.swotHistory.push(swot.id);
    competitor.lastAnalyzed = new Date().toISOString();

    // Update threat level
    if (overallScore < -50) competitor.threatLevel = 'critical';
    else if (overallScore < -20) competitor.threatLevel = 'high';
    else if (overallScore < 0) competitor.threatLevel = 'medium';
    else competitor.threatLevel = 'low';

    // Auto-generate intelligence drop for critical findings
    if (competitor.threatLevel === 'critical' || competitor.threatLevel === 'high') {
      this.createIntelligenceDrop({
        type: 'competitor_alert',
        priority: competitor.threatLevel === 'critical' ? 'critical' : 'high',
        title: `Competitor Alert: ${competitor.name}`,
        summary: swot.recommendation,
        data: { swotId: swot.id, competitorId, threatLevel: competitor.threatLevel },
        pipelineTarget: 'section7-strategy',
      });
    }

    logger.info(
      { swotId: swot.id, target: competitor.name, score: overallScore, threat: competitor.threatLevel },
      'Section7 Market: SWOT analysis completed',
    );

    return swot;
  }

  private assessStrengths(competitor: CompetitorProfile): string[] {
    const strengths: string[] = [];
    if (competitor.features.length > 10) strengths.push('Broad feature set');
    if (competitor.pricingModel === 'free') strengths.push('Zero-cost offering attracts users');
    if (competitor.pricingModel === 'freemium') strengths.push('Freemium model enables growth');
    if (competitor.domain.includes('.ai')) strengths.push('AI-focused branding');
    strengths.push(`Established in ${competitor.category} category`);
    return strengths;
  }

  private assessWeaknesses(competitor: CompetitorProfile): string[] {
    const weaknesses: string[] = [];
    if (competitor.pricingModel === 'paid' || competitor.pricingModel === 'enterprise') {
      weaknesses.push('Paid model creates barrier to entry');
    }
    if (competitor.features.length < 5) weaknesses.push('Limited feature set');
    weaknesses.push('Likely lacks empathy-first design philosophy');
    weaknesses.push('Probable reliance on expensive cloud compute');
    return weaknesses;
  }

  private assessOpportunities(competitor: CompetitorProfile): string[] {
    const opportunities: string[] = [];
    opportunities.push('Trancendos zero-cost model undercuts pricing');
    opportunities.push('Empathy Mandate provides unique differentiation');
    opportunities.push('Edge-compute architecture eliminates cloud dependency');
    if (competitor.pricingModel !== 'free') {
      opportunities.push(`Offer free alternative to ${competitor.name}'s paid features`);
    }
    return opportunities;
  }

  private assessThreats(competitor: CompetitorProfile): string[] {
    const threats: string[] = [];
    if (competitor.features.length > 15) threats.push('Feature parity gap may exist');
    if (competitor.pricingModel === 'free') threats.push('Competing free offering reduces differentiation');
    threats.push('Established user base creates switching costs');
    return threats;
  }

  private generateRecommendation(score: number, competitor: CompetitorProfile): string {
    if (score < -30) {
      return `HIGH PRIORITY: ${competitor.name} poses significant competitive threat. Recommend accelerating feature development in ${competitor.category} and emphasizing Trancendos unique value propositions (zero-cost, empathy-first, edge-compute).`;
    } else if (score < 0) {
      return `MONITOR: ${competitor.name} is a moderate competitor. Continue tracking and ensure Trancendos maintains differentiation through the Empathy Mandate and zero-cost architecture.`;
    } else {
      return `OPPORTUNITY: ${competitor.name}'s weaknesses present clear opportunities for Trancendos. Focus marketing on areas where the competitor falls short, particularly around cost and user experience.`;
    }
  }

  // ── Intelligence Drops (JSON for CI/CD Pipeline) ────────────────────────

  createIntelligenceDrop(input: {
    type: IntelligenceDrop['type'];
    priority: IntelligenceDrop['priority'];
    title: string;
    summary: string;
    data: Record<string, unknown>;
    pipelineTarget: string;
  }): IntelligenceDrop {
    const drop: IntelligenceDrop = {
      id: uuid(),
      ...input,
      consumed: false,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };

    this.intelligenceDrops.set(drop.id, drop);
    logger.info({ id: drop.id, type: drop.type, priority: drop.priority }, 'Section7 Market: Intelligence drop created');
    return drop;
  }

  consumeDrop(dropId: string): IntelligenceDrop | null {
    const drop = this.intelligenceDrops.get(dropId);
    if (!drop || drop.consumed) return null;
    drop.consumed = true;
    return drop;
  }

  getPendingDrops(pipelineTarget?: string): IntelligenceDrop[] {
    const now = new Date().toISOString();
    return [...this.intelligenceDrops.values()]
      .filter(d => !d.consumed && d.expiresAt > now)
      .filter(d => !pipelineTarget || d.pipelineTarget === pipelineTarget)
      .sort((a, b) => {
        const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      });
  }

  // ── Query Methods ───────────────────────────────────────────────────────

  getCompetitor(id: string): CompetitorProfile | undefined { return this.competitors.get(id); }
  getSWOT(id: string): SWOTAnalysis | undefined { return this.swotAnalyses.get(id); }

  getAllCompetitors(): CompetitorProfile[] {
    return [...this.competitors.values()].sort((a, b) => {
      const threatOrder = { critical: 0, high: 1, medium: 2, low: 3, none: 4 };
      return threatOrder[a.threatLevel] - threatOrder[b.threatLevel];
    });
  }

  getStats(): {
    competitors: number;
    swotAnalyses: number;
    pendingDrops: number;
    criticalThreats: number;
  } {
    return {
      competitors: this.competitors.size,
      swotAnalyses: this.swotAnalyses.size,
      pendingDrops: this.getPendingDrops().length,
      criticalThreats: [...this.competitors.values()].filter(c => c.threatLevel === 'critical').length,
    };
  }
}