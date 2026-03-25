import { SVGPathData, SVGPathDataTransformer } from 'svg-pathdata';
import type { PathGeometry, Shape } from '../types';

export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

/* ── Helpers for tight Bézier bounding boxes ────────────────────────── */

/** Evaluate a cubic Bézier at parameter t. */
function cubicAt(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const mt = 1 - t;
  return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3;
}

/** Evaluate a quadratic Bézier at parameter t. */
function quadAt(p0: number, p1: number, p2: number, t: number): number {
  const mt = 1 - t;
  return mt * mt * p0 + 2 * mt * t * p1 + t * t * p2;
}

/**
 * Find the t-values where the derivative of a cubic Bézier is zero (extrema).
 * Returns only roots in (0, 1).
 */
function cubicExtrema(p0: number, p1: number, p2: number, p3: number): number[] {
  // B'(t) = at² + bt + c  where
  const a = -p0 + 3 * p1 - 3 * p2 + p3;
  const b = 2 * (p0 - 2 * p1 + p2);
  const c = -p0 + p1;
  const roots: number[] = [];

  if (Math.abs(a) < 1e-12) {
    // Linear: bt + c = 0
    if (Math.abs(b) > 1e-12) {
      const t = -c / b;
      if (t > 0 && t < 1) roots.push(t);
    }
  } else {
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const sq = Math.sqrt(disc);
      const t1 = (-b + sq) / (2 * a);
      const t2 = (-b - sq) / (2 * a);
      if (t1 > 0 && t1 < 1) roots.push(t1);
      if (t2 > 0 && t2 < 1) roots.push(t2);
    }
  }
  return roots;
}

/**
 * Find the t-value where the derivative of a quadratic Bézier is zero.
 * Returns only roots in (0, 1).
 */
function quadExtrema(p0: number, p1: number, p2: number): number[] {
  const denom = p0 - 2 * p1 + p2;
  if (Math.abs(denom) < 1e-12) return [];
  const t = (p0 - p1) / denom;
  return t > 0 && t < 1 ? [t] : [];
}

/** Expand min/max with a value */
function expand(val: number, box: { min: number; max: number }) {
  if (val < box.min) box.min = val;
  if (val > box.max) box.max = val;
}

/**
 * Compute the bounding box by properly parsing SVG path data into absolute
 * coordinates and finding tight bounds for Bézier curves by solving for
 * extrema rather than using control-point hulls.
 */
function bboxFromPaths(paths: string[]): BBox | null {
  const bx = { min: Infinity, max: -Infinity };
  const by = { min: Infinity, max: -Infinity };

  for (const d of paths) {
    let pathData: SVGPathData;
    try {
      // Convert arcs → cubics, smooth curves → regular, then absolute + normalise
      pathData = new SVGPathData(d)
        .toAbs()
        .normalizeHVZ()
        .transform(SVGPathDataTransformer.NORMALIZE_ST())
        .transform(SVGPathDataTransformer.A_TO_C());
    } catch {
      continue;
    }

    let curX = 0;
    let curY = 0;

    for (const cmd of pathData.commands) {
      const type: number = cmd.type;

      // MOVE_TO (2) or LINE_TO (4 / 8 / 16) – endpoint only
      if (type === SVGPathData.MOVE_TO || type === SVGPathData.LINE_TO) {
        const { x, y } = cmd as { x: number; y: number };
        expand(x, bx);
        expand(y, by);
        curX = x;
        curY = y;
        continue;
      }

      // CUBIC CURVE_TO (type 8 in some builds, we also check by property)
      if ('x1' in cmd && 'y1' in cmd && 'x2' in cmd && 'y2' in cmd && 'x' in cmd && 'y' in cmd) {
        const c = cmd as { x1: number; y1: number; x2: number; y2: number; x: number; y: number };
        // Start and end points are always on the curve
        expand(curX, bx);
        expand(curY, by);
        expand(c.x, bx);
        expand(c.y, by);
        // Find extrema
        for (const t of cubicExtrema(curX, c.x1, c.x2, c.x)) {
          expand(cubicAt(curX, c.x1, c.x2, c.x, t), bx);
        }
        for (const t of cubicExtrema(curY, c.y1, c.y2, c.y)) {
          expand(cubicAt(curY, c.y1, c.y2, c.y, t), by);
        }
        curX = c.x;
        curY = c.y;
        continue;
      }

      // QUADRATIC CURVE_TO
      if ('x1' in cmd && 'y1' in cmd && 'x' in cmd && 'y' in cmd && !('x2' in cmd)) {
        const c = cmd as { x1: number; y1: number; x: number; y: number };
        expand(curX, bx);
        expand(curY, by);
        expand(c.x, bx);
        expand(c.y, by);
        for (const t of quadExtrema(curX, c.x1, c.x)) {
          expand(quadAt(curX, c.x1, c.x, t), bx);
        }
        for (const t of quadExtrema(curY, c.y1, c.y)) {
          expand(quadAt(curY, c.y1, c.y, t), by);
        }
        curX = c.x;
        curY = c.y;
        continue;
      }

      // Fallback: any command with x/y endpoint
      if ('x' in cmd && 'y' in cmd) {
        const { x, y } = cmd as { x: number; y: number };
        if (Number.isFinite(x) && Number.isFinite(y)) {
          expand(x, bx);
          expand(y, by);
          curX = x;
          curY = y;
        }
      }
    }
  }

  if (!Number.isFinite(bx.min)) return null;
  return {
    minX: bx.min,
    minY: by.min,
    maxX: bx.max,
    maxY: by.max,
    width: bx.max - bx.min,
    height: by.max - by.min,
  };
}

/**
 * Compute the axis-aligned bounding box of an array of SVG path geometries.
 * This is a fast approximation — it extracts all numeric coordinate pairs
 * from the path data "d" string.
 */
export function computeBoundingBox(geometry: PathGeometry[]): BBox | null {
  return bboxFromPaths(geometry.map(g => g.d));
}

/** Compute bounding box from an array of Shape objects. */
export function computeShapesBoundingBox(shapes: Shape[]): BBox | null {
  return bboxFromPaths(shapes.map(s => s.d));
}
