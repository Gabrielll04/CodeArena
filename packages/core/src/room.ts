import {
  DEFAULT_ROOM_SETTINGS,
  toPublicQuestion,
  type ActiveQuestion,
  countsForAcceptance,
  type AssessmentQuestionProgress,
  type AssessmentQuestionStatus,
  type AssessmentRow,
  type AssessmentStudentView,
  type AvatarId,
  type HistoryAnswer,
  type HistoryAnswerStatus,
  type HistoryPlayer,
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
  type SessionHistory,
  type SessionReport,
} from '@codearena/schemas';
import { calculateStreakBonus, calculateXP, rankPlayers } from './scoring';
import { activeElapsed, buildPlayerTimeline, createPasteLog, recordPaste, type PasteLog, type PauseInterval } from './timeline';

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
  /** Último código de cada aluno: salvo na atividade ou enviado na competição (vai para o histórico). */
  codes: Map<string, { code: string; at: number }>;
  /** Pausas do professor depois do início da questão: não contam nos tempos dos alunos. */
  pauses: PauseInterval[];
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
  /** Horário de criação (só ao restaurar uma sala; o padrão é agora). */
  createdAt?: number;
  /** Id do registro desta sessão no histórico do professor (mostrado a ele no fim). */
  historyId?: string;
  /** Chamado uma vez, quando a sessão termina (para guardar no histórico). */
  onEnded?: (room: Room) => void;
  /**
   * Chamado depois de qualquer mudança no estado da sala (para gravar um ponto de recuperação com `toState`). Pode ser
   * chamado muitas vezes seguidas: quem grava decide o intervalo.
   */
  onChange?: (room: Room) => void;
}

/**
 * Estado completo da sala em JSON, para retomar a sessão depois de o servidor reiniciar (`Room.fromState`). Inclui os
 * tokens de professor e alunos: guarde só no servidor.
 */
export interface RoomState {
  version: 1;
  /** Quando o estado foi gerado (relógio do servidor). */
  savedAt: number;
  code: string;
  hostToken: string;
  packTitle: string;
  createdAt: number;
  lastActivityAt: number;
  questions: ResolvedQuestion[];
  settings: RoomSettings;
  phase: RoomPhase;
  startedAt: number | null;
  window: { startsAt: number; endsAt: number } | null;
  players: PlayerState[];
  history: QuestionRecordState[];
  /** Índice de `history` da questão atual, ou -1. */
  currentIndex: number;
  report: SessionReport | null;
  /** Desde quando a sessão está pausada pelo professor (ausente em estados gravados antes da pausa existir). */
  pausedAt?: number | null;
}

export interface PlayerState {
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
  /** Atividade: índice da questão em que o aluno está. */
  position: number;
  /** Atividade: o aluno entregou e não edita mais. */
  delivered: boolean;
}

/** `QuestionRecord` sem o que só existe em memória (validações em andamento, intervalo entre envios). */
export interface QuestionRecordState {
  question: ResolvedQuestion;
  index: number;
  startsAt: number;
  endsAt: number;
  finishedAt: number | null;
  answers: [string, PlayerAnswer][];
  progress: [string, { done: number; total: number }][];
  itemState: [string, [string, { done: boolean; firstAt: number }][]][];
  pastes: [string, PasteLog][];
  allowPaste: boolean;
  codes: [string, { code: string; at: number }][];
  pauses?: PauseInterval[];
  results: QuestionResults | null;
}

