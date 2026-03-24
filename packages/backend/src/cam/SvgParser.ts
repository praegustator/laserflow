import { parseSync } from 'svgson';
import type { INode } from 'svgson';
import type { PathGeometry } from '../types/index.js';

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

function walkTree(node: INode, paths: PathGeometry[]): void {
  const tag = node.name.toLowerCase();

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
    const layerId = node.attributes['data-layer'] ?? node.attributes['id'] ?? undefined;
    paths.push({ d: d.trim(), layerId });
  }

  for (const child of node.children ?? []) {
    walkTree(child, paths);
  }
}

export async function parseSvg(svgContent: string): Promise<PathGeometry[]> {
  const node = parseSync(svgContent);
  const paths: PathGeometry[] = [];
  walkTree(node, paths);
  return paths;
}
