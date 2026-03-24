import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { machineProfiles } from '../config/MachineProfiles.js';
import type { MachineProfile } from '../types/index.js';

export function registerRoutes(app: FastifyInstance): void {
  app.get('/api/machines', async (_req, reply) => {
    return reply.send(machineProfiles.getAll());
  });

  app.post<{ Body: Omit<MachineProfile, 'id'> & { id?: string } }>('/api/machines', async (req, reply) => {
    const profile: MachineProfile = {
      ...req.body,
      id: req.body.id ?? randomUUID(),
    };
    machineProfiles.save(profile);
    return reply.code(201).send(profile);
  });

  app.delete<{ Params: { id: string } }>('/api/machines/:id', async (req, reply) => {
    machineProfiles.delete(req.params.id);
    return reply.code(204).send();
  });
}
