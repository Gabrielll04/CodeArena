import { describe, expect, it } from 'vitest';
import {
  QuestionSchema,
  type AssessmentGradeRow,
  type ResolvedQuestion,
  type RoomSettingsPatch,
  type ServerToClientEvents,
} from '@codearena/schemas';
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

function setup(
  options: {
    countdownSeconds?: number;
    questions?: ResolvedQuestion[];
    validator?: SubmissionValidator;
    settings?: RoomSettingsPatch;
  } = {},
) {
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
    settings: { countdownSeconds: options.countdownSeconds ?? 3, ...options.settings },
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

describe('Room: revisão da turma por item', () => {
  const twoItems: ResolvedQuestion = {
    ...QuestionSchema.parse({
      id: 'dois-itens',
      title: 'Dois itens',
      prompt: 'Escreva ok e go',
      timeLimitSeconds: 100,
      baseXP: 500,
      speedBonusMax: 500,
      solution: 'ok go',
      checklist: [
        { id: 'a', label: 'Escrever ok', rule: { type: 'contains', value: 'ok' } },
        { id: 'b', label: 'Escrever go', rule: { type: 'contains', value: 'go' } },
      ],
    }),
    pluginId: 'test',
  };
  const perItem: SubmissionValidator = async (code) => {
    const items = [
      { id: 'a', passed: code.includes('ok') },
      { id: 'b', passed: code.includes('go') },
    ];
    return { passed: items.every((i) => i.passed), items };
  };

  it('conta quem concluiu cada item, calcula a mediana do tempo e ignora ids desconhecidos', async () => {
    const { room, clock, events } = setup({ countdownSeconds: 0, questions: [twoItems], validator: perItem });
    const ana = room.join({ name: 'Ana', avatar: 'bolt' });
    const bia = room.join({ name: 'Bia', avatar: 'prism' });
    const caio = room.join({ name: 'Caio', avatar: 'cube' });
    room.startNextQuestion();

    await clock.advance(10_000);
    room.reportProgress(ana.playerId, 1, 2, ['a', 'nao-existe']);
    await clock.advance(10_000);
    room.reportProgress(bia.playerId, 1, 2, ['a']);
    room.reportProgress(caio.playerId, 1, 2, ['b']);
    room.reportProgress(caio.playerId, 0, 2, []); // desfez: não conta mais
    await clock.advance(10_000);
    await room.submit(ana.playerId, 'ok go');
    expect((await room.submit(bia.playerId, 'ok')).status).toBe('rejected');

    const progress = events.filter((e) => e.event === 'question:progress').map((e) => e.payload as { doneIds: string[] });
    expect(progress[0]!.doneIds).toEqual(['a']);
    const host = room.snapshotForHost().progress!;
    expect(host.find((p) => p.playerId === ana.playerId)!.doneIds).toEqual(['a', 'b']);
    expect(host.find((p) => p.playerId === bia.playerId)!.doneIds).toEqual(['a']);
    expect(host.find((p) => p.playerId === caio.playerId)!.doneIds).toEqual([]);

    await room.finishQuestion();
    const results = room.snapshotForHost().lastResults!;
    expect(results.title).toBe('Dois itens');
    expect(results.items).toEqual([
      { id: 'a', label: 'Escrever ok', optional: false, completedCount: 2, playerCount: 3, medianTimeMs: 15_000 },
      { id: 'b', label: 'Escrever go', optional: false, completedCount: 1, playerCount: 3, medianTimeMs: 30_000 },
    ]);
    const report = await room.endSession();
    expect(report.questions[0]!.items).toHaveLength(2);
  });

  it('o veredito do servidor marca os itens confirmados mesmo sem relatório do cliente', async () => {
    const { room, clock } = setup({ countdownSeconds: 0, questions: [twoItems], validator: perItem });
    const ana = room.join({ name: 'Ana', avatar: 'bolt' });
    room.join({ name: 'Bia', avatar: 'prism' });
    room.startNextQuestion();
    await clock.advance(5000);
    await room.submit(ana.playerId, 'go');
    await room.finishQuestion();
    const items = room.snapshotForHost().lastResults!.items;
    expect(items.map((i) => i.completedCount)).toEqual([0, 1]);
  });
});

describe('Room: colagens e linha do tempo (só para o professor)', () => {
  const threeItems: ResolvedQuestion = {
    ...QuestionSchema.parse({
      id: 'tres-itens',
      prompt: 'Escreva ok, go e js',
      timeLimitSeconds: 100,
      baseXP: 500,
      speedBonusMax: 500,
      solution: 'ok go js',
      checklist: [
        { id: 'a', label: 'Escrever ok', rule: { type: 'contains', value: 'ok' } },
        { id: 'b', label: 'Escrever go', rule: { type: 'contains', value: 'go' } },
        { id: 'c', label: 'Escrever js', rule: { type: 'contains', value: 'js' } },
      ],
    }),
    pluginId: 'test',
  };
  const allItems: SubmissionValidator = async (code) => {
    const items = ['ok', 'go', 'js'].map((word, i) => ({ id: 'abc'[i]!, passed: code.includes(word) }));
    return { passed: items.every((i) => i.passed), items };
  };

  it('colar é permitido por padrão e a configuração vale para as próximas questões', () => {
    const { room } = setup();
    expect(room.snapshotForHost().settings.allowPaste).toBe(true);
    room.updateSettings({ allowPaste: false });
    expect(room.snapshotForHost().settings.allowPaste).toBe(false);
  });

  it('monta a linha do tempo com os horários do servidor e aponta a colagem que concluiu a checklist', async () => {
    const { room, clock, events } = setup({ countdownSeconds: 0, questions: [threeItems], validator: allItems });
    const ana = room.join({ name: 'Ana', avatar: 'bolt' });
    const bia = room.join({ name: 'Bia', avatar: 'prism' });
    room.startNextQuestion();

    // Ana digita aos poucos; Bia cola um bloco grande e conclui tudo em seguida.
    await clock.advance(20_000);
    room.reportProgress(ana.playerId, 1, 3, ['a']);
    room.reportPaste(bia.playerId, 5, false);
    await clock.advance(20_000);
    room.reportProgress(ana.playerId, 2, 3, ['a', 'b']);
    room.reportPaste(bia.playerId, 380, false);
    await clock.advance(1_000);
    room.reportProgress(bia.playerId, 3, 3, ['a', 'b', 'c']);
    await room.submit(bia.playerId, 'ok go js');

    const timelines = room.snapshotForHost().timelines!;
    expect(timelines).toHaveLength(1);
    expect(timelines[0]).toMatchObject({ questionId: 'tres-itens', timeLimitMs: 100_000, requiredTotal: 3, allowPaste: true });
    const of = (id: string) => timelines[0]!.players.find((p) => p.playerId === id)!;

    expect(of(ana.playerId).events).toEqual([
      { kind: 'item', atMs: 20_000, itemId: 'a' },
      { kind: 'item', atMs: 40_000, itemId: 'b' },
    ]);
    expect(of(ana.playerId).pasteImpact).toBeNull();

    expect(of(bia.playerId).paste).toEqual({ count: 2, chars: 385, largest: 380, blocked: 0 });
    expect(of(bia.playerId).events.map((e) => e.kind)).toEqual(['paste', 'paste', 'item', 'item', 'item', 'accepted']);
    expect(of(bia.playerId).pasteImpact).toEqual({ atMs: 40_000, chars: 380, items: 3 });

    // O professor recebe cada mudança; os alunos não recebem linha do tempo nem colagens de ninguém.
    expect(events.filter((e) => e.event === 'question:timeline').every((e) => e.target.kind === 'host')).toBe(true);
    expect(room.snapshotForPlayer(ana.playerId).timelines).toBeUndefined();
  });

  it('registra tentativas bloqueadas e ignora colagens fora do tempo da questão ou depois da resposta aceita', async () => {
    const { room, clock } = setup({ countdownSeconds: 3, questions: [threeItems], validator: allItems });
    const ana = room.join({ name: 'Ana', avatar: 'bolt' });
    room.join({ name: 'Bia', avatar: 'prism' });
    room.updateSettings({ allowPaste: false });
    room.startNextQuestion();
    room.reportPaste(ana.playerId, 200, true); // contagem regressiva: ignorada
    await clock.advance(5_000);
    room.reportPaste(ana.playerId, 200, true);
    room.reportPaste('desconhecido', 200, true);
    await room.submit(ana.playerId, 'ok go js');
    room.reportPaste(ana.playerId, 200, true); // depois de aceita: ignorada

    const timeline = room.snapshotForHost().timelines![0]!;
    expect(timeline.allowPaste).toBe(false);
    const anaTimeline = timeline.players.find((p) => p.playerId === ana.playerId)!;
    expect(anaTimeline.paste).toEqual({ count: 0, chars: 0, largest: 0, blocked: 1 });
    expect(anaTimeline.events[0]).toEqual({ kind: 'paste-blocked', atMs: 2_000 });
  });
});

/** Duas etapas com pesos 3 e 1: "a" e "b" no código. */
function guidedQuestion(id: string): ResolvedQuestion {
  return {
    ...QuestionSchema.parse({
      id,
      kind: 'guided',
      prompt: 'Siga os passos',
      timeLimitSeconds: 60,
      baseXP: 500,
      speedBonusMax: 500,
      solution: 'a b',
      checklist: [
        { id: 'a', label: 'Escrever a', rule: { type: 'contains', value: 'a' }, weight: 3 },
        { id: 'b', label: 'Escrever b', rule: { type: 'contains', value: 'b' } },
      ],
    }),
    pluginId: 'test',
  };
}

const stepsValidator: SubmissionValidator = async (code, question) => {
  const items = question.checklist.map((i) => ({ id: i.id, passed: code.includes(i.id) }));
  return { passed: items.every((i) => i.passed), items };
};

function assessmentSetup() {
  return setup({
    countdownSeconds: 0,
    questions: [guidedQuestion('q1'), guidedQuestion('q2')],
    validator: stepsValidator,
    settings: { mode: 'assessment', assessmentMinutes: 30 },
  });
}

describe('Room: atividade avaliativa', () => {
  it('abre todas as questões com o mesmo prazo e cada aluno navega no seu ritmo', async () => {
    const { room, clock } = assessmentSetup();
    const ana = room.join({ name: 'Ana', avatar: 'bolt' });
    const bia = room.join({ name: 'Bia', avatar: 'prism' });
    const start = clock.now();
    room.startNextQuestion();

    const snapshot = room.goTo(ana.playerId, 1);
    expect(snapshot.question?.question.id).toBe('q2');
    expect(snapshot.question?.endsAt).toBe(start + 30 * 60_000);
    expect(snapshot.assessment).toEqual({ startsAt: start, endsAt: start + 30 * 60_000 });
    expect(snapshot.leaderboard).toEqual([]);
    expect(room.snapshotForPlayer(bia.playerId).question?.question.id).toBe('q1');
    expect(() => room.startNextQuestion()).toThrowError(RoomError);
  });

  it('dá nota pela melhor versão confirmada pelo servidor, sem XP', async () => {
    const { room, clock, events } = assessmentSetup();
    const ana = room.join({ name: 'Ana', avatar: 'bolt' });
    room.startNextQuestion();

    const partial = await room.submit(ana.playerId, 'a', 'q1');
    expect(partial.status).toBe('rejected');
    await clock.advance(1_000);
    await room.submit(ana.playerId, 'b', 'q1'); // pior que a anterior: não substitui
    await clock.advance(1_000);
    const done = await room.submit(ana.playerId, 'a b', 'q2');
    expect(done).toMatchObject({ status: 'accepted', xp: 0 });

    const row = room.snapshotForHost().grades!.find((r) => r.playerId === ana.playerId)!;
    expect(row.questions.map((q) => [q.status, q.grade])).toEqual([
      ['partial', 7.5],
      ['complete', 10],
    ]);
    expect(row.grade).toBe(8.8);
    const rows = events.filter((e) => e.event === 'assessment:row');
    expect(rows.every((e) => e.target.kind === 'host')).toBe(true);
    expect((rows.at(-1)!.payload as AssessmentGradeRow).grade).toBe(8.8);

    const me = room.snapshotForPlayer(ana.playerId).me!;
    expect(me.totalXP).toBe(0);
    expect(me.assessment?.questions.map((q) => q.status)).toEqual(['partial', 'complete']);
    expect(JSON.stringify(me)).not.toContain('grade');
  });

  it('encerra no prazo e cada aluno recebe só o próprio relatório', async () => {
    const { room, clock, events } = assessmentSetup();
    const ana = room.join({ name: 'Ana', avatar: 'bolt' });
    const bia = room.join({ name: 'Bia', avatar: 'prism' });
    room.startNextQuestion();
    await room.submit(ana.playerId, 'a b', 'q1');
    await clock.advance(30 * 60_000);

    expect(room.currentPhase).toBe('ended');
    const ended = events.filter((e) => e.event === 'session:ended');
    expect(ended.some((e) => e.target.kind === 'all')).toBe(false);
    const forBia = ended.find((e) => e.target.kind === 'player' && e.target.playerId === bia.playerId)!;
    expect((forBia.payload as { players: { playerId: string }[] }).players.map((p) => p.playerId)).toEqual([bia.playerId]);
    expect(room.snapshotForPlayer(bia.playerId).report?.players).toHaveLength(1);
    expect(room.snapshotForHost().report?.players).toHaveLength(2);
    await expect(room.submit(ana.playerId, 'a b', 'q2')).rejects.toThrowError(RoomError);
  });

  it('não muda o modo depois de começar', () => {
    const { room } = assessmentSetup();
    room.join({ name: 'Ana', avatar: 'bolt' });
    room.startNextQuestion();
    room.updateSettings({ mode: 'competition', assessmentMinutes: 5, allowPaste: false });
    expect(room.currentSettings).toMatchObject({ mode: 'assessment', assessmentMinutes: 30, allowPaste: false });
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
