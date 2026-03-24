import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useJobStore } from '../store/jobStore';
import { useMachineStore } from '../store/machineStore';
import SvgCanvas from '../components/SvgCanvas';
import OperationsPanel from '../components/OperationsPanel';
import type { Operation } from '../types';

export default function Editor() {
  const jobs = useJobStore((s) => s.jobs);
  const activeJobId = useJobStore((s) => s.activeJobId);
  const setActiveJobId = useJobStore((s) => s.setActiveJobId);
  const fetchJobs = useJobStore((s) => s.fetchJobs);
  const startJob = useJobStore((s) => s.startJob);
  const uploadJob = useJobStore((s) => s.uploadJob);
  const connectionStatus = useMachineStore((s) => s.connectionStatus);
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [operations, setOperations] = useState<Operation[]>([]);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchJobs();
  }, [fetchJobs]);

  // Sync operations from active job
  const activeJob = jobs.find((j) => j.id === activeJobId) ?? null;
  useEffect(() => {
    if (activeJob) {
      setOperations(activeJob.operations.length > 0 ? activeJob.operations : []);
    }
  }, [activeJob?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const job = await uploadJob(file);
      setActiveJobId(job.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      e.target.value = '';
    }
  };

  const handleStart = async () => {
    if (!activeJob) return;
    setStarting(true);
    setError(null);
    try {
      await startJob(activeJob.id);
      void navigate('/console');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start job');
    } finally {
      setStarting(false);
    }
  };

  const canStart =
    connectionStatus === 'connected' && !!activeJob?.gcode && !starting;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Top bar */}
      <div className="flex-shrink-0 bg-gray-900 border-b border-gray-800 px-4 py-3 flex items-center gap-3">
        <label className="text-xs text-gray-500 uppercase flex-shrink-0">Job</label>
        <select
          value={activeJobId ?? ''}
          onChange={(e) => setActiveJobId(e.target.value || null)}
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-orange-500 max-w-xs"
        >
          <option value="">— Select a job —</option>
          {jobs.map((j) => (
            <option key={j.id} value={j.id}>
              {j.name}
            </option>
          ))}
        </select>

        <button
          onClick={() => fileInputRef.current?.click()}
          className="px-3 py-1.5 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors"
        >
          + Import SVG
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".svg"
          className="hidden"
          onChange={(e) => { void handleFileChange(e); }}
        />

        <div className="flex-1" />

        {error && <p className="text-xs text-red-400">{error}</p>}

        <button
          onClick={() => { void handleStart(); }}
          disabled={!canStart}
          className="px-4 py-1.5 text-sm rounded-lg bg-green-700 hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold transition-colors"
        >
          {starting ? 'Starting…' : '▶ Start Job'}
        </button>
        {connectionStatus !== 'connected' && (
          <span className="text-xs text-yellow-500">⚠ Connect machine first</span>
        )}
      </div>

      {/* Main canvas + operations */}
      {activeJob ? (
        <div className="flex flex-1 min-h-0">
          {/* Canvas */}
          <div className="flex-1 min-w-0 min-h-0">
            <SvgCanvas
              geometry={activeJob.geometry}
              operations={operations}
            />
          </div>

          {/* Operations panel */}
          <div className="w-72 flex-shrink-0 border-l border-gray-800 bg-gray-900 flex flex-col min-h-0">
            <OperationsPanel
              job={activeJob}
              operations={operations}
              onOperationsChange={setOperations}
            />
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-center">
          <div>
            <div className="text-5xl mb-4">🖼</div>
            <h2 className="text-lg font-semibold text-gray-400">No job selected</h2>
            <p className="text-sm text-gray-600 mt-2 mb-6">
              Select a job above or import an SVG file
            </p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-5 py-2 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-sm font-semibold transition-colors"
            >
              Import SVG
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
