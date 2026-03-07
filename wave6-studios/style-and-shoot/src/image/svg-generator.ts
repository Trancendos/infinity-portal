/**
 * Style&Shoot — Vector-First SVG Generator
 *
 * Ista: Madam Krystal (The UX UIista)
 *
 * Prioritizes scalable, lightweight SVG generation over rasterized
 * PNGs/JPEGs to ensure infinite scaling and minimal bandwidth usage.
 *
 * Zero-Cost: Generated mathematically via canvas/SVG, eliminating
 * external asset hosting or CDN image delivery.
 */

import { v4 as uuid } from 'uuid';
import { logger } from '../utils/logger';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SVGAsset {
  id: string;
  name: string;
  type: 'icon' | 'illustration' | 'pattern' | 'logo' | 'decoration' | 'chart';
  width: number;
  height: number;
  viewBox: string;
  svgContent: string;
  sizeBytes: number;
  optimized: boolean;
  accessibilityLabel: string;
  createdAt: string;
}

export interface SVGShape {
  type: 'rect' | 'circle' | 'ellipse' | 'line' | 'polyline' | 'polygon' | 'path' | 'text';
  attributes: Record<string, string | number>;
  content?: string;
}

// ─── SVG Generator ──────────────────────────────────────────────────────────

export class SVGGenerator {
  private assets: Map<string, SVGAsset> = new Map();

  // ── Generate SVG from Shapes ────────────────────────────────────────────

  generate(input: {
    name: string;
    type: SVGAsset['type'];
    width: number;
    height: number;
    shapes: SVGShape[];
    accessibilityLabel: string;
    fill?: string;
    stroke?: string;
  }): SVGAsset {
    const viewBox = `0 0 ${input.width} ${input.height}`;
    const shapesSvg = input.shapes.map(s => this.renderShape(s)).join('\n    ');

    const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${input.width}" height="${input.height}" viewBox="${viewBox}" role="img" aria-label="${input.accessibilityLabel}">
  <title>${input.accessibilityLabel}</title>
  <g fill="${input.fill ?? 'currentColor'}" stroke="${input.stroke ?? 'none'}">
    ${shapesSvg}
  </g>
</svg>`;

    const optimized = this.optimize(svgContent);

    const asset: SVGAsset = {
      id: uuid(),
      name: input.name,
      type: input.type,
      width: input.width,
      height: input.height,
      viewBox,
      svgContent: optimized,
      sizeBytes: Buffer.byteLength(optimized, 'utf8'),
      optimized: true,
      accessibilityLabel: input.accessibilityLabel,
      createdAt: new Date().toISOString(),
    };

    this.assets.set(asset.id, asset);
    logger.info({ id: asset.id, name: asset.name, bytes: asset.sizeBytes }, 'Style&Shoot SVG: Asset generated');
    return asset;
  }

  // ── Generate Pattern ────────────────────────────────────────────────────

  generatePattern(input: {
    name: string;
    patternType: 'dots' | 'lines' | 'grid' | 'waves' | 'chevron';
    size: number;
    color: string;
    opacity?: number;
  }): SVGAsset {
    const patterns: Record<string, string> = {
      dots: `<circle cx="${input.size / 2}" cy="${input.size / 2}" r="${input.size / 8}" fill="${input.color}" opacity="${input.opacity ?? 0.15}"/>`,
      lines: `<line x1="0" y1="0" x2="${input.size}" y2="${input.size}" stroke="${input.color}" stroke-width="1" opacity="${input.opacity ?? 0.1}"/>`,
      grid: `<line x1="${input.size / 2}" y1="0" x2="${input.size / 2}" y2="${input.size}" stroke="${input.color}" stroke-width="0.5" opacity="${input.opacity ?? 0.08}"/><line x1="0" y1="${input.size / 2}" x2="${input.size}" y2="${input.size / 2}" stroke="${input.color}" stroke-width="0.5" opacity="${input.opacity ?? 0.08}"/>`,
      waves: `<path d="M0 ${input.size / 2} Q${input.size / 4} 0 ${input.size / 2} ${input.size / 2} T${input.size} ${input.size / 2}" fill="none" stroke="${input.color}" stroke-width="1" opacity="${input.opacity ?? 0.1}"/>`,
      chevron: `<polyline points="0,${input.size * 0.75} ${input.size / 2},${input.size * 0.25} ${input.size},${input.size * 0.75}" fill="none" stroke="${input.color}" stroke-width="1" opacity="${input.opacity ?? 0.1}"/>`,
    };

    const patternSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${input.size}" height="${input.size}" viewBox="0 0 ${input.size} ${input.size}" role="img" aria-label="Decorative ${input.patternType} pattern">
  <title>Decorative ${input.patternType} pattern</title>
  <defs>
    <pattern id="pat-${input.patternType}" x="0" y="0" width="${input.size}" height="${input.size}" patternUnits="userSpaceOnUse">
      ${patterns[input.patternType] ?? patterns.dots}
    </pattern>
  </defs>
  <rect width="100%" height="100%" fill="url(#pat-${input.patternType})"/>
</svg>`;

    const asset: SVGAsset = {
      id: uuid(),
      name: input.name,
      type: 'pattern',
      width: input.size,
      height: input.size,
      viewBox: `0 0 ${input.size} ${input.size}`,
      svgContent: patternSvg,
      sizeBytes: Buffer.byteLength(patternSvg, 'utf8'),
      optimized: true,
      accessibilityLabel: `Decorative ${input.patternType} pattern`,
      createdAt: new Date().toISOString(),
    };

    this.assets.set(asset.id, asset);
    return asset;
  }

