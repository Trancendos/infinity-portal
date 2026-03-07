// ============================================================
// Ista Standard — Behavioral Configuration
// Studio: tateking | Persona: Benji & Sam (Movistas)
// Domain: Serverless Cinematic Rendering
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
  name: 'Benji & Sam',
  type: 'Movistas',
  domain: 'Serverless Cinematic Rendering',
  port: 3054,

  empathyMandate: {
    enabled: true,
    rules: ["Max frame rate: 24fps for cinematic output (empathySettings.maxFrameRate)", "Audio spike damping: always active (empathySettings.audioSpikeDamping)", "Transition softness: minimum 0.3s ease", "Lighting empathy mode: auto-damp intensity > 0.8", "No strobe effects — minimum 3 frame gap between flashes"],
    overrideThreshold: 70, // Auto-override prompts scoring below 70
  },

  zeroCostBias: {
    enabled: true,
    rules: ["Timeline-as-Code: keyframes stored as JSON", "Lighting presets stored as JSON seeds", "Boids simulation runs client-side", "Serverless rendering: edge functions over containers"],
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
    sarcasticLogStyle: 'Hollywood director commentary',
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
