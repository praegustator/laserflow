import { describe, it, expect, afterEach } from 'vitest';
import { buildServer } from '../../src/server.js';

const SIMPLE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="10mm" height="10mm" viewBox="0 0 10 10"><rect x="1" y="1" width="8" height="8"/></svg>';

describe('POST /api/import/svg', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;

  afterEach(async () => {
    if (app) await app.close();
  });

  it('accepts SVG as a JSON body and returns parsed geometry', async () => {
    app = await buildServer();
    const res = await app.inject({
      method: 'POST',
      url: '/api/import/svg',
      headers: { 'content-type': 'application/json' },
      payload: { svg: SIMPLE_SVG, filename: 'test-design.svg' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ geometry: unknown[]; sourceSvg: string; filename: string }>();
    expect(body.filename).toBe('test-design');
    expect(body.sourceSvg).toBe(SIMPLE_SVG);
    expect(Array.isArray(body.geometry)).toBe(true);
    expect(body.geometry.length).toBeGreaterThan(0);
  });

  it('strips .svg extension from filename', async () => {
    app = await buildServer();
    const res = await app.inject({
      method: 'POST',
      url: '/api/import/svg',
      headers: { 'content-type': 'application/json' },
      payload: { svg: SIMPLE_SVG, filename: 'MyDesign.svg' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ filename: string }>();
    expect(body.filename).toBe('MyDesign');
  });

  it('uses default filename when none is provided', async () => {
    app = await buildServer();
    const res = await app.inject({
      method: 'POST',
      url: '/api/import/svg',
      headers: { 'content-type': 'application/json' },
      payload: { svg: SIMPLE_SVG },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ filename: string }>();
    expect(body.filename).toBe('Illustrator Export');
  });

  it('returns 400 when svg field is missing', async () => {
    app = await buildServer();
    const res = await app.inject({
      method: 'POST',
      url: '/api/import/svg',
      headers: { 'content-type': 'application/json' },
      payload: { filename: 'no-svg.svg' },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json<{ error: string }>();
    expect(body.error).toMatch(/svg/i);
  });

  it('returns 400 when svg field is empty', async () => {
    app = await buildServer();
    const res = await app.inject({
      method: 'POST',
      url: '/api/import/svg',
      headers: { 'content-type': 'application/json' },
      payload: { svg: '   ' },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json<{ error: string }>();
    expect(body.error).toMatch(/svg/i);
  });

  it('accepts SVG via multipart file upload', async () => {
    app = await buildServer();

    const boundary = '----TestBoundary';
    const body =
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="upload.svg"\r\n` +
      `Content-Type: image/svg+xml\r\n` +
      `\r\n` +
      `${SIMPLE_SVG}\r\n` +
      `--${boundary}--\r\n`;

    const res = await app.inject({
      method: 'POST',
      url: '/api/import/svg',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: body,
    });

    expect(res.statusCode).toBe(200);
    const json = res.json<{ geometry: unknown[]; sourceSvg: string; filename: string }>();
    expect(json.filename).toBe('upload');
    expect(json.sourceSvg).toBe(SIMPLE_SVG);
    expect(Array.isArray(json.geometry)).toBe(true);
    expect(json.geometry.length).toBeGreaterThan(0);
  });
});
