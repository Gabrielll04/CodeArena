import { describe, expect, it } from 'vitest';
import { QuestionSchema, type ResolvedQuestion, type ServerToClientEvents } from '@codearena/schemas';
import { Room, RoomError, RoomManager, type Clock, type RoomSink, type RoomTarget, type SubmissionValidator } from '../src';

/** Relógio manual: o tempo só anda quando o teste chama advance(). */
class FakeClock implements Clock {
  current = 1_000_000;
  private timers: { at: number; fn: () => void; id: number }[] = [];
  private nextId = 1;
  now = () => this.current;
  setTimeout = (fn: () => void, ms: number) => {
    const id = this.nextId++;
    this.timers.push({ at: this.current + ms, fn, id });
    return id;
  };
  clearTimeout = (handle: unknown) => {
    this.timers = this.timers.filter((t) => t.id !== handle);
  };
  async advance(ms: number) {
    const target = this.current + ms;
    for (;;) {
      const due = this.timers.filter((t) => t.at <= target).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      this.timers = this.timers.filter((t) => t !== due);
      this.current = due.at;
      due.fn();
      await flush();
    }
    this.current = target;
    await flush();
  }
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

type Emitted = { target: RoomTarget; event: keyof ServerToClientEvents; payload: unknown };

function makeQuestion(id: string, timeLimitSeconds = 100): ResolvedQuestion {
  return {
    ...QuestionSchema.parse({
      id,
      prompt: 'Escreva ok',
      timeLimitSeconds,
      baseXP: 500,
      speedBonusMax: 500,
      solution: 'ok',
      checklist: [{ id: 'ok', label: 'Escrever ok', rule: { type: 'contains', value: 'ok' } }],
    }),
    pluginId: 'test',
  };
}

/** Validador fiel ao comportamento do servidor: aprova se o código contém "ok". */
const validator: SubmissionValidator = async (code) => ({
  passed: code.includes('ok'),
  items: [{ id: 'ok', passed: code.includes('ok') }],
});

function setup(options: { countdownSeconds?: number; questions?: ResolvedQuestion[]; validator?: SubmissionValidator } = {}) {
  const clock = new FakeClock();
  const events: Emitted[] = [];
  let syncs = 0;
  const sink: RoomSink = {
    emit: (target, event, payload) => events.push({ target, event, payload }),
    sync: () => {
      syncs++;
    },
  };
  let ids = 0;
  const room = new Room({
    code: '123456',
    hostToken: 'host-secret',
    packTitle: 'Pack',
    questions: options.questions ?? [makeQuestion('q1'), makeQuestion('q2')],
    settings: { countdownSeconds: options.countdownSeconds ?? 3 },
    validator: options.validator ?? validator,
    sink,
    clock,
    createId: () => `id-${++ids}`,
  });
  return { room, clock, events, syncs: () => syncs };
}

describe('Room: entrada de alunos', () => {
  it('aceita vários alunos e impede nomes duplicados', () => {
    const { room, events } = setup();
    room.join({ name: 'Ana', avatar: 'bolt' });
    room.join({ name: 'Bia', avatar: 'prism' });
    expect(() => room.join({ name: ' ana ', avatar: 'cube' })).toThrowError(RoomError);
    expect(room.snapshotForHost().players.map((p) => p.name)).toEqual(['Ana', 'Bia']);
    expect(events.filter((e) => e.event === 'player:joined')).toHaveLength(2);
  });

  it('reconecta pelo token sem perder o jogador', () => {
    const { room } = setup();
    const ana = room.join({ name: 'Ana', avatar: 'bolt' });
    room.disconnect(ana.playerId);
    expect(room.snapshotForHost().players[0]!.connected).toBe(false);
    const again = room.join({ name: 'Ana', avatar: 'bolt', playerToken: ana.playerToken });
    expect(again).toMatchObject({ playerId: ana.playerId, reconnected: true });
    expect(room.snapshotForHost().players).toHaveLength(1);
    expect(room.snapshotForHost().players[0]!.connected).toBe(true);
  });
});

describe('Room: ciclo de uma questão', () => {
  it('sincroniza o início com contagem regressiva e recusa respostas antes do início', async () => {
    const { room, clock, events } = setup();
    const ana = room.join({ name: 'Ana', avatar: 'bolt' });
    const active = room.startNextQuestion();
    expect(room.currentPhase).toBe('countdown');
    expect(active.startsAt).toBe(clock.current + 3000);
    expect(active.endsAt).toBe(active.startsAt + 100_000);
    expect(events.some((e) => e.event === 'question:loaded' && e.target.kind === 'all')).toBe(true);
    expect('solution' in active.question).toBe(false);
    await expect(room.submit(ana.playerId, 'ok')).rejects.toThrow(/ainda não começou/);
    await clock.advance(3000);
    expect(room.currentPhase).toBe('question');
    expect(events.some((e) => e.event === 'question:started')).toBe(true);
  });

  it('pontua pelo relógio do servidor: quem responde antes ganha mais XP', async () => {
    const { room, clock } = setup({ countdownSeconds: 0 });
    const ana = room.join({ name: 'Ana', avatar: 'bolt' });
    const bia = room.join({ name: 'Bia', avatar: 'prism' });
    room.startNextQuestion();
    await clock.advance(20_000);
    const a = await room.submit(ana.playerId, 'ok');
    await clock.advance(30_000);
    const b = await room.submit(bia.playerId, 'ok');
    expect(a).toMatchObject({ status: 'accepted', xp: 500 + 400, remainingMs: 80_000 });
    expect(b).toMatchObject({ status: 'accepted', xp: 500 + 250 });
  });

  it('só aceita resposta que o servidor valida; permite nova tentativa', async () => {
    const { room, clock, events } = setup({ countdownSeconds: 0 });
    const ana = room.join({ name: 'Ana', avatar: 'bolt' });
    room.join({ name: 'Bia', avatar: 'prism' });
    room.startNextQuestion();
    const wrong = await room.submit(ana.playerId, 'errado');
    expect(wrong.status).toBe('rejected');
    expect(wrong.xp).toBe(0);
    await expect(room.submit(ana.playerId, 'ok')).rejects.toThrow(/Aguarde/);
    await clock.advance(1000);
    const right = await room.submit(ana.playerId, 'ok');
    expect(right.status).toBe('accepted');
    const validated = events.filter((e) => e.event === 'question:validated');
    expect(validated.every((e) => e.target.kind === 'player')).toBe(true);
    expect(events.filter((e) => e.event === 'question:submitted').every((e) => e.target.kind === 'host')).toBe(true);
  });

  it('encerra automaticamente quando todos os conectados acertam', async () => {
    const { room, events } = setup({ countdownSeconds: 0 });
    const ana = room.join({ name: 'Ana', avatar: 'bolt' });
    const bia = room.join({ name: 'Bia', avatar: 'prism' });
    const caio = room.join({ name: 'Caio', avatar: 'cube' });
    room.startNextQuestion();
    room.disconnect(caio.playerId);
    await room.submit(ana.playerId, 'ok');
    expect(room.currentPhase).toBe('question');
    await room.submit(bia.playerId, 'ok');
    await flush();
    expect(room.currentPhase).toBe('review');
    expect(events.some((e) => e.event === 'question:finished')).toBe(true);
  });

  it('encerra no fim do tempo e recusa respostas atrasadas sem XP', async () => {
    const { room, clock } = setup({ countdownSeconds: 0 });
    const ana = room.join({ name: 'Ana', avatar: 'bolt' });
    room.join({ name: 'Bia', avatar: 'prism' });
    room.startNextQuestion();
    await clock.advance(100_001);
    expect(room.currentPhase).toBe('review');
    await expect(room.submit(ana.playerId, 'ok')).resolves.toMatchObject({ status: 'late', xp: 0 });
    expect(room.snapshotForPlayer(ana.playerId).me!.totalXP).toBe(0);
  });

  it('conclui validações em andamento antes de fechar o placar', async () => {
    let release!: () => void;
    const slow: SubmissionValidator = (code) =>
      new Promise((resolve) => {
        release = () => resolve({ passed: code.includes('ok'), items: [] });
      });
    const { room, clock } = setup({ countdownSeconds: 0, validator: slow });
    const ana = room.join({ name: 'Ana', avatar: 'bolt' });
    room.join({ name: 'Bia', avatar: 'prism' });
    room.startNextQuestion();
    await clock.advance(99_000);
    const pending = room.submit(ana.playerId, 'ok');
    await clock.advance(2000);
    expect(room.currentPhase).toBe('question');
    release();
    await pending;
    await flush();
    expect(room.currentPhase).toBe('review');
    expect(room.snapshotForHost().leaderboard[0]).toMatchObject({ name: 'Ana', questionXP: 505 });
  });
});

describe('Room: placar e relatório', () => {
  it('acumula XP entre questões, registra posição anterior e gera relatório', async () => {
    const { room, clock } = setup({ countdownSeconds: 0 });
    const ana = room.join({ name: 'Ana', avatar: 'bolt' });
    const bia = room.join({ name: 'Bia', avatar: 'prism' });

    room.startNextQuestion();
    await room.submit(ana.playerId, 'ok');
    await clock.advance(50_000);
    await room.submit(bia.playerId, 'ok');
    await flush();
    let board = room.snapshotForHost().leaderboard;
    expect(board.map((e) => [e.name, e.totalXP, e.rank])).toEqual([
      ['Ana', 1000, 1],
      ['Bia', 750, 2],
    ]);

    room.startNextQuestion();
    await room.submit(bia.playerId, 'ok');
    await clock.advance(100_001);
    board = room.snapshotForHost().leaderboard;
    expect(board.map((e) => [e.name, e.totalXP, e.rank, e.previousRank, e.questionXP])).toEqual([
      ['Bia', 1750, 1, 2, 1000],
      ['Ana', 1000, 2, 1, 0],
    ]);

    expect(() => room.startNextQuestion()).toThrow(/Não há mais questões/);
    const report = await room.endSession();
    expect(room.currentPhase).toBe('ended');
    expect(report.questions).toHaveLength(2);
    expect(report.players[0]).toMatchObject({ name: 'Bia', correctCount: 2, questionCount: 2, averageTimeMs: 25_000 });
    expect(report.players[1]!.perQuestion.map((q) => q.correct)).toEqual([true, false]);
    expect(() => room.join({ name: 'Novo', avatar: 'bolt' })).toThrow(/encerrada/);
  });

  it('modo discreto mostra ao aluno só o top 3 e a própria posição', async () => {
    const { room, clock, events } = setup({ countdownSeconds: 0 });
    const players = ['Ana', 'Bia', 'Caio', 'Duda', 'Edu'].map((name) => room.join({ name, avatar: 'bolt' }));
    room.updateSettings({ discreetMode: true });
    room.startNextQuestion();
    for (const p of players.slice(0, 4)) {
      await room.submit(p.playerId, 'ok');
      await clock.advance(1000);
    }
    await clock.advance(100_000);
    const finished = events.find((e) => e.event === 'question:finished')!.payload as { leaderboard: unknown[] };
    expect(finished.leaderboard).toHaveLength(3);
    const view = room.snapshotForPlayer(players[4]!.playerId);
    expect(view.leaderboard.map((e) => e.name)).toEqual(['Ana', 'Bia', 'Caio', 'Edu']);
    expect(room.snapshotForHost().leaderboard).toHaveLength(5);
  });

  it('bônus de sequência soma a partir do segundo acerto seguido', async () => {
    const { room, clock } = setup({ countdownSeconds: 0 });
    const ana = room.join({ name: 'Ana', avatar: 'bolt' });
    room.join({ name: 'Bia', avatar: 'prism' });
    room.updateSettings({ streakEnabled: true, streakBonus: 50 });
    room.startNextQuestion();
    expect((await room.submit(ana.playerId, 'ok')).xp).toBe(1000);
    await clock.advance(100_001);
    room.startNextQuestion();
    expect((await room.submit(ana.playerId, 'ok')).xp).toBe(1050);
  });
});

describe('RoomManager', () => {
  it('gera códigos de 6 dígitos únicos e remove salas inativas', () => {
    let n = 0;
    const sequence = [0.1, 0.1, 0.2];
    const manager = new RoomManager(() => sequence[n++ % sequence.length]!);
    const base = { packTitle: 'P', questions: [makeQuestion('q')], validator, sink: { emit: () => undefined, sync: () => undefined } };
    const a = manager.create(base);
    const b = manager.create(base);
    expect(a.code).toMatch(/^[1-9]\d{5}$/);
    expect(a.code).not.toBe(b.code);
    expect(manager.sweep(Date.now() + 10_000, 1000).sort()).toEqual([a.code, b.code].sort());
    expect(manager.get(a.code)).toBeUndefined();
  });
});
