import { existsSync } from 'node:fs';
import { join } from 'node:path';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { Server } from 'socket.io';
import { RoomManager } from '@codearena/core';
import type { ClientToServerEvents, ServerToClientEvents } from '@codearena/schemas';
import type { ServerConfig } from './config';
import { registerHttpRoutes } from './http';
import { PackStore } from './packStore';
import { createServerPluginRegistry } from './plugins';
import { attachRealtime } from './realtime';
import { createSubmissionValidator } from './validation';

const ROOM_IDLE_LIMIT_MS = 6 * 60 * 60 * 1000;

export async function buildServer(config: Omit<ServerConfig, 'port' | 'host'>) {
  const app = Fastify({ logger: config.logger ? { level: 'info' } : false, bodyLimit: 2 * 1024 * 1024 });
  const plugins = createServerPluginRegistry();
  const packs = new PackStore({ dataDir: config.dataDir, contentDir: config.contentDir, log: (m) => app.log.warn(m) });
  await packs.init();
  const rooms = new RoomManager();
  const validator = createSubmissionValidator(plugins);

  registerHttpRoutes(app, { packs, plugins, rooms });

  if (config.webDist && existsSync(join(config.webDist, 'index.html'))) {
    await app.register(fastifyStatic, {
      root: config.webDist,
      wildcard: false,
      // O iframe do preview tem origem opaca e carrega módulos com CORS.
      setHeaders: (res) => res.setHeader('Access-Control-Allow-Origin', '*'),
    });
    app.setNotFoundHandler((request, reply) => {
      if (request.method === 'GET' && !request.url.startsWith('/api') && !request.url.startsWith('/socket.io')) {
        return reply.sendFile('index.html');
      }
      return reply.status(404).send({ error: 'Não encontrado' });
    });
  }

  const io = new Server<ClientToServerEvents, ServerToClientEvents>(app.server, {
    maxHttpBufferSize: 256 * 1024,
    cors: { origin: true },
  });
  attachRealtime({ io, rooms, packs, plugins, validator });

  const sweeper = setInterval(() => {
    const removed = rooms.sweep(Date.now(), ROOM_IDLE_LIMIT_MS);
    if (removed.length) app.log.info(`Salas inativas removidas: ${removed.join(', ')}`);
  }, 10 * 60 * 1000);
  sweeper.unref();

  app.addHook('onClose', async () => {
    clearInterval(sweeper);
    rooms.list().forEach((room) => rooms.delete(room.code));
    io.close();
  });

  return { app, io, rooms, packs, plugins };
}
