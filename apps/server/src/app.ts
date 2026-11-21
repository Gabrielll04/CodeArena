import { existsSync } from 'node:fs';
import { join } from 'node:path';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { Server } from 'socket.io';
import { RoomManager } from '@codearena/core';
import type { ActiveRoomSummary, ClientToServerEvents, ServerToClientEvents } from '@codearena/schemas';
import type { ServerConfig } from './config';
import { HistoryStore } from './historyStore';
import { registerHttpRoutes } from './http';
import { PackStore } from './packStore';
import { loadServerPlugins } from './plugins';
import { attachRealtime } from './realtime';
import { RoomStore } from './roomStore';
import { createSubmissionValidator } from './validation';

const ROOM_IDLE_LIMIT_MS = 6 * 60 * 60 * 1000;

export async function buildServer(config: Omit<ServerConfig, 'port' | 'host'>) {
  const app = Fastify({ logger: config.logger ? { level: 'info' } : false, bodyLimit: 2 * 1024 * 1024 });
  const { registry: plugins, samplePacks, dispose: disposePlugins } = await loadServerPlugins({
    rootDir: config.rootDir,
    configPath: config.pluginConfigPath,
    log: (m) => app.log.error(m),
  });
  const packs = new PackStore({
    dataDir: config.dataDir,
    samplePacks: samplePacks.map((s) => s.file),
    contentDir: config.contentDir,
    log: (m) => app.log.warn(m),
  });
  await packs.init();
  const rooms = new RoomManager();
  const validator = createSubmissionValidator(plugins);
  const history = new HistoryStore({ dataDir: config.dataDir, validator, log: (m) => app.log.warn(m) });
  await history.init();

  // As rotas sobem antes do tempo real; a lista de salas abertas só é consultada depois que ele existe.
  let activeRooms = (_owner: string): ActiveRoomSummary[] => [];
  registerHttpRoutes(app, { packs, plugins, rooms, history, activeRooms: (owner) => activeRooms(owner) });

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
  const roomStore = new RoomStore({ dataDir: config.dataDir });
  const realtime = attachRealtime({
    io,
    rooms,
    packs,
    plugins,
    validator,
    history,
    roomStore,
    idleLimitMs: ROOM_IDLE_LIMIT_MS,
    log: (m) => app.log.warn(m),
  });
  activeRooms = realtime.activeRooms;

  const sweeper = setInterval(() => {
    const now = Date.now();
    // Sessão abandonada no meio: encerra antes de descartar, para ficar no histórico.
    for (const room of rooms.list()) {
      if (room.inProgress && now - room.lastActivityAt > ROOM_IDLE_LIMIT_MS) void room.endSession();
    }
    const removed = rooms.sweep(now, ROOM_IDLE_LIMIT_MS);
    removed.forEach((code) => roomStore.delete(code));
    if (removed.length) app.log.info(`Salas inativas removidas: ${removed.join(', ')}`);
  }, 10 * 60 * 1000);
  sweeper.unref();

  app.addHook('onClose', async () => {
    clearInterval(sweeper);
    // As salas abertas ficam gravadas como estão e voltam quando o servidor subir de novo (ex.: uma atualização no
    // meio da aula). Não encerra as sessões.
    realtime.saveAll();
    await history.close();
    disposePlugins();
    rooms.list().forEach((room) => room.dispose());
    roomStore.close();
    io.close();
  });

  return { app, io, rooms, packs, plugins, history, roomStore };
}
