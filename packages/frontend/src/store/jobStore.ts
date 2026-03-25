import { create } from 'zustand';
import { api } from '../api/client';
import type { Job, JobProgress } from '../types';

interface JobStore {
  jobs: Job[];
  activeJobId: string | null;
  jobProgress: Record<string, JobProgress>;

  fetchJobs: () => Promise<void>;
  startJob: (jobId: string) => Promise<void>;
  pauseJob: (jobId: string) => Promise<void>;
  resumeJob: (jobId: string) => Promise<void>;
  abortJob: (jobId: string) => Promise<void>;
  deleteJob: (jobId: string) => Promise<void>;
  duplicateJob: (jobId: string) => Promise<Job>;
  queueJob: (jobId: string) => Promise<void>;
  bulkDeleteJobs: (ids: string[]) => Promise<void>;
  reorderJobs: (orderedIds: string[]) => Promise<void>;
  emergencyStop: () => Promise<void>;
  setActiveJobId: (id: string | null) => void;
  updateJobProgress: (jobId: string, progress: JobProgress) => void;
  updateJobStatus: (jobId: string, status: Job['status']) => void;
}

export const useJobStore = create<JobStore>((set, get) => ({
  jobs: [],
  activeJobId: null,
  jobProgress: {},

  fetchJobs: async () => {
    const jobs = await api.get('/api/jobs') as Job[];
    set({ jobs: jobs.map(j => ({ ...j, layers: j.layers ?? [] })) });
  },

  startJob: async (jobId: string) => {
    await api.post(`/api/jobs/${jobId}/start`);
    set((s) => ({
      activeJobId: jobId,
      jobs: s.jobs.map((j) =>
        j.id === jobId ? { ...j, status: 'running' } : j,
      ),
    }));
  },

  pauseJob: async (jobId: string) => {
    await api.post(`/api/jobs/${jobId}/pause`);
    set((s) => ({
      jobs: s.jobs.map((j) =>
        j.id === jobId ? { ...j, status: 'paused' } : j,
      ),
    }));
  },

  resumeJob: async (jobId: string) => {
    await api.post(`/api/jobs/${jobId}/resume`);
    set((s) => ({
      jobs: s.jobs.map((j) =>
        j.id === jobId ? { ...j, status: 'running' } : j,
      ),
    }));
  },

  abortJob: async (jobId: string) => {
    await api.post(`/api/jobs/${jobId}/abort`);
    set((s) => ({
      activeJobId: s.activeJobId === jobId ? null : s.activeJobId,
      jobs: s.jobs.map((j) =>
        j.id === jobId ? { ...j, status: 'idle' } : j,
      ),
    }));
  },

  deleteJob: async (jobId: string) => {
    await api.delete(`/api/jobs/${jobId}`);
    set((s) => ({
      jobs: s.jobs.filter((j) => j.id !== jobId),
      activeJobId: s.activeJobId === jobId ? null : s.activeJobId,
    }));
  },

  duplicateJob: async (jobId: string) => {
    const copy = await api.post(`/api/jobs/${jobId}/duplicate`) as Job;
    set((s) => ({ jobs: [...s.jobs, { ...copy, layers: copy.layers ?? [] }] }));
    return copy;
  },

  queueJob: async (jobId: string) => {
    await api.post(`/api/jobs/${jobId}/queue`);
    set((s) => ({
      jobs: s.jobs.map((j) =>
        j.id === jobId ? { ...j, status: 'queued' } : j,
      ),
    }));
  },

  bulkDeleteJobs: async (ids: string[]) => {
    await api.post('/api/jobs/bulk-delete', { ids });
    set((s) => ({
      jobs: s.jobs.filter((j) => !ids.includes(j.id)),
      activeJobId: ids.includes(s.activeJobId ?? '') ? null : s.activeJobId,
    }));
  },

  reorderJobs: async (orderedIds: string[]) => {
    await api.post('/api/jobs/reorder', { orderedIds });
    void get().fetchJobs();
  },

  emergencyStop: async () => {
    await api.post('/api/emergency-stop');
    set((s) => ({
      activeJobId: null,
      jobs: s.jobs.map((j) =>
        j.status === 'running' || j.status === 'paused'
          ? { ...j, status: 'error', errorMessage: 'Emergency stop' }
          : j,
      ),
    }));
  },

  setActiveJobId: (id) => {
    set({ activeJobId: id });
    if (id && !get().jobs.find((j) => j.id === id)) {
      void get().fetchJobs();
    }
  },

  updateJobProgress: (jobId, progress) => {
    set((s) => ({ jobProgress: { ...s.jobProgress, [jobId]: progress } }));
  },

  updateJobStatus: (jobId, status) => {
    set((s) => ({
      jobs: s.jobs.map((j) => (j.id === jobId ? { ...j, status } : j)),
    }));
  },
}));
