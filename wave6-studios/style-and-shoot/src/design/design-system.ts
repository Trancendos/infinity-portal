/**
 * Style&Shoot — Design System Engine
 *
 * Ista: Madam Krystal (The UX UIista)
 *
 * Enforces color theory, spacing scales, typography rules, and
 * visual accessibility standards across the entire Trancendos UI.
 *
 * Architecture: Trancendos Industry 6.0 / 2060 Standard
 */

import { v4 as uuid } from 'uuid';
import { logger } from '../utils/logger';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ColorToken {
  id: string;
  name: string;
  hex: string;
  hsl: { h: number; s: number; l: number };
  role: 'primary' | 'secondary' | 'accent' | 'neutral' | 'success' | 'warning' | 'error' | 'surface';
  wcagAACompliant: boolean;
  wcagAAACompliant: boolean;
  empathySafe: boolean;        // Not stress-inducing
}

export interface SpacingScale {
  unit: number;                // Base unit in px (default 4)
  scale: number[];             // Multipliers: [0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24]
  minTouchTarget: number;      // Minimum 44px for accessibility
}

export interface TypographyToken {
  id: string;
  name: string;
  fontFamily: string;
  fontSize: number;            // in rem
  lineHeight: number;          // ratio
  fontWeight: number;
  letterSpacing: number;       // in em
  role: 'display' | 'heading' | 'subheading' | 'body' | 'caption' | 'label';
  readabilityScore: number;    // 0-100
}

export interface DesignValidation {
  valid: boolean;
  score: number;
  issues: Array<{ rule: string; severity: 'error' | 'warning'; message: string }>;
}

// ─── Design System ──────────────────────────────────────────────────────────

export class DesignSystem {
  private colors: Map<string, ColorToken> = new Map();
  private typography: Map<string, TypographyToken> = new Map();
  private spacing: SpacingScale = {
    unit: 4,
    scale: [0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24],
    minTouchTarget: 44,
  };

  constructor() {
    this.seedDefaults();
  }

  private seedDefaults(): void {
    // Trancendos default empathy-safe palette
    const defaults: Array<Omit<ColorToken, 'id' | 'wcagAACompliant' | 'wcagAAACompliant' | 'empathySafe'>> = [
      { name: 'primary', hex: '#4F46E5', hsl: { h: 243, s: 75, l: 59 }, role: 'primary' },
      { name: 'secondary', hex: '#7C3AED', hsl: { h: 263, s: 83, l: 58 }, role: 'secondary' },
      { name: 'accent', hex: '#06B6D4', hsl: { h: 188, s: 95, l: 43 }, role: 'accent' },
      { name: 'neutral-50', hex: '#FAFAFA', hsl: { h: 0, s: 0, l: 98 }, role: 'surface' },
      { name: 'neutral-900', hex: '#171717', hsl: { h: 0, s: 0, l: 9 }, role: 'neutral' },
      { name: 'success', hex: '#10B981', hsl: { h: 160, s: 84, l: 39 }, role: 'success' },
      { name: 'warning', hex: '#F59E0B', hsl: { h: 38, s: 92, l: 50 }, role: 'warning' },
      { name: 'error', hex: '#EF4444', hsl: { h: 0, s: 84, l: 60 }, role: 'error' },
    ];

    for (const c of defaults) {
      this.registerColor(c);
    }

    // Default typography scale
    const typeDefaults: Array<Omit<TypographyToken, 'id' | 'readabilityScore'>> = [
      { name: 'display', fontFamily: 'Inter, system-ui, sans-serif', fontSize: 3.0, lineHeight: 1.1, fontWeight: 700, letterSpacing: -0.02, role: 'display' },
      { name: 'h1', fontFamily: 'Inter, system-ui, sans-serif', fontSize: 2.25, lineHeight: 1.2, fontWeight: 700, letterSpacing: -0.01, role: 'heading' },
      { name: 'h2', fontFamily: 'Inter, system-ui, sans-serif', fontSize: 1.875, lineHeight: 1.25, fontWeight: 600, letterSpacing: -0.005, role: 'heading' },
      { name: 'h3', fontFamily: 'Inter, system-ui, sans-serif', fontSize: 1.5, lineHeight: 1.3, fontWeight: 600, letterSpacing: 0, role: 'subheading' },
      { name: 'body', fontFamily: 'Inter, system-ui, sans-serif', fontSize: 1.0, lineHeight: 1.6, fontWeight: 400, letterSpacing: 0, role: 'body' },
      { name: 'caption', fontFamily: 'Inter, system-ui, sans-serif', fontSize: 0.875, lineHeight: 1.5, fontWeight: 400, letterSpacing: 0.01, role: 'caption' },
      { name: 'label', fontFamily: 'Inter, system-ui, sans-serif', fontSize: 0.75, lineHeight: 1.4, fontWeight: 500, letterSpacing: 0.02, role: 'label' },
    ];

    for (const t of typeDefaults) {
      this.registerTypography(t);
    }

    logger.info('Style&Shoot Design System: Defaults seeded — empathy-safe palette active');
  }

  // ── Color Management ────────────────────────────────────────────────────

  registerColor(input: Omit<ColorToken, 'id' | 'wcagAACompliant' | 'wcagAAACompliant' | 'empathySafe'>): ColorToken {
    const luminance = this.relativeLuminance(input.hex);
    const whiteLuminance = 1.0;
    const blackLuminance = 0.0;

    const contrastOnWhite = (whiteLuminance + 0.05) / (luminance + 0.05);
    const contrastOnBlack = (luminance + 0.05) / (blackLuminance + 0.05);
    const bestContrast = Math.max(contrastOnWhite, contrastOnBlack);

    const token: ColorToken = {
      id: uuid(),
      ...input,
      wcagAACompliant: bestContrast >= 4.5,
      wcagAAACompliant: bestContrast >= 7.0,
      empathySafe: this.isEmpathySafe(input.hsl),
    };

    this.colors.set(token.id, token);
    return token;
  }

