import { create } from 'zustand';
import { api } from '../api/client';
import type { Job, Operation, JobProgress, Layer } from '../types';

interface JobStore {
  jobs: Job[];
  activeJobId: string | null;
  jobProgress: Record<string, JobProgress>;
  layers: Layer[];

  fetchJobs: () => Promise<void>;
  uploadJob: (file: File) => Promise<Job>;
  generateGcode: (
    jobId: string,
    operations: Operation[],
    machineId?: string,
    layerTransforms?: Record<string, { offsetX: number; offsetY: number; scaleX: number; scaleY: number }>,
    originFlip?: boolean,
    workH?: number,
  ) => Promise<string>;
  startJob: (jobId: string) => Promise<void>;
  pauseJob: (jobId: string) => Promise<void>;
  resumeJob: (jobId: string) => Promise<void>;
  abortJob: (jobId: string) => Promise<void>;
  deleteJob: (jobId: string) => Promise<void>;
  setActiveJobId: (id: string | null) => void;
  updateJobProgress: (jobId: string, progress: JobProgress) => void;
  updateJobStatus: (jobId: string, status: Job['status']) => void;

  // Layer management
  addLayer: (layer: Layer) => void;
  updateLayer: (id: string, partial: Partial<Layer>) => void;
  removeLayer: (id: string) => void;
  moveLayerUp: (id: string) => void;
  moveLayerDown: (id: string) => void;
}

export const useJobStore = create<JobStore>((set, get) => ({
  jobs: [],
  activeJobId: null,
  jobProgress: {},
  layers: [],

  fetchJobs: async () => {
    const jobs = await api.get('/api/jobs') as Job[];
    set({ jobs: jobs.map(j => ({ ...j, layers: j.layers ?? [] })) });
  },

  uploadJob: async (file: File) => {
    const form = new FormData();
    form.append('file', file);
    const job = await api.postForm('/api/jobs', form) as Job;
    const jobWithLayers = { ...job, layers: job.layers ?? [] };

    // Create a layer from the uploaded file
    const layerId = job.id;
    const layer: Layer = {
      id: layerId,
      name: file.name.replace(/\.svg$/i, ''),
      sourceSvg: job.sourceSvg ?? '',
      geometry: job.geometry.map(g => ({ ...g, layerId })),
      visible: true,
      offsetX: 0,
      offsetY: 0,
      scaleX: 1,
      scaleY: 1,
    };

    set((s) => ({
      jobs: [jobWithLayers, ...s.jobs],
      layers: [...s.layers, layer],
    }));
    return jobWithLayers;
  },

  generateGcode: async (jobId, operations, machineId, layerTransforms, originFlip, workH) => {
    const result = await api.post(`/api/jobs/${jobId}/gcode`, {
      operations,
      machineId,
      layerTransforms,
      originFlip,
      workH,
    }) as { gcode: string };
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

  addLayer: (layer) => {
    set((s) => ({ layers: [...s.layers, layer] }));
  },

  updateLayer: (id, partial) => {
    set((s) => ({
      layers: s.layers.map((l) => (l.id === id ? { ...l, ...partial } : l)),
    }));
  },

  removeLayer: (id) => {
    set((s) => ({ layers: s.layers.filter((l) => l.id !== id) }));
  },

  moveLayerUp: (id) => {
    set((s) => {
      const idx = s.layers.findIndex((l) => l.id === id);
      if (idx <= 0) return s;
      const next = [...s.layers];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return { layers: next };
    });
  },

  moveLayerDown: (id) => {
    set((s) => {
      const idx = s.layers.findIndex((l) => l.id === id);
      if (idx < 0 || idx >= s.layers.length - 1) return s;
      const next = [...s.layers];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return { layers: next };
    });
  },
}));
