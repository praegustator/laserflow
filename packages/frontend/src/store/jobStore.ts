import { create } from 'zustand';
import { api } from '../api/client';
import type { Job, Operation, JobProgress } from '../types';

interface JobStore {
  jobs: Job[];
  activeJobId: string | null;
  jobProgress: Record<string, JobProgress>;

  fetchJobs: () => Promise<void>;
  uploadJob: (file: File) => Promise<Job>;
  generateGcode: (jobId: string, operations: Operation[], machineId?: string) => Promise<string>;
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
    set({ jobs });
  },

  uploadJob: async (file: File) => {
    const form = new FormData();
    form.append('file', file);
    const job = await api.postForm('/api/jobs', form) as Job;
    set((s) => ({ jobs: [job, ...s.jobs] }));
    return job;
  },

  generateGcode: async (jobId: string, operations: Operation[], machineId?: string) => {
    const result = await api.post(`/api/jobs/${jobId}/gcode`, { operations, machineId }) as { gcode: string };
    set((s) => ({
      jobs: s.jobs.map((j) =>
        j.id === jobId ? { ...j, gcode: result.gcode } : j,
      ),
    }));
    return result.gcode;
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
    // Fetch job list if the selected job isn't already loaded
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
