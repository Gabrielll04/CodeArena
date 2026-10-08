import {
  DEFAULT_ROOM_SETTINGS,
  toPublicQuestion,
  type ActiveQuestion,
  type AvatarId,
  type ErrorCode,
  type ItemCheck,
  type LeaderboardEntry,
  type PlayerAnswer,
  type PlayerPublic,
  type PlayerReport,
  type ProgressEntry,
  type QuestionResults,
  type ResolvedQuestion,
  type RoomPhase,
  type RoomSettings,
  type RoomSettingsPatch,
  type RoomSnapshot,
  type ServerToClientEvents,
  type SessionReport,
} from '@codearena/schemas';
import { calculateStreakBonus, calculateXP, rankPlayers } from './scoring';

export class RoomError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'RoomError';
  }
}

export interface SubmissionVerdict {
  passed: boolean;
  items: ItemCheck[];
  message?: string;
}

/** Validação oficial (servidor) de uma resposta. */
export type SubmissionValidator = (code: string, question: ResolvedQuestion) => Promise<SubmissionVerdict>;

export type RoomTarget = { kind: 'all' } | { kind: 'host' } | { kind: 'player'; playerId: string };

type EventName = keyof ServerToClientEvents;
type EventPayload<E extends EventName> = Parameters<ServerToClientEvents[E]>[0];

export interface RoomSink {
  emit<E extends EventName>(target: RoomTarget, event: E, payload: EventPayload<E>): void;
  /** Pede ao transporte para reenviar snapshots (cada destinatário recebe a sua visão). */
  sync(): void;
}

export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

interface PlayerState {
  id: string;
  token: string;
  name: string;
  avatar: AvatarId;
  connected: boolean;
  joinedAt: number;
  totalXP: number;
  correctCount: number;
  lastCorrectAt: number | null;
  streak: number;
  rank: number | null;
  previousRank: number | null;
  lastQuestionXP: number;
}

interface QuestionRecord {
  question: ResolvedQuestion;
  index: number;
  startsAt: number;
  endsAt: number;
  finishedAt: number | null;
  answers: Map<string, PlayerAnswer>;
  progress: Map<string, { done: number; total: number }>;
  pending: Map<string, Promise<void>>;
  results: QuestionResults | null;
}

export interface RoomOptions {
  code: string;
  hostToken: string;
  packTitle: string;
  questions: ResolvedQuestion[];
  settings?: RoomSettingsPatch;
  validator: SubmissionValidator;
  sink: RoomSink;
  clock?: Clock;
  createId?: () => string;
}

const randomId = () => globalThis.crypto.randomUUID();

export class Room {
  readonly code: string;
  readonly hostToken: string;
  readonly packTitle: string;
  readonly createdAt: number;
  private readonly questions: ResolvedQuestion[];
  private readonly validator: SubmissionValidator;
  private readonly sink: RoomSink;
  private readonly clock: Clock;
  private readonly createId: () => string;

  private phase: RoomPhase = 'lobby';
  private settings: RoomSettings;
  private players = new Map<string, PlayerState>();
  private history: QuestionRecord[] = [];
  private current: QuestionRecord | null = null;
  private timers: unknown[] = [];
  private finishing: Promise<void> | null = null;
  private report: SessionReport | null = null;
  private startedAt: number | null = null;
  lastActivityAt: number;

  constructor(options: RoomOptions) {
    if (options.questions.length === 0) throw new RoomError('invalid_state', 'A sala precisa de pelo menos 1 questão');
    this.code = options.code;
    this.hostToken = options.hostToken;
    this.packTitle = options.packTitle;
    this.questions = options.questions;
    this.validator = options.validator;
    this.sink = options.sink;
    this.clock = options.clock ?? systemClock;
    this.createId = options.createId ?? randomId;
    this.settings = { ...DEFAULT_ROOM_SETTINGS, ...options.settings };
    this.createdAt = this.clock.now();
    this.lastActivityAt = this.createdAt;
  }

  /* ---------------------------------------------------------------- */
  /* Consulta                                                          */
  /* ---------------------------------------------------------------- */

