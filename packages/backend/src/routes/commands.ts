import type { FastifyInstance } from 'fastify';
import { serialManager } from '../serial/SerialManager.js';
import { GRBL_REALTIME } from '../serial/GrblProtocol.js';

/**
 * GRBL realtime characters must be written WITHOUT a trailing newline: they
 * are intercepted by GRBL's serial ISR and never enter the line buffer, but a
 * trailing '\n' WOULD enter the buffer and can split an in-flight G-code line.
 */
const REALTIME_CHARS = new Set<string>([
  GRBL_REALTIME.FEED_HOLD,
  GRBL_REALTIME.CYCLE_START,
  GRBL_REALTIME.STATUS_QUERY,
  String.fromCharCode(GRBL_REALTIME.SOFT_RESET),
  String.fromCharCode(GRBL_REALTIME.JOG_CANCEL),
]);

export function registerRoutes(app: FastifyInstance): void {
  app.post<{ Body: { command: string } }>('/api/command', async (req, reply) => {
    const { command } = req.body ?? {};
    if (typeof command !== 'string' || command.length === 0) {
      return reply.code(400).send({ error: 'command is required' });
    }
    if (REALTIME_CHARS.has(command)) {
      serialManager.writeRealtime(command);
    } else {
      await serialManager.sendCommand(command);
    }
    return reply.send({ sent: true });
  });
}
