import { SVGPathData, SVGPathDataTransformer } from 'svg-pathdata';
import type { PathGeometry, Operation, MachineProfile } from '../types/index.js';
import type { RasterImage } from './ImageParser.js';

export interface PathTransform {
  offsetX: number;
  offsetY: number;
  scaleX: number;
  scaleY: number;
  flipY?: boolean;
  workH?: number;
}

const IDENTITY_TRANSFORM: PathTransform = { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1 };

/**
 * Parse a CSS hex colour (#RGB or #RRGGBB) and return the perceived
 * brightness as a 0-1 value (0 = black, 1 = white).  Returns `null` if
 * the colour string cannot be parsed.
 */
export function fillBrightness(fill: string | undefined): number | null {
  if (!fill) return null;
  const s = fill.trim();
  let r: number, g: number, b: number;
  if (/^#[0-9a-f]{6}$/i.test(s)) {
    r = parseInt(s.slice(1, 3), 16);
    g = parseInt(s.slice(3, 5), 16);
    b = parseInt(s.slice(5, 7), 16);
  } else if (/^#[0-9a-f]{3}$/i.test(s)) {
    r = parseInt(s[1] + s[1], 16);
    g = parseInt(s[2] + s[2], 16);
    b = parseInt(s[3] + s[3], 16);
  } else {
    // Try rgb(r, g, b) comma-separated or rgb(r g b) space-separated notation
    const rgbMatch = s.match(/^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i)
      ?? s.match(/^rgb\(\s*(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})\s*\)$/i);
    if (rgbMatch) {
      r = Math.min(255, parseInt(rgbMatch[1], 10));
      g = Math.min(255, parseInt(rgbMatch[2], 10));
      b = Math.min(255, parseInt(rgbMatch[3], 10));
    } else {
      return null;
    }
  }
  // ITU-R BT.601 luma
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

function applyTransform(x: number, y: number, t: PathTransform): [number, number] {
  const tx = t.offsetX + x * t.scaleX;
  let ty = t.offsetY + y * t.scaleY;
  // Y-flip converts from a top-left SVG coordinate system to bottom-left
  // machine coordinates: Y' = workH - Y. workH must be provided when flipY is true.
  if (t.flipY && t.workH !== undefined) {
    ty = t.workH - ty;
  }
  return [tx, ty];
}

function fmt(n: number): string {
  return n.toFixed(3);
}

/** Maximum distance (mm) between consecutive linearized points on a curve. */
const CURVE_TOLERANCE = 0.1;
const MIN_SEGMENTS = 2;

function adaptiveSegments(controlPolygonLength: number): number {
  return Math.max(MIN_SEGMENTS, Math.ceil(controlPolygonLength / CURVE_TOLERANCE));
}

function cubicBezierPoints(
  x0: number, y0: number,
  x1: number, y1: number,
  x2: number, y2: number,
  x3: number, y3: number,
  segments?: number
): Array<[number, number]> {
  if (segments === undefined) {
    const polyLen =
      Math.hypot(x1 - x0, y1 - y0) +
      Math.hypot(x2 - x1, y2 - y1) +
      Math.hypot(x3 - x2, y3 - y2);
    segments = adaptiveSegments(polyLen);
  }
  const pts: Array<[number, number]> = [];
  for (let i = 1; i <= segments; i++) {
    const t = i / segments;
    const mt = 1 - t;
    const x = mt * mt * mt * x0 + 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t * t * t * x3;
    const y = mt * mt * mt * y0 + 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t * y3;
    pts.push([x, y]);
  }
  return pts;
}

function quadraticBezierPoints(
  x0: number, y0: number,
  x1: number, y1: number,
  x2: number, y2: number,
  segments?: number
): Array<[number, number]> {
  if (segments === undefined) {
    const polyLen =
      Math.hypot(x1 - x0, y1 - y0) +
      Math.hypot(x2 - x1, y2 - y1);
    segments = adaptiveSegments(polyLen);
  }
  const pts: Array<[number, number]> = [];
  for (let i = 1; i <= segments; i++) {
    const t = i / segments;
    const mt = 1 - t;
    const x = mt * mt * x0 + 2 * mt * t * x1 + t * t * x2;
    const y = mt * mt * y0 + 2 * mt * t * y1 + t * t * y2;
    pts.push([x, y]);
  }
  return pts;
}

