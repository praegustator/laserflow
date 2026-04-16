import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type OriginPosition = 'bottom-left' | 'top-left';
export type ProjectsViewMode = 'card' | 'table';

interface AppSettings {
  backendUrl: string;
  originPosition: OriginPosition;
  workAreaWidth: number;
  workAreaHeight: number;
  units: 'mm' | 'in';
  safetyConfirmation: boolean;
  autoScrollConsole: boolean;
  autoZoomOnLayerSelect: boolean;
  autoPanOnLayerSelect: boolean;
  /** Calibrated display scale (px per mm). When set, zoom % is shown relative to this value so that 100 % = real physical size. */
  calibratedPxPerMm: number | null;
  /** Trace the bounding rectangle with laser off before running a job. */
  frameBeforeRun: boolean;
  /** Last used view mode on the Projects page ('card' or 'table'). */
  projectsViewMode: ProjectsViewMode;
  setBackendUrl: (url: string) => void;
  setOriginPosition: (pos: OriginPosition) => void;
  setWorkAreaWidth: (w: number) => void;
  setWorkAreaHeight: (h: number) => void;
  setUnits: (units: 'mm' | 'in') => void;
  setSafetyConfirmation: (v: boolean) => void;
  setAutoScrollConsole: (v: boolean) => void;
  setAutoZoomOnLayerSelect: (v: boolean) => void;
  setAutoPanOnLayerSelect: (v: boolean) => void;
  setCalibratedPxPerMm: (v: number | null) => void;
  setFrameBeforeRun: (v: boolean) => void;
  setProjectsViewMode: (v: ProjectsViewMode) => void;
}

export const useAppSettings = create<AppSettings>()(
  persist(
    (set) => ({
      // Empty string means "same origin" – API calls are routed through the
      // nginx (Docker) or Vite dev-server proxy at /api and /ws.
      // Override this only when the backend runs on a different host/port.
      backendUrl: '',
      originPosition: 'bottom-left',
      workAreaWidth: 300,
      workAreaHeight: 200,
      units: 'mm',
      safetyConfirmation: true,
      autoScrollConsole: true,
      autoZoomOnLayerSelect: false,
      autoPanOnLayerSelect: true,
      calibratedPxPerMm: null,
      frameBeforeRun: true,
      projectsViewMode: 'card',
      setBackendUrl: (url) => set({ backendUrl: url }),
      setOriginPosition: (pos) => set({ originPosition: pos }),
      setWorkAreaWidth: (w) => set({ workAreaWidth: w }),
      setWorkAreaHeight: (h) => set({ workAreaHeight: h }),
      setUnits: (units) => set({ units }),
      setSafetyConfirmation: (v) => set({ safetyConfirmation: v }),
      setAutoScrollConsole: (v) => set({ autoScrollConsole: v }),
      setAutoZoomOnLayerSelect: (v) => set({ autoZoomOnLayerSelect: v }),
      setAutoPanOnLayerSelect: (v) => set({ autoPanOnLayerSelect: v }),
      setCalibratedPxPerMm: (v) => set({ calibratedPxPerMm: v }),
      setFrameBeforeRun: (v) => set({ frameBeforeRun: v }),
      setProjectsViewMode: (v) => set({ projectsViewMode: v }),
    }),
    { name: 'laserflow-settings' },
  ),
);

// Helper to get the current backend URL without React
export function getBackendUrl(): string {
  try {
    const stored = JSON.parse(localStorage.getItem('laserflow-settings') ?? '{}') as { state?: { backendUrl?: string } };
    return stored.state?.backendUrl ?? '';
  } catch {
    return '';
  }
}

export function getWsUrl(): string {
  const base = getBackendUrl();
  if (!base) {
    // Same-origin mode: derive WebSocket URL from the current page location.
    // This works via the nginx (Docker) or Vite dev-server /ws proxy.
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}/ws`;
  }
  return base.replace(/^http/, 'ws') + '/ws';
}

/**
 * Returns true when the app is served over HTTPS but the configured backend
 * URL uses plain HTTP.  Browsers block both WebSocket (ws://) and fetch
 * (http://) connections from HTTPS pages as "mixed content", so the
 * connection will silently fail in this situation.
 */
export function isMixedContent(url?: string): boolean {
  if (typeof window === 'undefined') return false;
  const target = url ?? getBackendUrl();
  return window.location.protocol === 'https:' && target.startsWith('http://');
}
