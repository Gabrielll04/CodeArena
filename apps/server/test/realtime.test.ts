import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { io as connect, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ClientToServerEvents, RoomSnapshot, ServerToClientEvents } from '@codearena/schemas';
import { buildServer } from '../src/app';

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let server: Awaited<ReturnType<typeof buildServer>>;
let url: string;
let dataDir: string;
const sockets: ClientSocket[] = [];

beforeAll(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'codearena-test-'));
  server = await buildServer({
    dataDir,
    contentDir: resolve(__dirname, '../../../content/packs'),
    webDist: null,
    logger: false,
  });
  await server.app.listen({ port: 0, host: '127.0.0.1' });
  const address = server.app.server.address();
  url = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
});

afterAll(async () => {
  sockets.forEach((s) => s.disconnect());
  await server.app.close();
  await rm(dataDir, { recursive: true, force: true });
});

function client(): Promise<ClientSocket> {
  const socket: ClientSocket = connect(url, { transports: ['websocket'], forceNew: true });
  sockets.push(socket);
  return new Promise((resolve) => socket.on('connect', () => resolve(socket)));
}

const emit = <T>(socket: ClientSocket, event: string, payload?: unknown): Promise<T> =>
  (socket.timeout(10000) as unknown as { emitWithAck(e: string, p: unknown): Promise<T> }).emitWithAck(event, payload);

function nextEvent<E extends keyof ServerToClientEvents>(socket: ClientSocket, event: E, predicate: (payload: Parameters<ServerToClientEvents[E]>[0]) => boolean = () => true) {
  return new Promise<Parameters<ServerToClientEvents[E]>[0]>((resolve) => {
    const handler = (payload: Parameters<ServerToClientEvents[E]>[0]) => {
      if (!predicate(payload)) return;
      (socket.off as (e: string, h: unknown) => void)(event, handler);
      resolve(payload);
    };
    (socket.on as (e: string, h: unknown) => void)(event, handler);
  });
}

describe('API de packs', () => {
  it('lista os packs de exemplo', async () => {
    const res = await server.app.inject({ method: 'GET', url: '/api/packs' });
    const packs = res.json() as { id: string; questionCount: number }[];
    expect(packs.map((p) => p.id)).toEqual(expect.arrayContaining(['exemplo-react-native-fundamentos', 'exemplo-backend-http-basico']));
  });

  it('importa JSON válido e devolve campos incorretos de JSON inválido', async () => {
    const bad = await server.app.inject({ method: 'POST', url: '/api/packs', payload: { pack: { title: 'X' }, questions: [] } });
    expect(bad.statusCode).toBe(422);
    expect((bad.json() as { issues: { path: string }[] }).issues.map((i) => i.path)).toEqual(
      expect.arrayContaining(['pack.pluginId', 'pack.version', 'questions']),
    );

    const pack = (await server.app.inject({ method: 'GET', url: '/api/packs/exemplo-react-native-fundamentos/export' })).json();
    const created = await server.app.inject({ method: 'POST', url: '/api/packs', payload: pack });
    expect(created.statusCode).toBe(201);
    const { id } = created.json() as { id: string };
    const list = (await server.app.inject({ method: 'GET', url: '/api/packs' })).json() as { id: string; source: string }[];
    expect(list.find((p) => p.id === id)?.source).toBe('user');
    expect((await server.app.inject({ method: 'DELETE', url: '/api/packs/exemplo-react-native-fundamentos' })).statusCode).toBe(403);
    expect((await server.app.inject({ method: 'DELETE', url: `/api/packs/${id}` })).statusCode).toBe(204);
  });

  it('testa uma questão no servidor com avisos de autoria', async () => {
    const stored = (await server.app.inject({ method: 'GET', url: '/api/packs/exemplo-backend-http-basico' })).json() as {
      pack: { questions: { solution: string }[] };
    };
    const question = stored.pack.questions[0]!;
    const res = await server.app.inject({
      method: 'POST',
      url: '/api/questions/test',
      payload: { question, pluginId: 'backend-http', code: question.solution },
    });
    const body = res.json() as { evaluation: { allRequiredDone: boolean }; warnings: { level: string }[] };
    expect(body.evaluation.allRequiredDone).toBe(true);
    expect(body.warnings.filter((w) => w.level === 'error')).toEqual([]);
  });
});