  get currentPhase(): RoomPhase {
    return this.phase;
  }

  get currentSettings(): RoomSettings {
    return this.settings;
  }

  getPlayerByToken(token: string): PlayerPublic | null {
    for (const player of this.players.values()) {
      if (player.token === token) return this.publicPlayer(player);
    }
    return null;
  }

  isHost(token: string): boolean {
    return token === this.hostToken;
  }

  hasPlayer(playerId: string): boolean {
    return this.players.has(playerId);
  }

  /* ---------------------------------------------------------------- */
  /* Jogadores                                                         */
  /* ---------------------------------------------------------------- */

  join(input: { name: string; avatar: AvatarId; playerToken?: string }): {
    playerId: string;
    playerToken: string;
    reconnected: boolean;
  } {
    this.touch();
    if (input.playerToken) {
      for (const player of this.players.values()) {
        if (player.token === input.playerToken) {
          player.connected = true;
          this.sink.emit({ kind: 'all' }, 'player:joined', this.publicPlayer(player));
          this.sink.sync();
          return { playerId: player.id, playerToken: player.token, reconnected: true };
        }
      }
    }
    if (this.phase === 'ended') throw new RoomError('room_ended', 'Esta sessão já foi encerrada');
    const name = input.name.trim().replace(/\s+/g, ' ');
    const key = name.toLocaleLowerCase('pt-BR');
    for (const player of this.players.values()) {
      if (player.name.toLocaleLowerCase('pt-BR') === key) {
        throw new RoomError('name_taken', `O nome "${name}" já está em uso nesta sala`);
      }
    }
    const player: PlayerState = {
      id: this.createId(),
      token: this.createId(),
      name,
      avatar: input.avatar,
      connected: true,
      joinedAt: this.clock.now(),
      totalXP: 0,
      correctCount: 0,
      lastCorrectAt: null,
      streak: 0,
      rank: null,
      previousRank: null,
      lastQuestionXP: 0,
    };
    this.players.set(player.id, player);
    this.sink.emit({ kind: 'all' }, 'player:joined', this.publicPlayer(player));
    this.sink.sync();
    return { playerId: player.id, playerToken: player.token, reconnected: false };
  }

  connect(playerId: string): void {
    const player = this.players.get(playerId);
    if (!player || player.connected) return;
    player.connected = true;
    this.touch();
    this.sink.sync();
  }

  disconnect(playerId: string): void {
    const player = this.players.get(playerId);
    if (!player || !player.connected) return;
    player.connected = false;
    this.touch();
    this.sink.emit({ kind: 'all' }, 'player:left', { playerId, name: player.name });
    this.sink.sync();
    this.maybeFinishWhenAllAnswered();
  }

  /** Saída voluntária: no lobby remove o jogador; durante o jogo mantém o placar e marca como desconectado. */
  leave(playerId: string): void {
    const player = this.players.get(playerId);
    if (!player) return;
    if (this.phase === 'lobby') {
      this.players.delete(playerId);
      this.sink.emit({ kind: 'all' }, 'player:left', { playerId, name: player.name });
      this.sink.sync();
      return;
    }
    this.disconnect(playerId);
  }

  kick(playerId: string): void {
    const player = this.players.get(playerId);
    if (!player) throw new RoomError('not_in_room', 'Aluno não encontrado');
    this.players.delete(playerId);
    this.current?.answers.delete(playerId);
    this.current?.progress.delete(playerId);
    this.sink.emit({ kind: 'all' }, 'player:left', { playerId, name: player.name });
    this.sink.sync();
    this.maybeFinishWhenAllAnswered();
  }

  updateSettings(patch: RoomSettingsPatch): void {
    this.settings = { ...this.settings, ...patch };
    this.touch();
    this.sink.sync();
  }

  /* ---------------------------------------------------------------- */
  /* Ciclo da questão                                                  */
  /* ---------------------------------------------------------------- */