function pathToGcode(d: string, feedRate: number, sValue: number, transform: PathTransform = IDENTITY_TRANSFORM): string {
  const lines: string[] = [];
  const pathData = new SVGPathData(d)
    .toAbs()
    .normalizeHVZ()
    .transform(SVGPathDataTransformer.NORMALIZE_ST())
    .transform(SVGPathDataTransformer.A_TO_C());
  const commands = pathData.commands;

  // Scale factor so that the tolerance is applied in output (mm) space,
  // not in the raw SVG coordinate space.  Without this, curves that are
  // scaled up by the layer transform would keep the same segment count,
  // producing visibly rough output.
  const maxScale = Math.max(Math.abs(transform.scaleX), Math.abs(transform.scaleY)) || 1;

  let startX = 0;
  let startY = 0;
  let curX = 0;
  let curY = 0;

  for (const cmd of commands) {
    switch (cmd.type) {
      case SVGPathData.MOVE_TO: {
        const [mx, my] = applyTransform(cmd.x, cmd.y, transform);
        lines.push(`G0 X${fmt(mx)} Y${fmt(my)} S0`);
        startX = cmd.x;
        startY = cmd.y;
        curX = cmd.x;
        curY = cmd.y;
        break;
      }
      case SVGPathData.LINE_TO: {
        const [lx, ly] = applyTransform(cmd.x, cmd.y, transform);
        lines.push(`G1 X${fmt(lx)} Y${fmt(ly)} F${feedRate} S${sValue}`);
        curX = cmd.x;
        curY = cmd.y;
        break;
      }
      case SVGPathData.CURVE_TO: {
        const polyLen =
          Math.hypot(cmd.x1 - curX, cmd.y1 - curY) +
          Math.hypot(cmd.x2 - cmd.x1, cmd.y2 - cmd.y1) +
          Math.hypot(cmd.x - cmd.x2, cmd.y - cmd.y2);
        const segs = adaptiveSegments(polyLen * maxScale);
        const pts = cubicBezierPoints(curX, curY, cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.x, cmd.y, segs);
        for (const [px, py] of pts) {
          const [tx, ty] = applyTransform(px, py, transform);
          lines.push(`G1 X${fmt(tx)} Y${fmt(ty)} F${feedRate} S${sValue}`);
        }
        curX = cmd.x;
        curY = cmd.y;
        break;
      }
      case SVGPathData.QUAD_TO: {
        const polyLen =
          Math.hypot(cmd.x1 - curX, cmd.y1 - curY) +
          Math.hypot(cmd.x - cmd.x1, cmd.y - cmd.y1);
        const segs = adaptiveSegments(polyLen * maxScale);
        const pts = quadraticBezierPoints(curX, curY, cmd.x1, cmd.y1, cmd.x, cmd.y, segs);
        for (const [px, py] of pts) {
          const [tx, ty] = applyTransform(px, py, transform);
          lines.push(`G1 X${fmt(tx)} Y${fmt(ty)} F${feedRate} S${sValue}`);
        }
        curX = cmd.x;
        curY = cmd.y;
        break;
      }
      case SVGPathData.CLOSE_PATH: {
        const [cx, cy] = applyTransform(startX, startY, transform);
        lines.push(`G1 X${fmt(cx)} Y${fmt(cy)} F${feedRate} S${sValue}`);
        curX = startX;
        curY = startY;
        break;
      }
    }
  }

  return lines.join('\n');
}

/* ── Hatch-fill helpers (scan-line algorithm) ──────────────────────── */

/**
 * Linearize an SVG path into an array of polygon segments.
 * Each subpath produces a separate ring (array of [x, y] vertices).
 */
