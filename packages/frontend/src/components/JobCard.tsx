import type { Job, JobProgress } from '../types';
import { useJobStore } from '../store/jobStore';

const STATUS_COLORS: Record<string, string> = {
  idle: 'bg-gray-600 text-gray-200',
  queued: 'bg-blue-700 text-blue-100',
  running: 'bg-blue-500 text-white',
  paused: 'bg-yellow-600 text-yellow-100',
  completed: 'bg-green-600 text-white',
  error: 'bg-red-600 text-white',
};

function ProgressBar({ progress }: { progress: JobProgress }) {
  const pct =
    progress.totalLines > 0
      ? Math.round((progress.currentLine / progress.totalLines) * 100)
      : 0;
  const etaSec = Math.round(progress.eta / 1000);
  return (
    <div className="mt-2 space-y-1">
      <div className="w-full bg-gray-700 rounded-full h-1.5">
        <div
          className="bg-blue-500 h-1.5 rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-gray-500">
        <span>
          {progress.currentLine}/{progress.totalLines} lines ({pct}%)
        </span>
        {etaSec > 0 && <span>ETA {etaSec}s</span>}
      </div>
    </div>
  );
}

interface Props {
  job: Job;
  onView?: () => void;
}

export default function JobCard({ job, onView }: Props) {
  const startJob = useJobStore((s) => s.startJob);
  const pauseJob = useJobStore((s) => s.pauseJob);
  const resumeJob = useJobStore((s) => s.resumeJob);
  const abortJob = useJobStore((s) => s.abortJob);
  const deleteJob = useJobStore((s) => s.deleteJob);
  const progress = useJobStore((s) => s.jobProgress[job.id]);

  const createdAt = new Date(job.createdAt).toLocaleString();
  const colorClass = STATUS_COLORS[job.status] ?? STATUS_COLORS.idle;

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 space-y-3 hover:border-gray-600 transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold text-gray-100 truncate">{job.name}</h3>
          <p className="text-xs text-gray-500 mt-0.5">{createdAt}</p>
        </div>
        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold flex-shrink-0 ${colorClass}`}>
          {job.status}
        </span>
      </div>

      {/* Metadata */}
      <div className="flex gap-4 text-xs text-gray-400">
        <span>{job.geometry.length} paths</span>
        <span>{job.operations.length} operations</span>
        {job.gcode && (
          <span>{job.gcode.split('\n').length.toLocaleString()} lines</span>
        )}
      </div>

      {/* Progress */}
      {progress && (job.status === 'running' || job.status === 'paused') && (
        <ProgressBar progress={progress} />
      )}

      {/* Error */}
      {job.status === 'error' && job.errorMessage && (
        <p className="text-xs text-red-400 bg-red-900/20 rounded p-2">
          {job.errorMessage}
        </p>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2 pt-1">
        {onView && (
          <button
            onClick={onView}
            className="px-3 py-1 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors"
          >
            View
          </button>
        )}

        {(job.status === 'idle' || job.status === 'completed' || job.status === 'error') &&
          job.gcode && (
            <button
              onClick={() => { void startJob(job.id); }}
              className="px-3 py-1 text-xs rounded bg-green-700 hover:bg-green-600 text-white transition-colors"
            >
              ▶ Start
            </button>
          )}

        {job.status === 'running' && (
          <button
            onClick={() => { void pauseJob(job.id); }}
            className="px-3 py-1 text-xs rounded bg-yellow-700 hover:bg-yellow-600 text-white transition-colors"
          >
            ⏸ Pause
          </button>
        )}

        {job.status === 'paused' && (
          <button
            onClick={() => { void resumeJob(job.id); }}
            className="px-3 py-1 text-xs rounded bg-blue-700 hover:bg-blue-600 text-white transition-colors"
          >
            ▶ Resume
          </button>
        )}

        {(job.status === 'running' || job.status === 'paused') && (
          <button
            onClick={() => { void abortJob(job.id); }}
            className="px-3 py-1 text-xs rounded bg-red-800 hover:bg-red-700 text-white transition-colors"
          >
            ■ Abort
          </button>
        )}

        {job.status !== 'running' && (
          <button
            onClick={() => { void deleteJob(job.id); }}
            className="px-3 py-1 text-xs rounded bg-gray-700 hover:bg-red-900 text-gray-400 hover:text-red-300 transition-colors ml-auto"
          >
            🗑
          </button>
        )}
      </div>
    </div>
  );
}
