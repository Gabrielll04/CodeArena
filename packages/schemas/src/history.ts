import { z } from 'zod';
import type { AvatarId } from './avatars';
import type { PasteStats, RoomMode, RoomSettings, SessionReport } from './events';
import type { ResolvedQuestion } from './question-pack';

/* ------------------------------------------------------------------ */
/* Histórico de sessões do professor                                    */
/* ------------------------------------------------------------------ */

/** Chave do professor, guardada no navegador dele. O servidor guarda só o hash. */
export const TeacherKeySchema = z.string().regex(/^[A-Za-z0-9_-]{24,128}$/, 'Chave do professor inválida');

/** Quem decidiu se o critério foi atendido. */
export type CriterionSource = 'professor' | 'ia';

export interface CriterionMark {
  met: boolean;
  source: CriterionSource;
  /** Justificativa curta (escrita pelo professor ou devolvida pela IA). */
  note?: string;
}

/** Avaliação de uma resposta: cada critério marcado como atendido ou não. */
export interface AnswerEvaluation {
  playerId: string;
  questionId: string;
  /** Por id do critério (item da checklist). Critérios sem marca ainda não foram avaliados. */
  marks: Record<string, CriterionMark>;
  /** Comentário do professor para o aluno. */
  comment?: string;
  updatedAt: number;
}

export type HistoryAnswerStatus = 'empty' | 'started' | 'accepted' | 'rejected' | 'late';

/** Resposta de um aluno a uma questão, como ficou no fim da sessão. */
export interface HistoryAnswer {
  playerId: string;
  questionId: string;
  /** Último código salvo (atividade) ou enviado (competição). */
  code: string;
  status: HistoryAnswerStatus;
  xp: number;
  savedAt: number | null;
  paste: PasteStats | null;
  /**
   * Verificação automática dos critérios com regra (o servidor roda a checklist no código salvo). É só uma sugestão
   * para quem avalia; critérios manuais não aparecem aqui.
   */
  auto?: Record<string, boolean>;
}

export interface HistoryPlayer {
  id: string;
  name: string;
  avatar: AvatarId;
  /** Atividade: o aluno entregou antes do fim. */
  delivered: boolean;
}

export interface SessionHistory {
  id: string;
  version: 1;
  mode: RoomMode;
  roomCode: string;
  packId: string | null;
  packTitle: string;
  startedAt: number;
  endedAt: number;
  settings: RoomSettings;
  /** Questões completas (com solução e critérios), como estavam na sessão. */
  questions: ResolvedQuestion[];
  players: HistoryPlayer[];
  /** Placar e resultados da sessão. */
  report: SessionReport;
  answers: HistoryAnswer[];
  evaluations: AnswerEvaluation[];
  /** Situação da verificação automática das respostas da atividade. */
  autoCheck: 'none' | 'pending' | 'done';
}

export interface SessionHistorySummary {
  id: string;
  mode: RoomMode;
  roomCode: string;
  packTitle: string;
  startedAt: number;
  endedAt: number;
  playerCount: number;
  questionCount: number;
  /** Atividade: alunos com todas as respostas avaliadas. */
  evaluatedCount: number;
}

export const CriterionMarkSchema = z
  .object({
    met: z.boolean(),
    source: z.enum(['professor', 'ia']),
    note: z.string().trim().max(1000).optional(),
  })
  .strict();

export const EvaluationEntrySchema = z
  .object({
    playerId: z.string().min(1).max(100),
    questionId: z.string().min(1).max(64),
    /** null remove a marca do critério. */
    marks: z.record(z.string().max(64), CriterionMarkSchema.nullable()),
    comment: z.string().max(2000).optional(),
  })
  .strict();

/** Corpo de PUT /api/history/:id/evaluations: cria ou atualiza avaliações de respostas. */
export const EvaluationUpdateSchema = z.object({ entries: z.array(EvaluationEntrySchema).min(1).max(5000) }).strict();

export type EvaluationEntry = z.infer<typeof EvaluationEntrySchema>;
export type EvaluationUpdate = z.infer<typeof EvaluationUpdateSchema>;
