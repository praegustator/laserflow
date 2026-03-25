import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { buildServer } from '../../src/server.js';

describe('GET /api/version', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let originalBackendVersion: string | undefined;

  beforeEach(() => {
    originalBackendVersion = process.env['BACKEND_VERSION'];
  });

  afterEach(async () => {
    if (app) await app.close();
    if (originalBackendVersion === undefined) {
      delete process.env['BACKEND_VERSION'];
    } else {
      process.env['BACKEND_VERSION'] = originalBackendVersion;
    }
  });

  it('returns a version string', async () => {
    app = await buildServer();
    const res = await app.inject({ method: 'GET', url: '/api/version' });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ version: string }>();
    expect(typeof body.version).toBe('string');
    expect(body.version.length).toBeGreaterThan(0);
  });

  it('uses BACKEND_VERSION env var when set', async () => {
    process.env['BACKEND_VERSION'] = '9.8.7';
    app = await buildServer();
    const res = await app.inject({ method: 'GET', url: '/api/version' });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ version: string }>();
    expect(body.version).toBe('9.8.7');
  });
});
