import { z } from 'zod';
import { AVATAR_IDS, type AvatarId } from './avatars';
import { MAX_CODE_LENGTH, type PublicQuestion } from './question-pack';

/* ------------------------------------------------------------------ */
/* Nomes dos eventos                                                    */
/* ------------------------------------------------------------------ */

/** Eventos enviados pelo cliente (professor ou aluno) ao servidor. */
export const ClientEvent = {
  RoomCreate: 'room:create',
  RoomJoin: 'room:join',
  RoomHost: 'room:host',
  RoomLeave: 'room:leave',
  HostStartQuestion: 'host:start-question',
  HostFinishQuestion: 'host:finish-question',
  HostEndSession: 'host:end-session',
  HostUpdateSettings: 'host:update-settings',
  HostKick: 'host:kick',
  QuestionProgress: 'question:progress',
  QuestionSubmit: 'question:submit',
} as const;

/** Eventos enviados pelo servidor aos clientes. */
export const ServerEvent = {
  RoomUpdate: 'room:update',
  PlayerJoined: 'player:joined',
  PlayerLeft: 'player:left',
  QuestionLoaded: 'question:loaded',
  QuestionStarted: 'question:started',
  QuestionProgress: 'question:progress',
  QuestionSubmitted: 'question:submitted',
  QuestionValidated: 'question:validated',
  QuestionFinished: 'question:finished',
  LeaderboardUpdate: 'leaderboard:update',
  SessionEnded: 'session:ended',
  RoomClosed: 'room:closed',
} as const;

/* ------------------------------------------------------------------ */
/* Estado público da sala                                               */
/* ------------------------------------------------------------------ */

export type RoomPhase = 'lobby' | 'countdown' | 'question' | 'review' | 'ended';

export interface RoomSettings {
  /** Modo discreto: alunos veem apenas a própria posição e o top 3, sem pódio. */
  discreetMode: boolean;
  /** Bônus de sequência de acertos consecutivos. Desligado por padrão. */
  streakEnabled: boolean;
  /** XP extra por acerto consecutivo (a partir do 2º), limitado por streakMaxSteps. */
  streakBonus: number;
  streakMaxSteps: number;
  /** Segundos de contagem regressiva antes de cada questão. */
  countdownSeconds: number;
}

export const DEFAULT_ROOM_SETTINGS: RoomSettings = {
  discreetMode: false,
  streakEnabled: false,
  streakBonus: 50,
  streakMaxSteps: 5,
  countdownSeconds: 3,
};

export interface PlayerPublic {
  id: string;
  name: string;
  avatar: AvatarId;
  connected: boolean;
  totalXP: number;
  correctCount: number;
}

export interface LeaderboardEntry {
  playerId: string;
  name: string;
  avatar: AvatarId;
  totalXP: number;
  /** XP ganho na última questão encerrada. */
  questionXP: number;
  rank: number;
  previousRank: number | null;
  correctCount: number;
  lastCorrectAt: number | null;
  connected: boolean;
}

export interface ActiveQuestion {
  index: number;
  total: number;
  question: PublicQuestion;
  /** Horário (relógio do servidor, ms) em que a questão começa a valer. */
  startsAt: number;
  endsAt: number;
  finishedAt: number | null;
}

export type AnswerStatus = 'validating' | 'accepted' | 'rejected' | 'late';

export interface ItemCheck {
  id: string;
  passed: boolean;
  message?: string;
}

export interface PlayerAnswer {
  status: AnswerStatus;
  /** XP provisório (aceito) ou concedido. */
  xp: number;
  receivedAt: number;
  remainingMs: number;
  items: ItemCheck[];
  /** Código aceito, para restaurar o editor após reconexão. */
  code?: string;
  message?: string;
}

export interface ProgressEntry {
  playerId: string;
  done: number;
  total: number;
  answered: boolean;
  /** Ids dos itens da checklist que o aluno concluiu agora (somente ids; nunca o código). */
  doneIds: string[];
}

