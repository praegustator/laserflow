import type { MachineState } from '../types/index.js';

export const GRBL_REALTIME = {
  SOFT_RESET: 0x18,
  FEED_HOLD: '!',
  CYCLE_START: '~',
  STATUS_QUERY: '?',
  JOG_CANCEL: 0x85,
} as const;

export function parseStatusReport(line: string): Partial<MachineState> {
  if (!line.startsWith('<') || !line.endsWith('>')) {
    return {};
  }

  const inner = line.slice(1, -1);
  const parts = inner.split('|');
  const result: Partial<MachineState> = {};

  const statePart = parts[0];
  if (statePart) {
    const stateStr = statePart.split(':')[0];
    if (['Idle', 'Run', 'Hold', 'Alarm', 'Error'].includes(stateStr)) {
      result.state = stateStr as MachineState['state'];
    }
  }

  for (const part of parts.slice(1)) {
    if (part.startsWith('MPos:')) {
      const coords = part.slice(5).split(',').map(Number);
      result.position = { x: coords[0] ?? 0, y: coords[1] ?? 0, z: coords[2] ?? 0 };
    } else if (part.startsWith('WPos:')) {
      const coords = part.slice(5).split(',').map(Number);
      result.workPosition = { x: coords[0] ?? 0, y: coords[1] ?? 0, z: coords[2] ?? 0 };
    } else if (part.startsWith('FS:')) {
      const fs = part.slice(3).split(',').map(Number);
      result.feed = fs[0] ?? 0;
      result.spindle = fs[1] ?? 0;
    } else if (part.startsWith('Ov:')) {
      const ov = part.slice(3).split(',').map(Number);
      result.overrides = { feed: ov[0] ?? 100, rapids: ov[1] ?? 100, spindle: ov[2] ?? 100 };
    }
  }

  return result;
}

export function parseResponse(line: string): { type: 'ok' | 'error' | 'alarm' | 'status' | 'message'; value?: string } {
  if (line === 'ok') return { type: 'ok' };
  if (line.startsWith('error:')) return { type: 'error', value: line.slice(6) };
  if (line.startsWith('ALARM:')) return { type: 'alarm', value: line.slice(6) };
  if (line.startsWith('<') && line.endsWith('>')) return { type: 'status', value: line };
  return { type: 'message', value: line };
}

export function buildJogCommand(axis: string, distance: number, feed: number): string {
  return `$J=G91G21${axis.toUpperCase()}${distance}F${feed}`;
}

export function buildStatusQueryCommand(): string {
  return '?';
}
