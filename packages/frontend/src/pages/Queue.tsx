import { useEffect, useState, useRef, useCallback } from 'react';
import { useJobStore } from '../store/jobStore';
import { useMachineStore } from '../store/machineStore';
import { useToastStore } from '../store/toastStore';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPlay,
  faPause,
  faStop,
  faTrash,
  faClone,
  faRotateRight,
  faCircle,
  faHourglass,
  faCheckCircle,
  faExclamationCircle,
  faGripVertical,
  faHome,
  faCrosshairs,
  faArrowsAlt,
  faBorderAll,
} from '@fortawesome/free-solid-svg-icons';
import JogControls from '../components/JogControls';
import type { Job, JobProgress } from '../types';

/* ─── Status styles ─── */
const STATUS_STYLES: Record<string, { color: string; icon: typeof faCircle; label: string }> = {
  idle: { color: 'text-gray-400', icon: faCircle, label: 'Idle' },
  queued: { color: 'text-yellow-400', icon: faHourglass, label: 'Queued' },
  running: { color: 'text-green-400', icon: faPlay, label: 'Running' },
  paused: { color: 'text-orange-400', icon: faPause, label: 'Paused' },
  completed: { color: 'text-blue-400', icon: faCheckCircle, label: 'Completed' },
  error: { color: 'text-red-400', icon: faExclamationCircle, label: 'Error' },
};

type StatusFilter = 'all' | Job['status'];

/** Feed rate (mm/min) used when tracing the job bounding box with laser off */
const TRACE_FEED_RATE = 1000;

/* ─── Helpers ─── */
function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Extract bounding box of all G0/G1 moves from compiled G-code */
function gcodeBBox(gcode: string): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let x = 0, y = 0;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let hasMove = false;
  for (const raw of gcode.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith(';')) continue;
    const isG0 = line.startsWith('G0 ') || line.startsWith('G0\t') || line === 'G0';
    const isG1 = line.startsWith('G1 ') || line.startsWith('G1\t') || line === 'G1';
    if (!isG0 && !isG1) continue;
    const xm = line.match(/X(-?[\d.]+)/);
    const ym = line.match(/Y(-?[\d.]+)/);
    if (xm) x = parseFloat(xm[1]);
    if (ym) y = parseFloat(ym[1]);
    if (!xm && !ym) continue;
    // Only include cutting moves (G1) in the bounding box — G0 are rapids
    if (isG1) {
      hasMove = true;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  return hasMove && Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
}

