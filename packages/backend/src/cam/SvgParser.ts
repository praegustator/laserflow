import { parseSync } from 'svgson';
import type { INode } from 'svgson';
import { SVGPathData, SVGPathDataTransformer } from 'svg-pathdata';
import type { PathGeometry } from '../types/index.js';

/* ── 2×3 affine matrix [a, b, c, d, e, f]: x'=ax+cy+e, y'=bx+dy+f ── */

type Matrix = [number, number, number, number, number, number];

function identityMatrix(): Matrix {
  return [1, 0, 0, 1, 0, 0];
}

function isIdentity(m: Matrix): boolean {
  return (
    Math.abs(m[0] - 1) < 1e-12 && Math.abs(m[1]) < 1e-12 &&
    Math.abs(m[2]) < 1e-12 && Math.abs(m[3] - 1) < 1e-12 &&
    Math.abs(m[4]) < 1e-12 && Math.abs(m[5]) < 1e-12
  );
}

function multiplyMatrices(m1: Matrix, m2: Matrix): Matrix {
  const [a1, b1, c1, d1, e1, f1] = m1;
  const [a2, b2, c2, d2, e2, f2] = m2;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

/* ── SVG unit / viewBox helpers ──────────────────────────────────────── */

/** Tags whose children should NOT be extracted as visible geometry.
 *  All entries are lowercase — tag names are lowercased before lookup. */
const NON_VISUAL_TAGS = new Set([
  'defs', 'clippath', 'mask', 'symbol', 'pattern', 'marker',
  'metadata', 'title', 'desc', 'style', 'script',
  'lineargradient', 'radialgradient', 'filter',
]);

/**
 * Parse an SVG length value with a physical unit into millimetres.
 * Returns `null` for unitless / px / em / % values so that we only scale
 * when we have a reliable physical dimension.  Negative and zero values
 * are rejected because physical dimensions cannot be non-positive.
 */
export function parseSvgLength(raw: string | undefined): number | null {
  if (!raw) return null;
  const m = raw.trim().match(/^([+-]?[\d.]+(?:e[+-]?\d+)?)\s*(mm|cm|in|pt|pc)$/i);
  if (!m) return null;
  const num = parseFloat(m[1]);
  if (!Number.isFinite(num) || num <= 0) return null;
  switch (m[2].toLowerCase()) {
    case 'mm': return num;
    case 'cm': return num * 10;
    case 'in': return num * 25.4;
    case 'pt': return num * 25.4 / 72;
    case 'pc': return num * 25.4 / 6;
    default: return null;
  }
}

/** Parse an SVG `viewBox` attribute into its four components. */
export function parseViewBox(raw: string | undefined): { minX: number; minY: number; width: number; height: number } | null {
  if (!raw) return null;
  const parts = raw.trim().split(/[\s,]+/).map(Number);
  if (parts.length !== 4 || parts.some(n => !Number.isFinite(n))) return null;
  const [minX, minY, width, height] = parts;
  if (width <= 0 || height <= 0) return null;
  return { minX, minY, width, height };
}

/**
 * Compute the root transformation matrix that maps SVG user-space
 * coordinates into millimetres.
 *
 * Strategy:
 *   1. If viewBox AND width/height with physical units exist, compute exact
 *      mm-per-viewBox-unit scaling.  This handles the typical Illustrator
 *      export: `width="10mm" viewBox="0 0 28.35 28.35"`.
 *   2. Otherwise return the identity – existing laser-cutter SVGs that
 *      already use mm as their coordinate unit continue to work unchanged.
 */
export function computeRootMatrix(attrs: Record<string, string>): Matrix {
  const vb = parseViewBox(attrs['viewBox'] ?? attrs['viewbox']);
  const wMm = parseSvgLength(attrs['width']);
  const hMm = parseSvgLength(attrs['height']);

  if (vb && wMm !== null && hMm !== null) {
    const sx = wMm / vb.width;
    const sy = hMm / vb.height;
    return [sx, 0, 0, sy, -vb.minX * sx, -vb.minY * sy];
  }

  // viewBox with non-zero origin but no physical dimensions: shift only
  if (vb && (vb.minX !== 0 || vb.minY !== 0)) {
    return [1, 0, 0, 1, -vb.minX, -vb.minY];
  }

  return identityMatrix();
}

/* ── SVG transform attribute parser ──────────────────────────────────── */

/**
 * Parse an SVG `transform` attribute into a combined affine matrix.
 * Supports: matrix, translate, scale, rotate, skewX, skewY.
 */
export function parseTransformAttr(raw: string): Matrix {
  let matrix: Matrix = identityMatrix();
  const regex = /(\w+)\s*\(([^)]*)\)/g;
  let match;
  while ((match = regex.exec(raw)) !== null) {
    const fn = match[1].toLowerCase();
    const args = match[2].split(/[\s,]+/).filter(Boolean).map(Number);
    let m: Matrix;
    switch (fn) {
      case 'matrix':
        if (args.length < 6) continue;
        m = [args[0], args[1], args[2], args[3], args[4], args[5]];
        break;
      case 'translate':
        m = [1, 0, 0, 1, args[0] || 0, args[1] || 0];
        break;
      case 'scale': {
        const sx = args[0] ?? 1;
        const sy = args[1] ?? sx;
        m = [sx, 0, 0, sy, 0, 0];
        break;
      }
      case 'rotate': {
        const angle = (args[0] ?? 0) * Math.PI / 180;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        if (args.length >= 3) {
          const cx = args[1], cy = args[2];
          m = [cos, sin, -sin, cos, cx - cos * cx + sin * cy, cy - sin * cx - cos * cy];
        } else {
          m = [cos, sin, -sin, cos, 0, 0];
        }
        break;
      }
      case 'skewx': {
        const a = Math.tan((args[0] ?? 0) * Math.PI / 180);
        m = [1, 0, a, 1, 0, 0];
        break;
      }
      case 'skewy': {
        const a = Math.tan((args[0] ?? 0) * Math.PI / 180);
        m = [1, a, 0, 1, 0, 0];
        break;
      }
      default:
        continue;
    }
    matrix = multiplyMatrices(matrix, m);
  }
  return matrix;
}

