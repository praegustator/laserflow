export type JobStatus = 'idle' | 'queued' | 'running' | 'paused' | 'completed' | 'error';
export type OperationType = 'cut' | 'engrave' | 'ignore';

export interface Operation {
  id: string;
  type: OperationType;
  feedRate: number;
  power: number;
  passes: number;
  zOffset?: number;
  layerId?: string;
  label?: string;
}

export interface PathGeometry {
  d: string;
  layerId?: string;
  shapeId?: string;
}

export interface Layer {
  id: string;
  name: string;
  sourceSvg: string;
  geometry: PathGeometry[];
  visible: boolean;
  offsetX: number;
  offsetY: number;
  scaleX: number;
  scaleY: number;
}

export interface Job {
  id: string;
  name: string;
  createdAt: string;
  status: JobStatus;
  sourceSvg?: string;
  geometry: PathGeometry[];
  layers: Layer[];
  operations: Operation[];
  gcode?: string;
  errorMessage?: string;
}

export interface MachineState {
  state: 'Idle' | 'Run' | 'Hold' | 'Alarm' | 'Error' | 'Disconnected';
  position: { x: number; y: number; z: number };
  workPosition: { x: number; y: number; z: number };
  feed: number;
  spindle: number;
}

export interface PortInfo {
  path: string;
  manufacturer?: string;
}

export interface MachineProfile {
  id: string;
  name: string;
  workArea: { x: number; y: number };
  maxFeedRate: { x: number; y: number };
  maxSpindleSpeed: number;
  homingEnabled: boolean;
}

export interface MaterialPreset {
  id: string;
  name: string;
  thickness: number;
  engrave: { feedRate: number; power: number };
  cutThin: { feedRate: number; power: number };
  cutThick: { feedRate: number; power: number };
}

export interface ConsoleEntry {
  id: string;
  direction: 'in' | 'out';
  line: string;
  timestamp: number;
}

export interface JobProgress {
  currentLine: number;
  totalLines: number;
  elapsed: number;
  eta: number;
}

export interface WsMessage {
  type: 'console' | 'machineStatus' | 'jobProgress';
  data: unknown;
}
