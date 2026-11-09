import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Room } from '@codearena/core';
import { DEFAULT_ROOM_SETTINGS, QuestionSchema } from '@codearena/schemas';
import { hashTeacherKey, HistoryStore } from '../src/historyStore';

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const question = {
  ...QuestionSchema.parse({
    id: 'q1',
    prompt: 'Faça algo',
    timeLimitSeconds: 60,
    baseXP: 100,
    speedBonusMax: 100,
    checklist: [
      { id: 'a', label: 'Fazer A', rule: { type: 'manual' } },
      { id: 'b', label: 'Fazer B', rule: { type: 'manual' }, optional: true },
    ],
  }),
  pluginId: 'test',
};

/** Só o que o HistoryStore usa da sala. */
const fakeRoom = {
  historySnapshot: () => ({
    mode: 'assessment' as const,
    roomCode: '123456',
    packTitle: 'Pack',
    startedAt: 1,
    endedAt: 2,
    settings: { ...DEFAULT_ROOM_SETTINGS, mode: 'assessment' as const },
    questions: [question],
    players: [{ id: 'p1', name: 'Ana', avatar: 'bolt' as const, delivered: true }],
    report: { roomCode: '123456', packTitle: 'Pack', startedAt: 1, endedAt: 2, questions: [], players: [] },
    answers: [{ playerId: 'p1', questionId: 'q1', code: 'x', status: 'started' as const, xp: 0, savedAt: 1, paste: null }],
  }),
} as unknown as Room;

async function store() {
  const dataDir = await mkdtemp(join(tmpdir(), 'codearena-history-'));
  dirs.push(dataDir);
  const history = new HistoryStore({ dataDir });
  await history.init();
  return { history, dataDir };
}

describe('HistoryStore', () => {
  it('guarda em disco, separa por professor e conta os alunos já avaliados', async () => {
    const { history, dataDir } = await store();
    const owner = hashTeacherKey('chave-do-professor-de-teste-123456');
    const id = history.newId();
    await history.saveRoom({ id, owner, packId: 'pack', room: fakeRoom });
    expect(history.list(hashTeacherKey('outra-chave-qualquer-1234567890'))).toEqual([]);
    expect(history.list(owner)[0]).toMatchObject({ id, evaluatedCount: 0, playerCount: 1 });

    await history.updateEvaluations(id, owner, [
      { playerId: 'p1', questionId: 'q1', marks: { a: { met: true, source: 'ia', note: 'ok' }, b: { met: false, source: 'professor' } } },
    ]);
    const reopened = new HistoryStore({ dataDir });
    await reopened.init();
    expect(reopened.list(owner)[0]!.evaluatedCount).toBe(1);
    const record = await reopened.get(id, owner);
    expect(record.evaluations[0]!.marks.a).toEqual({ met: true, source: 'ia', note: 'ok' });
    expect('owner' in record).toBe(false);

    await reopened.updateEvaluations(id, owner, [{ playerId: 'p1', questionId: 'q1', marks: { b: null } }]);
    expect(reopened.list(owner)[0]!.evaluatedCount).toBe(0);
    await reopened.delete(id, owner);
    await expect(reopened.get(id, owner)).rejects.toThrowError('Sessão não encontrada');
  });
});
