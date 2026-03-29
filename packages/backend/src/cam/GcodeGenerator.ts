import { SVGPathData, SVGPathDataTransformer } from 'svg-pathdata';
import type { PathGeometry, Operation, MachineProfile } from '../types/index.js';

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
  const hex = fill.trim();
  let r: number, g: number, b: number;
  if (/^#[0-9a-f]{6}$/i.test(hex)) {
    r = parseInt(hex.slice(1, 3), 16);
    g = parseInt(hex.slice(3, 5), 16);
    b = parseInt(hex.slice(5, 7), 16);
  } else if (/^#[0-9a-f]{3}$/i.test(hex)) {
    r = parseInt(hex[1] + hex[1], 16);
    g = parseInt(hex[2] + hex[2], 16);
    b = parseInt(hex[3] + hex[3], 16);
  } else {
    return null;
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

  const lines: string[] = [];
  let leftToRight = true;

  // Scan from minY to maxY, offset by half-interval to stay inside the shape
  for (let scanY = minY + lineInterval / 2; scanY <= maxY - lineInterval / 2 + 1e-9; scanY += lineInterval) {
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

export function generateGcode(
  geometry: PathGeometry[],
  operations: Operation[],
  profile: MachineProfile,
  layerTransforms?: Record<string, PathTransform>,
  originFlip?: boolean,
  workH?: number
): string {
  const lines: string[] = [];

  lines.push('; LaserFlow G-code');
  lines.push('G21');
  lines.push('G90');
  lines.push('G0 X0 Y0 S0');
  lines.push('');

  for (const op of operations) {
    if (op.type === 'ignore') continue;

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

        // For engrave operations, filled shapes get hatch-fill scan lines.
        // The S value is scaled by the fill shade: darker = more power,
        // lighter = less.  fill="none" shapes (fill === undefined) are
        // skipped — they have no interior to raster.
        if (op.type === 'engrave' && geo.fill && geo.fill !== 'none') {
          const interval = op.engraveLineInterval ?? 0.1;
          const angle = op.engraveLineAngle ?? 0;
          // Scale power by shade brightness (black = full power, white = 0)
          const brightness = fillBrightness(geo.fill);
          const shadeSValue = brightness !== null
            ? Math.round(sValue * (1 - brightness))
            : sValue;
          const hatchGcode = hatchFillToGcode(geo.d, op.feedRate, shadeSValue, interval, angle, transform);
          if (hatchGcode) lines.push(hatchGcode);
        }

        // Always trace the outline (cut or engrave)
        const pathGcode = pathToGcode(geo.d, op.feedRate, sValue, transform);
        lines.push(pathGcode);
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