/* ── Path transformation helper ──────────────────────────────────────── */

function applyMatrixToPath(pathD: string, matrix: Matrix): string {
  if (isIdentity(matrix)) return pathD;
  try {
    const [a, b, c, d, e, f] = matrix;
    return new SVGPathData(pathD)
      .toAbs()
      .transform(SVGPathDataTransformer.MATRIX(a, b, c, d, e, f))
      .encode();
  } catch {
    return pathD;
  }
}

/* ── Closed-path spur removal ────────────────────────────────────────── */

/**
 * Some SVG exporters (e.g. Adobe Illustrator) emit closed paths whose
 * starting M point is slightly offset from the path's first real vertex,
 * creating a short diagonal "spur" at the start and end of the sub-path.
 *
 * Pattern:  M(a) L(b) … L(b) Z   where (a) ≠ (b)
 *
 * The spur consists of:  M(a)→L(b) at the beginning  and  Z→(a) at the end.
 * Fix: relocate M to (b) and drop the first L; Z then closes to (b),
 * producing a zero-length close instead of the diagonal.
 */
export function removeClosedPathSpurs(pathD: string): string {
  try {
    const data = new SVGPathData(pathD).toAbs();
    const cmds = data.commands;

    let modified = false;
    let i = 0;

    while (i < cmds.length) {
      if (cmds[i].type !== SVGPathData.MOVE_TO) { i++; continue; }

      const mIdx = i;
      // Find the end of this sub-path (next M or end of commands)
      let endIdx = mIdx + 1;
      while (endIdx < cmds.length && cmds[endIdx].type !== SVGPathData.MOVE_TO) {
        endIdx++;
      }
      const subLen = endIdx - mIdx;
      // Need at least M, L, …, L, Z  (4 commands minimum)
      if (subLen < 4) { i = endIdx; continue; }

      const lastCmd = cmds[endIdx - 1];
      if (lastCmd.type !== SVGPathData.CLOSE_PATH) { i = endIdx; continue; }

      const firstDraw = cmds[mIdx + 1];
      if (firstDraw.type !== SVGPathData.LINE_TO) { i = endIdx; continue; }

      // Find the last drawing command that has x,y before the Z
      let lastDrawIdx = -1;
      for (let j = endIdx - 2; j > mIdx; j--) {
        const c = cmds[j];
        if ('x' in c && 'y' in c) { lastDrawIdx = j; break; }
      }
      if (lastDrawIdx < 0) { i = endIdx; continue; }

      const lastDraw = cmds[lastDrawIdx] as { x: number; y: number };
      const firstLine = firstDraw as unknown as { x: number; y: number };
      const mCmd = cmds[mIdx] as { x: number; y: number };

      // Check: first L destination ≈ last drawing destination (same vertex)
      if (Math.hypot(lastDraw.x - firstLine.x, lastDraw.y - firstLine.y) > 0.01) {
        i = endIdx; continue;
      }
      // Check: M is actually offset from that vertex (there IS a spur)
      if (Math.hypot(mCmd.x - firstLine.x, mCmd.y - firstLine.y) < 0.001) {
        i = endIdx; continue;
      }

      // Relocate M to the first L destination and drop the first L
      mCmd.x = firstLine.x;
      mCmd.y = firstLine.y;
      cmds.splice(mIdx + 1, 1);
      endIdx--;
      modified = true;

      i = endIdx;
    }

    if (!modified) return pathD;
    return new SVGPathData(cmds).encode();
  } catch {
    return pathD;
  }
}

