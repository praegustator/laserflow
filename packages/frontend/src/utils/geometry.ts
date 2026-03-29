import { SVGPathData, SVGPathDataTransformer } from 'svg-pathdata';
import type { Layer, PathGeometry, Shape } from '../types';

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

      // CUBIC CURVE_TO
      if (type === SVGPathData.CURVE_TO) {
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
      if (type === SVGPathData.QUAD_TO) {
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

/* ── Layer transform helpers ─────────────────────────────────────────── */

/** 2×3 affine matrix [a, b, c, d, e, f] where x'=ax+cy+e, y'=bx+dy+f */
export type AffineMatrix = [number, number, number, number, number, number];

/**
 * Compute the affine matrix that maps a shape's natural coordinates to world
 * coordinates for a given layer. Accounts for offset, scale, mirror, rotation
 * and the pivot anchor.
 *
 * SVG transform order (right-to-left):
 *   translate(tx,ty) · rotate(θ, cx,cy) · scale(sx,sy)
 * where cx = sx*pivotX, cy = sy*pivotY.
 */
export function computeLayerMatrix(layer: Layer): AffineMatrix {
  const bbox = computeShapesBoundingBox(layer.shapes);
  const pivot = layer.pivot ?? 'tl';
  let pivotX = 0, pivotY = 0;
  if (bbox) {
    const col = pivot[1] === 'l' ? 0 : pivot[1] === 'c' ? 0.5 : 1;
    const row = pivot[0] === 't' ? 0 : pivot[0] === 'm' ? 0.5 : 1;
    pivotX = bbox.minX + bbox.width * col;
    pivotY = bbox.minY + bbox.height * row;
  }

  const mX = layer.mirrorX ?? false;
  const mY = layer.mirrorY ?? false;
  const sx = mX ? -layer.scaleX : layer.scaleX;
  const sy = mY ? -layer.scaleY : layer.scaleY;
  const tx = layer.offsetX;
  const ty = layer.offsetY;
  const theta = ((layer.rotation ?? 0) * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);

  // Pivot in scaled space
  const cx = sx * pivotX;
  const cy = sy * pivotY;

  // Matrix = T(tx,ty) · T(cx,cy) · R(θ) · T(-cx,-cy) · S(sx,sy)
  const a = cos * sx;
  const b = sin * sx;
  const c = -sin * sy;
  const d = cos * sy;
  const e = -cos * cx + sin * cy + cx + tx;
  const f = -sin * cx - cos * cy + cy + ty;

  return [a, b, c, d, e, f];
}

/**
 * Apply a 2×3 affine matrix to every coordinate in an SVG path string.
 * Returns the transformed path as a string.
 */
export function transformPath(pathD: string, [a, b, c, d, e, f]: AffineMatrix): string {
  try {
    return new SVGPathData(pathD)
      .toAbs()
      .transform(SVGPathDataTransformer.MATRIX(a, b, c, d, e, f))
      .encode();
  } catch {
    return pathD;
  }
}

/**
 * Bake a layer's transform (offset, scale, rotation, mirror) into all of its
 * shapes' path data, returning new shapes with transformed `d` strings.
 * After baking, the layer should have its transform reset to identity.
 */
export function bakeLayerTransform(layer: Layer): Shape[] {
  const matrix = computeLayerMatrix(layer);
  // If the matrix is already identity, skip the transform
  const [a, b, c, d, e, f] = matrix;
  const isIdentity =
    Math.abs(a - 1) < 1e-9 && Math.abs(b) < 1e-9 &&
    Math.abs(c) < 1e-9 && Math.abs(d - 1) < 1e-9 &&
    Math.abs(e) < 1e-9 && Math.abs(f) < 1e-9;
  if (isIdentity) return layer.shapes;

  return layer.shapes.map(shape => ({
    ...shape,
    d: transformPath(shape.d, matrix),
  }));
}

/**
 * Compute the world-space bounding box of a layer by transforming its natural
 * bounding-box corners through the layer matrix. For non-zero rotation, the
 * result is the axis-aligned enclosure of the rotated rectangle.
 */
export function computeLayerWorldBBox(layer: Layer): BBox | null {
  const bbox = computeShapesBoundingBox(layer.shapes);
  if (!bbox) return null;
  const m = computeLayerMatrix(layer);

  // Transform the 4 corners of the natural bbox
  const corners: [number, number][] = [
    [bbox.minX, bbox.minY],
    [bbox.maxX, bbox.minY],
    [bbox.maxX, bbox.maxY],
    [bbox.minX, bbox.maxY],
  ];

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of corners) {
    const wx = m[0] * x + m[2] * y + m[4];
    const wy = m[1] * x + m[3] * y + m[5];
    if (wx < minX) minX = wx;
    if (wy < minY) minY = wy;
    if (wx > maxX) maxX = wx;
    if (wy > maxY) maxY = wy;
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/**
 * Compute the combined world-space bounding box across multiple layers.
 */
export function computeMultiLayerWorldBBox(layers: Layer[]): BBox | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let found = false;
  for (const layer of layers) {
    const wb = computeLayerWorldBBox(layer);
    if (!wb) continue;
    found = true;
    if (wb.minX < minX) minX = wb.minX;
    if (wb.minY < minY) minY = wb.minY;
    if (wb.maxX > maxX) maxX = wb.maxX;
    if (wb.maxY > maxY) maxY = wb.maxY;
  }
  if (!found) return null;
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/**
 * Split a multi-subpath SVG path `d` string into individual subpath strings.
 * Each subpath starts with a MOVE_TO (M) command.
 * Returns an array with one entry per subpath; single-subpath paths return a one-element array.
 */
export function splitPathIntoSubpaths(d: string): string[] {
  try {
    const commands = new SVGPathData(d).toAbs().commands;
    const groups: (typeof commands)[] = [];
    let current: typeof commands = [];
    for (const cmd of commands) {
      if (cmd.type === SVGPathData.MOVE_TO && current.length > 0) {
        groups.push(current);
        current = [];
      }
      current.push(cmd);
    }
    if (current.length > 0) groups.push(current);
    return groups.map(cmds => SVGPathData.encode(cmds));
  } catch {
    return [d];
  }
}

/**
 * Get the world-space anchor point from a world bounding box and a PivotAnchor.
 */
export function worldAnchorPoint(bbox: BBox, anchor: PivotAnchor): { x: number; y: number } {
  const col = anchor[1] === 'l' ? 0 : anchor[1] === 'c' ? 0.5 : 1;
  const row = anchor[0] === 't' ? 0 : anchor[0] === 'm' ? 0.5 : 1;
  return {
    x: bbox.minX + bbox.width * col,
    y: bbox.minY + bbox.height * row,
  };
}

export function hasMultipleSubpaths(d: string): boolean {
  try {
    const commands = new SVGPathData(d).toAbs().commands;
    let moveCount = 0;
    for (const cmd of commands) {
      if (cmd.type === SVGPathData.MOVE_TO) {
        moveCount++;
        if (moveCount > 1) return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}
