import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type OriginPosition = 'bottom-left' | 'top-left';

interface AppSettings {
  backendUrl: string;
  originPosition: OriginPosition;
  units: 'mm' | 'in';
  safetyConfirmation: boolean;
  autoScrollConsole: boolean;
  setBackendUrl: (url: string) => void;
  setOriginPosition: (pos: OriginPosition) => void;
  setUnits: (units: 'mm' | 'in') => void;
  setSafetyConfirmation: (v: boolean) => void;
  setAutoScrollConsole: (v: boolean) => void;
}

export const useAppSettings = create<AppSettings>()(
  persist(
    (set) => ({
      backendUrl: 'http://localhost:3001',
      originPosition: 'bottom-left',
      units: 'mm',
      safetyConfirmation: true,
      autoScrollConsole: true,
      setBackendUrl: (url) => set({ backendUrl: url }),
      setOriginPosition: (pos) => set({ originPosition: pos }),
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
