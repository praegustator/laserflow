import { describe, it, expect } from 'vitest';
import { generateGcode } from '../../src/cam/GcodeGenerator.js';
import type { PathGeometry, Operation, MachineProfile } from '../../src/types/index.js';

const defaultProfile: MachineProfile = {
  id: 'test',
  name: 'Test Machine',
  workArea: { x: 400, y: 400 },
  maxFeedRate: { x: 8000, y: 8000 },
  maxSpindleSpeed: 1000,
  homingEnabled: false,
};

describe('GcodeGenerator', () => {
  it('generates header and footer', () => {
    const gcode = generateGcode([], [], defaultProfile);
    expect(gcode).toContain('G21');
    expect(gcode).toContain('G90');
    expect(gcode).toContain('M5');
  });

  it('generates cut operation for a simple line path', () => {
    const geometry: PathGeometry[] = [{ d: 'M 0 0 L 100 0' }];
    const operations: Operation[] = [{
      id: 'op1',
      type: 'cut',
      feedRate: 600,
      power: 80,
      passes: 1,
    }];
    const gcode = generateGcode(geometry, operations, defaultProfile);
    expect(gcode).toContain('M3 S0');
    expect(gcode).toContain('G1');
    expect(gcode).toContain('F600');
    expect(gcode).toContain('S800'); // 80% of 1000
  });

  it('generates engrave operation with M4', () => {
    const geometry: PathGeometry[] = [{ d: 'M 0 0 L 50 50' }];
    const operations: Operation[] = [{
      id: 'op2',
      type: 'engrave',
      feedRate: 3000,
      power: 50,
      passes: 1,
    }];
    const gcode = generateGcode(geometry, operations, defaultProfile);
    expect(gcode).toContain('M4 S0');
    expect(gcode).toContain('S500'); // 50% of 1000
  });

  it('includes S parameter on all G0 and M3/M4 lines for GRBL compatibility', () => {
    const geometry: PathGeometry[] = [{ d: 'M 0 0 L 100 0' }];
    const operations: Operation[] = [{
      id: 'grbl-compat',
      type: 'cut',
      feedRate: 600,
      power: 80,
      passes: 1,
    }];
    const gcode = generateGcode(geometry, operations, defaultProfile);
    const lines = gcode.split('\n');

    // Every G0 line must include S parameter
    const g0Lines = lines.filter(l => l.startsWith('G0'));
    for (const line of g0Lines) {
      expect(line).toMatch(/S\d+/);
    }

    // Every M3/M4 line must include S parameter
    const mLines = lines.filter(l => /^M[34]/.test(l));
    for (const line of mLines) {
      expect(line).toMatch(/S\d+/);
    }
  });

  it('ignores operations with type ignore', () => {
    const geometry: PathGeometry[] = [{ d: 'M 0 0 L 100 0' }];
    const operations: Operation[] = [{
      id: 'op3',
      type: 'ignore',
      feedRate: 600,
      power: 80,
      passes: 1,
    }];
    const gcode = generateGcode(geometry, operations, defaultProfile);
    expect(gcode).not.toContain('M3');
    expect(gcode).not.toContain('M4');
  });

  it('repeats path for multiple passes', () => {
    const geometry: PathGeometry[] = [{ d: 'M 0 0 L 10 0' }];
    const operations: Operation[] = [{
      id: 'op4',
      type: 'cut',
      feedRate: 300,
      power: 100,
      passes: 3,
    }];
    const gcode = generateGcode(geometry, operations, defaultProfile);
    const passMatches = gcode.match(/; Pass \d+/g);
    expect(passMatches).toHaveLength(3);
  });

  it('filters geometry by layerIds when specified on an operation', () => {
    // Two layers: layer1 (cut path at X=10) and layer2 (engrave path at X=50)
    const geometry: PathGeometry[] = [
      { d: 'M 0 0 L 10 0', layerId: 'layer1' },
      { d: 'M 0 0 L 50 0', layerId: 'layer2' },
    ];
    const operations: Operation[] = [
      { id: 'cut-op', type: 'cut', feedRate: 600, power: 80, passes: 1, layerIds: ['layer1'] },
      { id: 'engrave-op', type: 'engrave', feedRate: 3000, power: 50, passes: 1, layerIds: ['layer2'] },
    ];

    const gcode = generateGcode(geometry, operations, defaultProfile);

    expect(gcode).toContain('M3 S0');
    expect(gcode).toContain('M4 S0');

    // Verify each operation only processes its own layer's path.
    // cut-op targets layer1 (L 10 0 → X10.000) and must appear before M4.
    // engrave-op targets layer2 (L 50 0 → X50.000) and must appear after M4.
    const m3Index = gcode.indexOf('M3 S0');
    const m4Index = gcode.indexOf('M4 S0');
    const x10Index = gcode.indexOf('X10.000');
    const x50Index = gcode.indexOf('X50.000');

    expect(x10Index).toBeGreaterThan(m3Index);
    expect(x10Index).toBeLessThan(m4Index);
    expect(x50Index).toBeGreaterThan(m4Index);
  });

  it('does not duplicate geometry when two operations share a layer', () => {
    // Both operations reference layer1.  The caller must supply geometry for
    // layer1 only once; the generator should process it once per operation.
    const geometry: PathGeometry[] = [
      { d: 'M 0 0 L 10 0', layerId: 'layer1' },
    ];
    const operations: Operation[] = [
      { id: 'op-a', type: 'cut', feedRate: 600, power: 80, passes: 1, layerIds: ['layer1'] },
      { id: 'op-b', type: 'cut', feedRate: 600, power: 80, passes: 1, layerIds: ['layer1'] },
    ];

    const gcode = generateGcode(geometry, operations, defaultProfile);

    // Each operation should produce exactly 1 pass comment and 1 G1 cut line
    // for the single geometry entry.  Total: 2 passes, 2 cut segments.
    const passMatches = gcode.match(/; Pass \d+/g);
    expect(passMatches).toHaveLength(2); // one pass per operation

    const g1Lines = gcode.split('\n').filter(l => l.trimStart().startsWith('G1'));
    expect(g1Lines).toHaveLength(2); // one cut line per operation
  });

  it('processes all geometry when operation has no layerIds (backward compat)', () => {
    const geometry: PathGeometry[] = [
      { d: 'M 0 0 L 10 0', layerId: 'layer1' },
      { d: 'M 0 0 L 50 0', layerId: 'layer2' },
    ];
    const operations: Operation[] = [{
      id: 'op-all',
      type: 'cut',
      feedRate: 600,
      power: 80,
      passes: 1,
      // no layerIds — should process all geometry
    }];

    const gcode = generateGcode(geometry, operations, defaultProfile);

    expect(gcode).toContain('X10.000');
    expect(gcode).toContain('X50.000');
  });

  it('converts arc commands (circles) into G1 moves', () => {
    // Circle: center (50,50), radius 50 — uses SVG arc commands
    const circlePath = 'M 0 50 A 50 50 0 1 0 100 50 A 50 50 0 1 0 0 50 Z';
    const geometry: PathGeometry[] = [{ d: circlePath }];
    const operations: Operation[] = [{
      id: 'arc-op',
      type: 'cut',
      feedRate: 600,
      power: 100,
      passes: 1,
    }];

    const gcode = generateGcode(geometry, operations, defaultProfile);
    const g1Lines = gcode.split('\n').filter(l => l.startsWith('G1'));

    // Arcs must be linearized into many G1 segments (not dropped)
    expect(g1Lines.length).toBeGreaterThan(10);

    // The linearized circle should pass through roughly (50,0) — the top — and (50,100) — the bottom
    const coords = g1Lines.map(l => {
      const xm = l.match(/X([\d.-]+)/);
      const ym = l.match(/Y([\d.-]+)/);
      return [parseFloat(xm?.[1] ?? '0'), parseFloat(ym?.[1] ?? '0')];
    });
    const nearTop = coords.some(([x, y]) => Math.abs(x - 50) < 2 && Math.abs(y - 0) < 2);
    const nearBottom = coords.some(([x, y]) => Math.abs(x - 50) < 2 && Math.abs(y - 100) < 2);
    expect(nearTop).toBe(true);
    expect(nearBottom).toBe(true);
  });

  it('uses more segments for larger curves than for smaller ones', () => {
    // Small curve (~5mm span)
    const smallCurve = 'M 0 0 C 1 2 4 3 5 0';
    // Large curve (~200mm span)
    const largeCurve = 'M 0 0 C 50 100 150 100 200 0';

    const makeGcode = (d: string) => {
      const geometry: PathGeometry[] = [{ d }];
      const ops: Operation[] = [{ id: 'op', type: 'cut', feedRate: 600, power: 100, passes: 1 }];
      return generateGcode(geometry, ops, defaultProfile);
    };

    const smallG1 = makeGcode(smallCurve).split('\n').filter(l => l.startsWith('G1')).length;
    const largeG1 = makeGcode(largeCurve).split('\n').filter(l => l.startsWith('G1')).length;

    // Larger curves should produce more segments
    expect(largeG1).toBeGreaterThan(smallG1);
  });

  it('produces more segments when layer transform scales up', () => {
    // A curve linearized at scale=1 should have fewer G1 segments than the
    // same curve linearized at scale=3, because the output tolerance is
    // applied in mm (post-transform) space.
    const curvePath = 'M 0 0 C 10 20 30 20 40 0';
    const ops: Operation[] = [{ id: 'op', type: 'cut', feedRate: 600, power: 100, passes: 1 }];

    // scale=1
    const geo1: PathGeometry[] = [{ d: curvePath, layerId: 'L' }];
    const t1 = { L: { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1 } };
    const g1Count = generateGcode(geo1, ops, defaultProfile, t1)
      .split('\n').filter(l => l.startsWith('G1')).length;

    // scale=3
    const t3 = { L: { offsetX: 0, offsetY: 0, scaleX: 3, scaleY: 3 } };
    const g3Count = generateGcode(geo1, ops, defaultProfile, t3)
      .split('\n').filter(l => l.startsWith('G1')).length;

    // 3× scale must produce roughly 3× the segments
    expect(g3Count).toBeGreaterThan(g1Count * 2);
  });

  it('keeps maximum output segment length within tolerance', () => {
    // Circle linearized with a scale=2 transform.  Every consecutive pair of
    // output G1 points must be ≤ 0.15 mm apart (CURVE_TOLERANCE = 0.1 plus a
    // small margin for parametric non-uniformity).
    const circlePath = 'M 0 50 A 50 50 0 1 0 100 50 A 50 50 0 1 0 0 50 Z';
    const ops: Operation[] = [{ id: 'op', type: 'cut', feedRate: 600, power: 100, passes: 1 }];
    const geo: PathGeometry[] = [{ d: circlePath, layerId: 'L' }];
    const t = { L: { offsetX: 0, offsetY: 0, scaleX: 2, scaleY: 2 } };

    const gcode = generateGcode(geo, ops, defaultProfile, t);
    const coords = gcode.split('\n')
      .filter(l => l.startsWith('G1'))
      .map(l => {
        const xm = l.match(/X([\d.-]+)/);
        const ym = l.match(/Y([\d.-]+)/);
        return [parseFloat(xm?.[1] ?? '0'), parseFloat(ym?.[1] ?? '0')];
      });

    let maxDist = 0;
    for (let i = 1; i < coords.length; i++) {
      const d = Math.hypot(coords[i][0] - coords[i - 1][0], coords[i][1] - coords[i - 1][1]);
      if (d > maxDist) maxDist = d;
    }

    expect(maxDist).toBeLessThan(0.15);
  });

  it('flips Y coordinates when originFlip is true and workH is provided', () => {
    // A simple line at Y=30 in SVG space should be at Y=170 in machine space
    // when workH=200 and originFlip=true (bottom-left origin).
    const geometry: PathGeometry[] = [{ d: 'M 10 30 L 50 30' }];
    const operations: Operation[] = [{
      id: 'flip-op',
      type: 'cut',
      feedRate: 600,
      power: 100,
      passes: 1,
    }];
    const gcode = generateGcode(geometry, operations, defaultProfile, undefined, true, 200);

    // Y should be flipped: 200 - 30 = 170
    expect(gcode).toContain('Y170.000');
    // X should remain unchanged
    expect(gcode).toContain('X10.000');
    expect(gcode).toContain('X50.000');
  });

  it('does not flip Y when originFlip is false', () => {
    const geometry: PathGeometry[] = [{ d: 'M 10 30 L 50 30' }];
    const operations: Operation[] = [{
      id: 'no-flip-op',
      type: 'cut',
      feedRate: 600,
      power: 100,
      passes: 1,
    }];
    const gcode = generateGcode(geometry, operations, defaultProfile, undefined, false, 200);

    // Y should NOT be flipped
    expect(gcode).toContain('Y30.000');
  });

  it('flips Y with layer transforms when originFlip is true', () => {
    const geometry: PathGeometry[] = [{ d: 'M 0 0 L 10 0', layerId: 'L1' }];
    const operations: Operation[] = [{
      id: 'transform-flip',
      type: 'cut',
      feedRate: 600,
      power: 100,
      passes: 1,
      layerIds: ['L1'],
    }];
    const transforms = { L1: { offsetX: 5, offsetY: 10, scaleX: 1, scaleY: 1 } };
    const gcode = generateGcode(geometry, operations, defaultProfile, transforms, true, 200);

    // With transform: Y = offsetY + 0 * scaleY = 10, then flip: 200 - 10 = 190
    expect(gcode).toContain('Y190.000');
    // X = offsetX + 0 * scaleX = 5
    expect(gcode).toContain('X5.000');
  });
});
