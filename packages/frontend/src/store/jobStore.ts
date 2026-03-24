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
