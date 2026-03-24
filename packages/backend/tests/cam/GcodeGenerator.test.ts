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
});
