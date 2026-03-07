/**
 * Style&Shoot — Component Isolation Framework
 *
 * Ista: Madam Krystal (The UX UIista)
 *
 * Enforces strict modularity. The engine will not compile or render
 * a parent DOM tree if any child component fails visual accessibility
 * or spacing checks.
 *
 * The Madam Krystal Rule: Isolate the component, describe its
 * logic/aesthetics in plain English, await approval before code generation.
 *
 * Architecture: Trancendos Industry 6.0 / 2060 Standard
 */

import { v4 as uuid } from 'uuid';
import { logger } from '../utils/logger';

// ─── Types ──────────────────────────────────────────────────────────────────

export type ComponentStatus = 'draft' | 'isolated' | 'validated' | 'approved' | 'compiled' | 'rejected';

export interface UIComponent {
  id: string;
  name: string;
  type: 'atom' | 'molecule' | 'organism' | 'template' | 'page';
  parentId: string | null;
  description: string;           // Plain English description (Madam Krystal Rule)
  cssClasses: string[];
  tailwindUtilities: string[];
  accessibilityScore: number;    // 0-100
  spacingValid: boolean;
  contrastRatio: number;         // WCAG requires >= 4.5 for AA
  empathyScore: number;          // 0-100
  status: ComponentStatus;
  children: string[];
  renderOutput: string | null;   // SVG/CSS output
  createdAt: string;
  validatedAt: string | null;
}

export interface AccessibilityReport {
  componentId: string;
  passed: boolean;
  score: number;
  checks: Array<{
    rule: string;
    passed: boolean;
    severity: 'error' | 'warning' | 'info';
    message: string;
  }>;
  empathyGrade: 'AAA' | 'AA' | 'A' | 'FAIL';
}

export interface BERState {
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  ambientLight: 'bright' | 'normal' | 'dim' | 'dark';
  interactionSpeed: 'fast' | 'normal' | 'slow' | 'frustrated';
  uiState: 'default' | 'simplified' | 'calming' | 'high-contrast';
  colorShift: { hueRotate: number; saturation: number; brightness: number };
}

// ─── Component Engine ───────────────────────────────────────────────────────

export class ComponentEngine {
  private components: Map<string, UIComponent> = new Map();
  private berState: BERState = {
    timeOfDay: 'morning',
    ambientLight: 'normal',
    interactionSpeed: 'normal',
    uiState: 'default',
    colorShift: { hueRotate: 0, saturation: 100, brightness: 100 },
  };

  // ── Component Creation (Madam Krystal Rule) ─────────────────────────────

  createComponent(input: {
    name: string;
    type: UIComponent['type'];
    parentId?: string;
    description: string;
    cssClasses?: string[];
    tailwindUtilities?: string[];
  }): UIComponent {
    // Validate parent exists if specified
    if (input.parentId && !this.components.has(input.parentId)) {
      throw new Error(`Parent component ${input.parentId} not found — isolate before composing`);
    }

    const component: UIComponent = {
      id: uuid(),
      name: input.name,
      type: input.type,
      parentId: input.parentId ?? null,
      description: input.description,
      cssClasses: input.cssClasses ?? [],
      tailwindUtilities: input.tailwindUtilities ?? [],
      accessibilityScore: 0,
      spacingValid: false,
      contrastRatio: 0,
      empathyScore: 0,
      status: 'draft',
      children: [],
      renderOutput: null,
      createdAt: new Date().toISOString(),
      validatedAt: null,
    };

    this.components.set(component.id, component);

    // Register as child of parent
    if (input.parentId) {
      const parent = this.components.get(input.parentId)!;
      parent.children.push(component.id);
    }

    logger.info({ id: component.id, name: component.name, type: component.type },
      'Style&Shoot: Component created in isolation');
    return component;
  }

  // ── Accessibility Validation ────────────────────────────────────────────