describe('sala em tempo real', () => {
  it('executa o fluxo completo: criar, entrar, responder, placar e relatório', async () => {
    const host = await client();
    const created = await emit<{ ok: true; code: string; hostToken: string }>(host, 'room:create', {
      packId: 'exemplo-react-native-fundamentos',
      questionIds: ['botao-clique-aqui', 'texto-ola'],
      settings: { countdownSeconds: 0 },
    });
    expect(created.ok).toBe(true);
    expect(created.code).toMatch(/^\d{6}$/);
    const auth = { code: created.code, hostToken: created.hostToken };

    const ana = await client();
    const bia = await client();
    const joinedAna = await emit<{ ok: boolean; playerToken: string; snapshot: RoomSnapshot }>(ana, 'room:join', { code: created.code, name: 'Ana', avatar: 'bolt' });
    const joinedBia = await emit<{ ok: boolean }>(bia, 'room:join', { code: created.code, name: 'Bia', avatar: 'prism' });
    expect(joinedAna.ok && joinedBia.ok).toBe(true);
    const duplicate = await emit<{ ok: boolean; code: string }>(await client(), 'room:join', { code: created.code, name: 'ana', avatar: 'cube' });
    expect(duplicate).toMatchObject({ ok: false, code: 'name_taken' });

    // Aluno não pode controlar a sala.
    expect(await emit(ana, 'host:start-question', { code: created.code, hostToken: 'chute' })).toMatchObject({ ok: false, code: 'not_authorized' });

    const loadedAna = nextEvent(ana, 'question:loaded');
    const loadedBia = nextEvent(bia, 'question:loaded');
    expect(await emit(host, 'host:start-question', auth)).toEqual({ ok: true });
    const [qa, qb] = await Promise.all([loadedAna, loadedBia]);
    expect(qa.question.question.id).toBe('botao-clique-aqui');
    expect(qa.question.startsAt).toBe(qb.question.startsAt);
    expect('solution' in qa.question.question).toBe(false);

    // Checklist incompleta: o servidor recusa mesmo que o cliente diga o contrário.
    const rejected = await emit<{ ok: true; answer: { status: string; items: { id: string; passed: boolean }[] } }>(ana, 'question:submit', {
      code: 'export default function App() {}',
    });
    expect(rejected.answer.status).toBe('rejected');
    expect(rejected.answer.items.find((i) => i.id === 'componente-app')?.passed).toBe(true);

    const solution = 'export default function App() {\n  return <Button title="Clique aqui" />;\n}';
    const accepted = await emit<{ ok: true; answer: { status: string; xp: number; remainingMs: number } }>(ana, 'question:submit', { code: solution });
    expect(accepted.answer.status).toBe('accepted');
    await new Promise((r) => setTimeout(r, 30));

    const finished = nextEvent(host, 'question:finished');
    const second = await emit<{ ok: true; answer: { status: string; xp: number; remainingMs: number } }>(bia, 'question:submit', { code: solution });
    expect(second.answer.status).toBe('accepted');
    // O tempo restante vem do relógio do servidor; o XP arredondado pode empatar em respostas quase simultâneas.
    expect(accepted.answer.remainingMs).toBeGreaterThan(second.answer.remainingMs);
    expect(accepted.answer.xp).toBeGreaterThanOrEqual(second.answer.xp);

    const results = await finished;
    expect(results.results.correctCount).toBe(2);
    expect(results.leaderboard.map((e) => e.name)).toEqual(['Ana', 'Bia']);
    expect(results.solution).toContain('Clique aqui');

    // Reconexão com o token mantém o XP.
    ana.disconnect();
    const anaAgain = await client();
    const rejoined = await emit<{ ok: true; snapshot: RoomSnapshot }>(anaAgain, 'room:join', {
      code: created.code,
      name: 'Ana',
      avatar: 'bolt',
      playerToken: joinedAna.playerToken,
    });
    expect(rejoined.snapshot.me!.totalXP).toBe(accepted.answer.xp);

    // Segunda questão: o professor encerra manualmente; quem não respondeu fica sem XP.
    expect(await emit(host, 'host:start-question', auth)).toEqual({ ok: true });
    expect(await emit(host, 'host:finish-question', auth)).toEqual({ ok: true });
    const ended = nextEvent(bia, 'session:ended');
    expect(await emit(host, 'host:end-session', auth)).toEqual({ ok: true });
    const report = await ended;
    expect(report.players.map((p) => [p.name, p.correctCount, p.questionCount])).toEqual([
      ['Ana', 1, 2],
      ['Bia', 1, 2],
    ]);
  });

  it('valida questões de backend executando o código no servidor', async () => {
    const host = await client();
    const created = await emit<{ ok: true; code: string; hostToken: string }>(host, 'room:create', {
      packId: 'exemplo-backend-http-basico',
      questionIds: ['parametro-rota'],
      settings: { countdownSeconds: 0 },
    });
    const student = await client();
    await emit(student, 'room:join', { code: created.code, name: 'Caio', avatar: 'hex' });
    await emit(host, 'host:start-question', { code: created.code, hostToken: created.hostToken });

    // Resposta "decorada" (sempre 42) passa no regex, mas falha no teste HTTP com outro id.
    const hardcoded = `const app = require('express')();\napp.get('/users/:id', (req, res) => { req.params; res.json({ id: '42' }); });`;
    const bad = await emit<{ ok: true; answer: { status: string; items: { id: string; passed: boolean; message?: string }[] } }>(student, 'question:submit', { code: hardcoded });
    expect(bad.answer.status).toBe('rejected');
    expect(bad.answer.items.find((i) => i.id === 'responde-7')).toMatchObject({ passed: false });

    const good = `const app = require('express')();\napp.get('/users/:id', (req, res) => res.json({ id: req.params.id }));`;
    const ok = await emit<{ ok: true; answer: { status: string } }>(student, 'question:submit', { code: good });
    expect(ok.answer.status).toBe('accepted');
  });

  it('recusa sala de pack inexistente e entrada em sala inexistente', async () => {
    const socket = await client();
    expect(await emit(socket, 'room:create', { packId: 'nao-existe' })).toMatchObject({ ok: false, code: 'pack_not_found' });
    expect(await emit(socket, 'room:join', { code: '999999', name: 'Zé', avatar: 'bolt' })).toMatchObject({ ok: false, code: 'room_not_found' });
    expect(await emit(socket, 'room:join', { code: '12', name: 'Zé', avatar: 'bolt' })).toMatchObject({ ok: false, code: 'invalid_payload' });
  });
});