/* ── Shape-to-path converters ────────────────────────────────────────── */

function rectToPath(attrs: Record<string, string>): string {
  const x = parseFloat(attrs['x'] ?? '0');
  const y = parseFloat(attrs['y'] ?? '0');
  const w = parseFloat(attrs['width'] ?? '0');
  const h = parseFloat(attrs['height'] ?? '0');
  const rx = parseFloat(attrs['rx'] ?? attrs['ry'] ?? '0');
  const ry = parseFloat(attrs['ry'] ?? attrs['rx'] ?? '0');

  if (rx === 0 && ry === 0) {
    return `M ${x} ${y} L ${x + w} ${y} L ${x + w} ${y + h} L ${x} ${y + h} Z`;
  }
  return `M ${x + rx} ${y} L ${x + w - rx} ${y} Q ${x + w} ${y} ${x + w} ${y + ry} L ${x + w} ${y + h - ry} Q ${x + w} ${y + h} ${x + w - rx} ${y + h} L ${x + rx} ${y + h} Q ${x} ${y + h} ${x} ${y + h - ry} L ${x} ${y + ry} Q ${x} ${y} ${x + rx} ${y} Z`;
}

function circleToPath(attrs: Record<string, string>): string {
  const cx = parseFloat(attrs['cx'] ?? '0');
  const cy = parseFloat(attrs['cy'] ?? '0');
  const r = parseFloat(attrs['r'] ?? '0');
  return `M ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy} Z`;
}

function ellipseToPath(attrs: Record<string, string>): string {
  const cx = parseFloat(attrs['cx'] ?? '0');
  const cy = parseFloat(attrs['cy'] ?? '0');
  const rx = parseFloat(attrs['rx'] ?? '0');
  const ry = parseFloat(attrs['ry'] ?? '0');
  return `M ${cx - rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx + rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx - rx} ${cy} Z`;
}