  startNextQuestion(): ActiveQuestion {
    if (this.phase !== 'lobby' && this.phase !== 'review') {
      throw new RoomError('invalid_state', 'Só é possível iniciar uma questão no lobby ou após o placar');
    }
    const index = this.history.length;
    const question = this.questions[index];
    if (!question) throw new RoomError('invalid_state', 'Não há mais questões. Encerre a sessão.');
    this.touch();

    const now = this.clock.now();
    this.startedAt ??= now;
    const countdownMs = this.settings.countdownSeconds * 1000;
    const startsAt = now + countdownMs;
    const endsAt = startsAt + question.timeLimitSeconds * 1000;
    const record: QuestionRecord = {
      question,
      index,
      startsAt,
      endsAt,
      finishedAt: null,
      answers: new Map(),
      progress: new Map(),
      pending: new Map(),
      results: null,
    };
    this.current = record;
    this.history.push(record);
    this.phase = countdownMs > 0 ? 'countdown' : 'question';

    const active = this.activeQuestion()!;
    this.sink.emit({ kind: 'all' }, 'question:loaded', { question: active, serverNow: now });

    const begin = () => {
      if (this.current !== record || this.phase !== 'countdown') return;
      this.phase = 'question';
      this.sink.emit({ kind: 'all' }, 'question:started', {
        questionId: question.id,
        startsAt,
        endsAt,
        serverNow: this.clock.now(),
      });
      this.sink.sync();
    };
    if (countdownMs > 0) {
      this.schedule(begin, countdownMs);
    } else {
      this.sink.emit({ kind: 'all' }, 'question:started', { questionId: question.id, startsAt, endsAt, serverNow: now });
    }
    this.schedule(() => {
      if (this.current === record && record.finishedAt === null) void this.finishQuestion();
    }, endsAt - now);
    this.sink.sync();
    return active;
  }

  reportProgress(playerId: string, done: number, total: number): void {
    const record = this.current;
    if (!record || record.finishedAt !== null || !this.players.has(playerId)) return;
    const safeTotal = record.question.checklist.filter((i) => !i.optional).length;
    const entry = { done: Math.min(done, safeTotal), total: safeTotal };
    record.progress.set(playerId, entry);
    this.sink.emit({ kind: 'host' }, 'question:progress', {
      playerId,
      ...entry,
      answered: record.answers.get(playerId)?.status === 'accepted',
    });
  }

  /**
   * Recebe uma resposta. O horário usado para pontuação é o de chegada no servidor,
   * registrado antes da validação (o tempo de validação não penaliza o aluno).
   */
  async submit(playerId: string, code: string): Promise<PlayerAnswer> {
    const player = this.players.get(playerId);
    if (!player) throw new RoomError('not_in_room', 'Você não está nesta sala');
    const record = this.current;
    const receivedAt = this.clock.now();
    this.touch();

    if (!record || this.phase === 'lobby' || this.phase === 'ended') {
      throw new RoomError('invalid_state', 'Não há questão ativa');
    }
    const existing = record.answers.get(playerId);
    if (existing && (existing.status === 'accepted' || existing.status === 'validating')) return existing;
    if (this.phase === 'countdown' || receivedAt < record.startsAt) {
      throw new RoomError('invalid_state', 'A questão ainda não começou');
    }

    const timeLimitMs = record.question.timeLimitSeconds * 1000;
    const remainingMs = Math.max(0, record.endsAt - receivedAt);

    if (record.finishedAt !== null || receivedAt > record.endsAt) {
      const late: PlayerAnswer = {
        status: 'late',
        xp: 0,
        receivedAt,
        remainingMs: 0,
        items: [],
        message: 'O tempo acabou antes da resposta chegar ao servidor',
      };
      if (record.finishedAt === null) record.answers.set(playerId, late);
      this.sink.emit({ kind: 'player', playerId }, 'question:validated', { questionId: record.question.id, answer: late });
      return late;
    }

    const validating: PlayerAnswer = { status: 'validating', xp: 0, receivedAt, remainingMs, items: [] };
    record.answers.set(playerId, validating);

    const task = (async () => {
      let verdict: SubmissionVerdict;
      try {
        verdict = await this.validator(code, record.question);
      } catch (err) {
        verdict = { passed: false, items: [], message: `Falha na validação: ${err instanceof Error ? err.message : String(err)}` };
      }
      let answer: PlayerAnswer;
      if (verdict.passed) {
        const xp = calculateXP({
          baseXP: record.question.baseXP,
          speedBonusMax: record.question.speedBonusMax,
          timeLimitMs,
          remainingMs,
        });
        const streakBonus = calculateStreakBonus(player.streak + 1, this.settings);
        answer = {
          status: 'accepted',
          xp: xp.total + streakBonus,
          receivedAt,
          remainingMs,
          items: verdict.items,
          code,
          ...(streakBonus > 0 ? { message: `Inclui ${streakBonus} XP de sequência` } : {}),
        };
      } else {
        answer = {
          status: 'rejected',
          xp: 0,
          receivedAt,
          remainingMs,
          items: verdict.items,
          message: verdict.message ?? 'O servidor não confirmou todos os itens da checklist',
        };
      }
      if (this.players.has(playerId)) record.answers.set(playerId, answer);
      return answer;
    })();

    const tracked = task.then(() => undefined);
    record.pending.set(playerId, tracked);
    const answer = await task;
    record.pending.delete(playerId);

    this.sink.emit({ kind: 'player', playerId }, 'question:validated', { questionId: record.question.id, answer });
    this.sink.emit({ kind: 'host' }, 'question:submitted', {
      playerId,
      name: player.name,
      accepted: answer.status === 'accepted',
      answeredCount: this.acceptedCount(record),
      playerCount: this.connectedPlayers().length,
    });
    this.sink.sync();
    this.maybeFinishWhenAllAnswered();
    return answer;
  }

