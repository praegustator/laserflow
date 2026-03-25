import type { FastifyInstance } from 'fastify';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pkg = require('../../package.json') as { version: string };

export function registerRoutes(app: FastifyInstance): void {
  app.get('/api/version', async (_req, reply) => {
    const version = process.env['BACKEND_VERSION'] ?? pkg.version;
    return reply.send({ version });
  });
}