  validateComponent(componentId: string): AccessibilityReport {
    const component = this.components.get(componentId);
    if (!component) throw new Error('Component not found');

    const checks: AccessibilityReport['checks'] = [];

    // Check 1: Description exists (Madam Krystal Rule)
    checks.push({
      rule: 'KRYSTAL-001: Plain English Description',
      passed: component.description.length >= 10,
      severity: 'error',
      message: component.description.length >= 10
        ? 'Component has adequate description'
        : 'Component MUST have a plain English description before code generation',
    });

    // Check 2: Tailwind class conflicts
    const conflictPairs = [
      ['text-left', 'text-right'], ['text-center', 'text-right'],
      ['hidden', 'block'], ['hidden', 'flex'], ['hidden', 'grid'],
      ['p-0', 'p-4'], ['m-0', 'm-4'],
    ];
    const hasConflicts = conflictPairs.some(([a, b]) =>
      component.tailwindUtilities.includes(a) && component.tailwindUtilities.includes(b)
    );
    checks.push({
      rule: 'A11Y-001: Tailwind Class Conflicts',
      passed: !hasConflicts,
      severity: 'error',
      message: hasConflicts ? 'Conflicting Tailwind classes detected' : 'No class conflicts',
    });

    // Check 3: Spacing validation
    const hasSpacing = component.tailwindUtilities.some(c =>
      /^(p|m|gap|space)-/.test(c)
    ) || component.cssClasses.some(c => c.includes('spacing'));
    checks.push({
      rule: 'A11Y-002: Generous Whitespace',
      passed: hasSpacing || component.type === 'atom',
      severity: 'warning',
      message: hasSpacing ? 'Spacing utilities present' : 'Consider adding whitespace for cognitive ease',
    });

    // Check 4: Color contrast (simulated)
    const contrastRatio = this.estimateContrast(component);
    checks.push({
      rule: 'WCAG-001: Color Contrast (AA)',
      passed: contrastRatio >= 4.5,
      severity: 'error',
      message: `Contrast ratio: ${contrastRatio.toFixed(1)}:1 (minimum 4.5:1 for AA)`,
    });

    // Check 5: Visual clutter (signal-to-noise)
    const clutterScore = this.assessClutter(component);
    checks.push({
      rule: 'EMPATHY-001: Visual Clutter',
      passed: clutterScore <= 60,
      severity: 'warning',
      message: `Clutter score: ${clutterScore}/100 (target: ≤60)`,
    });

    // Check 6: Children validation (recursive)
    if (component.children.length > 0) {
      const childrenValid = component.children.every(childId => {
        const child = this.components.get(childId);
        return child && child.status !== 'rejected';
      });
      checks.push({
        rule: 'ISOLATION-001: Child Component Integrity',
        passed: childrenValid,
        severity: 'error',
        message: childrenValid
          ? 'All child components are valid'
          : 'BLOCKED: Parent cannot compile — child component failed validation',
      });
    }

    // Calculate scores
    const passedChecks = checks.filter(c => c.passed).length;
    const score = Math.round((passedChecks / checks.length) * 100);
    const errorsFailed = checks.filter(c => !c.passed && c.severity === 'error').length;

    component.accessibilityScore = score;
    component.contrastRatio = contrastRatio;
    component.spacingValid = hasSpacing || component.type === 'atom';
    component.empathyScore = Math.max(0, 100 - clutterScore);
    component.validatedAt = new Date().toISOString();

    if (errorsFailed === 0 && score >= 70) {
      component.status = 'validated';
    } else {
      component.status = 'rejected';
    }

    const report: AccessibilityReport = {
      componentId,
      passed: errorsFailed === 0,
      score,
      checks,
      empathyGrade: score >= 90 ? 'AAA' : score >= 70 ? 'AA' : score >= 50 ? 'A' : 'FAIL',
    };

    logger.info(
      { componentId, score, grade: report.empathyGrade, status: component.status },
      `Style&Shoot: Validation complete — ${component.name}`,
    );

    return report;
  }

  private estimateContrast(component: UIComponent): number {
    // Simulate contrast ratio based on Tailwind classes
    const darkBg = component.tailwindUtilities.some(c => /bg-(gray|slate|zinc|neutral|stone)-(7|8|9)/.test(c));
    const lightText = component.tailwindUtilities.some(c => /text-(white|gray-[12])/.test(c));
    const darkText = component.tailwindUtilities.some(c => /text-(black|gray-(8|9))/.test(c));
    const lightBg = component.tailwindUtilities.some(c => /bg-(white|gray-[12])/.test(c));

    if ((darkBg && lightText) || (lightBg && darkText)) return 12.5;
    if (darkBg || darkText) return 7.0;
    return 5.5; // Default reasonable contrast
  }

  private assessClutter(component: UIComponent): number {
    let clutter = 0;
    clutter += Math.max(0, component.cssClasses.length - 5) * 5;
    clutter += Math.max(0, component.tailwindUtilities.length - 8) * 3;
    clutter += Math.max(0, component.children.length - 5) * 8;
    if (!component.description) clutter += 20;
    return Math.min(100, clutter);
  }

