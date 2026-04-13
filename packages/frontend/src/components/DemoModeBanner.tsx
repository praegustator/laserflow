import { useMachineStore } from '../store/machineStore';

/**
 * Thin banner shown at the top of the app when the user is in demo mode
 * (backend unreachable, but the user chose to continue without it).
 * Dismissed automatically when the backend reconnects.
 */
export default function DemoModeBanner() {
  const backendConnected = useMachineStore((s) => s.backendConnected);
  const demoMode = useMachineStore((s) => s.demoMode);
  const setDemoMode = useMachineStore((s) => s.setDemoMode);

  if (backendConnected || !demoMode) return null;

  return (
    <div className="flex-shrink-0 flex items-center justify-between gap-2 px-4 py-1.5 bg-amber-900/40 border-b border-amber-700/50 text-xs text-amber-300">
      <span>
        <span className="font-semibold">Demo mode</span>
        {' '}— backend unavailable. G-code generation, job queue and machine control are disabled.
      </span>
      <button
        onClick={() => setDemoMode(false)}
        className="flex-shrink-0 px-2 py-0.5 rounded bg-amber-800/60 hover:bg-amber-700/60 text-amber-200 transition-colors"
        title="Dismiss — the connection overlay will reappear"
      >
        ✕ Exit demo
      </button>
    </div>
  );
}