  /** Encerra a questão atual (tempo esgotado, todos responderam ou ação do professor). */
  finishQuestion(): Promise<void> {
    if (this.finishing) return this.finishing;
    const record = this.current;
    if (!record || record.finishedAt !== null) return Promise.resolve();
    if (this.phase !== 'question' && this.phase !== 'countdown') return Promise.resolve();

    this.finishing = (async () => {
      // Respostas que chegaram dentro do prazo e ainda estão em validação são concluídas antes do placar.
      await Promise.allSettled([...record.pending.values()]);
      this.clearTimers();
      const now = this.clock.now();
      record.finishedAt = Math.min(now, record.endsAt);

      const before = new Map([...this.players.values()].map((p) => [p.id, p.rank]));
      for (const player of this.players.values()) {
        const answer = record.answers.get(player.id);
        if (answer?.status === 'accepted') {
          player.totalXP += answer.xp;
          player.correctCount += 1;
          player.lastCorrectAt = answer.receivedAt;
          player.streak += 1;
          player.lastQuestionXP = answer.xp;
        } else {
          player.streak = 0;
          player.lastQuestionXP = 0;
        }
      }
      for (const ranked of rankPlayers([...this.players.values()])) {
        const player = this.players.get(ranked.id)!;
        player.previousRank = before.get(player.id) ?? null;
        player.rank = ranked.rank;
      }

      record.results = this.computeResults(record);
      this.phase = 'review';
      this.touch();
      const leaderboard = this.leaderboard();
      this.sink.emit({ kind: 'all' }, 'question:finished', {
        results: record.results,
        leaderboard,
        solution: record.question.solution,
      });
      this.sink.emit({ kind: 'all' }, 'leaderboard:update', leaderboard);
      this.sink.sync();
    })().finally(() => {
      this.finishing = null;
    });
    return this.finishing;
  }

  async endSession(): Promise<SessionReport> {
    if (this.report) return this.report;
    if (this.phase === 'question' || this.phase === 'countdown') await this.finishQuestion();
    this.clearTimers();
    this.phase = 'ended';
    this.touch();
    this.report = this.buildReport();
    this.sink.emit({ kind: 'all' }, 'session:ended', this.report);
    this.sink.sync();
    return this.report;
  }

  dispose(): void {
    this.clearTimers();
  }

  /* ---------------------------------------------------------------- */
  /* Snapshots                                                         */
  /* ---------------------------------------------------------------- */

