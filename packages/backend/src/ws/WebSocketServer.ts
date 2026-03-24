import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import { serialManager } from '../serial/SerialManager.js';
import { buildJogCommand } from '../serial/GrblProtocol.js';

const clients = new Set<WebSocket>();

export class WebSocketBroadcaster {
  static instance = new WebSocketBroadcaster();

  broadcast(event: string, data: unknown): void {
    const msg = JSON.stringify({ type: event, data });
    for (const client of clients) {
      if (client.readyState === 1) {
        client.send(msg);
      }
    }
  }

  setup(app: FastifyInstance): void {
    app.get('/ws', { websocket: true }, (socket) => {
      clients.add(socket);

      socket.on('message', (raw: Buffer | string) => {
        try {
          const msg = JSON.parse(raw.toString()) as { type: string; axis?: string; distance?: number; feed?: number; command?: string };

          if (msg.type === 'jog' && msg.axis && msg.distance !== undefined && msg.feed !== undefined) {
            const cmd = buildJogCommand(msg.axis, msg.distance, msg.feed);
            serialManager.sendCommand(cmd).catch(() => {});
          } else if (msg.type === 'command' && msg.command) {
            serialManager.sendCommand(msg.command).catch(() => {});
          }
        } catch {
          // ignore parse errors
        }
      });

      socket.on('close', () => {
        clients.delete(socket);
      });
    });
  }
}

export const wsBroadcaster = WebSocketBroadcaster.instance;
