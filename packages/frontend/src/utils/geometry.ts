import { SVGPathData } from 'svg-pathdata';
import type { PathGeometry, Shape } from '../types';

export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

/**
 * Compute the bounding box by properly parsing SVG path data into absolute
 * coordinates. Uses svg-pathdata to handle all command types (M, L, C, Q, A,
 * H, V, Z, and their relative variants) correctly.
 */
function bboxFromPaths(paths: string[]): BBox | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const d of paths) {
    let pathData: SVGPathData;
    try {
      pathData = new SVGPathData(d).toAbs().normalizeHVZ();
    } catch {
      continue;
    }

    for (const cmd of pathData.commands) {
      // MOVE_TO, LINE_TO – just x/y
      if ('x' in cmd && 'y' in cmd) {
        const { x, y } = cmd as { x: number; y: number };
        if (Number.isFinite(x) && Number.isFinite(y)) {
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        }
      }
      // CURVE_TO (cubic) – include control points
      if ('x1' in cmd && 'y1' in cmd) {
        const c = cmd as { x1: number; y1: number };
        if (Number.isFinite(c.x1) && Number.isFinite(c.y1)) {
          minX = Math.min(minX, c.x1);
          maxX = Math.max(maxX, c.x1);
          minY = Math.min(minY, c.y1);
          maxY = Math.max(maxY, c.y1);
        }
      }
      if ('x2' in cmd && 'y2' in cmd) {
        const c = cmd as { x2: number; y2: number };
        if (Number.isFinite(c.x2) && Number.isFinite(c.y2)) {
          minX = Math.min(minX, c.x2);
          maxX = Math.max(maxX, c.x2);
          minY = Math.min(minY, c.y2);
          maxY = Math.max(maxY, c.y2);
        }
      }
    }
  }

  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
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
