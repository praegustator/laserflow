import type { FastifyInstance } from 'fastify';
import { serialManager } from '../serial/SerialManager.js';

export function registerRoutes(app: FastifyInstance): void {
  app.get('/api/ports', async (_req, reply) => {
    const ports = await serialManager.listPorts();
    return reply.send(ports);
  });
}
