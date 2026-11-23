import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveQuestions, type ResolvedQuestion, type SessionHistory } from '@codearena/schemas';
import { buildServer } from '../src/app';
import { hashTeacherKey } from '../src/historyStore';

let server: Awaited<ReturnType<typeof buildServer>>;
let dataDir: string;
const key = 'chave-do-professor-de-teste-capacidades';
const A1 = '00000000-0000-4000-8000-000000000001';
const A2 = '00000000-0000-4000-8000-000000000002';
const OTHER = '00000000-0000-4000-8000-000000000003';
const headers = { 'x-teacher-key': key };

beforeAll(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'codearena-capabilities-'));
  server = await buildServer({
    rootDir: resolve(__dirname, '../../..'),
    pluginConfigPath: resolve(__dirname, '../../../codearena.config.json'),
    dataDir,
    contentDir: null,
    webDist: null,
    logger: false,
  });
});

afterAll(async () => {
  await server.app.close();
  await rm(dataDir, { recursive: true, force: true });
});

/** Uma atividade avaliada com as duas primeiras questões do pack de exemplo, cada uma com uma capacidade. */
function activity(id: string, startedAt: number, anaMet: boolean): SessionHistory {
  const questions: ResolvedQuestion[] = resolveQuestions(server.packs.get('exemplo-react-native-fundamentos')!.pack)
    .slice(0, 2)
    .map((question, index) => ({
      ...question,
      checklist: question.checklist.map((item) => ({
        ...item,
        capability: { type: 'capacidade-tecnica' as const, name: index === 0 ? 'Componentes' : 'Estado' },
      })),
    }));
  const marks = (question: ResolvedQuestion, met: boolean) =>
    Object.fromEntries(question.checklist.map((item) => [item.id, { met, source: 'professor' as const }]));
  return {
    id,
    version: 1,
    mode: 'assessment',
    roomCode: '123456',
    packId: 'exemplo-react-native-fundamentos',
    packTitle: 'Fundamentos',
    startedAt,
    endedAt: startedAt + 1000,
    settings: { mode: 'assessment' } as SessionHistory['settings'],
    questions,
    players: [{ id: `${id}-ana`, name: 'Ana', avatar: 'bolt', delivered: true }],
    report: { players: [], questions: [] } as unknown as SessionHistory['report'],
    answers: [],
    evaluations: [
      { playerId: `${id}-ana`, questionId: questions[0]!.id, marks: marks(questions[0]!, anaMet), updatedAt: 1 },
      { playerId: `${id}-ana`, questionId: questions[1]!.id, marks: marks(questions[1]!, true), updatedAt: 1 },
    ],
    autoCheck: 'none',
  };
}

describe('API de capacidades', () => {
  it('monta o mapa só com as atividades do professor e cria a recuperação como pack', async () => {
    await server.history.importRecord(activity(A1, 1000, false), hashTeacherKey(key));
    await server.history.importRecord(activity(OTHER, 500, false), hashTeacherKey('chave-de-outro-professor-000000000'));

    expect((await server.app.inject({ url: '/api/capabilities' })).statusCode).toBe(401);
    const map = (await server.app.inject({ url: '/api/capabilities', headers })).json();
    expect(map.sessions.map((s: { id: string }) => s.id)).toEqual([A1]);
    expect(map.students[0].cells['capacidade-tecnica:componentes'].status).toBe('to-recover');
    expect(map.students[0].cells['capacidade-tecnica:estado'].status).toBe('developed');

    const created = await server.app.inject({
      method: 'POST',
      url: '/api/capabilities/recovery',
      headers,
      payload: { sessions: [A1], capabilities: ['capacidade-tecnica:componentes'], capabilityNames: ['Componentes'] },
    });
    expect(created.statusCode).toBe(201);
    const stored = created.json();
    expect(stored.pack.pack).toMatchObject({ title: 'Recuperação: Componentes', tags: ['recuperacao'] });
    expect(stored.pack.questions).toHaveLength(1);

    // Recuperação feita: a capacidade passa a "recuperada", e filtrar pelas atividades muda o mapa.
    await server.history.importRecord(activity(A2, 2000, true), hashTeacherKey(key));
    const after = (await server.app.inject({ url: '/api/capabilities', headers })).json();
    expect(after.students[0].cells['capacidade-tecnica:componentes'].status).toBe('recovered');
    const onlyFirst = (await server.app.inject({ url: `/api/capabilities?sessions=${A1}`, headers })).json();
    expect(onlyFirst.sessions).toHaveLength(1);
  });

  it('recusa uma recuperação sem questões para as capacidades', async () => {
    const response = await server.app.inject({
      method: 'POST',
      url: '/api/capabilities/recovery',
      headers,
      payload: { sessions: [A1], capabilities: ['conhecimento:inexistente'] },
    });
    expect(response.statusCode).toBe(422);
  });
});
