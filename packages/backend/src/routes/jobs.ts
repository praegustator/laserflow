import type { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { JobRepository } from '../jobs/JobRepository.js';
import { jobEngine } from '../jobs/JobExecutionEngine.js';
import { parseSvg } from '../cam/SvgParser.js';
import { generateGcode, type PathTransform } from '../cam/GcodeGenerator.js';
import { machineProfiles } from '../config/MachineProfiles.js';
import type { Job, Operation } from '../types/index.js';
const jobRepo = new JobRepository();

export function registerRoutes(app: FastifyInstance): void {
  app.get('/api/jobs', async (_req, reply) => {
    return reply.send(jobRepo.findAll());
  });

  app.get<{ Params: { id: string } }>('/api/jobs/:id', async (req, reply) => {
    const job = jobRepo.findById(req.params.id);
    if (!job) return reply.code(404).send({ error: 'Not found' });
    return reply.send(job);
  });

  app.post('/api/jobs', async (req, reply) => {
    const data = await req.file();
    if (!data) return reply.code(400).send({ error: 'No file uploaded' });

    const svgContent = (await data.toBuffer()).toString('utf-8');
    const geometry = await parseSvg(svgContent);

    const job: Job = {
      id: uuidv4(),
      name: data.filename ?? 'Untitled',
      createdAt: new Date().toISOString(),
      status: 'idle',
      sourceSvg: svgContent,
      geometry,
      operations: [],
    };

    jobRepo.save(job);
    return reply.code(201).send(job);
  });

  app.delete<{ Params: { id: string } }>('/api/jobs/:id', async (req, reply) => {
    jobRepo.delete(req.params.id);
    return reply.code(204).send();
  });

  app.post<{ Params: { id: string }; Body: { operations: Operation[]; machineId?: string; layerTransforms?: Record<string, PathTransform>; originFlip?: boolean; workH?: number } }>(
    '/api/jobs/:id/gcode',
    async (req, reply) => {
      const job = jobRepo.findById(req.params.id);
      if (!job) return reply.code(404).send({ error: 'Not found' });

      const { operations, machineId, layerTransforms, originFlip, workH } = req.body;
      const profile = machineId ? machineProfiles.getById(machineId) : machineProfiles.getAll()[0];
      if (!profile) return reply.code(400).send({ error: 'No machine profile found' });

      job.operations = operations;
      job.gcode = generateGcode(job.geometry, operations, profile, layerTransforms, originFlip, workH);
      jobRepo.save(job);

      return reply.send({ gcode: job.gcode });
    }
  );

  // Compile endpoint: accepts raw geometry + operations, creates a job with generated G-code
  app.post<{
    Body: {
      name: string;
      geometry: import('../types/index.js').PathGeometry[];
      operations: Operation[];
      machineId?: string;
      layerTransforms?: Record<string, PathTransform>;
      originFlip?: boolean;
      workH?: number;
    };
  }>('/api/jobs/compile', async (req, reply) => {
    const { name, geometry, operations: ops, machineId, layerTransforms, originFlip, workH } = req.body;
    if (!geometry || !Array.isArray(geometry) || geometry.length === 0) {
      return reply.code(400).send({ error: 'geometry is required' });
    }
    const profile = machineId ? machineProfiles.getById(machineId) : machineProfiles.getAll()[0];
    if (!profile) return reply.code(400).send({ error: 'No machine profile found' });

    const gcode = generateGcode(geometry, ops ?? [], profile, layerTransforms, originFlip, workH);

    const job: Job = {
      id: uuidv4(),
      name: name || 'Compiled Job',
      createdAt: new Date().toISOString(),
      status: 'idle',
      geometry,
      operations: ops ?? [],
      gcode,
    };

    jobRepo.save(job);
    return reply.code(201).send(job);
  });

  app.post<{ Params: { id: string } }>('/api/jobs/:id/start', async (req, reply) => {
    const job = jobRepo.findById(req.params.id);
    if (!job) return reply.code(404).send({ error: 'Not found' });
    if (!job.gcode) return reply.code(400).send({ error: 'Job has no G-code' });

    job.status = 'running';
    jobRepo.save(job);
    await jobEngine.start(job);
    return reply.send({ status: 'running' });
  });

  app.post<{ Params: { id: string } }>('/api/jobs/:id/pause', async (req, reply) => {
    const job = jobRepo.findById(req.params.id);
    if (!job) return reply.code(404).send({ error: 'Not found' });

    jobEngine.pause();
    job.status = 'paused';
    jobRepo.save(job);
    return reply.send({ status: 'paused' });
  });

  app.post<{ Params: { id: string } }>('/api/jobs/:id/resume', async (req, reply) => {
    const job = jobRepo.findById(req.params.id);
    if (!job) return reply.code(404).send({ error: 'Not found' });

    jobEngine.resume();
    job.status = 'running';
    jobRepo.save(job);
    return reply.send({ status: 'running' });
  });

  app.post<{ Params: { id: string } }>('/api/jobs/:id/abort', async (req, reply) => {
    const job = jobRepo.findById(req.params.id);
    if (!job) return reply.code(404).send({ error: 'Not found' });

    jobEngine.abort();
    job.status = 'idle';
    jobRepo.save(job);
    return reply.send({ status: 'idle' });
  });
}