/** Como a turma foi em um item da checklist: base da "revisão da turma". */
export interface ItemInsight {
  id: string;
  label: string;
  optional: boolean;
  /** Alunos com o item concluído quando a questão terminou. */
  completedCount: number;
  playerCount: number;
  /** Mediana do tempo (desde o início da questão) até o item ser concluído pela primeira vez. */
  medianTimeMs: number | null;
}

export interface QuestionResults {
  questionId: string;
  title: string;
  index: number;
  items: ItemInsight[];
  playerCount: number;
  correctCount: number;
  averageTimeMs: number | null;
  fastest: { playerId: string; name: string; timeMs: number } | null;
}

export interface PlayerReport {
  playerId: string;
  name: string;
  avatar: AvatarId;
  rank: number;
  totalXP: number;
  correctCount: number;
  questionCount: number;
  averageTimeMs: number | null;
  perQuestion: { questionId: string; correct: boolean; xp: number; timeMs: number | null }[];
}

export interface SessionReport {
  roomCode: string;
  packTitle: string;
  startedAt: number;
  endedAt: number;
  questions: QuestionResults[];
  players: PlayerReport[];
}

export interface RoomSnapshot {
  code: string;
  phase: RoomPhase;
  packTitle: string;
  pluginIds: string[];
  questionCount: number;
  /** Índice da questão atual/última (-1 antes da primeira). */
  questionIndex: number;
  settings: RoomSettings;
  players: PlayerPublic[];
  leaderboard: LeaderboardEntry[];
  question: ActiveQuestion | null;
  /** Alunos com resposta aceita na questão atual. */
  answeredCount: number;
  connectedCount: number;
  lastResults: QuestionResults | null;
  report: SessionReport | null;
  serverNow: number;
  /** Visão do aluno. */
  me?: {
    playerId: string;
    name: string;
    avatar: AvatarId;
    totalXP: number;
    rank: number | null;
    streak: number;
    answer: PlayerAnswer | null;
  };
  /** Visão do professor: progresso por aluno (sem código). */
  progress?: ProgressEntry[];
}

/* ------------------------------------------------------------------ */
/* Payloads cliente -> servidor (validados com Zod no servidor)         */
/* ------------------------------------------------------------------ */

export const RoomCodeSchema = z.string().regex(/^\d{6}$/, 'O código da sala tem 6 dígitos');

export const PlayerNameSchema = z
  .string()
  .trim()
  .min(2, 'O nome precisa de pelo menos 2 caracteres')
  .max(24, 'O nome pode ter no máximo 24 caracteres')
  .regex(/^[\p{L}\p{N} ._-]+$/u, 'Use apenas letras, números, espaço, ".", "_" ou "-"');

export const RoomSettingsPatchSchema = z
  .object({
    discreetMode: z.boolean(),
    streakEnabled: z.boolean(),
    streakBonus: z.number().int().min(0).max(1000),
    streakMaxSteps: z.number().int().min(1).max(20),
    countdownSeconds: z.number().int().min(0).max(10),
  })
  .partial()
  .strict();

export const CreateRoomPayloadSchema = z.object({
  packId: z.string().min(1),
  questionIds: z.array(z.string()).optional(),
  settings: RoomSettingsPatchSchema.optional(),
});

export const JoinRoomPayloadSchema = z.object({
  code: RoomCodeSchema,
  name: PlayerNameSchema,
  avatar: z.enum(AVATAR_IDS),
  playerToken: z.string().max(100).optional(),
});

export const HostAuthPayloadSchema = z.object({
  code: RoomCodeSchema,
  hostToken: z.string().min(1).max(100),
});

export const HostSettingsPayloadSchema = HostAuthPayloadSchema.extend({ settings: RoomSettingsPatchSchema });
export const HostKickPayloadSchema = HostAuthPayloadSchema.extend({ playerId: z.string().min(1) });

export const ProgressPayloadSchema = z.object({
  done: z.number().int().min(0).max(100),
  total: z.number().int().min(0).max(100),
  /** Itens concluídos no cliente. Informativo (painel do professor); a pontuação nunca depende disso. */
  doneIds: z.array(z.string().max(64)).max(12).optional(),
});

