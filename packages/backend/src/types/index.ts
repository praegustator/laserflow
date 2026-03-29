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

export type JobStatus = 'idle' | 'queued' | 'running' | 'paused' | 'completed' | 'canceled' | 'error';

export type OperationType = 'cut' | 'engrave';

export interface Operation {
  id: string;
  type: OperationType;
  feedRate: number;
  power: number;   // 0-100 %
  passes: number;
  zOffset?: number;
  /** Layer IDs this operation applies to. When present, only geometry tagged with a matching layerId is processed. */
  layerIds?: string[];
  /** Spacing between hatch scan-lines when engraving filled shapes (mm, default 0.1). */
  engraveLineInterval?: number;
  /** Angle of hatch scan-lines in degrees (default 0 = horizontal). */
  engraveLineAngle?: number;
}

export interface PathGeometry {
  d: string;        // SVG path data string
  layerId?: string;
  /** Fill colour from the source SVG (e.g. '#999'). `undefined` means no fill / outline only. */
  fill?: string;
  /** Base64 data-URL of a raster image (PNG/JPEG). When present, engrave operations
   *  raster the image pixel-by-pixel instead of using the vector hatch-fill. */
  imageDataUrl?: string;
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
  /** 1-based line number in the G-code that caused the error */
  failedGcodeLineNumber?: number;
  /** Exact G-code text of the line that caused the error */
  failedGcodeLineContent?: string;
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
