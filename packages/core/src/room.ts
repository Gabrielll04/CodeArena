import {
  DEFAULT_ROOM_SETTINGS,
  toPublicQuestion,
  type ActiveQuestion,
  type AssessmentGradeRow,
  type AssessmentQuestionProgress,
  type AssessmentStudentView,
  type AvatarId,
  type ErrorCode,
  type ItemCheck,
  type ItemInsight,
  type LeaderboardEntry,
  type PlayerAnswer,
  type PlayerPublic,
  type PlayerReport,
  type PlayerTimeline,
  type ProgressEntry,
  type QuestionTimeline,
  type QuestionResults,
  type ResolvedQuestion,
  type RoomPhase,
  type RoomSettings,
  type RoomSettingsPatch,
  type RoomSnapshot,
  type ServerToClientEvents,
  type SessionReport,
} from '@codearena/schemas';
import { activityGrade, questionGrade } from './grading';
import { calculateStreakBonus, calculateXP, rankPlayers } from './scoring';
import { buildPlayerTimeline, createPasteLog, recordPaste, type PasteLog } from './timeline';

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
  /** Atividade avaliativa: índice da questão em que o aluno está. */
  position: number;
}

interface QuestionRecord {
  question: ResolvedQuestion;
  index: number;
  startsAt: number;
  endsAt: number;
  finishedAt: number | null;
  answers: Map<string, PlayerAnswer>;
  progress: Map<string, { done: number; total: number }>;
  /** Por aluno e item: se está concluído agora e quando foi concluído pela primeira vez (relógio do servidor). */
  itemState: Map<string, Map<string, { done: boolean; firstAt: number }>>;
  /** Colagens informadas pelo navegador de cada aluno (tamanho, nunca o texto). */
  pastes: Map<string, PasteLog>;
  /** Configuração de colagem no início da questão (a linha do tempo explica o que valia). */
  allowPaste: boolean;
  pending: Map<string, Promise<void>>;
  lastSubmitAt: Map<string, number>;
  /** Atividade avaliativa: a melhor versão de cada aluno, pelos itens que o servidor confirmou. */
  best: Map<string, { grade: number; passed: Set<string> }>;
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

/** Intervalo mínimo entre envios do mesmo aluno (protege o runner de validação contra spam). */
export const SUBMIT_INTERVAL_MS = 500;

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
  private ending: Promise<SessionReport> | null = null;
  private report: SessionReport | null = null;
  private startedAt: number | null = null;
  /** Atividade avaliativa: começo e prazo, iguais para todas as questões. */
  private window: { startsAt: number; endsAt: number } | null = null;
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
      position: 0,
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
    for (const record of this.isAssessment ? this.history : this.current ? [this.current] : []) {
      record.answers.delete(playerId);
      record.progress.delete(playerId);
      record.itemState.delete(playerId);
      record.best.delete(playerId);
    }
    this.sink.emit({ kind: 'all' }, 'player:left', { playerId, name: player.name });
    this.sink.sync();
    this.maybeFinishWhenAllAnswered();
  }

  updateSettings(patch: RoomSettingsPatch): void {
    // O modo e a duração só mudam antes de começar.
    if (this.phase !== 'lobby') {
      const { mode: _mode, assessmentMinutes: _minutes, ...rest } = patch;
      patch = rest;
    }
    this.settings = { ...this.settings, ...patch };
    this.touch();
    this.sink.sync();
  }

  /* ---------------------------------------------------------------- */
  /* Ciclo da questão                                                  */
  /* ---------------------------------------------------------------- */

  startNextQuestion(): ActiveQuestion {
    if (this.isAssessment) return this.startAssessment();
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
    const record = this.createRecord(question, index, startsAt, endsAt);
    this.current = record;
    this.history.push(record);
    this.phase = countdownMs > 0 ? 'countdown' : 'question';

    const active = this.activeQuestion(record)!;
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

  /**
   * Atividade avaliativa: todas as questões abrem juntas, com o mesmo prazo, e cada aluno navega no próprio ritmo.
   * Ao fim do prazo a sessão é encerrada.
   */
  private startAssessment(): ActiveQuestion {
    if (this.phase !== 'lobby') throw new RoomError('invalid_state', 'A atividade já começou');
    this.touch();
    const now = this.clock.now();
    this.startedAt = now;
    const countdownMs = this.settings.countdownSeconds * 1000;
    const startsAt = now + countdownMs;
    const endsAt = startsAt + this.settings.assessmentMinutes * 60_000;
    this.window = { startsAt, endsAt };
    this.history = this.questions.map((question, index) => this.createRecord(question, index, startsAt, endsAt));
    this.current = this.history[0]!;
    for (const player of this.players.values()) player.position = 0;
    this.phase = countdownMs > 0 ? 'countdown' : 'question';

    const active = this.activeQuestion(this.current)!;
    this.sink.emit({ kind: 'all' }, 'question:loaded', { question: active, serverNow: now });
    const started = () => ({ questionId: active.question.id, startsAt, endsAt, serverNow: this.clock.now() });
    if (countdownMs > 0) {
      this.schedule(() => {
        if (this.phase !== 'countdown') return;
        this.phase = 'question';
        this.sink.emit({ kind: 'all' }, 'question:started', started());
        this.sink.sync();
      }, countdownMs);
    } else {
      this.sink.emit({ kind: 'all' }, 'question:started', started());
    }
    this.schedule(() => void this.endSession(), endsAt - now);
    this.sink.sync();
    return active;
  }

  /** Atividade avaliativa: o aluno vai para outra questão. Devolve o snapshot dele. */
  goTo(playerId: string, index: number): RoomSnapshot {
    const player = this.players.get(playerId);
    if (!player) throw new RoomError('not_in_room', 'Você não está nesta sala');
    if (!this.isAssessment || !this.window) throw new RoomError('invalid_state', 'Disponível só em atividades avaliativas');
    if (this.phase === 'ended') throw new RoomError('room_ended', 'A atividade foi encerrada');
    if (!this.history[index]) throw new RoomError('invalid_state', 'Questão não encontrada');
    this.touch();
    player.position = index;
    this.sink.emit({ kind: 'host' }, 'assessment:row', this.gradeRow(player));
    return this.snapshotForPlayer(playerId);
  }

  private createRecord(question: ResolvedQuestion, index: number, startsAt: number, endsAt: number): QuestionRecord {
    return {
      question,
      index,
      startsAt,
      endsAt,
      finishedAt: null,
      answers: new Map(),
      progress: new Map(),
      itemState: new Map(),
      pastes: new Map(),
      allowPaste: this.settings.allowPaste,
      pending: new Map(),
      lastSubmitAt: new Map(),
      best: new Map(),
      results: null,
    };
  }

  private get isAssessment(): boolean {
    return this.settings.mode === 'assessment';
  }

  /**
   * A questão em que o aluno está trabalhando: a atual da sala ou, na atividade avaliativa, a que ele informou
   * (ou a posição dele).
   */
  private recordFor(playerId: string, questionId?: string): QuestionRecord | null {
    if (!this.isAssessment) return this.current;
    if (questionId) return this.history.find((r) => r.question.id === questionId) ?? null;
    const player = this.players.get(playerId);
    return player ? (this.history[player.position] ?? null) : null;
  }

  /**
   * Progresso informado pelo cliente (contagem e ids dos itens concluídos, nunca o código).
   * É apenas informativo, para o painel do professor e a revisão da turma; a pontuação não depende dele.
   */
  reportProgress(playerId: string, done: number, total: number, doneIds?: string[], questionId?: string): void {
    const record = this.recordFor(playerId, questionId);
    if (!record || record.finishedAt !== null || !this.players.has(playerId)) return;
    const required = record.question.checklist.filter((i) => !i.optional);
    let firstCompletion = false;
    if (doneIds) {
      const valid = new Set(record.question.checklist.map((i) => i.id));
      firstCompletion = this.markItems(record, playerId, new Set(doneIds.filter((id) => valid.has(id))), 'replace', this.clock.now());
      done = required.filter((i) => record.itemState.get(playerId)?.get(i.id)?.done).length;
    }
    const entry = { done: Math.min(done, required.length), total: required.length };
    record.progress.set(playerId, entry);
    // Na atividade avaliativa, o professor acompanha pelo que o servidor confirmou (assessment:row).
    if (!this.isAssessment) this.sink.emit({ kind: 'host' }, 'question:progress', {
      playerId,
      ...entry,
      answered: record.answers.get(playerId)?.status === 'accepted',
      doneIds: this.doneIdsOf(record, playerId),
    });
    if (firstCompletion) this.emitTimeline(record, playerId);
  }

  /**
   * Colagem no editor, informada pelo navegador do aluno. Entra só na linha do tempo do professor, como indício;
   * a pontuação nunca depende dela. Ignorada fora do tempo da questão e depois da resposta aceita.
   */
  reportPaste(playerId: string, chars: number, blocked: boolean, questionId?: string): void {
    const record = this.recordFor(playerId, questionId);
    const now = this.clock.now();
    if (!record || record.finishedAt !== null || this.phase !== 'question' || !this.players.has(playerId)) return;
    if (now < record.startsAt || now > record.endsAt || record.answers.get(playerId)?.status === 'accepted') return;
    let log = record.pastes.get(playerId);
    if (!log) record.pastes.set(playerId, (log = createPasteLog()));
    recordPaste(log, { at: now, chars, blocked });
    this.emitTimeline(record, playerId);
  }

  private emitTimeline(record: QuestionRecord, playerId: string): void {
    this.sink.emit({ kind: 'host' }, 'question:timeline', { questionId: record.question.id, timeline: this.timelineOf(record, playerId) });
  }

  /**
   * Atualiza o estado por item. `replace` define o conjunto atual; `add` só acrescenta itens concluídos.
   * Devolve true quando algum item foi concluído pela primeira vez (a linha do tempo mudou).
   */
  private markItems(record: QuestionRecord, playerId: string, ids: Set<string>, mode: 'replace' | 'add', now: number): boolean {
    let state = record.itemState.get(playerId);
    if (!state) record.itemState.set(playerId, (state = new Map()));
    let first = false;
    for (const item of record.question.checklist) {
      const entry = state.get(item.id);
      if (ids.has(item.id)) {
        if (!entry) {
          state.set(item.id, { done: true, firstAt: now });
          first = true;
        } else entry.done = true;
      } else if (mode === 'replace' && entry) {
        entry.done = false;
      }
    }
    return first;
  }

  private doneIdsOf(record: QuestionRecord, playerId: string): string[] {
    if (record.answers.get(playerId)?.status === 'accepted') return record.question.checklist.map((i) => i.id);
    const state = record.itemState.get(playerId);
    return record.question.checklist.filter((i) => state?.get(i.id)?.done).map((i) => i.id);
  }

  /**
   * Recebe uma resposta. O horário usado para pontuação é o de chegada no servidor,
   * registrado antes da validação (o tempo de validação não penaliza o aluno).
   */
  async submit(playerId: string, code: string, questionId?: string): Promise<PlayerAnswer> {
    const player = this.players.get(playerId);
    if (!player) throw new RoomError('not_in_room', 'Você não está nesta sala');
    const record = this.recordFor(playerId, questionId);
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
    const previous = record.lastSubmitAt.get(playerId);
    if (previous !== undefined && receivedAt - previous < SUBMIT_INTERVAL_MS && record.finishedAt === null) {
      throw new RoomError('invalid_state', 'Aguarde um instante antes de reenviar');
    }
    record.lastSubmitAt.set(playerId, receivedAt);

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
      if (verdict.passed && this.isAssessment) {
        answer = { status: 'accepted', xp: 0, receivedAt, remainingMs, items: verdict.items, code };
      } else if (verdict.passed) {
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
      if (this.players.has(playerId)) {
        record.answers.set(playerId, answer);
        // O servidor é a fonte confiável por item: aceita = tudo concluído; recusada = os itens que ele confirmou.
        const confirmed = verdict.passed
          ? new Set(record.question.checklist.map((i) => i.id))
          : new Set(verdict.items.filter((i) => i.passed).map((i) => i.id));
        this.markItems(record, playerId, confirmed, 'add', receivedAt);
        if (answer.status === 'accepted') this.emitTimeline(record, playerId);
        if (this.isAssessment) {
          const grade = questionGrade(record.question.checklist, confirmed);
          const best = record.best.get(playerId);
          if (!best || grade > best.grade || (grade === best.grade && confirmed.size > best.passed.size)) {
            record.best.set(playerId, { grade, passed: confirmed });
          }
        }
      }
      return answer;
    })();

    const tracked = task.then(() => undefined);
    record.pending.set(playerId, tracked);
    const answer = await task;
    record.pending.delete(playerId);

    this.sink.emit({ kind: 'player', playerId }, 'question:validated', { questionId: record.question.id, answer });
    if (this.isAssessment) {
      // Sem sincronizar a sala inteira a cada envio: só o aluno e a linha dele no painel do professor.
      if (this.players.has(playerId)) {
        this.sink.emit({ kind: 'player', playerId }, 'room:update', this.snapshotForPlayer(playerId));
        this.sink.emit({ kind: 'host' }, 'assessment:row', this.gradeRow(player));
      }
      return answer;
    }
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
    if (this.isAssessment) return this.endSession().then(() => undefined);
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
      // No modo discreto, a transmissão geral leva só o top 3; cada aluno recebe a própria posição no snapshot.
      const publicBoard = this.settings.discreetMode ? leaderboard.filter((e) => e.rank <= 3) : leaderboard;
      this.sink.emit({ kind: 'all' }, 'question:finished', {
        results: record.results,
        leaderboard: publicBoard,
        solution: record.question.solution,
      });
      this.sink.emit({ kind: 'all' }, 'leaderboard:update', publicBoard);
      this.sink.sync();
    })().finally(() => {
      this.finishing = null;
    });
    return this.finishing;
  }

  endSession(): Promise<SessionReport> {
    if (this.report) return Promise.resolve(this.report);
    this.ending ??= (async () => {
      if (this.isAssessment) await this.finishAssessment();
      else if (this.phase === 'question' || this.phase === 'countdown') await this.finishQuestion();
      this.clearTimers();
      this.phase = 'ended';
      this.touch();
      const report = this.buildReport();
      this.report = report;
      if (this.isAssessment) {
        // Na atividade avaliativa, cada aluno recebe só o próprio resultado.
        this.sink.emit({ kind: 'host' }, 'session:ended', report);
        for (const player of this.players.values()) {
          this.sink.emit({ kind: 'player', playerId: player.id }, 'session:ended', this.reportFor(player.id)!);
        }
      } else {
        this.sink.emit({ kind: 'all' }, 'session:ended', report);
      }
      this.sink.sync();
      return report;
    })();
    return this.ending;
  }

  /** Fecha todas as questões da atividade: espera as validações em andamento e calcula os resultados. */
  private async finishAssessment(): Promise<void> {
    if (!this.window) return;
    await Promise.allSettled(this.history.flatMap((record) => [...record.pending.values()]));
    const finishedAt = Math.min(this.clock.now(), this.window.endsAt);
    for (const record of this.history) {
      record.finishedAt = finishedAt;
      record.results = this.computeResults(record);
    }
    for (const player of this.players.values()) {
      player.correctCount = this.history.filter((r) => r.answers.get(player.id)?.status === 'accepted').length;
    }
  }

  dispose(): void {
    this.clearTimers();
  }

  /* ---------------------------------------------------------------- */
  /* Snapshots                                                         */
  /* ---------------------------------------------------------------- */

  snapshotForHost(): RoomSnapshot {
    const snapshot: RoomSnapshot = {
      ...this.baseSnapshot(this.leaderboard(), this.current),
      progress: this.progressEntries(),
      timelines: this.history.map((record) => this.questionTimeline(record)),
    };
    if (this.isAssessment && this.window) {
      const grades = [...this.players.values()].map((player) => this.gradeRow(player));
      return { ...snapshot, grades, answeredCount: grades.filter((row) => isComplete(row.questions)).length };
    }
    return snapshot;
  }

  snapshotForPlayer(playerId: string): RoomSnapshot {
    const player = this.players.get(playerId);
    if (this.isAssessment) {
      // Sem placar: o aluno vê só a própria atividade.
      const record = this.recordFor(playerId);
      const snapshot = { ...this.baseSnapshot([], record), report: this.report && this.reportFor(playerId) };
      if (!player) return snapshot;
      return {
        ...snapshot,
        me: { ...this.me(player, record), ...(this.window ? { assessment: this.studentView(player) } : {}) },
      };
    }
    const full = this.leaderboard();
    const leaderboard = this.settings.discreetMode
      ? full.filter((entry) => entry.rank <= 3 || entry.playerId === playerId)
      : full;
    const snapshot = this.baseSnapshot(leaderboard, this.current);
    if (!player) return snapshot;
    return { ...snapshot, me: this.me(player, this.current) };
  }

  private me(player: PlayerState, record: QuestionRecord | null): NonNullable<RoomSnapshot['me']> {
    return {
      playerId: player.id,
      name: player.name,
      avatar: player.avatar,
      totalXP: player.totalXP,
      rank: player.rank,
      streak: player.streak,
      answer: record?.answers.get(player.id) ?? null,
    };
  }

  /* ---------------------------------------------------------------- */
  /* Atividade avaliativa                                              */
  /* ---------------------------------------------------------------- */

  private questionProgress(record: QuestionRecord, playerId: string): AssessmentQuestionProgress & { grade: number } {
    const required = record.question.checklist.filter((i) => !i.optional);
    const best = record.best.get(playerId);
    const done = best ? required.filter((i) => best.passed.has(i.id)).length : 0;
    const complete = record.answers.get(playerId)?.status === 'accepted';
    return {
      questionId: record.question.id,
      title: record.question.title ?? record.question.prompt.slice(0, 60),
      kind: record.question.kind,
      done: complete ? required.length : done,
      total: required.length,
      status: complete ? 'complete' : done > 0 ? 'partial' : 'empty',
      grade: complete ? questionGrade(record.question.checklist, new Set(required.map((i) => i.id))) : (best?.grade ?? 0),
    };
  }

  /** Linha do professor: nota de cada questão (melhor versão) e média da atividade. */
  private gradeRow(player: PlayerState): AssessmentGradeRow {
    const questions = this.history.map((record) => this.questionProgress(record, player.id));
    return {
      playerId: player.id,
      index: player.position,
      grade: activityGrade(questions.map((q) => q.grade)),
      questions,
    };
  }

  /** O que o aluno vê: as mesmas situações, sem nota. */
  private studentView(player: PlayerState): AssessmentStudentView {
    return {
      index: player.position,
      questions: this.history.map((record) => {
        const { grade: _grade, ...progress } = this.questionProgress(record, player.id);
        return progress;
      }),
    };
  }

  /** O relatório com só o próprio aluno (atividade avaliativa). */
  private reportFor(playerId: string): SessionReport | null {
    if (!this.report) return null;
    return { ...this.report, players: this.report.players.filter((p) => p.playerId === playerId) };
  }

  /* ---------------------------------------------------------------- */
  /* Internos                                                          */
  /* ---------------------------------------------------------------- */

  private baseSnapshot(leaderboard: LeaderboardEntry[], record: QuestionRecord | null): RoomSnapshot {
    return {
      code: this.code,
      phase: this.phase,
      packTitle: this.packTitle,
      pluginIds: [...new Set(this.questions.map((q) => q.pluginId))],
      questionCount: this.questions.length,
      questionIndex: record?.index ?? -1,
      settings: this.settings,
      players: [...this.players.values()].sort((a, b) => a.joinedAt - b.joinedAt).map((p) => this.publicPlayer(p)),
      leaderboard,
      question: this.activeQuestion(record),
      answeredCount: this.current ? this.acceptedCount(this.current) : 0,
      connectedCount: this.connectedPlayers().length,
      lastResults: this.current?.results ?? null,
      report: this.report,
      serverNow: this.clock.now(),
      ...(this.isAssessment && this.window ? { assessment: { ...this.window } } : {}),
    };
  }

  private activeQuestion(record: QuestionRecord | null): ActiveQuestion | null {
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
      return {
        playerId: player.id,
        done: answered ? total : (progress?.done ?? 0),
        total,
        answered,
        doneIds: record ? this.doneIdsOf(record, player.id) : [],
      };
    });
  }

  private timelineOf(record: QuestionRecord, playerId: string): PlayerTimeline {
    const firstAt = new Map<string, number>();
    record.itemState.get(playerId)?.forEach((state, id) => firstAt.set(id, state.firstAt));
    const answer = record.answers.get(playerId);
    return buildPlayerTimeline({
      playerId,
      startsAt: record.startsAt,
      checklist: record.question.checklist,
      itemFirstAt: firstAt,
      pastes: record.pastes.get(playerId),
      acceptedAt: answer?.status === 'accepted' ? answer.receivedAt : null,
    });
  }

  private questionTimeline(record: QuestionRecord): QuestionTimeline {
    return {
      questionId: record.question.id,
      index: record.index,
      title: record.question.title ?? record.question.prompt.slice(0, 60),
      timeLimitMs: record.question.timeLimitSeconds * 1000,
      requiredTotal: record.question.checklist.filter((i) => !i.optional).length,
      allowPaste: record.allowPaste,
      players: [...this.players.keys()].map((id) => this.timelineOf(record, id)),
    };
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
    if (this.isAssessment || !record || record.finishedAt !== null || this.phase !== 'question') return;
    const connected = this.connectedPlayers();
    if (connected.length === 0) return;
    if (connected.every((p) => record.answers.get(p.id)?.status === 'accepted')) void this.finishQuestion();
  }

  private computeResults(record: QuestionRecord): QuestionResults {
    const correct = [...record.answers.entries()].filter(([, a]) => a.status === 'accepted');
    const times = correct.map(([id, a]) => ({ id, timeMs: Math.max(0, a.receivedAt - record.startsAt) }));
    const fastest = times.reduce<{ id: string; timeMs: number } | null>(
      (best, t) => (!best || t.timeMs < best.timeMs ? t : best),
      null,
    );
    const items: ItemInsight[] = record.question.checklist.map((item) => {
      const doneAt: number[] = [];
      for (const player of this.players.values()) {
        const state = record.itemState.get(player.id)?.get(item.id);
        if (state?.done) doneAt.push(Math.max(0, state.firstAt - record.startsAt));
      }
      return {
        id: item.id,
        label: item.label,
        optional: item.optional,
        completedCount: doneAt.length,
        playerCount: this.players.size,
        medianTimeMs: median(doneAt),
      };
    });
    return {
      questionId: record.question.id,
      title: record.question.title ?? record.question.prompt.slice(0, 60),
      index: record.index,
      items,
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
          timeMs: correct ? Math.max(0, answer!.receivedAt - record.startsAt) : null,
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

function isComplete(questions: AssessmentQuestionProgress[]): boolean {
  return questions.length > 0 && questions.every((q) => q.status === 'complete');
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return Math.round(sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2);
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
