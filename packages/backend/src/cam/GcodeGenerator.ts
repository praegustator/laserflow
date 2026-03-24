import { SVGPathData } from 'svg-pathdata';
import type { PathGeometry, Operation, MachineProfile } from '../types/index.js';

function fmt(n: number): string {
  return n.toFixed(3);
}

function cubicBezierPoints(
  x0: number, y0: number,
  x1: number, y1: number,
  x2: number, y2: number,
  x3: number, y3: number,
  segments: number
): Array<[number, number]> {
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
  segments: number
): Array<[number, number]> {
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

function pathToGcode(d: string, feedRate: number, sValue: number): string {
  const lines: string[] = [];
  const pathData = new SVGPathData(d).toAbs().normalizeHVZ();
  const commands = pathData.commands;

  let startX = 0;
  let startY = 0;
  let curX = 0;
  let curY = 0;

  for (const cmd of commands) {
    switch (cmd.type) {
      case SVGPathData.MOVE_TO: {
        lines.push(`G0 X${fmt(cmd.x)} Y${fmt(cmd.y)} S0`);
        startX = cmd.x;
        startY = cmd.y;
        curX = cmd.x;
        curY = cmd.y;
        break;
      }
      case SVGPathData.LINE_TO: {
        lines.push(`G1 X${fmt(cmd.x)} Y${fmt(cmd.y)} F${feedRate} S${sValue}`);
        curX = cmd.x;
        curY = cmd.y;
        break;
      }
      case SVGPathData.CURVE_TO: {
        const pts = cubicBezierPoints(curX, curY, cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.x, cmd.y, 10);
        for (const [px, py] of pts) {
          lines.push(`G1 X${fmt(px)} Y${fmt(py)} F${feedRate} S${sValue}`);
        }
        curX = cmd.x;
        curY = cmd.y;
        break;
      }
      case SVGPathData.QUAD_TO: {
        const pts = quadraticBezierPoints(curX, curY, cmd.x1, cmd.y1, cmd.x, cmd.y, 10);
        for (const [px, py] of pts) {
          lines.push(`G1 X${fmt(px)} Y${fmt(py)} F${feedRate} S${sValue}`);
        }
        curX = cmd.x;
        curY = cmd.y;
        break;
      }
      case SVGPathData.CLOSE_PATH: {
        lines.push(`G1 X${fmt(startX)} Y${fmt(startY)} F${feedRate} S${sValue}`);
        curX = startX;
        curY = startY;
        break;
      }
    }
  }

  return lines.join('\n');
}

export function generateGcode(
  geometry: PathGeometry[],
  operations: Operation[],
  profile: MachineProfile
): string {
  const lines: string[] = [];

  lines.push('; LaserFlow G-code');
  lines.push('G21');
  lines.push('G90');
  lines.push('G0 X0 Y0');
  lines.push('');

  for (const op of operations) {
    if (op.type === 'ignore') continue;

    const sValue = Math.round((op.power / 100) * profile.maxSpindleSpeed);
    const laserMode = op.type === 'cut' ? 'M3' : 'M4';

    lines.push(`; Operation: ${op.id} type=${op.type} power=${op.power}% feed=${op.feedRate}`);
    lines.push(laserMode);
    lines.push('');

    for (let pass = 1; pass <= op.passes; pass++) {
      lines.push(`; Pass ${pass}`);
      for (const geo of geometry) {
        const pathGcode = pathToGcode(geo.d, op.feedRate, sValue);
        lines.push(pathGcode);
      }
      lines.push('');
    }

    lines.push('M5');
    lines.push('');
  }

  lines.push('M5');
  lines.push('G0 X0 Y0');
  lines.push('; End');

  return lines.join('\n');
}
