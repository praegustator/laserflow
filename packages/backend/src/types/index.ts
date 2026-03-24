export interface MachineProfile {
  id: string;
  name: string;
  workArea: { x: number; y: number };
  maxFeedRate: { x: number; y: number };
  maxSpindleSpeed: number; // $30 value
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

export type JobStatus = 'idle' | 'queued' | 'running' | 'paused' | 'completed' | 'error';

export type OperationType = 'cut' | 'engrave' | 'ignore';

export interface Operation {
  id: string;
  type: OperationType;
  feedRate: number;
  power: number;   // 0-100 %
  passes: number;
  zOffset?: number;
  /** Layer IDs this operation applies to. When present, only geometry tagged with a matching layerId is processed. */
  layerIds?: string[];
}

export interface PathGeometry {
  d: string;        // SVG path data string
  layerId?: string;
}

export interface Job {
  id: string;
  name: string;
  createdAt: string;
  status: JobStatus;
  sourceSvg?: string;     // original SVG content
  geometry: PathGeometry[];
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
  overrides?: { feed: number; rapids: number; spindle: number };
  alarms?: string[];
}

export interface JobProgress {
  jobId: string;
  state: JobStatus;
  currentLine: number;
  totalLines: number;
  elapsed: number;
  eta: number;
}