  validateColorPair(fgHex: string, bgHex: string): { ratio: number; aa: boolean; aaa: boolean } {
    const fgLum = this.relativeLuminance(fgHex);
    const bgLum = this.relativeLuminance(bgHex);
    const lighter = Math.max(fgLum, bgLum);
    const darker = Math.min(fgLum, bgLum);
    const ratio = (lighter + 0.05) / (darker + 0.05);

    return {
      ratio: Math.round(ratio * 100) / 100,
      aa: ratio >= 4.5,
      aaa: ratio >= 7.0,
    };
  }

  private relativeLuminance(hex: string): number {
    const rgb = this.hexToRgb(hex);
    const [r, g, b] = rgb.map(c => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  private hexToRgb(hex: string): [number, number, number] {
    const h = hex.replace('#', '');
    return [
      parseInt(h.substring(0, 2), 16),
      parseInt(h.substring(2, 4), 16),
      parseInt(h.substring(4, 6), 16),
    ];
  }

  private isEmpathySafe(hsl: { h: number; s: number; l: number }): boolean {
    // Reject overly saturated reds (stress-inducing)
    if (hsl.h >= 0 && hsl.h <= 15 && hsl.s > 85) return false;
    if (hsl.h >= 345 && hsl.s > 85) return false;
    // Reject extreme brightness/darkness
    if (hsl.l < 5 || hsl.l > 98) return false;
    // Reject neon-level saturation
    if (hsl.s > 95 && hsl.l > 50 && hsl.l < 70) return false;
    return true;
  }

  // ── Typography Management ───────────────────────────────────────────────

  registerTypography(input: Omit<TypographyToken, 'id' | 'readabilityScore'>): TypographyToken {
    let readability = 70;
    if (input.lineHeight >= 1.5) readability += 10;
    if (input.fontSize >= 1.0) readability += 10;
    if (input.fontFamily.includes('system-ui') || input.fontFamily.includes('sans-serif')) readability += 5;
    if (input.letterSpacing >= 0) readability += 5;

    const token: TypographyToken = {
      id: uuid(),
      ...input,
      readabilityScore: Math.min(100, readability),
    };

    this.typography.set(token.id, token);
    return token;
  }

  // ── Full Design Validation ──────────────────────────────────────────────

  validateDesign(input: {
    colors?: string[];           // hex values
    fontSizes?: number[];        // rem values
    spacing?: number[];          // px values
  }): DesignValidation {
    const issues: DesignValidation['issues'] = [];

    // Validate colors
    if (input.colors) {
      for (const hex of input.colors) {
        if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) {
          issues.push({ rule: 'COLOR-001', severity: 'error', message: `Invalid hex: ${hex}` });
        }
      }
      // Check for empathy-safe palette
      for (const hex of input.colors) {
        const rgb = this.hexToRgb(hex);
        const r = rgb[0], g = rgb[1], b = rgb[2];
        if (r > 200 && g < 50 && b < 50) {
          issues.push({ rule: 'EMPATHY-COLOR', severity: 'warning', message: `Aggressive red detected: ${hex} — consider softer alternative` });
        }
      }
    }

    // Validate font sizes
    if (input.fontSizes) {
      for (const size of input.fontSizes) {
        if (size < 0.75) {
          issues.push({ rule: 'TYPE-001', severity: 'error', message: `Font size ${size}rem too small — minimum 0.75rem for accessibility` });
        }
      }
    }

    // Validate spacing
    if (input.spacing) {
      for (const sp of input.spacing) {
        if (sp > 0 && sp < this.spacing.minTouchTarget && sp > 20) {
          issues.push({ rule: 'SPACE-001', severity: 'warning', message: `Touch target ${sp}px below minimum ${this.spacing.minTouchTarget}px` });
        }
      }
    }

    const errorCount = issues.filter(i => i.severity === 'error').length;
    const score = Math.max(0, 100 - errorCount * 20 - (issues.length - errorCount) * 5);

    return { valid: errorCount === 0, score, issues };
  }

  // ── Query Methods ───────────────────────────────────────────────────────

  getColors(): ColorToken[] { return [...this.colors.values()]; }
  getTypography(): TypographyToken[] { return [...this.typography.values()]; }
  getSpacing(): SpacingScale { return { ...this.spacing }; }

  getDesignTokens(): {
    colors: ColorToken[];
    typography: TypographyToken[];
    spacing: SpacingScale;
  } {
    return {
      colors: this.getColors(),
      typography: this.getTypography(),
      spacing: this.getSpacing(),
    };
  }

  getStats(): {
    colors: number;
    empathySafeColors: number;
    wcagAAColors: number;
    typographyTokens: number;
    avgReadability: number;
  } {
    const colors = [...this.colors.values()];
    const types = [...this.typography.values()];
    return {
      colors: colors.length,
      empathySafeColors: colors.filter(c => c.empathySafe).length,
      wcagAAColors: colors.filter(c => c.wcagAACompliant).length,
      typographyTokens: types.length,
      avgReadability: types.length > 0 ? Math.round(types.reduce((a, t) => a + t.readabilityScore, 0) / types.length) : 0,
    };
  }
}