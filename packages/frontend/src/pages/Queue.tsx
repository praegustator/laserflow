import { useEffect, useState } from 'react';
import { useJobStore } from '../store/jobStore';
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
} from '@fortawesome/free-solid-svg-icons';
import type { Job, JobProgress } from '../types';

const STATUS_STYLES: Record<string, { color: string; icon: typeof faCircle; label: string }> = {
  idle: { color: 'text-gray-400', icon: faCircle, label: 'Idle' },
  queued: { color: 'text-yellow-400', icon: faHourglass, label: 'Queued' },
  running: { color: 'text-green-400', icon: faPlay, label: 'Running' },
  paused: { color: 'text-orange-400', icon: faPause, label: 'Paused' },
  completed: { color: 'text-blue-400', icon: faCheckCircle, label: 'Completed' },
  error: { color: 'text-red-400', icon: faExclamationCircle, label: 'Error' },
};

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function ProgressBar({ progress }: { progress: JobProgress | undefined }) {
  if (!progress || progress.totalLines === 0) return null;
  const pct = Math.min(100, (progress.currentLine / progress.totalLines) * 100);
  return (
    <div className="w-full bg-gray-700 rounded-full h-2 mt-2">
      <div
        className="bg-orange-500 h-2 rounded-full transition-all duration-300"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

interface JobRowProps {
  job: Job;
  progress: JobProgress | undefined;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onAbort: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
}

function JobRow({ job, progress, onStart, onPause, onResume, onAbort, onDelete, onDuplicate }: JobRowProps) {
  const st = STATUS_STYLES[job.status] ?? STATUS_STYLES.idle;
  const pct = progress && progress.totalLines > 0
    ? Math.min(100, (progress.currentLine / progress.totalLines) * 100)
    : null;

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 space-y-2 hover:border-gray-600 transition-colors">
      {/* Header */}
      <div className="flex items-center gap-2">
        <FontAwesomeIcon icon={st.icon} className={`${st.color} text-sm`} />
        <h3 className="font-semibold text-gray-100 flex-1 truncate">{job.name}</h3>
        <span className={`text-xs font-semibold ${st.color}`}>{st.label}</span>
      </div>

      {/* Metadata */}
      <div className="flex gap-4 text-xs text-gray-400">
        <span>{new Date(job.createdAt).toLocaleString()}</span>
        {job.gcode && (
          <span>{job.gcode.split('\n').length.toLocaleString()} lines</span>
        )}
        {job.operations.length > 0 && (
          <span>{job.operations.length} op{job.operations.length !== 1 ? 's' : ''}</span>
        )}
      </div>

      {/* Progress (for running/paused jobs) */}
      {(job.status === 'running' || job.status === 'paused') && progress && (
        <div className="space-y-1">
          <ProgressBar progress={progress} />
          <div className="flex justify-between text-xs text-gray-400">
            <span>{pct !== null ? `${pct.toFixed(1)}%` : ''}</span>
            <span>
              {progress.currentLine.toLocaleString()} / {progress.totalLines.toLocaleString()} lines
            </span>
            <span>
              Elapsed: {formatDuration(progress.elapsed)}
              {progress.eta > 0 && ` · ETA: ${formatDuration(progress.eta)}`}
            </span>
          </div>
        </div>
      )}

      {/* Error message */}
      {job.status === 'error' && job.errorMessage && (
        <p className="text-xs text-red-400 bg-red-900/20 rounded px-2 py-1">{job.errorMessage}</p>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2 pt-1">
        {job.status === 'idle' || job.status === 'queued' ? (
          <button
            onClick={onStart}
            className="px-3 py-1 text-xs rounded bg-green-700 hover:bg-green-600 text-white transition-colors flex items-center gap-1"
          ><FontAwesomeIcon icon={faPlay} /> Start</button>
        ) : job.status === 'running' ? (
          <button
            onClick={onPause}
            className="px-3 py-1 text-xs rounded bg-orange-700 hover:bg-orange-600 text-white transition-colors flex items-center gap-1"
          ><FontAwesomeIcon icon={faPause} /> Pause</button>
        ) : job.status === 'paused' ? (
          <button
            onClick={onResume}
            className="px-3 py-1 text-xs rounded bg-green-700 hover:bg-green-600 text-white transition-colors flex items-center gap-1"
          ><FontAwesomeIcon icon={faPlay} /> Resume</button>
        ) : null}

        {(job.status === 'running' || job.status === 'paused') && (
          <button
            onClick={onAbort}
            className="px-3 py-1 text-xs rounded bg-red-700 hover:bg-red-600 text-white transition-colors flex items-center gap-1"
          ><FontAwesomeIcon icon={faStop} /> Cancel</button>
        )}

        <button
          onClick={onDuplicate}
          className="px-3 py-1 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors flex items-center gap-1"
          title="Duplicate job"
        ><FontAwesomeIcon icon={faClone} /> Duplicate</button>

        <button
          onClick={onDelete}
          disabled={job.status === 'running'}
          className="px-3 py-1 text-xs rounded bg-gray-700 hover:bg-red-900 text-gray-400 hover:text-red-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors ml-auto flex items-center gap-1"
          title="Delete job"
        ><FontAwesomeIcon icon={faTrash} /></button>
      </div>
    </div>
  );
}

export default function Queue() {
  const jobs = useJobStore(s => s.jobs);
  const jobProgress = useJobStore(s => s.jobProgress);
  const fetchJobs = useJobStore(s => s.fetchJobs);
  const startJob = useJobStore(s => s.startJob);
  const pauseJob = useJobStore(s => s.pauseJob);
  const resumeJob = useJobStore(s => s.resumeJob);
  const abortJob = useJobStore(s => s.abortJob);
  const deleteJob = useJobStore(s => s.deleteJob);
  const addToast = useToastStore(s => s.addToast);
  const [loading, setLoading] = useState(false);

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

  const wrap = (fn: () => Promise<void>, successMsg?: string) => async () => {
    try {
      await fn();
      if (successMsg) addToast('success', successMsg);
      await fetchJobs();
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Action failed');
    }
  };

  // Sort: running > paused > queued > idle > completed > error
  const statusOrder: Record<string, number> = { running: 0, paused: 1, queued: 2, idle: 3, completed: 4, error: 5 };
  const sorted = [...jobs].sort((a, b) => (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9));

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Job Queue</h1>
          <p className="text-sm text-gray-400 mt-1">
            {jobs.length} job{jobs.length !== 1 ? 's' : ''}
            {jobs.filter(j => j.status === 'running').length > 0 && (
              <span className="text-green-400 ml-2">
                · {jobs.filter(j => j.status === 'running').length} running
              </span>
            )}
          </p>
        </div>
        <button
          onClick={() => { void fetchJobs(); }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm font-semibold transition-colors"
          title="Refresh job list"
        ><FontAwesomeIcon icon={faRotateRight} /> Refresh</button>
      </div>

      {loading && jobs.length === 0 ? (
        <div className="text-center py-24 text-gray-500">
          <p className="text-sm">Loading jobs…</p>
        </div>
      ) : sorted.length === 0 ? (
        <div className="text-center py-24 border-2 border-dashed border-gray-800 rounded-xl">
          <div className="text-5xl mb-4">📭</div>
          <h2 className="text-lg font-semibold text-gray-400">No jobs in queue</h2>
          <p className="text-sm text-gray-600 mt-2">
            Generate G-code from the Editor and send it to the queue
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map(job => (
            <JobRow
              key={job.id}
              job={job}
              progress={jobProgress[job.id]}
              onStart={() => { void wrap(() => startJob(job.id), 'Job started')(); }}
              onPause={() => { void wrap(() => pauseJob(job.id), 'Job paused')(); }}
              onResume={() => { void wrap(() => resumeJob(job.id), 'Job resumed')(); }}
              onAbort={() => { void wrap(() => abortJob(job.id), 'Job cancelled')(); }}
              onDelete={() => { void wrap(() => deleteJob(job.id), 'Job deleted')(); }}
              onDuplicate={() => {
                addToast('info', 'Duplicate: re-send from Editor to create a copy');
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
