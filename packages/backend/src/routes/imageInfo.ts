import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';

/**
 * POST /api/image-info
 *
 * Accepts a multipart form with a single `file` field (PNG, JPEG, etc.)
 * and returns pixel dimensions plus any embedded DPI metadata.
 *
 * Response:
 * ```json
 * {
 *   "width": 153,
 *   "height": 272,
 *   "dpi": 72,
 *   "widthMm": 54.0,
 *   "heightMm": 96.0
 * }
 * ```
 *
 * `dpi` is the detected density from PNG/JPEG metadata.
 * When the image contains no density information, `dpi` is `null` and the
 * frontend should either use a sensible default (96) or ask the user.
 */
export function registerRoutes(app: FastifyInstance): void {
  app.post('/api/image-info', async (request, reply) => {
    const data = await request.file();
    if (!data) {
      return reply.code(400).send({ error: 'No file uploaded' });
    }

    const buffer = await data.toBuffer();
    const metadata = await sharp(buffer).metadata();

    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;

    // sharp reports `density` in DPI (dots per inch).
    // PNG files store this as pHYs chunk (pixels per metre → converted by sharp).
    // JPEG files store this in JFIF/EXIF density fields.
    // When absent, density is undefined.
    const dpi: number | null = metadata.density ?? null;

    let widthMm: number | null = null;
    let heightMm: number | null = null;
    if (dpi !== null && dpi > 0) {
      widthMm = Math.round((width / dpi) * 25.4 * 1000) / 1000;
      heightMm = Math.round((height / dpi) * 25.4 * 1000) / 1000;
    }

    return { width, height, dpi, widthMm, heightMm };
  });
}