  snapshotForHost(): RoomSnapshot {
    return { ...this.baseSnapshot(this.leaderboard()), progress: this.progressEntries() };
  }

  snapshotForPlayer(playerId: string): RoomSnapshot {
    const player = this.players.get(playerId);
    const full = this.leaderboard();
    const leaderboard = this.settings.discreetMode
      ? full.filter((entry) => entry.rank <= 3 || entry.playerId === playerId)
      : full;
    const snapshot = this.baseSnapshot(leaderboard);
    if (!player) return snapshot;
    const answer = this.current?.answers.get(playerId) ?? null;
    return {
      ...snapshot,
      me: {
        playerId: player.id,
        name: player.name,
        avatar: player.avatar,
        totalXP: player.totalXP,
        rank: player.rank,
        streak: player.streak,
        answer,
      },
    };
  }

  /* ---------------------------------------------------------------- */
  /* Internos                                                          */
  /* ---------------------------------------------------------------- */

  private baseSnapshot(leaderboard: LeaderboardEntry[]): RoomSnapshot {
    return {
      code: this.code,
      phase: this.phase,
      packTitle: this.packTitle,
      pluginIds: [...new Set(this.questions.map((q) => q.pluginId))],
      questionCount: this.questions.length,
      questionIndex: this.current?.index ?? -1,
      settings: this.settings,
      players: [...this.players.values()].sort((a, b) => a.joinedAt - b.joinedAt).map((p) => this.publicPlayer(p)),
      leaderboard,
      question: this.activeQuestion(),
      answeredCount: this.current ? this.acceptedCount(this.current) : 0,
      connectedCount: this.connectedPlayers().length,
      lastResults: this.current?.results ?? null,
      report: this.report,
      serverNow: this.clock.now(),
    };
  }

  private activeQuestion(): ActiveQuestion | null {
    const record = this.current;
    if (!record) return null;
    return {
      index: record.index,
      total: this.questions.length,
      question: toPublicQuestion(record.question),
      startsAt: record.startsAt,
      endsAt: record.endsAt,
      finishedAt: record.finishedAt,
    };
  }

  private publicPlayer(player: PlayerState): PlayerPublic {
    return {
      id: player.id,
      name: player.name,
      avatar: player.avatar,
      connected: player.connected,
      totalXP: player.totalXP,
      correctCount: player.correctCount,
    };
  }

  private leaderboard(): LeaderboardEntry[] {
    return rankPlayers([...this.players.values()]).map((p) => ({
      playerId: p.id,
      name: p.name,
      avatar: p.avatar,
      totalXP: p.totalXP,
      questionXP: p.lastQuestionXP,
      rank: p.rank,
      previousRank: p.previousRank,
      correctCount: p.correctCount,
      lastCorrectAt: p.lastCorrectAt,
      connected: p.connected,
    }));
  }

  private progressEntries(): ProgressEntry[] {
    const record = this.current;
    const total = record ? record.question.checklist.filter((i) => !i.optional).length : 0;
    return [...this.players.values()].map((player) => {
      const answered = record?.answers.get(player.id)?.status === 'accepted';
      const progress = record?.progress.get(player.id);
      return { playerId: player.id, done: answered ? total : (progress?.done ?? 0), total, answered };
    });
  }

  private connectedPlayers(): PlayerState[] {
    return [...this.players.values()].filter((p) => p.connected);
  }

  private acceptedCount(record: QuestionRecord): number {
    let count = 0;
    for (const answer of record.answers.values()) if (answer.status === 'accepted') count++;
    return count;
  }

  private maybeFinishWhenAllAnswered(): void {
    const record = this.current;
    if (!record || record.finishedAt !== null || this.phase !== 'question') return;
    const connected = this.connectedPlayers();
    if (connected.length === 0) return;
    if (connected.every((p) => record.answers.get(p.id)?.status === 'accepted')) void this.finishQuestion();
  }

