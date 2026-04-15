import type { FastifyInstance } from 'fastify';
import { getInboxDir, setInboxDir } from '../importInbox.js';

export function registerRoutes(app: FastifyInstance): void {
  /**
   * GET /api/settings/import-inbox
   *
   * Returns the current import inbox directory path.
   */
  app.get('/api/settings/import-inbox', async (_req, reply) => {
    return reply.send({ path: getInboxDir() });
  });

  /**
   * PUT /api/settings/import-inbox
   *
   * Change the import inbox directory.  The backend will restart its
   * file-watcher to use the new path.
   *
   * Body: { path: string }
   */
  app.put('/api/settings/import-inbox', async (req, reply) => {
    const body = req.body as { path?: string } | null;
    if (!body || typeof body.path !== 'string' || body.path.trim().length === 0) {
      return reply.code(400).send({ error: 'path field is required' });
    }

    try {
      const resolved = setInboxDir(body.path.trim());
      return reply.send({ path: resolved });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.code(400).send({ error: msg });
    }
  });
}
