import type { FastifyInstance } from 'fastify';
import { serialManager } from '../serial/SerialManager.js';

export function registerRoutes(app: FastifyInstance): void {
  app.post<{ Body: { command: string } }>('/api/command', async (req, reply) => {
    const { command } = req.body;
    await serialManager.sendCommand(command);
    return reply.send({ sent: true });
  });
}
