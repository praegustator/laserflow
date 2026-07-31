import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { materialPresets } from '../config/MaterialPresets.js';
import type { MaterialPreset } from '../types/index.js';

function isValidSettings(s: unknown): s is { feedRate: number; power: number } {
  if (!s || typeof s !== 'object') return false;
  const { feedRate, power } = s as { feedRate?: unknown; power?: unknown };
  return (
    typeof feedRate === 'number' && Number.isFinite(feedRate) && feedRate > 0 &&
    typeof power === 'number' && Number.isFinite(power) && power >= 0 && power <= 100
  );
}

/** Validate a material preset payload; returns an error message or null. */
function validatePreset(body: Partial<MaterialPreset> | undefined): string | null {
  if (!body || typeof body !== 'object') return 'Request body is required';
  if (typeof body.name !== 'string' || !body.name.trim()) return 'name is required';
  if (typeof body.thickness !== 'number' || !Number.isFinite(body.thickness) || body.thickness <= 0) {
    return 'thickness must be a positive number';
  }
  for (const slot of ['engrave', 'cutThin', 'cutThick'] as const) {
    if (!isValidSettings(body[slot])) {
      return `${slot} must have a positive feedRate and a power between 0 and 100`;
    }
  }
  return null;
}

/**
 * Build a clean preset from a validated payload, copying only known fields so
 * arbitrary extra properties from the request body are never persisted or
 * echoed back to the client.
 */
function sanitizePreset(body: Omit<MaterialPreset, 'id'>, id: string): MaterialPreset {
  return {
    id,
    name: body.name.trim(),
    thickness: body.thickness,
    engrave: { feedRate: body.engrave.feedRate, power: body.engrave.power },
    cutThin: { feedRate: body.cutThin.feedRate, power: body.cutThin.power },
    cutThick: { feedRate: body.cutThick.feedRate, power: body.cutThick.power },
  };
}

export function registerRoutes(app: FastifyInstance): void {
  app.get('/api/material-presets', async (_req, reply) => {
    return reply.send(materialPresets.getAll());
  });

  app.post<{ Body: Omit<MaterialPreset, 'id'> & { id?: string } }>('/api/material-presets', async (req, reply) => {
    const error = validatePreset(req.body);
    if (error) return reply.code(400).send({ error });
    const preset = sanitizePreset(req.body, typeof req.body.id === 'string' && req.body.id ? req.body.id : randomUUID());
    materialPresets.save(preset);
    return reply.code(201).send(preset);
  });

  app.post<{ Params: { id: string }; Body: MaterialPreset }>('/api/material-presets/:id', async (req, reply) => {
    const error = validatePreset(req.body);
    if (error) return reply.code(400).send({ error });
    const preset = sanitizePreset(req.body, req.params.id);
    materialPresets.save(preset);
    return reply.send(preset);
  });

  app.delete<{ Params: { id: string } }>('/api/material-presets/:id', async (req, reply) => {
    materialPresets.delete(req.params.id);
    return reply.code(204).send();
  });
}
