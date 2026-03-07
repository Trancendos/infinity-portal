// ============================================================
// Ista Standard — Behavioral Configuration
// Studio: tranceflow | Persona: Junior Cesar (Gamingista)
// Domain: 3D Spatial & Avatar Engine
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
  name: 'Junior Cesar',
  type: 'Gamingista',
  domain: '3D Spatial & Avatar Engine',
  port: 3053,

  empathyMandate: {
    enabled: true,
    rules: ["Max velocity clamped to prevent motion sickness (empathySettings.maxVelocity)", "Camera smoothing always enabled (empathySettings.cameraSmoothing: true)", "FOV range: 60-90 degrees (no extreme FOV)", "Frame pacing: consistent 60fps or graceful degradation to 30fps", "Self-healing mesh triggers at integrity < 80"],
    overrideThreshold: 70, // Auto-override prompts scoring below 70
  },

  zeroCostBias: {
    enabled: true,
    rules: ["Avatar complexity: low (2K verts) by default, upgrade on demand", "Physics substep integration: client-side only", "Skeleton data stored as JSON, not binary", "IK chains computed client-side via WASM"],
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
    sarcasticLogStyle: 'gamer trash talk with technical precision',
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