function linearizePathToPolygons(d: string): Array<Array<[number, number]>> {
  const pathData = new SVGPathData(d)
    .toAbs()
    .normalizeHVZ()
    .transform(SVGPathDataTransformer.NORMALIZE_ST())
    .transform(SVGPathDataTransformer.A_TO_C());
  const commands = pathData.commands;

  const polygons: Array<Array<[number, number]>> = [];
  let current: Array<[number, number]> = [];
  let curX = 0, curY = 0;
  let startX = 0, startY = 0;

  for (const cmd of commands) {
    switch (cmd.type) {
      case SVGPathData.MOVE_TO:
        if (current.length > 0) polygons.push(current);
        current = [[cmd.x, cmd.y]];
        startX = cmd.x; startY = cmd.y;
        curX = cmd.x; curY = cmd.y;
        break;
      case SVGPathData.LINE_TO:
        current.push([cmd.x, cmd.y]);
        curX = cmd.x; curY = cmd.y;
        break;
      case SVGPathData.CURVE_TO: {
        const polyLen =
          Math.hypot(cmd.x1 - curX, cmd.y1 - curY) +
          Math.hypot(cmd.x2 - cmd.x1, cmd.y2 - cmd.y1) +
          Math.hypot(cmd.x - cmd.x2, cmd.y - cmd.y2);
        const segs = adaptiveSegments(polyLen);
        const pts = cubicBezierPoints(curX, curY, cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.x, cmd.y, segs);
        for (const pt of pts) current.push(pt);
        curX = cmd.x; curY = cmd.y;
        break;
      }
      case SVGPathData.QUAD_TO: {
        const polyLen =
          Math.hypot(cmd.x1 - curX, cmd.y1 - curY) +
          Math.hypot(cmd.x - cmd.x1, cmd.y - cmd.y1);
        const segs = adaptiveSegments(polyLen);
        const pts = quadraticBezierPoints(curX, curY, cmd.x1, cmd.y1, cmd.x, cmd.y, segs);
        for (const pt of pts) current.push(pt);
        curX = cmd.x; curY = cmd.y;
        break;
      }
      case SVGPathData.CLOSE_PATH:
        current.push([startX, startY]);
        curX = startX; curY = startY;
        break;
    }
  }
  if (current.length > 0) polygons.push(current);
  return polygons;
}

/* ── Shared fill-pattern helpers ─────────────────────────────────────── */

/** Minimum cos(half-angle) before a corner is treated as "very sharp" in insetPolygon.
 *  cos(84°) ≈ 0.09 — angles narrower than ~6° use a clamped scale factor. */
const INSET_MIN_COS_HALF = 0.09;
/** Fallback scale factor for very sharp corners (< ~6°) to avoid exploding offsets. */
const INSET_SHARP_CORNER_SCALE = 11;

/** Points generated per full spiral revolution. Higher = smoother curve, more G-code lines. */
const SPIRAL_POINTS_PER_REVOLUTION = 100;

/** Length (mm) of the G1 laser-on move that forms each dot in the dots pattern.
 *  0.1 mm is short enough to look like a point but long enough to be accepted by all firmware. */
const DOT_PULSE_MM = 0.1;

/** Even-odd point-in-polygon test for a set of polygons. */
function pointInPolygons(x: number, y: number, polygons: Array<Array<[number, number]>>): boolean {
  let inside = false;
  for (const poly of polygons) {
    const n = poly.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = poly[i][0], yi = poly[i][1];
      const xj = poly[j][0], yj = poly[j][1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
  }
  return inside;
}

/** Shoelace signed area (positive = CCW in screen/SVG coordinates). */
function signedArea(pts: Array<[number, number]>): number {
  let area = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1];
  }
  return area / 2;
}

/**
 * Inset a polygon by `amount` using vertex bisectors.
 * Returns the new (open) polygon, or null if it degenerates.
 * Handles both CW and CCW winding by reading the signed area.
 */
function insetPolygon(poly: Array<[number, number]>, amount: number): Array<[number, number]> | null {
  // Strip duplicate closing point if present
  let pts = poly;
  if (pts.length >= 2) {
    const last = pts[pts.length - 1];
    if (Math.hypot(last[0] - pts[0][0], last[1] - pts[0][1]) < 1e-9) {
      pts = pts.slice(0, -1);
    }
  }
  const n = pts.length;
  if (n < 3) return null;

  const area = signedArea(pts);
  if (Math.abs(area) < 1e-10) return null;

  // CCW polygon (positive area in SVG coords): inward normal = left perpendicular of edge.
  // CW polygon: inward normal = right perpendicular. windingSign flips accordingly.
  const windingSign = area > 0 ? 1 : -1;

  const result: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n];
    const curr = pts[i];
    const next = pts[(i + 1) % n];

    const e1x = curr[0] - prev[0], e1y = curr[1] - prev[1];
    const e2x = next[0] - curr[0], e2y = next[1] - curr[1];
    const l1 = Math.hypot(e1x, e1y);
    const l2 = Math.hypot(e2x, e2y);

    if (l1 < 1e-10 || l2 < 1e-10) {
      result.push([curr[0], curr[1]]);
      continue;
    }

    // Inward unit normals (left perpendicular of edge for CCW polygon)
    const nx1 = windingSign * (-e1y / l1);
    const ny1 = windingSign * ( e1x / l1);
    const nx2 = windingSign * (-e2y / l2);
    const ny2 = windingSign * ( e2x / l2);

    // Bisector of the two inward normals
    const bx = nx1 + nx2, by = ny1 + ny2;
    const bl = Math.hypot(bx, by);

    if (bl < 1e-10) {
      // Anti-parallel normals (collinear edges back-to-back): use one normal directly
      result.push([curr[0] + nx1 * amount, curr[1] + ny1 * amount]);
      continue;
    }

    // Scale bisector so perpendicular distance to each edge equals `amount`
    const cosHalf = (nx1 * bx + ny1 * by) / bl;
    // Clamp to avoid exploding on very sharp corners (cosHalf → 0 means corner < ~6°)
    const scale = Math.abs(cosHalf) > INSET_MIN_COS_HALF ? amount / cosHalf : amount * INSET_SHARP_CORNER_SCALE;

    result.push([curr[0] + (bx / bl) * scale, curr[1] + (by / bl) * scale]);
  }

  // Reject degenerate or sign-reversed insets
  const newArea = signedArea(result);
  if (Math.abs(newArea) < 1e-6) return null;
  if (Math.sign(newArea) !== Math.sign(area)) return null;
  if (Math.abs(newArea) > Math.abs(area) * 1.05) return null; // growing → unstable

  return result;
}