function lineToPath(attrs: Record<string, string>): string {
  const x1 = parseFloat(attrs['x1'] ?? '0');
  const y1 = parseFloat(attrs['y1'] ?? '0');
  const x2 = parseFloat(attrs['x2'] ?? '0');
  const y2 = parseFloat(attrs['y2'] ?? '0');
  return `M ${x1} ${y1} L ${x2} ${y2}`;
}

function polylineToPath(attrs: Record<string, string>, close: boolean): string {
  const points = (attrs['points'] ?? '').trim().split(/[\s,]+/).filter(Boolean);
  if (points.length < 2) return '';
  let d = `M ${points[0]} ${points[1]}`;
  for (let i = 2; i < points.length - 1; i += 2) {
    d += ` L ${points[i]} ${points[i + 1]}`;
  }
  if (close) d += ' Z';
  return d;
}

/* ── Tree walker ─────────────────────────────────────────────────────── */

function walkTree(node: INode, paths: PathGeometry[], transform: Matrix, inheritedFill: string | undefined): void {
  const tag = node.name.toLowerCase();

  // Skip non-visual containers — their children must not be extracted
  if (NON_VISUAL_TAGS.has(tag)) return;

  // Accumulate element-level transform
  let currentTransform = transform;
  const transformAttr = node.attributes['transform'];
  if (transformAttr) {
    currentTransform = multiplyMatrices(transform, parseTransformAttr(transformAttr));
  }

  // Resolve fill: explicit attribute overrides inherited value.
  // Also check the inline `style` attribute (e.g. `style="fill:#999"`)
  // which Illustrator and other tools commonly use instead of the `fill`
  // presentation attribute.  The `fill` attribute takes priority when both
  // are present, matching SVG cascading rules (presentation attributes win
  // over inline style in practice for our purposes — the spec says inline
  // style wins, but in real exports they rarely conflict).
  // `fill="none"` / `fill:none` is treated as no-fill (undefined).
  // Per SVG spec, the default fill for shape elements is `#000000` (black).
  let rawFill = node.attributes['fill'];
  if (rawFill === undefined) {
    // Fall back to inline style attribute
    const style = node.attributes['style'];
    if (style) {
      const m = style.match(/(?:^|;)\s*fill\s*:\s*([^;]+)/i);
      if (m) rawFill = m[1].trim();
    }
  }
  let currentFill = inheritedFill;
  if (rawFill !== undefined) {
    currentFill = rawFill.trim().toLowerCase() === 'none' ? undefined : rawFill.trim();
  }

  let d: string | null = null;

  switch (tag) {
    case 'path':
      d = node.attributes['d'] ?? null;
      break;
    case 'rect':
      d = rectToPath(node.attributes);
      break;
    case 'circle':
      d = circleToPath(node.attributes);
      break;
    case 'ellipse':
      d = ellipseToPath(node.attributes);
      break;
    case 'line':
      d = lineToPath(node.attributes);
      break;
    case 'polyline':
      d = polylineToPath(node.attributes, false);
      break;
    case 'polygon':
      d = polylineToPath(node.attributes, true);
      break;
  }

  if (d && d.trim()) {
    const transformed = applyMatrixToPath(d.trim(), currentTransform);
    const cleaned = removeClosedPathSpurs(transformed);
    const layerId = node.attributes['data-layer'] ?? node.attributes['id'] ?? undefined;
    paths.push({ d: cleaned, layerId, fill: currentFill });
  }

  for (const child of node.children ?? []) {
    walkTree(child, paths, currentTransform, currentFill);
  }
}

export async function parseSvg(svgContent: string): Promise<PathGeometry[]> {
  const node = parseSync(svgContent);
  const rootMatrix = computeRootMatrix(node.attributes);
  const paths: PathGeometry[] = [];
  // SVG spec: the initial value of the `fill` property is `#000000` (black).
  // Shapes that don't explicitly set fill="none" will inherit this default.
  walkTree(node, paths, rootMatrix, '#000000');
  return paths;
}