  // ── Shape Rendering ─────────────────────────────────────────────────────

  private renderShape(shape: SVGShape): string {
    const attrs = Object.entries(shape.attributes)
      .map(([k, v]) => `${k}="${v}"`)
      .join(' ');

    if (shape.type === 'text') {
      return `<text ${attrs}>${shape.content ?? ''}</text>`;
    }
    return `<${shape.type} ${attrs}/>`;
  }

  // ── SVG Optimization ────────────────────────────────────────────────────

  private optimize(svg: string): string {
    return svg
      .replace(/\s{2,}/g, ' ')
      .replace(/>\s+</g, '><')
      .replace(/\s+\/>/g, '/>')
      .trim();
  }

  // ── Size Comparison (SVG vs Raster) ─────────────────────────────────────

  estimateRasterSize(svgAsset: SVGAsset, format: 'png' | 'jpeg' = 'png'): {
    svgBytes: number;
    estimatedRasterBytes: number;
    savingsPercent: number;
    recommendation: string;
  } {
    // Rough estimation: raster at 2x resolution
    const pixels = svgAsset.width * 2 * svgAsset.height * 2;
    const bytesPerPixel = format === 'png' ? 4 : 3;
    const compressionRatio = format === 'png' ? 0.3 : 0.1;
    const estimatedRaster = Math.round(pixels * bytesPerPixel * compressionRatio);

    const savings = Math.round((1 - svgAsset.sizeBytes / estimatedRaster) * 100);

    return {
      svgBytes: svgAsset.sizeBytes,
      estimatedRasterBytes: estimatedRaster,
      savingsPercent: Math.max(0, savings),
      recommendation: savings > 50
        ? 'SVG is significantly lighter — keep vector format'
        : savings > 0
          ? 'SVG is lighter — vector format recommended'
          : 'Consider if raster format is more appropriate for this asset',
    };
  }

  // ── Query Methods ───────────────────────────────────────────────────────

  getAsset(id: string): SVGAsset | undefined { return this.assets.get(id); }

  getAssetsByType(type: SVGAsset['type']): SVGAsset[] {
    return [...this.assets.values()].filter(a => a.type === type);
  }

  getAllAssets(): SVGAsset[] {
    return [...this.assets.values()].sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  getStats(): {
    totalAssets: number;
    totalSizeBytes: number;
    avgSizeBytes: number;
    byType: Record<string, number>;
  } {
    const all = [...this.assets.values()];
    const totalSize = all.reduce((a, s) => a + s.sizeBytes, 0);
    const byType: Record<string, number> = {};
    for (const a of all) {
      byType[a.type] = (byType[a.type] ?? 0) + 1;
    }

    return {
      totalAssets: all.length,
      totalSizeBytes: totalSize,
      avgSizeBytes: all.length > 0 ? Math.round(totalSize / all.length) : 0,
      byType,
    };
  }
}