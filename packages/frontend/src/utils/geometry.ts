import type { PathGeometry, Shape } from '../types';

export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

function bboxFromPaths(paths: string[]): BBox | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const d of paths) {
    const nums = d.match(/-?\d+(?:\.\d+)?/g);
    if (!nums || nums.length < 2) continue;
    for (let i = 0; i < nums.length - 1; i += 2) {
      const x = Number(nums[i]);
      const y = Number(nums[i + 1]);
      if (Number.isFinite(x) && Number.isFinite(y)) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
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
