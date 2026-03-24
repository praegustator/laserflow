import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import websocketPlugin from '@fastify/websocket';
import { wsBroadcaster } from './ws/WebSocketServer.js';
import { serialManager } from './serial/SerialManager.js';
import { parseStatusReport } from './serial/GrblProtocol.js';
import { registerRoutes as registerPortRoutes } from './routes/ports.js';
import { registerRoutes as registerMachineRoutes } from './routes/machines.js';
import { registerRoutes as registerConnectionRoutes } from './routes/connection.js';
import { registerRoutes as registerCommandRoutes } from './routes/commands.js';
import { registerRoutes as registerJobRoutes } from './routes/jobs.js';

export async function buildServer() {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true });
  await app.register(multipart);
  await app.register(websocketPlugin);

  wsBroadcaster.setup(app);

  registerPortRoutes(app);
  registerMachineRoutes(app);
  registerConnectionRoutes(app);
  registerCommandRoutes(app);
  registerJobRoutes(app);

  serialManager.on('data', (line: string) => {
    wsBroadcaster.broadcast('console', line);

    if (line.startsWith('<') && line.endsWith('>')) {
      const state = parseStatusReport(line);
      wsBroadcaster.broadcast('machineStatus', state);
    }
  });

  setInterval(() => {
    if (serialManager.getStatus() === 'connected') {
      serialManager.sendCommand('?').catch(() => {});
    }
  }, 200);

  return app;
}
