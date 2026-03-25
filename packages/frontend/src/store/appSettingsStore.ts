import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type OriginPosition = 'bottom-left' | 'top-left';

interface AppSettings {
  backendUrl: string;
  originPosition: OriginPosition;
  workAreaWidth: number;
  workAreaHeight: number;
  units: 'mm' | 'in';
  safetyConfirmation: boolean;
  autoScrollConsole: boolean;
  setBackendUrl: (url: string) => void;
  setOriginPosition: (pos: OriginPosition) => void;
  setWorkAreaWidth: (w: number) => void;
  setWorkAreaHeight: (h: number) => void;
  setUnits: (units: 'mm' | 'in') => void;
  setSafetyConfirmation: (v: boolean) => void;
  setAutoScrollConsole: (v: boolean) => void;
}

export const useAppSettings = create<AppSettings>()(
  persist(
    (set) => ({
      backendUrl: 'http://localhost:3001',
      originPosition: 'bottom-left',
      workAreaWidth: 300,
      workAreaHeight: 200,
      units: 'mm',
      safetyConfirmation: true,
      autoScrollConsole: true,
      setBackendUrl: (url) => set({ backendUrl: url }),
      setOriginPosition: (pos) => set({ originPosition: pos }),
      setWorkAreaWidth: (w) => set({ workAreaWidth: w }),
      setWorkAreaHeight: (h) => set({ workAreaHeight: h }),
      setUnits: (units) => set({ units }),
      setSafetyConfirmation: (v) => set({ safetyConfirmation: v }),
      setAutoScrollConsole: (v) => set({ autoScrollConsole: v }),
    }),
    { name: 'laserflow-settings' },
  ),
);

// Helper to get the current backend URL without React
export function getBackendUrl(): string {
  try {
    const stored = JSON.parse(localStorage.getItem('laserflow-settings') ?? '{}') as { state?: { backendUrl?: string } };
    return stored.state?.backendUrl ?? 'http://localhost:3001';
  } catch {
    return 'http://localhost:3001';
  }
}

export function getWsUrl(): string {
  const base = getBackendUrl();
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
