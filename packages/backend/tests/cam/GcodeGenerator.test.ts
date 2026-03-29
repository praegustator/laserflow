import { describe, it, expect } from 'vitest';
import { generateGcode, fillBrightness } from '../../src/cam/GcodeGenerator.js';
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
  it('generates header and footer', async () => {
    const gcode = await generateGcode([], [], defaultProfile);
    expect(gcode).toContain('G21');
    expect(gcode).toContain('G90');
    expect(gcode).toContain('M5');
  });

  it('generates cut operation for a simple line path', async () => {
    const geometry: PathGeometry[] = [{ d: 'M 0 0 L 100 0' }];
    const operations: Operation[] = [{
      id: 'op1',
      type: 'cut',
      feedRate: 600,
      power: 80,
      passes: 1,
    }];
    const gcode = await generateGcode(geometry, operations, defaultProfile);
    expect(gcode).toContain('M3 S0');
    expect(gcode).toContain('G1');
    expect(gcode).toContain('F600');
    expect(gcode).toContain('S800'); // 80% of 1000
  });

  it('generates engrave operation with M4', async () => {
    const geometry: PathGeometry[] = [{ d: 'M 0 0 L 50 50' }];
    const operations: Operation[] = [{
      id: 'op2',
      type: 'engrave',
      feedRate: 3000,
      power: 50,
      passes: 1,
    }];
    const gcode = await generateGcode(geometry, operations, defaultProfile);
    expect(gcode).toContain('M4 S0');
    expect(gcode).toContain('S500'); // 50% of 1000
  });

  it('includes S parameter on all G0 and M3/M4 lines for GRBL compatibility', async () => {
    const geometry: PathGeometry[] = [{ d: 'M 0 0 L 100 0' }];
    const operations: Operation[] = [{
      id: 'grbl-compat',
      type: 'cut',
      feedRate: 600,
      power: 80,
      passes: 1,
    }];
    const gcode = await generateGcode(geometry, operations, defaultProfile);
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

  it('ignores operations with type ignore', async () => {
    const geometry: PathGeometry[] = [{ d: 'M 0 0 L 100 0' }];
    const operations: Operation[] = [{
      id: 'op3',
      type: 'ignore',
      feedRate: 600,
      power: 80,
      passes: 1,
    }];
    const gcode = await generateGcode(geometry, operations, defaultProfile);
    expect(gcode).not.toContain('M3');
    expect(gcode).not.toContain('M4');
  });

  it('repeats path for multiple passes', async () => {
    const geometry: PathGeometry[] = [{ d: 'M 0 0 L 10 0' }];
    const operations: Operation[] = [{
      id: 'op4',
      type: 'cut',
      feedRate: 300,
      power: 100,
      passes: 3,
    }];
    const gcode = await generateGcode(geometry, operations, defaultProfile);
    const passMatches = gcode.match(/; Pass \d+/g);
    expect(passMatches).toHaveLength(3);
  });

  it('filters geometry by layerIds when specified on an operation', async () => {
    // Two layers: layer1 (cut path at X=10) and layer2 (engrave path at X=50)
    const geometry: PathGeometry[] = [
      { d: 'M 0 0 L 10 0', layerId: 'layer1' },
      { d: 'M 0 0 L 50 0', layerId: 'layer2' },
    ];
    const operations: Operation[] = [
      { id: 'cut-op', type: 'cut', feedRate: 600, power: 80, passes: 1, layerIds: ['layer1'] },
      { id: 'engrave-op', type: 'engrave', feedRate: 3000, power: 50, passes: 1, layerIds: ['layer2'] },
    ];

    const gcode = await generateGcode(geometry, operations, defaultProfile);

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

  it('does not duplicate geometry when two operations share a layer', async () => {
    // Both operations reference layer1.  The caller must supply geometry for
    // layer1 only once; the generator should process it once per operation.
    const geometry: PathGeometry[] = [
      { d: 'M 0 0 L 10 0', layerId: 'layer1' },
    ];
    const operations: Operation[] = [
      { id: 'op-a', type: 'cut', feedRate: 600, power: 80, passes: 1, layerIds: ['layer1'] },
      { id: 'op-b', type: 'cut', feedRate: 600, power: 80, passes: 1, layerIds: ['layer1'] },
    ];

    const gcode = await generateGcode(geometry, operations, defaultProfile);

    // Each operation should produce exactly 1 pass comment and 1 G1 cut line
    // for the single geometry entry.  Total: 2 passes, 2 cut segments.
    const passMatches = gcode.match(/; Pass \d+/g);
    expect(passMatches).toHaveLength(2); // one pass per operation

    const g1Lines = gcode.split('\n').filter(l => l.trimStart().startsWith('G1'));
    expect(g1Lines).toHaveLength(2); // one cut line per operation
  });

  it('processes all geometry when operation has no layerIds (backward compat)', async () => {
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

    const gcode = await generateGcode(geometry, operations, defaultProfile);

    expect(gcode).toContain('X10.000');
    expect(gcode).toContain('X50.000');
  });

  it('converts arc commands (circles) into G1 moves', async () => {
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

    const gcode = await generateGcode(geometry, operations, defaultProfile);
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

  it('uses more segments for larger curves than for smaller ones', async () => {
    // Small curve (~5mm span)
    const smallCurve = 'M 0 0 C 1 2 4 3 5 0';
    // Large curve (~200mm span)
    const largeCurve = 'M 0 0 C 50 100 150 100 200 0';

    const makeGcode = async (d: string) => {
      const geometry: PathGeometry[] = [{ d }];
      const ops: Operation[] = [{ id: 'op', type: 'cut', feedRate: 600, power: 100, passes: 1 }];
      return await generateGcode(geometry, ops, defaultProfile);
    };

    const smallG1 = (await makeGcode(smallCurve)).split('\n').filter(l => l.startsWith('G1')).length;
    const largeG1 = (await makeGcode(largeCurve)).split('\n').filter(l => l.startsWith('G1')).length;

    // Larger curves should produce more segments
    expect(largeG1).toBeGreaterThan(smallG1);
  });

  it('produces more segments when layer transform scales up', async () => {
    // A curve linearized at scale=1 should have fewer G1 segments than the
    // same curve linearized at scale=3, because the output tolerance is
    // applied in mm (post-transform) space.
    const curvePath = 'M 0 0 C 10 20 30 20 40 0';
    const ops: Operation[] = [{ id: 'op', type: 'cut', feedRate: 600, power: 100, passes: 1 }];

    // scale=1
    const geo1: PathGeometry[] = [{ d: curvePath, layerId: 'L' }];
    const t1 = { L: { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1 } };
    const g1Count = (await generateGcode(geo1, ops, defaultProfile, t1))
      .split('\n').filter(l => l.startsWith('G1')).length;

    // scale=3
    const t3 = { L: { offsetX: 0, offsetY: 0, scaleX: 3, scaleY: 3 } };
    const g3Count = (await generateGcode(geo1, ops, defaultProfile, t3))
      .split('\n').filter(l => l.startsWith('G1')).length;

    // 3× scale must produce roughly 3× the segments
    expect(g3Count).toBeGreaterThan(g1Count * 2);
  });

  it('keeps maximum output segment length within tolerance', async () => {
    // Circle linearized with a scale=2 transform.  Every consecutive pair of
    // output G1 points must be ≤ 0.15 mm apart (CURVE_TOLERANCE = 0.1 plus a
    // small margin for parametric non-uniformity).
    const circlePath = 'M 0 50 A 50 50 0 1 0 100 50 A 50 50 0 1 0 0 50 Z';
    const ops: Operation[] = [{ id: 'op', type: 'cut', feedRate: 600, power: 100, passes: 1 }];
    const geo: PathGeometry[] = [{ d: circlePath, layerId: 'L' }];
    const t = { L: { offsetX: 0, offsetY: 0, scaleX: 2, scaleY: 2 } };

    const gcode = await generateGcode(geo, ops, defaultProfile, t);
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

  it('flips Y coordinates when originFlip is true and workH is provided', async () => {
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
    const gcode = await generateGcode(geometry, operations, defaultProfile, undefined, true, 200);

    // Y should be flipped: 200 - 30 = 170
    expect(gcode).toContain('Y170.000');
    // X should remain unchanged
    expect(gcode).toContain('X10.000');
    expect(gcode).toContain('X50.000');
  });

  it('does not flip Y when originFlip is false', async () => {
    const geometry: PathGeometry[] = [{ d: 'M 10 30 L 50 30' }];
    const operations: Operation[] = [{
      id: 'no-flip-op',
      type: 'cut',
      feedRate: 600,
      power: 100,
      passes: 1,
    }];
    const gcode = await generateGcode(geometry, operations, defaultProfile, undefined, false, 200);

    // Y should NOT be flipped
    expect(gcode).toContain('Y30.000');
  });

  it('flips Y with layer transforms when originFlip is true', async () => {
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
    const gcode = await generateGcode(geometry, operations, defaultProfile, transforms, true, 200);

    // With transform: Y = offsetY + 0 * scaleY = 10, then flip: 200 - 10 = 190
    expect(gcode).toContain('Y190.000');
    // X = offsetX + 0 * scaleX = 5
    expect(gcode).toContain('X5.000');
  });

  it('generates hatch-fill scan lines for filled shapes in engrave operations', async () => {
    // A simple filled square: 0,0 → 10,0 → 10,10 → 0,10 → Z
    const geometry: PathGeometry[] = [{
      d: 'M 0 0 L 10 0 L 10 10 L 0 10 Z',
      fill: '#999',
    }];
    const operations: Operation[] = [{
      id: 'engrave-fill',
      type: 'engrave',
      feedRate: 3000,
      power: 50,
      passes: 1,
      engraveLineInterval: 1, // 1mm spacing — should produce ~10 scan lines
    }];
    const gcode = await generateGcode(geometry, operations, defaultProfile);

    // Should contain M4 (engrave mode)
    expect(gcode).toContain('M4 S0');

    // Hatch lines appear as G1 moves.  With 1mm interval on a 10mm square
    // we expect roughly 9-10 scan lines, each producing one G1 segment.
    const g1Lines = gcode.split('\n').filter(l => l.startsWith('G1'));
    // At minimum we need the hatch lines plus the outline segments (4 sides)
    expect(g1Lines.length).toBeGreaterThan(10);
  });

  it('does NOT hatch-fill shapes without fill in engrave operations', async () => {
    // An unfilled square
    const geometry: PathGeometry[] = [{
      d: 'M 0 0 L 10 0 L 10 10 L 0 10 Z',
      // no fill property
    }];
    const operations: Operation[] = [{
      id: 'engrave-no-fill',
      type: 'engrave',
      feedRate: 3000,
      power: 50,
      passes: 1,
      engraveLineInterval: 1,
    }];
    const gcode = await generateGcode(geometry, operations, defaultProfile);

    // Should only have the outline trace (4 line segments + close = 5 G1 lines)
    const g1Lines = gcode.split('\n').filter(l => l.startsWith('G1'));
    expect(g1Lines.length).toBeLessThanOrEqual(5);
  });

  it('does NOT hatch-fill shapes in cut operations even when filled', async () => {
    const geometry: PathGeometry[] = [{
      d: 'M 0 0 L 10 0 L 10 10 L 0 10 Z',
      fill: '#ff0000',
    }];
    const operations: Operation[] = [{
      id: 'cut-filled',
      type: 'cut',
      feedRate: 600,
      power: 80,
      passes: 1,
    }];
    const gcode = await generateGcode(geometry, operations, defaultProfile);

    // Cut mode: should use M3, not M4
    expect(gcode).toContain('M3 S0');

    // Should only have the outline trace (no hatch fill)
    const g1Lines = gcode.split('\n').filter(l => l.startsWith('G1'));
    expect(g1Lines.length).toBeLessThanOrEqual(5);
  });

  it('respects engraveLineAngle for angled hatch lines', async () => {
    // Filled square with 90° angle (vertical scan lines)
    const geometry: PathGeometry[] = [{
      d: 'M 0 0 L 10 0 L 10 10 L 0 10 Z',
      fill: '#999',
    }];
    const operations: Operation[] = [{
      id: 'engrave-angle',
      type: 'engrave',
      feedRate: 3000,
      power: 50,
      passes: 1,
      engraveLineInterval: 1,
      engraveLineAngle: 90,
    }];
    const gcode = await generateGcode(geometry, operations, defaultProfile);

    const g1Lines = gcode.split('\n').filter(l => l.startsWith('G1'));
    // Should still produce hatch lines
    expect(g1Lines.length).toBeGreaterThan(10);
  });

  it('scales hatch-fill S value by fill shade brightness', async () => {
    // Two filled squares: one black (#000), one gray (#999)
    // Both assigned to the same engrave operation at 100% power.
    // The black fill should produce S1000, the gray should produce a lower S value.
    const geometry: PathGeometry[] = [
      { d: 'M 0 0 L 10 0 L 10 10 L 0 10 Z', fill: '#000000', layerId: 'L1' },
      { d: 'M 20 0 L 30 0 L 30 10 L 20 10 Z', fill: '#999999', layerId: 'L2' },
    ];
    const operations: Operation[] = [{
      id: 'shade-op',
      type: 'engrave',
      feedRate: 3000,
      power: 100,
      passes: 1,
      engraveLineInterval: 1,
      layerIds: ['L1', 'L2'],
    }];
    const gcode = await generateGcode(geometry, operations, defaultProfile);

    // Parse all G1 lines — hatch lines for the black square should use S1000,
    // hatch lines for the gray square should use a lower S value.
    const g1Lines = gcode.split('\n').filter(l => l.startsWith('G1'));
    const sValues = g1Lines.map(l => {
      const m = l.match(/S(\d+)/);
      return m ? parseInt(m[1]) : 0;
    });

    // Black fill (#000) → brightness ≈ 0 → S ≈ 1000 (full power)
    expect(sValues).toContain(1000);
    // Gray fill (#999) → brightness ≈ 0.6 → S ≈ 400 (reduced power)
    const grayS = sValues.filter(s => s > 0 && s < 1000);
    expect(grayS.length).toBeGreaterThan(0);
    // The gray S value should be roughly 400 (1000 * (1 - 0.6))
    expect(grayS[0]).toBeGreaterThan(300);
    expect(grayS[0]).toBeLessThan(500);
  });

  it('hatch-fills shapes with SVG default fill (#000000) in engrave operations', async () => {
    // This shape has fill="#000000" (the SVG default), simulating a shape
    // that had no explicit fill attribute in the SVG source.
    const geometry: PathGeometry[] = [{
      d: 'M 0 0 L 10 0 L 10 10 L 0 10 Z',
      fill: '#000000',
    }];
    const operations: Operation[] = [{
      id: 'default-fill-engrave',
      type: 'engrave',
      feedRate: 3000,
      power: 50,
      passes: 1,
      engraveLineInterval: 1,
    }];
    const gcode = await generateGcode(geometry, operations, defaultProfile);

    // Should produce hatch lines plus outline
    const g1Lines = gcode.split('\n').filter(l => l.startsWith('G1'));
    expect(g1Lines.length).toBeGreaterThan(10);
    // Black fill = full operation power (500)
    expect(gcode).toContain('S500');
  });
});

describe('fillBrightness', () => {
  it('returns 0 for black (#000000)', async () => {
    expect(fillBrightness('#000000')).toBeCloseTo(0);
  });

  it('returns 1 for white (#ffffff)', async () => {
    expect(fillBrightness('#ffffff')).toBeCloseTo(1);
  });

  it('returns approximately 0.6 for #999999', async () => {
    expect(fillBrightness('#999999')).toBeCloseTo(0.6, 1);
  });

  it('handles short hex (#RGB)', async () => {
    expect(fillBrightness('#000')).toBeCloseTo(0);
    expect(fillBrightness('#fff')).toBeCloseTo(1);
  });

  it('returns null for non-hex strings', async () => {
    expect(fillBrightness('red')).toBeNull();
    expect(fillBrightness(undefined)).toBeNull();
    expect(fillBrightness('')).toBeNull();
  });
});

describe('raster image engraving', () => {
  /** Helper: create a PNG data URL from raw grayscale pixel values. */
  async function makeGrayscalePng(pixels: number[], width: number, height: number): Promise<string> {
    const sharp = (await import('sharp')).default;
    const buf = await sharp(Buffer.from(pixels), { raw: { width, height, channels: 1 } })
      .png()
      .toBuffer();
    return 'data:image/png;base64,' + buf.toString('base64');
  }

  it('generates raster G-code for image geometry in engrave operations', async () => {
    // 4×2 grayscale image: top row has varying brightness, bottom row is mid-gray.
    // Bounding rect: 4mm × 2mm
    const dataUrl = await makeGrayscalePng([0, 85, 170, 255, 128, 128, 128, 128], 4, 2);
    const geometry: PathGeometry[] = [{
      d: 'M 0 0 L 4 0 L 4 2 L 0 2 Z',
      imageDataUrl: dataUrl,
    }];
    const operations: Operation[] = [{
      id: 'img-engrave',
      type: 'engrave',
      feedRate: 3000,
      power: 100,
      passes: 1,
    }];

    const gcode = await generateGcode(geometry, operations, defaultProfile);

    // Should contain M4 (engrave mode)
    expect(gcode).toContain('M4 S0');

    // Should contain G1 moves (raster scan lines)
    const g1Lines = gcode.split('\n').filter(l => l.startsWith('G1'));
    expect(g1Lines.length).toBeGreaterThan(0);

    // Black pixel → full power (S1000)
    expect(gcode).toContain('S1000');

    // White pixel → no power — emitted as G0 (rapid) not G1
    // The last pixel in row 0 is white (255), so it should produce a G0 S0.
    const g0Lines = gcode.split('\n').filter(l => l.includes('G0') && l.includes('S0'));
    expect(g0Lines.length).toBeGreaterThan(0);
  });

  it('traces bounding rectangle outline for cut operations on images', async () => {
    // Simple 2×2 black image
    const dataUrl = await makeGrayscalePng([0, 0, 0, 0], 2, 2);
    const geometry: PathGeometry[] = [{
      d: 'M 0 0 L 10 0 L 10 10 L 0 10 Z',
      imageDataUrl: dataUrl,
    }];
    const operations: Operation[] = [{
      id: 'img-cut',
      type: 'cut',
      feedRate: 600,
      power: 80,
      passes: 1,
    }];

    const gcode = await generateGcode(geometry, operations, defaultProfile);

    // Should use M3 (cut mode)
    expect(gcode).toContain('M3 S0');

    // Should NOT contain raster scan data — just the rectangle outline
    // 4 sides of the rectangle = 4 G1 lines + 1 close
    const g1Lines = gcode.split('\n').filter(l => l.startsWith('G1'));
    expect(g1Lines.length).toBeLessThanOrEqual(5);

    // The outline should reference the rectangle corners
    expect(gcode).toContain('X10.000');
    expect(gcode).toContain('Y10.000');
  });

  it('skips fully white rows in raster engraving', async () => {
    // 2×2 image: row 0 is white, row 1 is black
    const dataUrl = await makeGrayscalePng([255, 255, 0, 0], 2, 2);
    const geometry: PathGeometry[] = [{
      d: 'M 0 0 L 2 0 L 2 2 L 0 2 Z',
      imageDataUrl: dataUrl,
    }];
    const operations: Operation[] = [{
      id: 'img-skip-white',
      type: 'engrave',
      feedRate: 3000,
      power: 100,
      passes: 1,
    }];

    const gcode = await generateGcode(geometry, operations, defaultProfile);

    // Should have raster lines for the black row but skip the white row
    // The outline trace also produces G1 lines, so just verify that
    // S1000 appears (from the black pixels).
    expect(gcode).toContain('S1000');
  });

  it('modulates power by pixel brightness', async () => {
    // 2×1 image: one pixel at mid-gray (128), one at black (0)
    const dataUrl = await makeGrayscalePng([128, 0], 2, 1);
    const geometry: PathGeometry[] = [{
      d: 'M 0 0 L 2 0 L 2 1 L 0 1 Z',
      imageDataUrl: dataUrl,
    }];
    const operations: Operation[] = [{
      id: 'img-brightness',
      type: 'engrave',
      feedRate: 3000,
      power: 100,
      passes: 1,
    }];

    const gcode = await generateGcode(geometry, operations, defaultProfile);

    // Black pixel (brightness=0) → S1000
    expect(gcode).toContain('S1000');
    // Mid-gray pixel (brightness=128) → S ≈ round(1000*(1-128/255)) ≈ 498
    const g1Lines = gcode.split('\n').filter(l => l.startsWith('G1'));
    const sValues = g1Lines.map(l => {
      const m = l.match(/S(\d+)/);
      return m ? parseInt(m[1]) : -1;
    }).filter(v => v >= 0);
    // Should have a value around 498 (mid-gray power)
    const midGrayS = sValues.filter(s => s > 400 && s < 600);
    expect(midGrayS.length).toBeGreaterThan(0);
  });
});