function ProgressBar({ progress }: { progress: JobProgress | undefined }) {
  if (!progress || progress.totalLines === 0) return null;
  const pct = Math.min(100, (progress.currentLine / progress.totalLines) * 100);
  return (
    <div className="w-full bg-gray-700 rounded-full h-1.5 mt-1">
      <div
        className="bg-orange-500 h-1.5 rounded-full transition-all duration-300"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/* ─── Compact Job Card ─── */
interface JobCardProps {
  job: Job;
  progress: JobProgress | undefined;
  selected: boolean;
  onSelect: (id: string, toggle: boolean) => void;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onAbort: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onRerun: () => void;
  onTraceFrame: () => void;
  draggable?: boolean;
  onDragStart?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: () => void;
  machineConnected: boolean;
}

function JobCard({
  job, progress, selected, onSelect, onStart, onPause, onResume, onAbort,
  onDelete, onDuplicate, onRerun, onTraceFrame, draggable, onDragStart, onDragOver, onDrop,
  machineConnected,
}: JobCardProps) {
  const st = STATUS_STYLES[job.status] ?? STATUS_STYLES.idle;
  const pct = progress && progress.totalLines > 0
    ? Math.min(100, (progress.currentLine / progress.totalLines) * 100)
    : null;

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`bg-gray-800 rounded-lg border p-3 space-y-1.5 transition-colors text-sm ${
        selected ? 'border-orange-500 ring-1 ring-orange-500/30' : 'border-gray-700 hover:border-gray-600'
      } ${draggable ? 'cursor-grab active:cursor-grabbing' : ''}`}
    >
      {/* Header row */}
      <div className="flex items-center gap-2">
        {draggable && (
          <FontAwesomeIcon icon={faGripVertical} className="text-gray-600 text-xs" />
        )}
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => onSelect(job.id, e.shiftKey)}
          className="accent-orange-500 flex-shrink-0"
        />
        <FontAwesomeIcon icon={st.icon} className={`${st.color} text-xs`} />
        <h3 className="font-medium text-gray-200 flex-1 truncate text-xs">{job.name}</h3>
        <span className={`text-[10px] font-semibold ${st.color}`}>{st.label}</span>
      </div>

      {/* Metadata */}
      <div className="flex gap-3 text-[10px] text-gray-500">
        <span>{new Date(job.createdAt).toLocaleString()}</span>
        {job.gcode && (
          <span>{job.gcode.split('\n').length.toLocaleString()} lines</span>
        )}
      </div>

      {/* Progress */}
      {(job.status === 'running' || job.status === 'paused') && progress && (
        <div className="space-y-0.5">
          <ProgressBar progress={progress} />
          <div className="flex justify-between text-[10px] text-gray-500">
            <span>{pct !== null ? `${pct.toFixed(1)}%` : ''}</span>
            <span>
              Elapsed: {formatDuration(progress.elapsed)}
              {progress.eta > 0 && ` · ETA: ${formatDuration(progress.eta)}`}
            </span>
          </div>
        </div>
      )}

      {/* Error */}
      {job.status === 'error' && job.errorMessage && (
        <p className="text-[10px] text-red-400 bg-red-900/20 rounded px-2 py-0.5">{job.errorMessage}</p>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-1 pt-0.5">
        {(job.status === 'idle' || job.status === 'queued') && (
          <button
            onClick={onStart}
            disabled={!machineConnected}
            className="px-2 py-0.5 text-[10px] rounded bg-green-700 hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors flex items-center gap-1"
            title={machineConnected ? 'Start job' : 'Machine not connected'}
          ><FontAwesomeIcon icon={faPlay} /> Start</button>
        )}
        {(job.status === 'idle' || job.status === 'queued') && job.gcode && (
          <button
            onClick={onTraceFrame}
            disabled={!machineConnected}
            className="px-2 py-0.5 text-[10px] rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed text-gray-200 transition-colors flex items-center gap-1"
            title={machineConnected ? 'Trace bounding box with laser off' : 'Machine not connected'}
          ><FontAwesomeIcon icon={faBorderAll} /> Trace</button>
        )}
        {job.status === 'running' && (
          <button
            onClick={onPause}
            className="px-2 py-0.5 text-[10px] rounded bg-orange-700 hover:bg-orange-600 text-white transition-colors flex items-center gap-1"
          ><FontAwesomeIcon icon={faPause} /> Pause</button>
        )}
        {job.status === 'paused' && (
          <button
            onClick={onResume}
            className="px-2 py-0.5 text-[10px] rounded bg-green-700 hover:bg-green-600 text-white transition-colors flex items-center gap-1"
          ><FontAwesomeIcon icon={faPlay} /> Resume</button>
        )}
        {(job.status === 'running' || job.status === 'paused') && (
          <button
            onClick={onAbort}
            className="px-2 py-0.5 text-[10px] rounded bg-red-700 hover:bg-red-600 text-white transition-colors flex items-center gap-1"
          ><FontAwesomeIcon icon={faStop} /> Cancel</button>
        )}
        {(job.status === 'completed' || job.status === 'error') && (
          <button
            onClick={onRerun}
            className="px-2 py-0.5 text-[10px] rounded bg-green-800 hover:bg-green-700 text-white transition-colors flex items-center gap-1"
            title="Queue this job to run again"
          ><FontAwesomeIcon icon={faRotateRight} /> Re-run</button>
        )}
        <button
          onClick={onDuplicate}
          className="px-2 py-0.5 text-[10px] rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors flex items-center gap-1"
          title="Duplicate job"
        ><FontAwesomeIcon icon={faClone} /></button>
        <button
          onClick={onDelete}
          disabled={job.status === 'running'}
          className="px-2 py-0.5 text-[10px] rounded bg-gray-700 hover:bg-red-900 text-gray-400 hover:text-red-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors ml-auto flex items-center gap-1"
          title="Delete job"
        ><FontAwesomeIcon icon={faTrash} /></button>
      </div>
    </div>
  );
}

/* ─── Column header ─── */
function ColumnHeader({ title, count, color }: { title: string; count: number; color: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className={`w-2 h-2 rounded-full ${color}`} />
      <h2 className="text-sm font-semibold text-gray-200">{title}</h2>
      <span className="text-xs text-gray-500 bg-gray-800 rounded-full px-2 py-0.5">{count}</span>
    </div>
  );
}

/* ─── Main Queue Page ─── */
export default function Queue() {
  const jobs = useJobStore(s => s.jobs);
  const jobProgress = useJobStore(s => s.jobProgress);
  const fetchJobs = useJobStore(s => s.fetchJobs);
  const startJob = useJobStore(s => s.startJob);
  const pauseJob = useJobStore(s => s.pauseJob);
  const resumeJob = useJobStore(s => s.resumeJob);
  const abortJob = useJobStore(s => s.abortJob);
  const deleteJob = useJobStore(s => s.deleteJob);
  const duplicateJob = useJobStore(s => s.duplicateJob);
  const queueJob = useJobStore(s => s.queueJob);
  const bulkDeleteJobs = useJobStore(s => s.bulkDeleteJobs);
  const reorderJobs = useJobStore(s => s.reorderJobs);
  const connectionStatus = useMachineStore(s => s.connectionStatus);
  const sendCommand = useMachineStore(s => s.sendCommand);
  const addToast = useToastStore(s => s.addToast);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const dragIdRef = useRef<string | null>(null);

  const machineConnected = connectionStatus === 'connected';

  useEffect(() => {
    setLoading(true);
    void fetchJobs().finally(() => setLoading(false));
  }, [fetchJobs]);

  // Auto-refresh every 5 seconds for running jobs
  useEffect(() => {
    const hasActive = jobs.some(j => j.status === 'running' || j.status === 'paused' || j.status === 'queued');
    if (!hasActive) return;
    const timer = setInterval(() => { void fetchJobs(); }, 5000);
    return () => clearInterval(timer);
  }, [jobs, fetchJobs]);

  const wrap = useCallback((fn: () => Promise<void>, successMsg?: string) => async () => {
    try {
      await fn();
      if (successMsg) addToast('success', successMsg);
      await fetchJobs();
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Action failed');
    }
  }, [addToast, fetchJobs]);

  const handleSelect = useCallback((id: string, _shift: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds).filter(id => {
      const job = jobs.find(j => j.id === id);
      return job && job.status !== 'running';
    });
    if (ids.length === 0) return;
    try {
      await bulkDeleteJobs(ids);
      setSelectedIds(new Set());
      addToast('success', `Deleted ${ids.length} job(s)`);
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Bulk delete failed');
    }
  };

  const handleDuplicate = useCallback(async (jobId: string) => {
    try {
      await duplicateJob(jobId);
      addToast('success', 'Job duplicated');
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Duplicate failed');
    }
  }, [duplicateJob, addToast]);

  const handleRerun = useCallback(async (jobId: string) => {
    try {
      await queueJob(jobId);
      addToast('success', 'Job re-queued');
      await fetchJobs();
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Re-queue failed');
    }
  }, [queueJob, addToast, fetchJobs]);

  /* ─── Drag & drop for queued jobs ─── */
  const handleDragStart = useCallback((id: string) => { dragIdRef.current = id; }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); }, []);

  const handleDrop = useCallback((targetId: string) => {
    if (!dragIdRef.current || dragIdRef.current === targetId) return;
    const queuedJobs = jobs
      .filter(j => j.status === 'queued' || j.status === 'idle')
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const ids = queuedJobs.map(j => j.id);
    const fromIdx = ids.indexOf(dragIdRef.current);
    const toIdx = ids.indexOf(targetId);
    if (fromIdx < 0 || toIdx < 0) return;
    ids.splice(fromIdx, 1);
    ids.splice(toIdx, 0, dragIdRef.current);
    void reorderJobs(ids);
    dragIdRef.current = null;
  }, [jobs, reorderJobs]);

  /* ─── Filter and group jobs ─── */
  const filtered = statusFilter === 'all'
    ? jobs
    : jobs.filter(j => j.status === statusFilter);

  const queuedJobs = filtered
    .filter(j => j.status === 'idle' || j.status === 'queued')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const runningJobs = filtered
    .filter(j => j.status === 'running' || j.status === 'paused');

  const finishedJobs = filtered
    .filter(j => j.status === 'completed' || j.status === 'error')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  /** Trace the bounding-box frame of a job's G-code with laser off. */
  const handleTraceFrame = useCallback(async (job: Job) => {
    if (!job.gcode) {
      addToast('error', 'Job has no G-code');
      return;
    }
    const bbox = gcodeBBox(job.gcode);
    if (!bbox) {
      addToast('error', 'No cutting moves found in G-code');
      return;
    }
    const fmt = (n: number) => n.toFixed(3);
    try {
      await sendCommand('M5');        // laser off
      await sendCommand('G90');       // absolute mode
      await sendCommand(`G0 X${fmt(bbox.minX)} Y${fmt(bbox.minY)}`);
      await sendCommand(`G1 X${fmt(bbox.maxX)} Y${fmt(bbox.minY)} F${TRACE_FEED_RATE}`);
      await sendCommand(`G1 X${fmt(bbox.maxX)} Y${fmt(bbox.maxY)} F${TRACE_FEED_RATE}`);
      await sendCommand(`G1 X${fmt(bbox.minX)} Y${fmt(bbox.maxY)} F${TRACE_FEED_RATE}`);
      await sendCommand(`G1 X${fmt(bbox.minX)} Y${fmt(bbox.minY)} F${TRACE_FEED_RATE}`);
      addToast('success', 'Tracing job frame…');
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Failed to trace frame');
    }
  }, [sendCommand, addToast]);

  const cardProps = useCallback((job: Job) => ({
    job,
    progress: jobProgress[job.id],
    selected: selectedIds.has(job.id),
    onSelect: handleSelect,
    onStart: () => { void wrap(() => startJob(job.id), 'Job running — sending to machine')(); },
    onPause: () => { void wrap(() => pauseJob(job.id), 'Job paused')(); },
    onResume: () => { void wrap(() => resumeJob(job.id), 'Job resumed')(); },
    onAbort: () => { void wrap(() => abortJob(job.id), 'Job cancelled')(); },
    onDelete: () => { void wrap(() => deleteJob(job.id), 'Job deleted')(); },
    onDuplicate: () => { void handleDuplicate(job.id); },
    onRerun: () => { void handleRerun(job.id); },
    onTraceFrame: () => { void handleTraceFrame(job); },
    machineConnected,
  }), [jobProgress, selectedIds, handleSelect, wrap, startJob, pauseJob, resumeJob, abortJob, deleteJob, handleDuplicate, handleRerun, handleTraceFrame, machineConnected]);

  const statusFilters: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'queued', label: 'Queued' },
    { key: 'idle', label: 'Idle' },
    { key: 'running', label: 'Running' },
    { key: 'paused', label: 'Paused' },
    { key: 'completed', label: 'Completed' },
    { key: 'error', label: 'Error' },
  ];

  return (
    <div className="flex h-full min-h-0">
      {/* Main content */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0">
        {/* Toolbar */}
        <div className="flex-shrink-0 bg-gray-900 border-b border-gray-800 px-4 py-2 flex items-center gap-3 flex-wrap">
          <h1 className="text-sm font-semibold text-gray-300 uppercase tracking-widest">Job Queue</h1>
          <span className="text-xs text-gray-500">
            {jobs.length} job{jobs.length !== 1 ? 's' : ''}
          </span>

          {/* Status filter pills */}
          <div className="flex gap-1 ml-2">
            {statusFilters.map(f => (
              <button
                key={f.key}
                onClick={() => setStatusFilter(f.key)}
                className={`px-2 py-0.5 text-[10px] rounded-full font-semibold transition-colors ${
                  statusFilter === f.key
                    ? 'bg-orange-500 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >{f.label}</button>
            ))}
          </div>

          <div className="flex-1" />

          {/* Bulk actions */}
          {selectedIds.size > 0 && (
            <button
              onClick={() => { void handleBulkDelete(); }}
              className="px-3 py-1 text-xs rounded bg-red-800 hover:bg-red-700 text-white transition-colors flex items-center gap-1"
            >
              <FontAwesomeIcon icon={faTrash} /> Delete {selectedIds.size} selected
            </button>
          )}

          <button
            onClick={() => { void fetchJobs(); }}
            className="flex items-center gap-1.5 px-3 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs font-semibold transition-colors"
            title="Refresh job list"
          ><FontAwesomeIcon icon={faRotateRight} /> Refresh</button>
        </div>

        {/* Three-column layout */}
        {loading && jobs.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
            Loading jobs…
          </div>
        ) : jobs.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="text-5xl mb-4">📭</div>
              <h2 className="text-lg font-semibold text-gray-400">No jobs in queue</h2>
              <p className="text-sm text-gray-600 mt-2">
                Generate G-code from the Editor and send it to the queue
              </p>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-auto p-4">
            <div className="grid grid-cols-3 gap-4 h-full min-h-0">
              {/* In Queue column */}
              <div className="flex flex-col min-h-0">
                <ColumnHeader title="In Queue" count={queuedJobs.length} color="bg-yellow-400" />
                <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                  {queuedJobs.length === 0 ? (
                    <p className="text-xs text-gray-600 text-center py-8">No queued jobs</p>
                  ) : (
                    queuedJobs.map(job => (
                      <JobCard
                        key={job.id}
                        {...cardProps(job)}
                        draggable
                        onDragStart={() => handleDragStart(job.id)}
                        onDragOver={handleDragOver}
                        onDrop={() => handleDrop(job.id)}
                      />
                    ))
                  )}
                </div>
              </div>

              {/* Running column */}
              <div className="flex flex-col min-h-0">
                <ColumnHeader title="Running" count={runningJobs.length} color="bg-green-400" />
                <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                  {runningJobs.length === 0 ? (
                    <p className="text-xs text-gray-600 text-center py-8">No running jobs</p>
                  ) : (
                    runningJobs.map(job => (
                      <JobCard key={job.id} {...cardProps(job)} />
                    ))
                  )}
                </div>
              </div>

              {/* Finished column */}
              <div className="flex flex-col min-h-0">
                <ColumnHeader title="Finished" count={finishedJobs.length} color="bg-blue-400" />
                <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                  {finishedJobs.length === 0 ? (
                    <p className="text-xs text-gray-600 text-center py-8">No finished jobs</p>
                  ) : (
                    finishedJobs.map(job => (
                      <JobCard key={job.id} {...cardProps(job)} />
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Right sidebar: Machine Controls */}
      <div className="w-64 flex-shrink-0 bg-gray-900 border-l border-gray-800 overflow-y-auto p-4 space-y-4">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Machine Controls</h2>

        {!machineConnected && (
          <p className="text-xs text-yellow-400 bg-yellow-900/20 rounded px-2 py-1.5">
            ⚠ Machine not connected — go to Console to connect
          </p>
        )}

        {/* Quick actions */}
        <div>
          <div className="text-xs text-gray-500 uppercase mb-2">Quick Actions</div>
          <div className="grid grid-cols-2 gap-1">
            <button
              onClick={() => { void sendCommand('$H'); }}
              disabled={!machineConnected}
              className="py-1.5 text-xs rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed text-gray-200 transition-colors flex items-center justify-center gap-1"
            >
              <FontAwesomeIcon icon={faHome} /> Home
            </button>
            <button
              onClick={() => { void sendCommand('G10L20P0X0Y0Z0'); }}
              disabled={!machineConnected}
              className="py-1.5 text-xs rounded bg-green-800 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors flex items-center justify-center gap-1"
            >
              <FontAwesomeIcon icon={faCrosshairs} /> Set Origin
            </button>
            <button
              onClick={() => { void sendCommand('$X'); }}
              disabled={!machineConnected}
              className="py-1.5 text-xs rounded bg-yellow-700 hover:bg-yellow-600 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors flex items-center justify-center gap-1"
            >
              🔓 Unlock
            </button>
            <button
              onClick={() => { void sendCommand('G0 X0 Y0'); }}
              disabled={!machineConnected}
              className="py-1.5 text-xs rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed text-gray-200 transition-colors flex items-center justify-center gap-1"
            >
              <FontAwesomeIcon icon={faArrowsAlt} /> Go Zero
            </button>
          </div>
        </div>

        {/* Jog controls */}
        <div>
          <div className="text-xs text-gray-500 uppercase mb-2">Jog Controls</div>
          <JogControls />
        </div>
      </div>
    </div>
  );
}
