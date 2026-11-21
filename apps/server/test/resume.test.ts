import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { io as connect, type Socket } from 'socket.io-client';
import { afterEach, describe, expect, it } from 'vitest';
import { Room } from '@codearena/core';
import { QuestionSchema, type ClientToServerEvents, type RoomSnapshot, type ServerToClientEvents } from '@codearena/schemas';
import { buildServer } from '../src/app';
import { hashTeacherKey } from '../src/historyStore';
import { ROOM_SAVE_INTERVAL_MS } from '../src/realtime';
import { RoomStore } from '../src/roomStore';

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
type Server = Awaited<ReturnType<typeof buildServer>>;

const sockets: ClientSocket[] = [];
const cleanup: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  // Clientes primeiro: o servidor só fecha depois que as conexões acabam.
  sockets.splice(0).forEach((s) => s.disconnect());
  for (const fn of cleanup.splice(0).reverse()) await fn();
});

async function start(dataDir: string): Promise<{ server: Server; url: string }> {
  const server = await buildServer({
    rootDir: resolve(__dirname, '../../..'),
    pluginConfigPath: resolve(__dirname, '../../../codearena.config.json'),
    dataDir,
    contentDir: null,
    webDist: null,
    logger: false,
  });
  await server.app.listen({ port: 0, host: '127.0.0.1' });
  const address = server.app.server.address();
  return { server, url: `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}` };
}

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'codearena-resume-'));
  cleanup.push(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

function client(url: string): Promise<ClientSocket> {
  const socket: ClientSocket = connect(url, { transports: ['websocket'], forceNew: true });
  sockets.push(socket);
  return new Promise((done) => socket.on('connect', () => done(socket)));
}

const emit = <T>(socket: ClientSocket, event: string, payload?: unknown): Promise<T> =>
  (socket.timeout(10000) as unknown as { emitWithAck(e: string, p: unknown): Promise<T> }).emitWithAck(event, payload);

const teacherKey = 'chave-do-professor-de-teste-123456';
const solution = 'export default function App() {\n  return <Button title="Clique aqui" />;\n}';

describe('retomada da sala depois de o servidor cair', () => {
  it('a atividade volta com o mesmo código, os alunos e o professor reconectam e nada se perde', async () => {
    const dataDir = await tempDir();
    const first = await start(dataDir);
    const host = await client(first.url);
    const created = await emit<{ ok: true; code: string; hostToken: string }>(host, 'room:create', {
      packId: 'exemplo-react-native-fundamentos',
      questionIds: ['botao-clique-aqui', 'texto-ola'],
      settings: { countdownSeconds: 0, mode: 'assessment', assessmentMinutes: 10 },
      teacherKey,
    });
    const ana = await client(first.url);
    const joined = await emit<{ ok: true; playerId: string; playerToken: string }>(ana, 'room:join', {
      code: created.code,
      name: 'Ana',
      avatar: 'bolt',
    });
    await emit(host, 'host:start-question', { code: created.code, hostToken: created.hostToken });
    await emit(ana, 'assessment:save', { questionId: 'botao-clique-aqui', code: solution });
    await new Promise((r) => setTimeout(r, ROOM_SAVE_INTERVAL_MS + 300));

    // Queda: o processo some sem desligar (nada mais é gravado) e outro sobe na mesma pasta.
    first.server.roomStore.close();
    cleanup.push(() => first.server.app.close());
    const second = await start(dataDir);
    cleanup.push(() => second.server.app.close());

    const host2 = await client(second.url);
    const hosted = await emit<{ ok: boolean; snapshot: RoomSnapshot }>(host2, 'room:host', {
      code: created.code,
      hostToken: created.hostToken,
    });
    expect(hosted.ok).toBe(true);
    expect(hosted.snapshot.phase).toBe('question');

    const ana2 = await client(second.url);
    const back = await emit<{ ok: boolean; playerId: string; snapshot: RoomSnapshot }>(ana2, 'room:join', {
      code: created.code,
      name: 'Ana',
      avatar: 'bolt',
      playerToken: joined.playerToken,
    });
    expect(back).toMatchObject({ ok: true, playerId: joined.playerId });
    const room = second.server.rooms.get(created.code)!;
    expect(room.historySnapshot()!.answers.find((a) => a.questionId === 'botao-clique-aqui')!.code).toBe(solution);

    // A aula continua: salva mais, encerra, e a sessão vai para o histórico (e sai do SQLite).
    expect(await emit(ana2, 'assessment:save', { questionId: 'texto-ola', code: 'x' })).toMatchObject({ ok: true });
    expect(await emit(host2, 'host:end-session', { code: created.code, hostToken: created.hostToken })).toEqual({ ok: true });
    await second.server.history.get(room.snapshotForHost().historyId!, hashTeacherKey(teacherKey));
    expect(second.server.roomStore.list().rooms).toEqual([]);
    expect(second.server.history.list(hashTeacherKey(teacherKey))).toHaveLength(1);
  });

  it('desligar o servidor (ex.: atualização) não encerra a sala: ela volta no próximo início', async () => {
    const dataDir = await tempDir();
    const first = await start(dataDir);
    const host = await client(first.url);
    const created = await emit<{ ok: true; code: string; hostToken: string }>(host, 'room:create', {
      packId: 'exemplo-react-native-fundamentos',
      questionIds: ['botao-clique-aqui'],
      settings: { countdownSeconds: 0, mode: 'assessment', assessmentMinutes: 10 },
      teacherKey,
    });
    const ana = await client(first.url);
    await emit(ana, 'room:join', { code: created.code, name: 'Ana', avatar: 'bolt' });
    await emit(host, 'host:start-question', { code: created.code, hostToken: created.hostToken });
    await emit(ana, 'assessment:save', { questionId: 'botao-clique-aqui', code: solution });
    sockets.splice(0).forEach((s) => s.disconnect());
    await first.server.app.close();
    expect(first.server.history.list(hashTeacherKey(teacherKey))).toEqual([]);

    const second = await start(dataDir);
    cleanup.push(() => second.server.app.close());
    const room = second.server.rooms.get(created.code)!;
    expect(room.currentPhase).toBe('question');
    expect(room.historySnapshot()!.answers[0]!.code).toBe(solution);
  });

  it('sala parada há mais de 6 horas não volta: a sessão é encerrada e fica no histórico', async () => {
    const dataDir = await tempDir();
    const question = {
      ...QuestionSchema.parse({
        id: 'q1',
        prompt: 'Faça algo',
        timeLimitSeconds: 60,
        baseXP: 100,
        speedBonusMax: 0,
        checklist: [{ id: 'a', label: 'Fazer A', rule: { type: 'manual' } }],
      }),
      pluginId: 'react-native',
    };
    const room = new Room({
      code: '777777',
      hostToken: 'host',
      packTitle: 'Antiga',
      questions: [question],
      settings: { mode: 'assessment', assessmentMinutes: 60, countdownSeconds: 0 },
      validator: async () => ({ passed: false, items: [] }),
      sink: { emit: () => {}, sync: () => {} },
    });
    const ana = room.join({ name: 'Ana', avatar: 'bolt' });
    room.startNextQuestion();
    room.saveAnswer(ana.playerId, 'q1', 'resposta');
    const store = new RoomStore({ dataDir });
    const owner = hashTeacherKey(teacherKey);
    store.save(room, { historyId: '11111111-2222-3333-4444-555555555555', owner, packId: null });
    room.dispose();
    // Envelhece o registro: a última atividade foi há 7 horas.
    const [saved] = store.list().rooms;
    saved!.state.lastActivityAt -= 7 * 60 * 60 * 1000;
    store.save(Room.fromState(saved!.state, { validator: async () => ({ passed: false, items: [] }), sink: { emit: () => {}, sync: () => {} } }), saved!);
    store.close();

    const { server } = await start(dataDir);
    cleanup.push(() => server.app.close());
    expect(server.rooms.get('777777')).toBeUndefined();
    const record = await server.history.get('11111111-2222-3333-4444-555555555555', owner);
    expect(record.answers[0]!.code).toBe('resposta');
    expect(server.roomStore.list().rooms).toEqual([]);
  });

  it('o histórico lista as salas abertas do professor, com o token para voltar, e só para ele', async () => {
    const dataDir = await tempDir();
    const first = await start(dataDir);
    const host = await client(first.url);
    const created = await emit<{ ok: true; code: string; hostToken: string }>(host, 'room:create', {
      packId: 'exemplo-react-native-fundamentos',
      questionIds: ['botao-clique-aqui'],
      settings: { countdownSeconds: 0, mode: 'assessment', assessmentMinutes: 10 },
      teacherKey,
    });
    await emit(host, 'host:start-question', { code: created.code, hostToken: created.hostToken });
    await new Promise((r) => setTimeout(r, ROOM_SAVE_INTERVAL_MS + 300));
    first.server.roomStore.close();
    cleanup.push(() => first.server.app.close());
    const second = await start(dataDir);
    cleanup.push(() => second.server.app.close());

    const active = (key?: string) =>
      fetch(`${second.url}/api/history/active`, { headers: key ? { 'x-teacher-key': key } : {} });
    expect((await active()).status).toBe(401);
    expect(await (await active('outra-chave-de-outro-professor-0000')).json()).toEqual([]);
    const listed = await (await active(teacherKey)).json();
    expect(listed).toEqual([
      expect.objectContaining({ roomCode: created.code, hostToken: created.hostToken, mode: 'assessment', phase: 'question' }),
    ]);

    // Encerrada, sai da lista e vai para o histórico.
    const host2 = await client(second.url);
    await emit(host2, 'room:host', { code: created.code, hostToken: created.hostToken });
    await emit(host2, 'host:end-session', { code: created.code, hostToken: created.hostToken });
    expect(await (await active(teacherKey)).json()).toEqual([]);
  });
});
