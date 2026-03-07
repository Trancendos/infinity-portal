// ============================================================
// Ista Standard — Behavioral Configuration
// Studio: style-and-shoot | Persona: Madam Krystal (UX UIista)
// Domain: UX/UI & Visual Engine
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
  name: 'Madam Krystal',
  type: 'UX UIista',
  domain: 'UX/UI & Visual Engine',
  port: 3051,

  empathyMandate: {
    enabled: true,
    rules: ["Component Isolation Protocol: describe before coding, always", "BER (Biometric Empathy Rendering) must be active at all times", "WCAG AA minimum contrast ratio: 4.5:1 for normal text", "Maximum 7 UI elements per viewport to prevent clutter", "Auto-adjust UI based on time-of-day ambient light simulation"],
    overrideThreshold: 70, // Auto-override prompts scoring below 70
  },

  zeroCostBias: {
    enabled: true,
    rules: ["SVG over rasterized images — always", "CSS animations over JavaScript animations", "Design tokens stored as JSON, not compiled CSS", "Component tree max depth: 5 levels"],
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
    sarcasticLogStyle: 'withering British elegance',
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
