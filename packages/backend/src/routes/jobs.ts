import type { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { jobRepo } from '../jobs/JobRepository.js';
import { jobEngine } from '../jobs/JobExecutionEngine.js';
import { serialManager } from '../serial/SerialManager.js';
import { GRBL_REALTIME } from '../serial/GrblProtocol.js';
import { parseSvg } from '../cam/SvgParser.js';
import { generateGcode, type PathTransform } from '../cam/GcodeGenerator.js';
import { machineProfiles } from '../config/MachineProfiles.js';
import type { Job, Operation } from '../types/index.js';

/** Extract bounding box of G1 (cutting) moves from G-code. */
function gcodeBBox(gcode: string): { minX: number; minY: number; maxX: number; maxY: number } | null {
  // Track current X/Y position, starting at origin (our generator always emits G0 X0 Y0 first).
  let x = 0, y = 0;
  // Use separate flags to know whether each axis has been explicitly set
  let xSet = false, ySet = false;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let hasMove = false;
  for (const raw of gcode.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith(';')) continue;
    // Match G0 / G1 regardless of whether there is whitespace before parameters
    const isG0 = /^G0(?:\s|[A-Z]|$)/i.test(line);
    const isG1 = /^G1(?:\s|[A-Z]|$)/i.test(line);
    if (!isG0 && !isG1) continue;
    const xm = line.match(/X(-?[\d.]+)/i);
    const ym = line.match(/Y(-?[\d.]+)/i);
    if (xm) { x = parseFloat(xm[1]); xSet = true; }
    if (ym) { y = parseFloat(ym[1]); ySet = true; }
    // Only update bbox for G1 (cutting) moves where at least one axis was specified
    if (isG1 && (xm || ym) && xSet && ySet) {
      hasMove = true;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  return hasMove && Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
}

/** Generate G-code that traces the bounding rectangle with laser off at 1000 mm/min. */
function frameGcode(bbox: { minX: number; minY: number; maxX: number; maxY: number }): string {
  const f = (n: number) => n.toFixed(3);
  const { minX, minY, maxX, maxY } = bbox;
  return [
    '; Frame trace',
    'M5',
    'G90',
    `G0 X${f(minX)} Y${f(minY)} S0`,
    `G1 X${f(maxX)} Y${f(minY)} F1000 S0`,
    `G1 X${f(maxX)} Y${f(maxY)} F1000 S0`,
    `G1 X${f(minX)} Y${f(maxY)} F1000 S0`,
    `G1 X${f(minX)} Y${f(minY)} F1000 S0`,
    `G0 X${f(minX)} Y${f(minY)} S0`,
    '; End frame trace',
    '',
  ].join('\n');
}

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

  // Bulk delete
  app.post<{ Body: { ids: string[] } }>('/api/jobs/bulk-delete', async (req, reply) => {
    const { ids } = req.body;
    if (!Array.isArray(ids)) return reply.code(400).send({ error: 'ids array is required' });
    for (const id of ids) {
      const job = jobRepo.findById(id);
      if (job && job.status !== 'running') {
        jobRepo.delete(id);
      }
    }
    return reply.send({ deleted: ids.length });
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
      job.gcode = await generateGcode(job.geometry, operations, profile, layerTransforms, originFlip, workH);
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
      projectId?: string;
      projectVersion?: string;
    };
  }>('/api/jobs/compile', async (req, reply) => {
    const { name, geometry, operations: ops, machineId, layerTransforms, originFlip, workH, projectId, projectVersion } = req.body;
    if (!geometry || !Array.isArray(geometry) || geometry.length === 0) {
      return reply.code(400).send({ error: 'geometry is required' });
    }
    const profile = machineId ? machineProfiles.getById(machineId) : machineProfiles.getAll()[0];
    if (!profile) return reply.code(400).send({ error: 'No machine profile found' });

    const gcode = await generateGcode(geometry, ops ?? [], profile, layerTransforms, originFlip, workH);

    const job: Job = {
      id: uuidv4(),
      name: name || 'Compiled Job',
      createdAt: new Date().toISOString(),
      status: 'idle',
      geometry,
      operations: ops ?? [],
      gcode,
      projectId,
      projectVersion,
    };

    jobRepo.save(job);
    return reply.code(201).send(job);
  });

  app.post<{ Params: { id: string }; Body: { frame?: boolean } }>('/api/jobs/:id/start', async (req, reply) => {
    const job = jobRepo.findById(req.params.id);
    if (!job) return reply.code(404).send({ error: 'Not found' });
    if (!job.gcode) return reply.code(400).send({ error: 'Job has no G-code' });
    if (serialManager.getStatus() !== 'connected') {
      return reply.code(400).send({ error: 'Machine is not connected' });
    }

    // Prepend bounding-box frame trace (laser off) when requested (default: true).
    const frame = req.body?.frame !== false;
    let gcodeToRun = job.gcode;
    if (frame) {
      const bbox = gcodeBBox(job.gcode);
      if (bbox) {
        gcodeToRun = frameGcode(bbox) + job.gcode;
      }
    }

    job.status = 'running';
    job.errorMessage = undefined;
    jobRepo.save(job);
    await jobEngine.start({ ...job, gcode: gcodeToRun });
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
    job.status = 'canceled';
    jobRepo.save(job);
    return reply.send({ status: 'canceled' });
  });

  // Duplicate a job (creates a new copy with 'idle' status)
  app.post<{ Params: { id: string } }>('/api/jobs/:id/duplicate', async (req, reply) => {
    const job = jobRepo.findById(req.params.id);
    if (!job) return reply.code(404).send({ error: 'Not found' });

    const copy: Job = {
      ...job,
      id: uuidv4(),
      name: `${job.name} (copy)`,
      createdAt: new Date().toISOString(),
      status: job.gcode ? 'queued' : 'idle',
      errorMessage: undefined,
    };

    jobRepo.save(copy);
    return reply.code(201).send(copy);
  });

  // Queue a job (set status to 'queued' without starting execution)
  app.post<{ Params: { id: string } }>('/api/jobs/:id/queue', async (req, reply) => {
    const job = jobRepo.findById(req.params.id);
    if (!job) return reply.code(404).send({ error: 'Not found' });
    if (!job.gcode) return reply.code(400).send({ error: 'Job has no G-code' });

    job.status = 'queued';
    job.errorMessage = undefined;
    jobRepo.save(job);
    return reply.send({ status: 'queued' });
  });

  // Rename a job
  app.patch<{ Params: { id: string }; Body: { name: string } }>('/api/jobs/:id/rename', async (req, reply) => {
    const job = jobRepo.findById(req.params.id);
    if (!job) return reply.code(404).send({ error: 'Not found' });
    const { name } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return reply.code(400).send({ error: 'name is required' });
    }
    job.name = name.trim();
    jobRepo.save(job);
    return reply.send(job);
  });

  // Reorder queued jobs
  app.post<{ Body: { orderedIds: string[] } }>('/api/jobs/reorder', async (req, reply) => {
    const { orderedIds } = req.body;
    if (!Array.isArray(orderedIds)) return reply.code(400).send({ error: 'orderedIds array is required' });
    // Re-timestamp queued jobs to reflect new ordering
    const now = Date.now();
    for (let i = 0; i < orderedIds.length; i++) {
      const job = jobRepo.findById(orderedIds[i]);
      if (job && (job.status === 'queued' || job.status === 'idle')) {
        job.createdAt = new Date(now + i).toISOString();
        jobRepo.save(job);
      }
    }
    return reply.send({ reordered: orderedIds.length });
  });

  // Emergency stop: abort current job and send GRBL soft-reset
  app.post('/api/emergency-stop', async (_req, reply) => {
    jobEngine.abort();
    // Also reset all running/paused jobs to error
    for (const job of jobRepo.findAll()) {
      if (job.status === 'running' || job.status === 'paused') {
        job.status = 'error';
        job.errorMessage = 'Emergency stop';
        jobRepo.save(job);
      }
    }
    // Send soft-reset to GRBL if connected
    if (serialManager.getStatus() === 'connected') {
      serialManager.writeRealtime(String.fromCharCode(GRBL_REALTIME.SOFT_RESET));
      try { await serialManager.sendCommand('M5'); } catch (e) { app.log.warn('Emergency stop: M5 failed: %s', e); }
    }
    return reply.send({ status: 'stopped' });
  });
}