export type RestoreOptions = Pick<RoomOptions, 'validator' | 'sink' | 'clock' | 'createId' | 'historyId' | 'onEnded' | 'onChange'>;

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
  private readonly options: Pick<RoomOptions, 'historyId' | 'onEnded' | 'onChange'>;

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
  /** Atividade: começo e prazo, iguais para todas as questões. */
  private window: { startsAt: number; endsAt: number } | null = null;
  /** Pausa do professor: desde quando o tempo está parado (relógio do servidor), ou null. */
  private pausedAt: number | null = null;
  lastActivityAt: number;

  constructor(options: RoomOptions) {
    if (options.questions.length === 0) throw new RoomError('invalid_state', 'A sala precisa de pelo menos 1 questão');
    this.code = options.code;
    this.hostToken = options.hostToken;
    this.packTitle = options.packTitle;
    this.questions = options.questions;
    this.validator = options.validator;
    // Tudo o que muda a sala passa por aqui ou por touch(): os dois avisam onChange.
    const sink = options.sink;
    this.sink = {
      emit: (target, event, payload) => {
        sink.emit(target, event, payload);
        this.changed();
      },
      sync: () => {
        sink.sync();
        this.changed();
      },
    };
    this.clock = options.clock ?? systemClock;
    this.createId = options.createId ?? randomId;
    this.options = { historyId: options.historyId, onEnded: options.onEnded, onChange: options.onChange };
    this.settings = { ...DEFAULT_ROOM_SETTINGS, ...options.settings };
    this.createdAt = options.createdAt ?? this.clock.now();
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

  get isPaused(): boolean {
    return this.pausedAt !== null;
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
          this.sink.emit(this.rosterTarget, 'player:joined', this.publicPlayer(player));
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
      delivered: false,
    };
    this.players.set(player.id, player);
    this.sink.emit(this.rosterTarget, 'player:joined', this.publicPlayer(player));
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
    this.sink.emit(this.rosterTarget, 'player:left', { playerId, name: player.name });
    this.sink.sync();
    this.maybeFinishWhenAllAnswered();
  }

  /** Saída voluntária: no lobby remove o jogador; durante o jogo mantém o placar e marca como desconectado. */
  leave(playerId: string): void {
    const player = this.players.get(playerId);
    if (!player) return;
    if (this.phase === 'lobby') {
      this.players.delete(playerId);
      this.sink.emit(this.rosterTarget, 'player:left', { playerId, name: player.name });
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
      record.codes.delete(playerId);
    }
    this.sink.emit(this.rosterTarget, 'player:left', { playerId, name: player.name });
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
    if (countdownMs === 0) {
      this.sink.emit({ kind: 'all' }, 'question:started', { questionId: question.id, startsAt, endsAt, serverNow: now });
    }
    this.armTimers();
    this.sink.sync();
    return active;
  }

  /**
   * Agenda o fim da contagem regressiva e o fim do prazo a partir dos horários guardados na sala (ao iniciar e ao
   * restaurar depois de o servidor reiniciar).
   */
  private armTimers(): void {
    if (this.phase !== 'countdown' && this.phase !== 'question') return;
    if (this.pausedAt !== null) return;
    const now = this.clock.now();
    if (this.isAssessment) {
      if (!this.window) return;
      const { startsAt, endsAt } = this.window;
      const questionId = this.history[0]!.question.id;
      if (this.phase === 'countdown') {
        this.schedule(() => {
          if (this.phase !== 'countdown') return;
          this.phase = 'question';
          this.sink.emit({ kind: 'all' }, 'question:started', { questionId, startsAt, endsAt, serverNow: this.clock.now() });
          this.sink.sync();
        }, startsAt - now);
      }
      this.schedule(() => void this.endSession(), endsAt - now);
      return;
    }
    const record = this.current;
    if (!record || record.finishedAt !== null) return;
    if (this.phase === 'countdown') {
      this.schedule(() => {
        if (this.current !== record || this.phase !== 'countdown') return;
        this.phase = 'question';
        this.sink.emit({ kind: 'all' }, 'question:started', {
          questionId: record.question.id,
          startsAt: record.startsAt,
          endsAt: record.endsAt,
          serverNow: this.clock.now(),
        });
        this.sink.sync();
      }, record.startsAt - now);
    }
    this.schedule(() => {
      if (this.current === record && record.finishedAt === null) void this.finishQuestion();
    }, record.endsAt - now);
  }

  /**
   * Pausa do professor: o cronômetro para e os alunos não navegam, não escrevem e não enviam até a retomada.
   * Só vale com o tempo correndo (contagem regressiva ou questão). Pausar de novo não muda nada.
   */
  pause(): void {
    if (this.phase !== 'countdown' && this.phase !== 'question') {
      throw new RoomError('invalid_state', 'Só é possível pausar com uma questão em andamento');
    }
    if (this.pausedAt !== null) return;
    this.pausedAt = this.clock.now();
    this.clearTimers();
    this.touch();
    this.sink.sync();
  }

  /** Retoma a sessão pausada: os prazos são adiados pelo tempo da pausa e o cronômetro volta de onde parou. */
  resume(): void {
    if (this.pausedAt === null) return;
    this.closePause();
    this.touch();
    this.armTimers();
    this.sink.sync();
  }

  /**
   * Fecha a pausa em andamento. Na contagem regressiva, o início e o prazo são adiados juntos; com a questão
   * valendo, só o prazo é adiado e a pausa fica registrada para não contar nos tempos dos alunos.
   */
  private closePause(): void {
    const from = this.pausedAt;
    if (from === null) return;
    this.pausedAt = null;
    const to = this.clock.now();
    const delta = Math.max(0, to - from);
    if (delta === 0) return;
    const shift = (span: { startsAt: number; endsAt: number }) => {
      if (from < span.startsAt) span.startsAt += delta;
      span.endsAt += delta;
    };
    const running = this.isAssessment ? this.history : this.current ? [this.current] : [];
    for (const record of running) {
      if (record.finishedAt !== null) continue;
      if (from >= record.startsAt) record.pauses.push({ from, to });
      shift(record);
    }
    if (this.isAssessment && this.window) shift(this.window);
  }

  private assertNotPaused(): void {
    if (this.pausedAt !== null) throw new RoomError('invalid_state', 'A sessão está pausada pelo professor');
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
    for (const player of this.players.values()) {
      player.position = 0;
      player.delivered = false;
    }
    this.phase = countdownMs > 0 ? 'countdown' : 'question';

    const active = this.activeQuestion(this.current)!;
    this.sink.emit({ kind: 'all' }, 'question:loaded', { question: active, serverNow: now });
    if (countdownMs === 0) {
      this.sink.emit({ kind: 'all' }, 'question:started', { questionId: active.question.id, startsAt, endsAt, serverNow: now });
    }
    this.armTimers();
    this.sink.sync();
    return active;
  }

  /** Atividade: o aluno vai para outra questão. Devolve o snapshot dele. */
  goTo(playerId: string, index: number): RoomSnapshot {
    const player = this.activityPlayer(playerId);
    this.assertNotPaused();
    if (!this.history[index]) throw new RoomError('invalid_state', 'Questão não encontrada');
    this.touch();
    player.position = index;
    this.emitRow(player);
    return this.snapshotForPlayer(playerId);
  }

  /**
   * Atividade: guarda a resposta do aluno como está, sem validar (o professor avalia depois).
   * Devolve o horário do servidor em que foi salva.
   */
  saveAnswer(playerId: string, questionId: string, code: string): number {
    const player = this.activityPlayer(playerId);
    if (this.phase !== 'question') throw new RoomError('invalid_state', 'A atividade ainda não começou');
    if (player.delivered) throw new RoomError('invalid_state', 'Você já entregou a atividade');
    this.assertNotPaused();
    const record = this.history.find((r) => r.question.id === questionId);
    if (!record) throw new RoomError('invalid_state', 'Questão não encontrada');
    const now = this.clock.now();
    if (now > record.endsAt) throw new RoomError('invalid_state', 'O tempo da atividade acabou');
    const before = this.answerStatus(record, playerId);
    record.codes.set(playerId, { code, at: now });
    this.touch();
    if (this.answerStatus(record, playerId) !== before) this.emitRow(player);
    return now;
  }

  /** Atividade: o aluno entrega; as respostas ficam como estão. Devolve o snapshot dele. */
  deliver(playerId: string): RoomSnapshot {
    const player = this.activityPlayer(playerId);
    if (this.phase !== 'question') throw new RoomError('invalid_state', 'A atividade ainda não começou');
    this.assertNotPaused();
    player.delivered = true;
    this.touch();
    this.emitRow(player);
    return this.snapshotForPlayer(playerId);
  }

  private activityPlayer(playerId: string): PlayerState {
    const player = this.players.get(playerId);
    if (!player) throw new RoomError('not_in_room', 'Você não está nesta sala');
    if (!this.isAssessment || !this.window) throw new RoomError('invalid_state', 'Disponível só em atividades');
    if (this.phase === 'ended') throw new RoomError('room_ended', 'A atividade foi encerrada');
    return player;
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
      codes: new Map(),
      pauses: [],
      results: null,
    };
  }

  private get isAssessment(): boolean {
    return this.settings.mode === 'assessment';
  }

  /** Entradas e saídas de alunos: na atividade, só o professor fica sabendo quem é quem. */
  private get rosterTarget(): RoomTarget {
    return this.isAssessment ? { kind: 'host' } : { kind: 'all' };
  }

  /**
   * A questão em que o aluno está trabalhando: a atual da sala ou, na atividade, a que ele informou
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
    // Na atividade não há checklist automática: nada a acompanhar.
    if (this.isAssessment || this.pausedAt !== null) return;
    const record = this.recordFor(playerId, questionId);
    if (!record || record.finishedAt !== null || !this.players.has(playerId)) return;
    const required = record.question.checklist.filter(countsForAcceptance);
    let firstCompletion = false;
    if (doneIds) {
      const valid = new Set(record.question.checklist.map((i) => i.id));
      firstCompletion = this.markItems(record, playerId, new Set(doneIds.filter((id) => valid.has(id))), 'replace', this.clock.now());
      done = required.filter((i) => record.itemState.get(playerId)?.get(i.id)?.done).length;
    }
    const entry = { done: Math.min(done, required.length), total: required.length };
    record.progress.set(playerId, entry);
    this.sink.emit({ kind: 'host' }, 'question:progress', {
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
    if (!record || record.finishedAt !== null || this.phase !== 'question' || this.pausedAt !== null || !this.players.has(playerId)) return;
    if (now < record.startsAt || now > record.endsAt || record.answers.get(playerId)?.status === 'accepted') return;
    let log = record.pastes.get(playerId);
    if (!log) record.pastes.set(playerId, (log = createPasteLog()));
    recordPaste(log, { at: now, chars, blocked });
    this.emitTimeline(record, playerId);
    const player = this.players.get(playerId);
    if (this.isAssessment && player) this.emitRow(player);
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
    if (this.isAssessment) throw new RoomError('invalid_state', 'Na atividade, as respostas são salvas automaticamente');
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
    this.assertNotPaused();
    const previous = record.lastSubmitAt.get(playerId);
    if (previous !== undefined && receivedAt - previous < SUBMIT_INTERVAL_MS && record.finishedAt === null) {
      throw new RoomError('invalid_state', 'Aguarde um instante antes de reenviar');
    }
    record.lastSubmitAt.set(playerId, receivedAt);
    record.codes.set(playerId, { code, at: receivedAt });

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
      if (this.players.has(playerId)) {
        record.answers.set(playerId, answer);
        // O servidor é a fonte confiável por item: aceita = tudo concluído; recusada = os itens que ele confirmou.
        const confirmed = verdict.passed
          ? new Set(record.question.checklist.map((i) => i.id))
          : new Set(verdict.items.filter((i) => i.passed).map((i) => i.id));
        this.markItems(record, playerId, confirmed, 'add', receivedAt);
        if (answer.status === 'accepted') this.emitTimeline(record, playerId);
      }
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
    if (this.isAssessment) return this.endSession().then(() => undefined);
    if (this.finishing) return this.finishing;
    const record = this.current;
    if (!record || record.finishedAt !== null) return Promise.resolve();
    if (this.phase !== 'question' && this.phase !== 'countdown') return Promise.resolve();

    this.finishing = (async () => {
      // Respostas que chegaram dentro do prazo e ainda estão em validação são concluídas antes do placar.
      await Promise.allSettled([...record.pending.values()]);
      this.clearTimers();
      // Encerrar durante a pausa: o tempo parado não conta, e a próxima questão começa sem pausa.
      this.closePause();
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
        // Na atividade, cada aluno recebe só o próprio resultado.
        this.sink.emit({ kind: 'host' }, 'session:ended', report);
        for (const player of this.players.values()) {
          this.sink.emit({ kind: 'player', playerId: player.id }, 'session:ended', this.reportFor(player.id)!);
        }
      } else {
        this.sink.emit({ kind: 'all' }, 'session:ended', report);
      }
      this.sink.sync();
      try {
        this.options.onEnded?.(this);
      } catch {
        // falha ao guardar no histórico não impede o encerramento
      }
      return report;
    })();
    return this.ending;
  }

  /** Fecha todas as questões da atividade. As respostas ficam como foram salvas. */
  private async finishAssessment(): Promise<void> {
    if (!this.window) return;
    this.closePause();
    const finishedAt = Math.min(this.clock.now(), this.window.endsAt);
    for (const record of this.history) {
      record.finishedAt = finishedAt;
      record.results = this.computeResults(record);
    }
  }

  dispose(): void {
    this.clearTimers();
  }

  /** A sessão já começou e ainda não terminou (vale guardar no histórico antes de descartar a sala). */
  get inProgress(): boolean {
    return this.startedAt !== null && this.phase !== 'ended';
  }

  /**
   * Dados da sessão para o histórico do professor: questões completas, alunos, placar e o último código de cada aluno
   * em cada questão. Nunca inclui tokens. Durante a sessão, serve de ponto de recuperação: o placar é o parcial e as
   * questões abertas ainda não têm resultado. null antes do início.
   */
  historySnapshot(): Omit<SessionHistory, 'id' | 'version' | 'packId' | 'evaluations' | 'autoCheck'> | null {
    if (!this.report && !this.inProgress) return null;
    const report = this.report ?? this.buildReport();
    const players: HistoryPlayer[] = [...this.players.values()]
      .sort((a, b) => a.joinedAt - b.joinedAt)
      .map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, delivered: p.delivered }));
    const answers: HistoryAnswer[] = this.history.flatMap((record) =>
      players.map((player) => {
        const saved = record.codes.get(player.id);
        const answer = record.answers.get(player.id);
        let status: HistoryAnswerStatus;
        if (this.isAssessment) status = this.answerStatus(record, player.id);
        else if (answer) status = answer.status === 'validating' ? 'rejected' : answer.status;
        else status = saved ? 'rejected' : 'empty';
        return {
          playerId: player.id,
          questionId: record.question.id,
          code: saved?.code ?? '',
          status,
          xp: answer?.status === 'accepted' ? answer.xp : 0,
          savedAt: saved?.at ?? null,
          paste: record.pastes.get(player.id)?.stats ?? null,
        };
      }),
    );
    return {
      mode: this.settings.mode,
      roomCode: this.code,
      packTitle: this.packTitle,
      startedAt: this.startedAt ?? this.createdAt,
      endedAt: report.endedAt,
      settings: { ...this.settings },
      questions: this.history.map((record) => record.question),
      players,
      report,
      answers,
    };
  }

  /* ---------------------------------------------------------------- */
  /* Recuperação                                                       */
  /* ---------------------------------------------------------------- */

  /** Estado completo da sala, em JSON, para `Room.fromState`. Validações em andamento ficam de fora. */
  toState(): RoomState {
    return structuredClone({
      version: 1,
      savedAt: this.clock.now(),
      code: this.code,
      hostToken: this.hostToken,
      packTitle: this.packTitle,
      createdAt: this.createdAt,
      lastActivityAt: this.lastActivityAt,
      questions: this.questions,
      settings: this.settings,
      phase: this.phase,
      startedAt: this.startedAt,
      window: this.window,
      players: [...this.players.values()],
      history: this.history.map((record) => ({
        question: record.question,
        index: record.index,
        startsAt: record.startsAt,
        endsAt: record.endsAt,
        finishedAt: record.finishedAt,
        // Uma resposta em validação não tem resultado: o aluno envia de novo depois da retomada.
        answers: [...record.answers.entries()].filter(([, answer]) => answer.status !== 'validating'),
        progress: [...record.progress.entries()],
        itemState: [...record.itemState.entries()].map(([playerId, items]) => [playerId, [...items.entries()]]),
        pastes: [...record.pastes.entries()],
        allowPaste: record.allowPaste,
        codes: [...record.codes.entries()],
        pauses: record.pauses,
        results: record.results,
      })),
      currentIndex: this.current ? this.history.indexOf(this.current) : -1,
      report: this.report,
      pausedAt: this.pausedAt,
    } satisfies RoomState);
  }

  /**
   * Recria a sala a partir de `toState`, depois de o servidor reiniciar. Os alunos aparecem desconectados até voltarem
   * com o próprio token. O tempo em que o servidor ficou fora não conta: os prazos abertos são adiados por ele.
   */
  static fromState(state: RoomState, options: RestoreOptions): Room {
    if (state.version !== 1) throw new RoomError('invalid_state', `Versão de estado da sala não suportada: ${state.version}`);
    const room = new Room({
      ...options,
      code: state.code,
      hostToken: state.hostToken,
      packTitle: state.packTitle,
      questions: state.questions,
      settings: state.settings,
      createdAt: state.createdAt,
    });
    const open = state.phase === 'countdown' || state.phase === 'question';
    // Pausada pelo professor: continua pausada, e a retomada já desconta o tempo em que o servidor ficou fora.
    const pausedAt = open ? (state.pausedAt ?? null) : null;
    const pausedMs = pausedAt !== null ? 0 : Math.max(0, room.clock.now() - state.savedAt);
    room.phase = state.phase;
    room.startedAt = state.startedAt;
    room.report = state.report;
    room.lastActivityAt = state.lastActivityAt;
    room.window = state.window && open ? { startsAt: state.window.startsAt + pausedMs, endsAt: state.window.endsAt + pausedMs } : state.window;
    room.players = new Map(state.players.map((player) => [player.id, { ...player, connected: false }]));
    room.history = state.history.map((saved, index) => {
      const record = room.createRecord(saved.question, saved.index, saved.startsAt, saved.endsAt);
      const running = open && saved.finishedAt === null && (state.window !== null || index === state.currentIndex);
      if (running) {
        record.startsAt += pausedMs;
        record.endsAt += pausedMs;
      }
      record.finishedAt = saved.finishedAt;
      record.answers = new Map(saved.answers);
      record.progress = new Map(saved.progress);
      record.itemState = new Map(saved.itemState.map(([playerId, items]) => [playerId, new Map(items)]));
      record.pastes = new Map(saved.pastes);
      record.allowPaste = saved.allowPaste;
      record.codes = new Map(saved.codes);
      record.pauses = saved.pauses ?? [];
      record.results = saved.results;
      return record;
    });
    room.current = room.history[state.currentIndex] ?? null;
    room.pausedAt = pausedAt;
    room.armTimers();
    return room;
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
    const extra: Partial<RoomSnapshot> = {};
    if (this.phase === 'ended' && this.options.historyId) extra.historyId = this.options.historyId;
    if (this.isAssessment && this.window) {
      const rows = [...this.players.values()].map((player) => this.assessmentRow(player));
      extra.assessmentRows = rows;
      extra.answeredCount = rows.filter((row) => row.delivered).length;
    }
    return { ...snapshot, ...extra };
  }

  snapshotForPlayer(playerId: string): RoomSnapshot {
    const player = this.players.get(playerId);
    if (this.isAssessment) {
      // Sem placar e sem os colegas: o aluno vê só a própria atividade e quantos estão na sala.
      const record = this.recordFor(playerId);
      const base = this.baseSnapshot([], record);
      const snapshot = {
        ...base,
        players: base.players.filter((p) => p.id === playerId),
        report: this.report && this.reportFor(playerId),
      };
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
  /* Atividade                                                         */
  /* ---------------------------------------------------------------- */

  /** Sem resposta: nada salvo, ou só o código inicial. */
  private answerStatus(record: QuestionRecord, playerId: string): AssessmentQuestionStatus {
    const code = record.codes.get(playerId)?.code.trim() ?? '';
    return code && code !== record.question.starterCode.trim() ? 'started' : 'empty';
  }

  private questionProgress(record: QuestionRecord, playerId: string): AssessmentQuestionProgress {
    return {
      questionId: record.question.id,
      title: record.question.title ?? record.question.prompt.slice(0, 60),
      status: this.answerStatus(record, playerId),
    };
  }

  /** Linha do professor: questão atual, situação de cada resposta, colagens e entrega. */
  private assessmentRow(player: PlayerState): AssessmentRow {
    return {
      playerId: player.id,
      index: player.position,
      delivered: player.delivered,
      questions: this.history.map((record) => ({
        ...this.questionProgress(record, player.id),
        pastes: record.pastes.get(player.id)?.stats.count ?? 0,
      })),
    };
  }

  private emitRow(player: PlayerState): void {
    this.sink.emit({ kind: 'host' }, 'assessment:row', this.assessmentRow(player));
  }

  /** O que o aluno vê da própria atividade, com a resposta salva da questão atual. */
  private studentView(player: PlayerState): AssessmentStudentView {
    return {
      index: player.position,
      delivered: player.delivered,
      questions: this.history.map((record) => this.questionProgress(record, player.id)),
      code: this.history[player.position]?.codes.get(player.id)?.code ?? null,
    };
  }

  /** O relatório com só o próprio aluno (atividade). */
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
      playerCount: this.players.size,
      leaderboard,
      question: this.activeQuestion(record),
      answeredCount: this.current ? this.acceptedCount(this.current) : 0,
      connectedCount: this.connectedPlayers().length,
      lastResults: this.current?.results ?? null,
      report: this.report,
      serverNow: this.clock.now(),
      ...(this.isAssessment && this.window ? { assessment: { ...this.window } } : {}),
      ...(this.pausedAt !== null ? { pausedAt: this.pausedAt } : {}),
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
    const total = record ? record.question.checklist.filter(countsForAcceptance).length : 0;
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
      pauses: record.pauses,
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
      requiredTotal: record.question.checklist.filter(countsForAcceptance).length,
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
    const times = correct.map(([id, a]) => ({ id, timeMs: this.elapsed(record, a.receivedAt) }));
    const fastest = times.reduce<{ id: string; timeMs: number } | null>(
      (best, t) => (!best || t.timeMs < best.timeMs ? t : best),
      null,
    );
    const items: ItemInsight[] = record.question.checklist.map((item) => {
      const doneAt: number[] = [];
      for (const player of this.players.values()) {
        const state = record.itemState.get(player.id)?.get(item.id);
        if (state?.done) doneAt.push(this.elapsed(record, state.firstAt));
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
          timeMs: correct ? this.elapsed(record, answer!.receivedAt) : null,
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

  /** Tempo de questão até `at`, sem as pausas do professor. */
  private elapsed(record: QuestionRecord, at: number): number {
    return activeElapsed(record.startsAt, at, record.pauses);
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
    this.changed();
  }

  private changed(): void {
    try {
      this.options.onChange?.(this);
    } catch {
      // falha ao gravar o ponto de recuperação não interrompe a sala
    }
  }
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

  /** Registra uma sala recriada com `Room.fromState`, com o mesmo código de antes. */
  restore(state: RoomState, options: RestoreOptions): Room {
    if (this.rooms.has(state.code)) throw new RoomError('invalid_state', `Já existe uma sala com o código ${state.code}`);
    const room = Room.fromState(state, options);
    this.rooms.set(room.code, room);
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
