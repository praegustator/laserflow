export type JobStatus = 'idle' | 'queued' | 'running' | 'paused' | 'completed' | 'error';
export type OperationType = 'cut' | 'engrave' | 'ignore';

export interface Operation {
  id: string;
  type: OperationType;
  feedRate: number;
  power: number;
  passes: number;
  zOffset?: number;
  layerIds: string[];
  label?: string;
  enabled: boolean;
  /** @deprecated kept for backward compat with old jobs */
  layerId?: string;
}

export interface PathGeometry {
  d: string;
  layerId?: string;
  shapeId?: string;
}

/** A single shape extracted from an SVG file */
export interface Shape {
  id: string;
  name: string;
  d: string;
  sourceFileId: string;
}

/**
 * Pivot anchor within the layer bounding box.
 * 'tl' = top-left, 'tc' = top-center, 'tr' = top-right,
 * 'ml' = middle-left, 'mc' = middle-center, 'mr' = middle-right,
 * 'bl' = bottom-left, 'bc' = bottom-center, 'br' = bottom-right.
 */
export type PivotAnchor = 'tl' | 'tc' | 'tr' | 'ml' | 'mc' | 'mr' | 'bl' | 'bc' | 'br';

export interface Layer {
  id: string;
  name: string;
  shapes: Shape[];
  visible: boolean;
  offsetX: number;
  offsetY: number;
  scaleX: number;
  scaleY: number;
  /** Rotation in degrees (clockwise) */
  rotation: number;
  /** Mirror across the X axis */
  mirrorX: boolean;
  /** Mirror across the Y axis */
  mirrorY: boolean;
  /** Pivot point anchor for transforms */
  pivot: PivotAnchor;
}

/** An SVG file imported into a project */
export interface ProjectFile {
  id: string;
  name: string;
  sourceSvg: string;
  shapes: Shape[];
}

/** A saved snapshot of a project */
export interface ProjectVersion {
  id: string;
  label: string;
  createdAt: string;
  snapshot: {
    files: ProjectFile[];
    layers: Layer[];
    operations: Operation[];
  };
}

export interface Project {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  files: ProjectFile[];
  layers: Layer[];
  operations: Operation[];
  versions: ProjectVersion[];
  /** Backend job ID if G-code has been generated */
  jobId?: string;
  gcode?: string;
  /** True when G-code is current (no changes since last compile). Undefined = never compiled. */
  gcodeUpToDate?: boolean;
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
  projectId?: string;
  projectVersion?: string;
}

export interface MachineState {
  state: 'Idle' | 'Run' | 'Hold' | 'Alarm' | 'Error' | 'Disconnected';
  position: { x: number; y: number; z: number };
  workPosition: { x: number; y: number; z: number };
  /** Work Coordinate Offset (WCO) — WPos = MPos − WCO */
  wco?: { x: number; y: number; z: number };
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
  type: 'console' | 'machineStatus' | 'jobProgress' | 'jobStatus';
  data: unknown;
}
