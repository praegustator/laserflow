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
    expect(gcode).toContain('M3');
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
    expect(gcode).toContain('M4');
    expect(gcode).toContain('S500'); // 50% of 1000
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

    expect(gcode).toContain('M3');
    expect(gcode).toContain('M4');

    // Verify each operation only processes its own layer's path.
    // cut-op targets layer1 (L 10 0 → X10.000) and must appear before M4.
    // engrave-op targets layer2 (L 50 0 → X50.000) and must appear after M4.
    const m3Index = gcode.indexOf('M3');
    const m4Index = gcode.indexOf('M4');
    const x10Index = gcode.indexOf('X10.000');
    const x50Index = gcode.indexOf('X50.000');

    expect(x10Index).toBeGreaterThan(m3Index);
    expect(x10Index).toBeLessThan(m4Index);
    expect(x50Index).toBeGreaterThan(m4Index);
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
      return [parseFloat(xm![1]), parseFloat(ym![1])];
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
});