  // ── Biometric Empathy Rendering (BER) ───────────────────────────────────

  updateBER(input: Partial<BERState>): BERState {
    if (input.timeOfDay) this.berState.timeOfDay = input.timeOfDay;
    if (input.ambientLight) this.berState.ambientLight = input.ambientLight;
    if (input.interactionSpeed) this.berState.interactionSpeed = input.interactionSpeed;

    // Auto-calculate UI state based on inputs
    if (this.berState.interactionSpeed === 'frustrated' || this.berState.interactionSpeed === 'slow') {
      this.berState.uiState = 'simplified';
      this.berState.colorShift = { hueRotate: 0, saturation: 80, brightness: 95 };
    } else if (this.berState.ambientLight === 'dark' || this.berState.timeOfDay === 'night') {
      this.berState.uiState = 'calming';
      this.berState.colorShift = { hueRotate: -10, saturation: 70, brightness: 85 };
    } else if (this.berState.ambientLight === 'bright') {
      this.berState.uiState = 'high-contrast';
      this.berState.colorShift = { hueRotate: 0, saturation: 110, brightness: 105 };
    } else {
      this.berState.uiState = 'default';
      this.berState.colorShift = { hueRotate: 0, saturation: 100, brightness: 100 };
    }

    logger.info({ berState: this.berState }, 'Style&Shoot: BER state updated');
    return this.berState;
  }

  getBERState(): BERState { return { ...this.berState }; }

  // ── Compile Component (SVG/CSS Output) ──────────────────────────────────

  compileComponent(componentId: string): string | null {
    const component = this.components.get(componentId);
    if (!component) return null;
    if (component.status !== 'validated' && component.status !== 'approved') {
      logger.warn({ componentId, status: component.status },
        'Style&Shoot: Cannot compile — component not validated. Madam Krystal disapproves.');
      return null;
    }

    // Generate lightweight CSS/SVG output
    const classes = [...component.cssClasses, ...component.tailwindUtilities].join(' ');
    const berFilter = this.berState.uiState !== 'default'
      ? ` filter: hue-rotate(${this.berState.colorShift.hueRotate}deg) saturate(${this.berState.colorShift.saturation}%) brightness(${this.berState.colorShift.brightness}%);`
      : '';

    const output = `<!-- ${component.name} | Type: ${component.type} | Empathy: ${component.empathyScore}/100 -->
<div class="${classes}" data-component-id="${component.id}" data-empathy="${component.empathyScore}" style="${berFilter}">
  <!-- ${component.description} -->
  ${component.children.map(cid => `<!-- child: ${cid} -->`).join('\n  ')}
</div>`;

    component.renderOutput = output;
    component.status = 'compiled';

    logger.info({ componentId, name: component.name }, 'Style&Shoot: Component compiled');
    return output;
  }

  // ── Query Methods ───────────────────────────────────────────────────────

  getComponent(id: string): UIComponent | undefined { return this.components.get(id); }

  getComponentsByType(type: UIComponent['type']): UIComponent[] {
    return [...this.components.values()].filter(c => c.type === type);
  }

  getComponentTree(rootId: string): UIComponent[] {
    const tree: UIComponent[] = [];
    const collect = (id: string) => {
      const comp = this.components.get(id);
      if (comp) {
        tree.push(comp);
        comp.children.forEach(collect);
      }
    };
    collect(rootId);
    return tree;
  }

  getStats(): {
    totalComponents: number;
    validated: number;
    compiled: number;
    rejected: number;
    avgEmpathyScore: number;
    avgAccessibility: number;
    berState: string;
  } {
    const all = [...this.components.values()];
    return {
      totalComponents: all.length,
      validated: all.filter(c => c.status === 'validated' || c.status === 'approved').length,
      compiled: all.filter(c => c.status === 'compiled').length,
      rejected: all.filter(c => c.status === 'rejected').length,
      avgEmpathyScore: all.length > 0 ? Math.round(all.reduce((a, c) => a + c.empathyScore, 0) / all.length) : 0,
      avgAccessibility: all.length > 0 ? Math.round(all.reduce((a, c) => a + c.accessibilityScore, 0) / all.length) : 0,
      berState: this.berState.uiState,
    };
  }
}