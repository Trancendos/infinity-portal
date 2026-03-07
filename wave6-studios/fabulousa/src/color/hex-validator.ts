/**
 * Fabulousa — Hex-Code Validation Matrix
 * Ista: Baron Von Hilton (The Styleista)
 *
 * Automated quality-control pipeline that intercepts hex codes and
 * cross-references against accessibility standards and color-theory.
 */

import { v4 as uuid } from 'uuid';
import { logger } from '../utils/logger';

export interface ColorValidation {
  id: string;
  inputHex: string;
  valid: boolean;
  wcagAA: boolean;
  wcagAAA: boolean;
  empathySafe: boolean;
  harmonyScore: number;
  issues: string[];
  suggestedAlternative: string | null;
  validatedAt: string;
}

export interface PaletteValidation {
  id: string;
  colors: string[];
  harmonyType: 'complementary' | 'analogous' | 'triadic' | 'split-complementary' | 'custom';
  overallScore: number;
  allAccessible: boolean;
  allEmpathySafe: boolean;
  issues: string[];
  validatedAt: string;
}

export class HexValidator {
  private validations: Map<string, ColorValidation> = new Map();
  private paletteValidations: Map<string, PaletteValidation> = new Map();

  validateHex(hex: string, bgHex: string = '#FFFFFF'): ColorValidation {
    const issues: string[] = [];
    const valid = /^#[0-9A-Fa-f]{6}$/.test(hex);
    if (!valid) issues.push('Invalid hex format');

    const contrast = valid ? this.contrastRatio(hex, bgHex) : 0;
    const wcagAA = contrast >= 4.5;
    const wcagAAA = contrast >= 7.0;
    if (!wcagAA) issues.push(`Contrast ratio ${contrast.toFixed(2)}:1 fails WCAG AA (min 4.5:1)`);

    const empathySafe = valid ? this.isEmpathySafe(hex) : false;
    if (!empathySafe && valid) issues.push('Color may cause sensory overload — consider softer alternative');

    const harmony = valid ? this.harmonyScore(hex) : 0;
    const suggested = (!wcagAA || !empathySafe) && valid ? this.suggestAlternative(hex) : null;

    const validation: ColorValidation = {
      id: uuid(), inputHex: hex, valid, wcagAA, wcagAAA, empathySafe,
      harmonyScore: harmony, issues, suggestedAlternative: suggested,
      validatedAt: new Date().toISOString(),
    };
    this.validations.set(validation.id, validation);
    if (issues.length > 0) logger.info({ hex, issues: issues.length }, 'Fabulousa Hex: Validation issues found');
    return validation;
  }

  validatePalette(colors: string[]): PaletteValidation {
    const issues: string[] = [];
    const validations = colors.map(c => this.validateHex(c));
    const allAccessible = validations.every(v => v.wcagAA);
    const allEmpathySafe = validations.every(v => v.empathySafe);

    if (!allAccessible) issues.push('Not all colors meet WCAG AA contrast requirements');
    if (!allEmpathySafe) issues.push('Palette contains colors that may cause sensory overload');

    // Check harmony between adjacent colors
    let harmonySum = 0;
    for (let i = 0; i < colors.length - 1; i++) {
      const h1 = this.getHue(colors[i]);
      const h2 = this.getHue(colors[i + 1]);
      const diff = Math.abs(h1 - h2);
      harmonySum += diff > 180 ? 360 - diff : diff;
    }
    const avgHarmony = colors.length > 1 ? harmonySum / (colors.length - 1) : 0;

    let harmonyType: PaletteValidation['harmonyType'] = 'custom';
    if (avgHarmony > 150 && avgHarmony < 210) harmonyType = 'complementary';
    else if (avgHarmony < 40) harmonyType = 'analogous';
    else if (avgHarmony > 100 && avgHarmony < 140) harmonyType = 'triadic';

    const overallScore = Math.round(
      (validations.reduce((a, v) => a + v.harmonyScore, 0) / validations.length) * 0.5 +
      (allAccessible ? 25 : 0) + (allEmpathySafe ? 25 : 0)
    );

    const pv: PaletteValidation = {
      id: uuid(), colors, harmonyType, overallScore, allAccessible, allEmpathySafe,
      issues, validatedAt: new Date().toISOString(),
    };
    this.paletteValidations.set(pv.id, pv);
    return pv;
  }

  private contrastRatio(fg: string, bg: string): number {
    const l1 = this.luminance(fg); const l2 = this.luminance(bg);
    const lighter = Math.max(l1, l2); const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  }

  private luminance(hex: string): number {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const toLinear = (c: number) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  }

  private isEmpathySafe(hex: string): boolean {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    if (r > 220 && g < 60 && b < 60) return false;
    const sat = this.getSaturation(hex);
    if (sat > 0.95) return false;
    return true;
  }

  private getHue(hex: string): number {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (max === min) return 0;
    let h = 0; const d = max - min;
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
    return Math.round(h * 360);
  }

  private getSaturation(hex: string): number {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (max === 0) return 0;
    return (max - min) / max;
  }

  private harmonyScore(hex: string): number {
    const sat = this.getSaturation(hex);
    const lum = this.luminance(hex);
    let score = 50;
    if (sat > 0.3 && sat < 0.8) score += 20;
    if (lum > 0.1 && lum < 0.8) score += 20;
    if (this.isEmpathySafe(hex)) score += 10;
    return Math.min(100, score);
  }

  private suggestAlternative(hex: string): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const nr = Math.min(255, Math.max(30, Math.round(r * 0.8 + 30)));
    const ng = Math.min(255, Math.max(30, Math.round(g * 0.8 + 30)));
    const nb = Math.min(255, Math.max(30, Math.round(b * 0.8 + 30)));
    return `#${nr.toString(16).padStart(2, '0')}${ng.toString(16).padStart(2, '0')}${nb.toString(16).padStart(2, '0')}`;
  }

  getStats(): { totalValidations: number; paletteValidations: number; passRate: number } {
    const all = [...this.validations.values()];
    return {
      totalValidations: all.length, paletteValidations: this.paletteValidations.size,
      passRate: all.length > 0 ? Math.round(all.filter(v => v.valid && v.wcagAA && v.empathySafe).length / all.length * 100) : 0,
    };
  }
}
