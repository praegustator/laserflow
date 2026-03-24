import type { FastifyInstance } from 'fastify';
import { machineProfiles } from '../config/MachineProfiles.js';
import type { MachineProfile } from '../types/index.js';

export function registerRoutes(app: FastifyInstance): void {
  app.get('/api/machines', async (_req, reply) => {
    return reply.send(machineProfiles.getAll());
  });

  app.post<{ Body: MachineProfile }>('/api/machines', async (req, reply) => {
    const profile = req.body;
    machineProfiles.save(profile);
    return reply.code(201).send(profile);
  });

  app.delete<{ Params: { id: string } }>('/api/machines/:id', async (req, reply) => {
    machineProfiles.delete(req.params.id);
    return reply.code(204).send();
  });
}
