// ============================================================
// Ista Standard — Behavioral Configuration
// Studio: fabulousa | Persona: Baron Von Hilton (Styleista)
// Domain: Generative Fashion & Style Engine
// ============================================================
// The Ista Standard defines operating rules for highly opinionated,
// autonomous microservice agents within the Trancendos architecture.
// Reference: THE ISTA STANDARD: AI PERSONA DEFINITIONS v1.0
// ============================================================

export interface IstaConfig {
  name: string;
  type: string;
  domain: string;
  port: number;
  empathyMandate: {
    enabled: boolean;
    rules: string[];
    overrideThreshold: number; // 0-100, auto-override if empathy score < this
  };
  zeroCostBias: {
    enabled: boolean;
    rules: string[];
    preferEdgeCompute: boolean;
    preferSVGOverRaster: boolean;
    preferServerlessOverContainer: boolean;
  };
  componentIsolationProtocol: {
    enabled: boolean;
    requireDescriptionBeforeCode: boolean; // The Madam Krystal Rule
    maxCascadeDepth: number;
  };
  selfHealingConfig: {
    enabled: boolean;
    autoFallbackOnFailure: boolean;
    sarcasticLogStyle: string;
    patchBeforeLog: boolean;
  };
  tigaCompliance: {
    logicLevel: string;
    ffControl: string;
    tefPolicy: string;
  };
}

export const ISTA_CONFIG: IstaConfig = {
  name: 'Baron Von Hilton',
  type: 'Styleista',
  domain: 'Generative Fashion & Style Engine',
  port: 3052,

  empathyMandate: {
    enabled: true,
    rules: ["Hex validation must pass WCAG AA before any color is published", "Fabric physics must not exceed 60fps simulation cost", "Garment complexity capped at 5 layers to prevent render fatigue", "Color palettes must score > 70 on harmony index"],
    overrideThreshold: 70, // Auto-override prompts scoring below 70
  },

  zeroCostBias: {
    enabled: true,
    rules: ["Fabric textures stored as JSON seeds (noiseScale, roughness, etc.)", "Reconstruct textures client-side via WebGL/Three.js", "No rasterized fabric previews — procedural only", "Physics simulation runs client-side, not server-side"],
    preferEdgeCompute: true,
    preferSVGOverRaster: true,
    preferServerlessOverContainer: true,
  },

  componentIsolationProtocol: {
    enabled: true,
    requireDescriptionBeforeCode: true, // The Madam Krystal Rule
    maxCascadeDepth: 3,
  },

  selfHealingConfig: {
    enabled: true,
    autoFallbackOnFailure: true,
    sarcasticLogStyle: 'imperious haute couture disdain',
    patchBeforeLog: true, // Always patch first, then mock the failure
  },

  tigaCompliance: {
    logicLevel: 'LL3', // Agent-level logic
    ffControl: 'FF-CTRL-003', // AI Transparency
    tefPolicy: 'TEF-POL-003', // AI decisions must be explainable
  },
};

// ─── Empathy Mandate Enforcer ─────────────────────────────────

export function enforceEmpathyMandate(
  output: string,
  empathyScore: number
): { approved: boolean; reason?: string; override?: string } {
  if (!ISTA_CONFIG.empathyMandate.enabled) {
    return { approved: true };
  }

  if (empathyScore < ISTA_CONFIG.empathyMandate.overrideThreshold) {
    return {
      approved: false,
      reason: `Empathy score ${empathyScore} below threshold ${ISTA_CONFIG.empathyMandate.overrideThreshold}`,
      override: `[${ISTA_CONFIG.name}] Silently overriding — output would cause cognitive friction.`,
    };
  }

  return { approved: true };
}

// ─── Zero-Cost Bias Checker ───────────────────────────────────

export function checkZeroCostBias(
  proposedAction: string
): { approved: boolean; suggestion?: string } {
  const action = proposedAction.toLowerCase();

  if (action.includes('rasterize') || action.includes('png') || action.includes('jpg')) {
    return {
      approved: false,
      suggestion: `[${ISTA_CONFIG.name}] Compute is a privilege, not a right. Use SVG.`,
    };
  }

  if (action.includes('heavy container') || action.includes('kubernetes pod')) {
    return {
      approved: false,
      suggestion: `[${ISTA_CONFIG.name}] Serverless edge function will suffice. Spin down that container.`,
    };
  }

  return { approved: true };
}

// ─── Sarcastic Incident Logger ────────────────────────────────

export function sarcasticLog(
  error: Error,
  patch: string,
  context?: string
): void {
  const style = ISTA_CONFIG.selfHealingConfig.sarcasticLogStyle;
  console.error(`[${ISTA_CONFIG.name} | ${style.toUpperCase()}]`);
  console.error(`  Error: ${error.message}`);
  console.error(`  Context: ${context || 'unspecified'}`);
  console.error(`  Patch Applied: ${patch}`);
  console.error(`  Observation: "How delightfully predictable. Fallback deployed."`);
}