  private computeResults(record: QuestionRecord): QuestionResults {
    const timeLimitMs = record.question.timeLimitSeconds * 1000;
    const correct = [...record.answers.entries()].filter(([, a]) => a.status === 'accepted');
    const times = correct.map(([id, a]) => ({ id, timeMs: timeLimitMs - a.remainingMs }));
    const fastest = times.reduce<{ id: string; timeMs: number } | null>(
      (best, t) => (!best || t.timeMs < best.timeMs ? t : best),
      null,
    );
    return {
      questionId: record.question.id,
      index: record.index,
      playerCount: this.players.size,
      correctCount: correct.length,
      averageTimeMs: times.length ? Math.round(times.reduce((s, t) => s + t.timeMs, 0) / times.length) : null,
      fastest: fastest
        ? { playerId: fastest.id, name: this.players.get(fastest.id)?.name ?? '', timeMs: fastest.timeMs }
        : null,
    };
  }

  private buildReport(): SessionReport {
    const finished = this.history.filter((r) => r.results);
    const ranked = rankPlayers([...this.players.values()]);
    const players: PlayerReport[] = ranked.map((player) => {
      const perQuestion = finished.map((record) => {
        const answer = record.answers.get(player.id);
        const correct = answer?.status === 'accepted';
        return {
          questionId: record.question.id,
          correct,
          xp: correct ? answer!.xp : 0,
          timeMs: correct ? record.question.timeLimitSeconds * 1000 - answer!.remainingMs : null,
        };
      });
      const times = perQuestion.map((q) => q.timeMs).filter((t): t is number => t !== null);
      return {
        playerId: player.id,
        name: player.name,
        avatar: player.avatar,
        rank: player.rank,
        totalXP: player.totalXP,
        correctCount: player.correctCount,
        questionCount: finished.length,
        averageTimeMs: times.length ? Math.round(times.reduce((s, t) => s + t, 0) / times.length) : null,
        perQuestion,
      };
    });
    return {
      roomCode: this.code,
      packTitle: this.packTitle,
      startedAt: this.startedAt ?? this.createdAt,
      endedAt: this.clock.now(),
      questions: finished.map((r) => r.results!),
      players,
    };
  }

  private schedule(fn: () => void, ms: number): void {
    this.timers.push(this.clock.setTimeout(fn, Math.max(0, ms)));
  }

  private clearTimers(): void {
    this.timers.forEach((t) => this.clock.clearTimeout(t));
    this.timers = [];
  }

  private touch(): void {
    this.lastActivityAt = this.clock.now();
  }
}

/** Gera códigos de 6 dígitos sem zero inicial (fáceis de ditar e digitar). */
export function generateRoomCode(random: () => number = Math.random): string {
  return String(100000 + Math.floor(random() * 900000));
}

export class RoomManager {
  private rooms = new Map<string, Room>();

  constructor(private readonly random: () => number = Math.random) {}

  create(options: Omit<RoomOptions, 'code' | 'hostToken'> & { hostToken?: string }): Room {
    let code = generateRoomCode(this.random);
    for (let attempt = 0; this.rooms.has(code); attempt++) {
      if (attempt > 50) throw new RoomError('invalid_state', 'Não foi possível gerar um código de sala livre');
      code = generateRoomCode(this.random);
    }
    const room = new Room({ ...options, code, hostToken: options.hostToken ?? randomId() });
    this.rooms.set(code, room);
    return room;
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  require(code: string): Room {
    const room = this.rooms.get(code);
    if (!room) throw new RoomError('room_not_found', 'Sala não encontrada. Confira o código.');
    return room;
  }

  delete(code: string): void {
    this.rooms.get(code)?.dispose();
    this.rooms.delete(code);
  }

  list(): Room[] {
    return [...this.rooms.values()];
  }

  /** Remove salas sem atividade há mais de `maxIdleMs`. Retorna os códigos removidos. */
  sweep(now: number, maxIdleMs: number): string[] {
    const removed: string[] = [];
    for (const room of this.rooms.values()) {
      if (now - room.lastActivityAt > maxIdleMs) {
        this.delete(room.code);
        removed.push(room.code);
      }
    }
    return removed;
  }
}
