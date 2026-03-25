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
import { registerRoutes as registerMaterialPresetRoutes } from './routes/materialPresets.js';
import { registerRoutes as registerVersionRoutes } from './routes/version.js';

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
  registerMaterialPresetRoutes(app);
  registerVersionRoutes(app);

  // Maintain last-known Work Coordinate Offset so we can always compute both
  // MPos and WPos even when GRBL only reports one of them.
  let lastWco: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 };

  serialManager.on('data', (line: string) => {
    wsBroadcaster.broadcast('console', line);

    if (line.startsWith('<') && line.endsWith('>')) {
      const state = parseStatusReport(line);

      // Update stored WCO if reported
      if (state.wco) {
        lastWco = state.wco;
      }

      // Derive the missing position type using WCO:
      //   WPos = MPos − WCO   |   MPos = WPos + WCO
      if (state.position && !state.workPosition) {
        state.workPosition = {
          x: state.position.x - lastWco.x,
          y: state.position.y - lastWco.y,
          z: state.position.z - lastWco.z,
        };
      } else if (state.workPosition && !state.position) {
        state.position = {
          x: state.workPosition.x + lastWco.x,
          y: state.workPosition.y + lastWco.y,
          z: state.workPosition.z + lastWco.z,
        };
      }

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
