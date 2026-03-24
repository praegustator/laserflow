import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useJobStore } from '../store/jobStore';
import JobCard from '../components/JobCard';

export default function Dashboard() {
  const jobs = useJobStore((s) => s.jobs);
  const fetchJobs = useJobStore((s) => s.fetchJobs);
  const uploadJob = useJobStore((s) => s.uploadJob);
  const setActiveJobId = useJobStore((s) => s.setActiveJobId);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    void fetchJobs();
  }, [fetchJobs]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const job = await uploadJob(file);
      setActiveJobId(job.id);
      void navigate('/editor');
    } catch (err) {
      console.error('Upload failed', err);
    } finally {
      e.target.value = '';
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = Array.from(e.dataTransfer.files).find(f => f.name.endsWith('.svg'));
    if (!file) return;
    try {
      const job = await uploadJob(file);
      setActiveJobId(job.id);
      void navigate('/editor');
    } catch (err) { console.error(err); }
  };

  return (
    <div
      className="relative p-6 max-w-4xl mx-auto"
      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => { void handleDrop(e); }}
    >
      {dragOver && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-gray-950/80 border-4 border-dashed border-orange-400 rounded-xl pointer-events-none">
          <p className="text-2xl font-bold text-orange-400">Drop SVG file here</p>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Dashboard</h1>
          <p className="text-sm text-gray-400 mt-1">
            {jobs.length} job{jobs.length !== 1 ? 's' : ''}
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-sm font-semibold transition-colors"
          >
            <span>+ Import SVG</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".svg"
            className="hidden"
            onChange={(e) => { void handleFileChange(e); }}
          />
        </div>
      </div>

      {/* Job list */}
      {jobs.length === 0 ? (
        <div className="text-center py-24 border-2 border-dashed border-gray-800 rounded-xl">
          <div className="text-5xl mb-4">🔥</div>
          <h2 className="text-lg font-semibold text-gray-400">No jobs yet</h2>
          <p className="text-sm text-gray-600 mt-2 mb-6">
            Import an SVG file or drag and drop one here
          </p>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-5 py-2 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-sm font-semibold transition-colors"
          >
            Import SVG
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {jobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              onView={() => {
                setActiveJobId(job.id);
                void navigate('/editor');
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
