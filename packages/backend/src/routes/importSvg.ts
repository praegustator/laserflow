import type { FastifyInstance } from 'fastify';
import { parseSvg } from '../cam/SvgParser.js';
import { wsBroadcaster } from '../ws/WebSocketServer.js';

export function registerRoutes(app: FastifyInstance): void {
  /**
   * POST /api/import/svg
   *
   * Accepts SVG content either as a JSON body or a multipart file upload,
   * parses it with the existing SVG parser, and broadcasts a `svgPushed`
   * WebSocket event so all connected frontends can import the design into
   * the active project.
   *
   * JSON body: { svg: string, filename?: string }
   * Multipart:  field name "file" containing the .svg file
   */
  app.post('/api/import/svg', async (req, reply) => {
    let svgContent: string;
    let filename = 'Illustrator Export';

    const contentType = req.headers['content-type'] ?? '';

    if (contentType.includes('multipart/form-data')) {
      const data = await req.file();
      if (!data) return reply.code(400).send({ error: 'No file uploaded' });
      svgContent = (await data.toBuffer()).toString('utf-8');
      if (data.filename) filename = data.filename.replace(/\.svg$/i, '');
    } else {
      const body = req.body as { svg?: string; filename?: string } | null;
      if (!body || typeof body.svg !== 'string' || body.svg.trim().length === 0) {
        return reply.code(400).send({ error: 'svg field is required' });
      }
      svgContent = body.svg;
      if (body.filename) filename = body.filename.replace(/\.svg$/i, '');
    }

    const geometry = await parseSvg(svgContent);

    const payload = {
      geometry,
      sourceSvg: svgContent,
      filename,
    };

    wsBroadcaster.broadcast('svgPushed', payload);

    return reply.send(payload);
  });
}