export const SubmitPayloadSchema = z.object({
  code: z.string().max(MAX_CODE_LENGTH, 'Código muito longo'),
});

export type CreateRoomPayload = z.infer<typeof CreateRoomPayloadSchema>;
export type JoinRoomPayload = z.infer<typeof JoinRoomPayloadSchema>;
export type HostAuthPayload = z.infer<typeof HostAuthPayloadSchema>;
export type HostSettingsPayload = z.infer<typeof HostSettingsPayloadSchema>;
export type HostKickPayload = z.infer<typeof HostKickPayloadSchema>;
export type ProgressPayload = z.infer<typeof ProgressPayloadSchema>;
export type SubmitPayload = z.infer<typeof SubmitPayloadSchema>;
export type RoomSettingsPatch = z.infer<typeof RoomSettingsPatchSchema>;

export type ErrorCode =
  | 'invalid_payload'
  | 'room_not_found'
  | 'name_taken'
  | 'room_ended'
  | 'not_authorized'
  | 'pack_not_found'
  | 'plugin_missing'
  | 'invalid_state'
  | 'not_in_room';

export type Ack<T = object> = ({ ok: true } & T) | { ok: false; error: string; code: ErrorCode };

/* ------------------------------------------------------------------ */
/* Tipagem Socket.IO                                                    */
/* ------------------------------------------------------------------ */

export interface QuestionLoadedEvent {
  question: ActiveQuestion;
  serverNow: number;
}

export interface QuestionSubmittedEvent {
  playerId: string;
  name: string;
  accepted: boolean;
  answeredCount: number;
  playerCount: number;
}

export interface QuestionValidatedEvent {
  questionId: string;
  answer: PlayerAnswer;
}

export interface QuestionFinishedEvent {
  results: QuestionResults;
  leaderboard: LeaderboardEntry[];
  /** Solução esperada, revelada após o fim da questão. */
  solution: string;
}

export interface ServerToClientEvents {
  'room:update': (snapshot: RoomSnapshot) => void;
  'player:joined': (player: PlayerPublic) => void;
  'player:left': (payload: { playerId: string; name: string }) => void;
  'question:loaded': (payload: QuestionLoadedEvent) => void;
  'question:started': (payload: { questionId: string; startsAt: number; endsAt: number; serverNow: number }) => void;
  'question:progress': (payload: ProgressEntry) => void;
  'question:submitted': (payload: QuestionSubmittedEvent) => void;
  'question:validated': (payload: QuestionValidatedEvent) => void;
  'question:finished': (payload: QuestionFinishedEvent) => void;
  'leaderboard:update': (leaderboard: LeaderboardEntry[]) => void;
  'session:ended': (report: SessionReport) => void;
  'room:closed': (payload: { reason: string }) => void;
}

export interface ClientToServerEvents {
  'room:create': (payload: CreateRoomPayload, ack: (res: Ack<{ code: string; hostToken: string; snapshot: RoomSnapshot }>) => void) => void;
  'room:host': (payload: HostAuthPayload, ack: (res: Ack<{ snapshot: RoomSnapshot }>) => void) => void;
  'room:join': (payload: JoinRoomPayload, ack: (res: Ack<{ playerId: string; playerToken: string; snapshot: RoomSnapshot }>) => void) => void;
  'room:leave': (ack?: (res: Ack) => void) => void;
  'host:start-question': (payload: HostAuthPayload, ack: (res: Ack) => void) => void;
  'host:finish-question': (payload: HostAuthPayload, ack: (res: Ack) => void) => void;
  'host:end-session': (payload: HostAuthPayload, ack: (res: Ack) => void) => void;
  'host:update-settings': (payload: HostSettingsPayload, ack: (res: Ack) => void) => void;
  'host:kick': (payload: HostKickPayload, ack: (res: Ack) => void) => void;
  'question:progress': (payload: ProgressPayload) => void;
  'question:submit': (payload: SubmitPayload, ack: (res: Ack<{ answer: PlayerAnswer }>) => void) => void;
}
