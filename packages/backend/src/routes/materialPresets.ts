import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { materialPresets } from '../config/MaterialPresets.js';
import type { MaterialPreset } from '../types/index.js';

export function registerRoutes(app: FastifyInstance): void {
  app.get('/api/material-presets', async (_req, reply) => {
    return reply.send(materialPresets.getAll());
  });

  app.post<{ Body: Omit<MaterialPreset, 'id'> & { id?: string } }>('/api/material-presets', async (req, reply) => {
    const preset: MaterialPreset = { ...req.body, id: req.body.id ?? randomUUID() };
    materialPresets.save(preset);
    return reply.code(201).send(preset);
  });

  app.post<{ Params: { id: string }; Body: MaterialPreset }>('/api/material-presets/:id', async (req, reply) => {
    const preset: MaterialPreset = { ...req.body, id: req.params.id };
    materialPresets.save(preset);
    return reply.send(preset);
  });

  app.delete<{ Params: { id: string } }>('/api/material-presets/:id', async (req, reply) => {
    materialPresets.delete(req.params.id);
    return reply.code(204).send();
  });
}
