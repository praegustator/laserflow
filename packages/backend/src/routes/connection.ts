import type { FastifyInstance } from 'fastify';
import { serialManager } from '../serial/SerialManager.js';

export function registerRoutes(app: FastifyInstance): void {
  app.post<{ Body: { port: string; baudRate: number } }>('/api/connect', async (req, reply) => {
    const { port, baudRate } = req.body;
    await serialManager.connect(port, baudRate);
    return reply.send({ status: 'connected' });
  });

  app.post('/api/disconnect', async (_req, reply) => {
    await serialManager.disconnect();
    return reply.send({ status: 'disconnected' });
  });

  app.get('/api/status', async (_req, reply) => {
    return reply.send({ status: serialManager.getStatus() });
  });
}