/**
 * Generate hatch-fill G-code for a filled shape using a scan-line algorithm.
 * Returns G-code lines that raster-fill the interior of the shape.
 */
function hatchFillToGcode(
  d: string,
  feedRate: number,
  sValue: number,
  lineInterval: number,
  lineAngle: number,
  transform: PathTransform = IDENTITY_TRANSFORM,
): string {
  const polygons = linearizePathToPolygons(d);
  if (polygons.length === 0) return '';

  const radians = (lineAngle % 360) * Math.PI / 180;
  const cosA = Math.cos(-radians);
  const sinA = Math.sin(-radians);
  const cosR = Math.cos(radians);
  const sinR = Math.sin(radians);

  // Rotate all polygon points by -angle so we can do horizontal scan lines
  const rotated: Array<Array<[number, number]>> = polygons.map(poly =>
    poly.map(([x, y]) => [x * cosA - y * sinA, x * sinA + y * cosA])
  );

  // Compute bounding box of rotated polygons
  let minY = Infinity, maxY = -Infinity;
  for (const poly of rotated) {
    for (const [, y] of poly) {
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  // Collect all edges from all polygons
  const edges: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
  for (const poly of rotated) {
    for (let i = 0; i < poly.length - 1; i++) {
      edges.push({ x1: poly[i][0], y1: poly[i][1], x2: poly[i + 1][0], y2: poly[i + 1][1] });
    }
  }

  // The lineInterval is specified in world-space mm, but the polygon
  // coordinates are in layer space (before the transform).  Convert to
  // layer-space by dividing by the effective scale factor perpendicular to
  // the scan direction so the *physical* line spacing matches regardless of
  // how much the layer has been scaled.
  // Guard against degenerate zero-scale transforms to avoid division by zero.
  const sinAngle = Math.sin(radians);
  const cosAngle = Math.cos(radians);
  const effectiveScale = Math.sqrt(
    (transform.scaleX * sinAngle) ** 2 + (transform.scaleY * cosAngle) ** 2
  );
  const layerInterval = effectiveScale > 0 ? lineInterval / effectiveScale : lineInterval;

  const lines: string[] = [];
  let leftToRight = true;

  // Scan from minY to maxY, offset by half-interval to stay inside the shape
  for (let scanY = minY + layerInterval / 2; scanY <= maxY - layerInterval / 2 + 1e-9; scanY += layerInterval) {
    // Find all X-intersections with polygon edges at this scanY
    const intersections: number[] = [];
    for (const edge of edges) {
      const { x1, y1, x2, y2 } = edge;
      if ((y1 <= scanY && y2 > scanY) || (y2 <= scanY && y1 > scanY)) {
        const t = (scanY - y1) / (y2 - y1);
        intersections.push(x1 + t * (x2 - x1));
      }
    }

    intersections.sort((a, b) => a - b);

    // Apply even-odd fill rule: fill between pairs of intersections
    const pairs: Array<[number, number]> = [];
    for (let i = 0; i + 1 < intersections.length; i += 2) {
      pairs.push([intersections[i], intersections[i + 1]]);
    }

    // Alternate direction for efficient toolpath (serpentine)
    if (!leftToRight) pairs.reverse();

    for (const [xStart, xEnd] of pairs) {
      // Rotate back to original coordinate space
      const [sx, sy] = leftToRight
        ? [xStart * cosR - scanY * sinR, xStart * sinR + scanY * cosR]
        : [xEnd * cosR - scanY * sinR, xEnd * sinR + scanY * cosR];
      const [ex, ey] = leftToRight
        ? [xEnd * cosR - scanY * sinR, xEnd * sinR + scanY * cosR]
        : [xStart * cosR - scanY * sinR, xStart * sinR + scanY * cosR];

      // Apply layer transform
      const [tsx, tsy] = applyTransform(sx, sy, transform);
      const [tex, tey] = applyTransform(ex, ey, transform);

      lines.push(`G0 X${fmt(tsx)} Y${fmt(tsy)} S0`);
      lines.push(`G1 X${fmt(tex)} Y${fmt(tey)} F${feedRate} S${sValue}`);
    }

    leftToRight = !leftToRight;
  }

  return lines.join('\n');
}

/* ── Cross-hatch fill ─────────────────────────────────────────────────── */

/**
 * Two perpendicular hatch passes at `lineAngle` and `lineAngle + 90°`.
 * Setting `lineAngle` to 45 produces a classic diamond crosshatch.
 */
function crosshatchFillToGcode(
  d: string,
  feedRate: number,
  sValue: number,
  lineInterval: number,
  lineAngle: number,
  transform: PathTransform = IDENTITY_TRANSFORM,
): string {
  const pass1 = hatchFillToGcode(d, feedRate, sValue, lineInterval, lineAngle, transform);
  const pass2 = hatchFillToGcode(d, feedRate, sValue, lineInterval, lineAngle + 90, transform);
  return [pass1, pass2].filter(Boolean).join('\n');
}

/* ── Concentric fill ──────────────────────────────────────────────────── */

/**
 * Fill a shape with concentric inward-shrinking contours spaced by `lineInterval`.
 * Each shell is traced as a closed loop. Stops when the inset polygon degenerates.
 */
function concentricFillToGcode(
  d: string,
  feedRate: number,
  sValue: number,
  lineInterval: number,
  transform: PathTransform = IDENTITY_TRANSFORM,
): string {
  const polygons = linearizePathToPolygons(d);
  if (polygons.length === 0) return '';

  // Convert world-space lineInterval to layer space using geometric mean scale
  const geoScale = Math.sqrt(Math.abs(transform.scaleX * transform.scaleY));
  const layerInterval = geoScale > 0 ? lineInterval / geoScale : lineInterval;

  const lines: string[] = [];

  for (const poly of polygons) {
    let current: Array<[number, number]> = poly;

    while (current.length >= 3) {
      // Emit this shell as a closed loop
      const [fx, fy] = applyTransform(current[0][0], current[0][1], transform);
      lines.push(`G0 X${fmt(fx)} Y${fmt(fy)} S0`);
      for (let i = 1; i < current.length; i++) {
        const [tx, ty] = applyTransform(current[i][0], current[i][1], transform);
        lines.push(`G1 X${fmt(tx)} Y${fmt(ty)} F${feedRate} S${sValue}`);
      }
      // Close back to start
      lines.push(`G1 X${fmt(fx)} Y${fmt(fy)} F${feedRate} S${sValue}`);

      const inset = insetPolygon(current, layerInterval);
      if (!inset) break;
      current = inset;
    }
  }

  return lines.join('\n');
}

/* ── Spiral fill ──────────────────────────────────────────────────────── */

/**
 * Fill a shape with an Archimedean spiral radiating from the shape centroid.
 * The spiral is clipped to the shape interior using an even-odd point test.
 * `lineInterval` controls the spacing between successive spiral arms.
 */
function spiralFillToGcode(
  d: string,
  feedRate: number,
  sValue: number,
  lineInterval: number,
  transform: PathTransform = IDENTITY_TRANSFORM,
): string {
  const polygons = linearizePathToPolygons(d);
  if (polygons.length === 0) return '';

  // Bounding box and centroid
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const poly of polygons) {
    for (const [x, y] of poly) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const maxRadius = Math.hypot(maxX - minX, maxY - minY) / 2;

  // Convert world-space lineInterval to layer space
  const geoScale = Math.sqrt(Math.abs(transform.scaleX * transform.scaleY));
  const layerInterval = geoScale > 0 ? lineInterval / geoScale : lineInterval;

  // Archimedean spiral: r = b * θ, so after 2π radians r grows by layerInterval
  const b = layerInterval / (2 * Math.PI);
  // θ at which r = maxRadius
  const thetaMax = b > 0 ? maxRadius / b : 0;
  if (thetaMax <= 0) return '';

  // Angular step giving SPIRAL_POINTS_PER_REVOLUTION points per revolution for smooth curves
  const angularStep = (2 * Math.PI) / SPIRAL_POINTS_PER_REVOLUTION;

  const lines: string[] = [];
  let prevInside = false;

  // Spiral outward from centre
  for (let theta = angularStep; theta <= thetaMax + angularStep; theta += angularStep) {
    const r = b * Math.min(theta, thetaMax);
    const x = cx + r * Math.cos(theta);
    const y = cy + r * Math.sin(theta);
    const inside = pointInPolygons(x, y, polygons);

    const [tx, ty] = applyTransform(x, y, transform);
    if (inside && !prevInside) {
      lines.push(`G0 X${fmt(tx)} Y${fmt(ty)} S0`);
    } else if (inside) {
      lines.push(`G1 X${fmt(tx)} Y${fmt(ty)} F${feedRate} S${sValue}`);
    }
    prevInside = inside;
  }

  return lines.join('\n');
}

/* ── Dots fill ────────────────────────────────────────────────────────── */

/**
 * Fill a shape with a grid of laser-pulse dots spaced `lineInterval` apart.
 * The grid can be rotated by `lineAngle` degrees.
 * Each dot is a very short (0.1 mm) G1 move to keep firmware compatibility.
 */
function dotsFillToGcode(
  d: string,
  feedRate: number,
  sValue: number,
  lineInterval: number,
  lineAngle: number,
  transform: PathTransform = IDENTITY_TRANSFORM,
): string {
  const polygons = linearizePathToPolygons(d);
  if (polygons.length === 0) return '';

  const geoScale = Math.sqrt(Math.abs(transform.scaleX * transform.scaleY));
  const layerInterval = geoScale > 0 ? lineInterval / geoScale : lineInterval;

  // Bounding box
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const poly of polygons) {
    for (const [x, y] of poly) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const diag = Math.hypot(maxX - minX, maxY - minY);

  const radians = (lineAngle % 360) * Math.PI / 180;
  const cosA = Math.cos(radians), sinA = Math.sin(radians);

  const iMax = Math.ceil(diag / layerInterval) + 1;
  const lines: string[] = [];

  for (let i = -iMax; i <= iMax; i++) {
    for (let j = -iMax; j <= iMax; j++) {
      // Rotated grid point
      const gx = i * layerInterval;
      const gy = j * layerInterval;
      const x = cx + gx * cosA - gy * sinA;
      const y = cy + gx * sinA + gy * cosA;

      if (!pointInPolygons(x, y, polygons)) continue;

      const [tx, ty] = applyTransform(x, y, transform);
      // Move to dot centre with laser off, then short move with laser on
      lines.push(`G0 X${fmt(tx)} Y${fmt(ty)} S0`);
      lines.push(`G1 X${fmt(tx + DOT_PULSE_MM)} Y${fmt(ty)} F${feedRate} S${sValue}`);
    }
  }

  return lines.join('\n');
}

/* ── Raster image engraving ──────────────────────────────────────────── */

/**
 * Parse the bounding rectangle from an SVG path string.
 * Expects a rectangle path like `M x y L x+w y L x+w y+h L x y+h Z`.
 */
function parsePathBBox(d: string): { x: number; y: number; w: number; h: number } | null {
  try {
    const pathData = new SVGPathData(d).toAbs();
    const cmds = pathData.commands;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const cmd of cmds) {
      if ('x' in cmd && 'y' in cmd) {
        const x = cmd.x as number;
        const y = cmd.y as number;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
    if (!Number.isFinite(minX)) return null;
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  } catch {
    return null;
  }
}

/**
 * Generate G-code to raster-engrave an image.
 *
 * Each pixel row produces one scan line.  The S value for each pixel is
 * proportional to `(1 - brightness/255) * sValue`, so black pixels get
 * full power and white pixels get zero.
 *
 * Scan lines alternate direction (serpentine) for efficient toolpath.
 *
 * @param image     Decoded grayscale image
 * @param d         SVG path data defining the bounding rectangle of the image in layer space
 * @param feedRate  Feed rate for engraving moves (mm/min)
 * @param sValue    Maximum S value for this operation (already scaled by op power)
 * @param transform Layer transform to apply
 */
export function rasterImageToGcode(
  image: RasterImage,
  d: string,
  feedRate: number,
  sValue: number,
  transform: PathTransform = IDENTITY_TRANSFORM,
  lineInterval?: number,
): string {
  const bbox = parsePathBBox(d);
  if (!bbox || image.width === 0 || image.height === 0) return '';

  const lines: string[] = [];
  const pixelW = bbox.w / image.width;
  const pixelH = bbox.h / image.height;

  // When a lineInterval is provided, use it for scan line spacing so that
  // raster images are engraved with the same density as SVG hatch fills.
  // The interval is specified in world-space mm, but scan lines are computed
  // in layer space (before the transform is applied).  Divide by the Y scale
  // factor so that the *physical* line spacing matches the requested value
  // regardless of how much the layer has been scaled.
  // Note: if the interval is larger than the image height, numLines clamps to 1.
  // Guard against degenerate zero-scale transforms to avoid division by zero.
  const absScaleY = Math.abs(transform.scaleY);
  const layerInterval = lineInterval && lineInterval > 0
    ? (absScaleY > 0 ? lineInterval / absScaleY : lineInterval)
    : undefined;
  const effectiveInterval = layerInterval ?? pixelH;
  const numLines = Math.max(1, Math.round(bbox.h / effectiveInterval));
  const actualInterval = bbox.h / numLines;

  for (let lineIdx = 0; lineIdx < numLines; lineIdx++) {
    const leftToRight = lineIdx % 2 === 0;
    const y = bbox.y + (lineIdx + 0.5) * actualInterval;

    // When a custom lineInterval is used, multiple scan lines may map to the
    // same pixel row (interval < pixelH) or some rows may be skipped
    // (interval > pixelH).  We pick the nearest source row for each scan line.
    const row = Math.min(image.height - 1, Math.max(0, Math.floor((y - bbox.y) / pixelH)));
    const step = leftToRight ? 1 : -1;

    // Find the first and last non-white pixels in this row.
    // At this point all transparency has already been composited to white (brightness=255)
    // by ImageParser, so brightness=255 means "no engraving power needed" regardless
    // of whether the original pixel was white or transparent.
    // This lets us skip those margins entirely — the head jumps directly to the first
    // content pixel and stops after the last one, avoiding needless travel over edges.
    const rowOffset = row * image.width;
    let firstContentCol = -1;
    let lastContentCol = -1;
    for (let c = 0; c < image.width; c++) {
      if (image.pixels[rowOffset + c] < 255) {
        if (firstContentCol === -1) firstContentCol = c;
        lastContentCol = c;
      }
    }
    // Skip fully white rows (no power needed on any pixel)
    if (firstContentCol === -1) continue;

    // Adjust scan range to content extent only (skip leading & trailing whites)
    const scanStartCol = leftToRight ? firstContentCol : lastContentCol;
    const scanEndCol   = leftToRight ? lastContentCol + 1 : firstContentCol - 1; // exclusive sentinel

    // Move directly to first content pixel (skip leading transparent margin)
    const startX = bbox.x + (leftToRight ? firstContentCol : lastContentCol + 1) * pixelW;
    const [tsx, tsy] = applyTransform(startX, y, transform);
    lines.push(`G0 X${fmt(tsx)} Y${fmt(tsy)} S0`);

    // Engrave pixel by pixel — group consecutive pixels with the same
    // brightness into single G1 moves for efficiency.
    let col = scanStartCol;
    while (col !== scanEndCol) {
      const brightness = image.pixels[rowOffset + col];
      const pixelSValue = Math.round(sValue * (1 - brightness / 255));

      // Find run of consecutive pixels with same brightness
      let runEnd = col + step;
      while (runEnd !== scanEndCol && image.pixels[rowOffset + runEnd] === brightness) {
        runEnd += step;
      }

      // Emit G1 move to end of run
      const endX = bbox.x + ((leftToRight ? runEnd : runEnd + 1) * pixelW);
      const [tex, tey] = applyTransform(endX, y, transform);
      if (pixelSValue > 0) {
        lines.push(`G1 X${fmt(tex)} Y${fmt(tey)} F${feedRate} S${pixelSValue}`);
      } else {
        // Interior white pixels — rapid move with laser off (bridges to next content pixel)
        lines.push(`G0 X${fmt(tex)} Y${fmt(tey)} S0`);
      }
      col = runEnd;
    }
  }

  return lines.join('\n');
}

export async function generateGcode(
  geometry: PathGeometry[],
  operations: Operation[],
  profile: MachineProfile,
  layerTransforms?: Record<string, PathTransform>,
  originFlip?: boolean,
  workH?: number
): Promise<string> {
  const { decodeImageDataUrl } = await import('./ImageParser.js');
  const lines: string[] = [];

  lines.push('; LaserFlow G-code');
  lines.push('G21');
  lines.push('G90');
  lines.push('G0 X0 Y0 S0');
  lines.push('');

  for (const op of operations) {

    const sValue = Math.round((op.power / 100) * profile.maxSpindleSpeed);
    const laserMode = op.type === 'cut' ? 'M3' : 'M4';

    lines.push(`; Operation: ${op.id} type=${op.type} power=${op.power}% feed=${op.feedRate}`);
    lines.push(`${laserMode} S0`);
    lines.push('');

    // When layerIds are specified on the operation, only process geometry
    // whose layerId is in the operation's layerIds list. This ensures each
    // operation only cuts/engraves paths from its assigned layers.
    const opGeometry = op.layerIds && op.layerIds.length > 0
      ? geometry.filter(geo => geo.layerId !== undefined && op.layerIds!.includes(geo.layerId))
      : geometry;

    for (let pass = 1; pass <= op.passes; pass++) {
      lines.push(`; Pass ${pass}`);
      for (const geo of opGeometry) {
        let transform: PathTransform = IDENTITY_TRANSFORM;
        if (geo.layerId && layerTransforms?.[geo.layerId]) {
          transform = {
            ...layerTransforms[geo.layerId],
            flipY: originFlip,
            workH,
          };
        } else if (originFlip && workH !== undefined) {
          transform = { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1, flipY: true, workH };
        }

        // Raster image handling: images use pixel-based engraving for engrave
        // operations and only outline tracing for cut operations.
        if (geo.imageDataUrl) {
          if (op.type === 'engrave') {
            const image = await decodeImageDataUrl(geo.imageDataUrl);
            const rasterGcode = rasterImageToGcode(image, geo.d, op.feedRate, sValue, transform, op.engraveLineInterval);
            if (rasterGcode) lines.push(rasterGcode);
            // For engrave, only raster-scan the pixels — do NOT trace the bounding
            // rectangle outline, as that would burn an unwanted border around the image.
            continue;
          }
          // For cut: trace the bounding rectangle outline to cut the image out.
          const pathGcode = pathToGcode(geo.d, op.feedRate, sValue, transform);
          lines.push(pathGcode);
          continue;
        }

        // For engrave operations, filled shapes get pattern-fill scan lines.
        // The S value is scaled by the fill shade: darker = more power,
        // lighter = less.  fill="none" shapes (fill === undefined) are
        // skipped — they have no interior to raster.
        if (op.type === 'engrave' && geo.fill) {
          const interval = op.engraveLineInterval ?? 0.1;
          const angle = op.engraveLineAngle ?? 0;
          const pattern = op.engravePattern ?? 'lines';
          // Scale power by shade brightness (black = full power, white = 0)
          const brightness = fillBrightness(geo.fill);
          const shadeSValue = brightness !== null
            ? Math.round(sValue * (1 - brightness))
            : sValue;
          let fillGcode = '';
          switch (pattern) {
            case 'crosshatch':
              fillGcode = crosshatchFillToGcode(geo.d, op.feedRate, shadeSValue, interval, angle, transform);
              break;
            case 'concentric':
              fillGcode = concentricFillToGcode(geo.d, op.feedRate, shadeSValue, interval, transform);
              break;
            case 'spiral':
              fillGcode = spiralFillToGcode(geo.d, op.feedRate, shadeSValue, interval, transform);
              break;
            case 'dots':
              fillGcode = dotsFillToGcode(geo.d, op.feedRate, shadeSValue, interval, angle, transform);
              break;
            default:
              fillGcode = hatchFillToGcode(geo.d, op.feedRate, shadeSValue, interval, angle, transform);
          }
          if (fillGcode) lines.push(fillGcode);
        }

        // For engrave ops: filled shapes were hatch-filled above — skip the
        // outline to avoid burning an unwanted border around each shape.
        // For cut ops (or unfilled engrave shapes): always trace the outline.
        if (op.type !== 'engrave' || !geo.fill) {
          const pathGcode = pathToGcode(geo.d, op.feedRate, sValue, transform);
          lines.push(pathGcode);
        }
      }
      lines.push('');
    }

    lines.push('M5');
    lines.push('');
  }

  lines.push('M5');
  lines.push('G0 X0 Y0 S0');
  lines.push('; End');

  return lines.join('\n');
}
