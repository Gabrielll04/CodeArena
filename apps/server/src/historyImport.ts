import {
  AVATAR_IDS,
  CriterionMarkSchema,
  MAX_CODE_LENGTH,
  QuestionSchema,
  SLUG_PATTERN,
  type SessionHistory,
} from '@codearena/schemas';
import { z } from 'zod';

const PasteStatsSchema = z.object({
  count: z.number().int().min(0),
  chars: z.number().int().min(0),
  largest: z.number().int().min(0),
  blocked: z.number().int().min(0),
});

/**
 * JSON da sessão baixado no Histórico ("Baixar sessão"), para trazer a sessão de volta, por exemplo depois de usar
 * uma guia anônima. O placar e as configurações só são exibidos, então basta que sejam objetos.
 */
export const SessionHistoryImportSchema = z.object({
  id: z.string().regex(/^[0-9a-f-]{36}$/, 'id da sessão inválido'),
  version: z.literal(1, { errorMap: () => ({ message: 'versão do arquivo não suportada' }) }),
  mode: z.enum(['competition', 'assessment']),
  roomCode: z.string().max(12),
  packId: z.string().max(100).nullable(),
  packTitle: z.string().max(200),
  startedAt: z.number(),
  endedAt: z.number(),
  settings: z.record(z.unknown()),
  questions: z.array(QuestionSchema.and(z.object({ pluginId: z.string().regex(SLUG_PATTERN) }))).min(1).max(100),
  players: z
    .array(z.object({ id: z.string().min(1).max(100), name: z.string().max(100), avatar: z.enum(AVATAR_IDS), delivered: z.boolean() }))
    .min(1)
    .max(500),
  report: z.record(z.unknown()),
  answers: z
    .array(
      z.object({
        playerId: z.string().max(100),
        questionId: z.string().max(64),
        code: z.string().max(MAX_CODE_LENGTH),
        status: z.enum(['empty', 'started', 'accepted', 'rejected', 'late']),
        xp: z.number(),
        savedAt: z.number().nullable(),
        paste: PasteStatsSchema.nullable(),
        auto: z.record(z.boolean()).optional(),
      }),
    )
    .max(50_000),
  evaluations: z
    .array(
      z.object({
        playerId: z.string().max(100),
        questionId: z.string().max(64),
        marks: z.record(z.string().max(64), CriterionMarkSchema),
        comment: z.string().max(2000).optional(),
        updatedAt: z.number(),
      }),
    )
    .max(50_000),
  autoCheck: z.enum(['none', 'pending', 'done']),
});

/** Converte o corpo da importação; devolve a mensagem do primeiro problema quando o arquivo não serve. */
export function parseSessionImport(body: unknown): { ok: true; record: SessionHistory } | { ok: false; error: string } {
  const parsed = SessionHistoryImportSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0]!;
    return { ok: false, error: `Arquivo de sessão inválido em ${issue.path.join('.') || 'arquivo'}: ${issue.message}` };
  }
  return { ok: true, record: parsed.data as unknown as SessionHistory };
}
