import { z } from 'zod';

/** Identificadores usados em ids de questão, itens de checklist e plugins. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;
const slug = (what: string) =>
  z
    .string({ required_error: `${what} é obrigatório` })
    .min(1, `${what} não pode ser vazio`)
    .max(64, `${what} deve ter no máximo 64 caracteres`)
    .regex(SLUG_PATTERN, `${what} deve usar apenas letras minúsculas, números, "-" ou "_" (ex.: "usar-button")`);

export const ALLOWED_REGEX_FLAGS = 'imsu';
export const MAX_CODE_LENGTH = 50_000;

/** Retorna a mensagem de erro de compilação da regex, ou null se for válida. */
export function regexCompileError(pattern: string, flags = ''): string | null {
  try {
    new RegExp(pattern, flags);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

const textRuleFields = {
  value: z.string().min(1, 'value não pode ser vazio'),
  caseSensitive: z.boolean().default(true),
  ignoreComments: z.boolean().default(false),
};

export const ContainsRuleSchema = z
  .object({ type: z.literal('contains'), ...textRuleFields })
  .strict();

export const NotContainsRuleSchema = z
  .object({ type: z.literal('notContains'), ...textRuleFields })
  .strict();

export const RegexRuleSchema = z
  .object({
    type: z.literal('regex'),
    pattern: z.string().min(1, 'pattern não pode ser vazio').max(1000, 'pattern muito longo'),
    flags: z
      .string()
      .regex(new RegExp(`^[${ALLOWED_REGEX_FLAGS}]*$`), `flags aceita apenas as letras "${ALLOWED_REGEX_FLAGS}"`)
      .default(''),
    ignoreComments: z.boolean().default(false),
  })
  .strict();

export const PluginRuleSchema = z
  .object({
    type: z.literal('pluginRule'),
    validator: z.string().min(1, 'validator é obrigatório'),
    params: z.record(z.unknown()).default({}),
  })
  .strict();

export const ChecklistRuleSchema = z.discriminatedUnion('type', [
  ContainsRuleSchema,
  NotContainsRuleSchema,
  // A compilação da regex é verificada no ChecklistItemSchema (discriminatedUnion não aceita refinements).
  RegexRuleSchema,
  PluginRuleSchema,
]);

export const ChecklistItemSchema = z
  .object({
    id: slug('id do item'),
    label: z.string().trim().min(1, 'label é obrigatório').max(140, 'label deve ter no máximo 140 caracteres'),
    rule: ChecklistRuleSchema,
    optional: z.boolean().default(false),
    hint: z.string().max(280).optional(),
  })
  .strict()
  .superRefine((item, ctx) => {
    if (item.rule.type === 'regex') {
      const error = regexCompileError(item.rule.pattern, item.rule.flags);
      if (error) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['rule', 'pattern'], message: `Regex inválida: ${error}` });
      }
    }
  });

export const QuestionSchema = z
  .object({
    id: slug('id da questão'),
    title: z.string().trim().max(80).optional(),
    prompt: z.string().trim().min(1, 'prompt é obrigatório').max(2000, 'prompt deve ter no máximo 2000 caracteres'),
    pluginId: slug('pluginId').optional(),
    /**
     * build: o aluno escreve a solução a partir de pouco ou nada.
     * debug: o `starterCode` é um código com bug e a checklist verifica o comportamento corrigido.
     */
    kind: z.enum(['build', 'debug']).default('build'),
    timeLimitSeconds: z
      .number({ invalid_type_error: 'timeLimitSeconds deve ser um número' })
      .int('timeLimitSeconds deve ser inteiro')
      .min(10, 'timeLimitSeconds mínimo é 10')
      .max(3600, 'timeLimitSeconds máximo é 3600'),
    baseXP: z.number().int().min(0).max(10_000),
    speedBonusMax: z.number().int().min(0).max(10_000),
    starterCode: z.string().max(MAX_CODE_LENGTH).default(''),
    solution: z.string().max(MAX_CODE_LENGTH).default(''),
    lockOnComplete: z.boolean().default(true),
    checklist: z
      .array(ChecklistItemSchema)
      .min(1, 'checklist precisa de pelo menos 1 item')
      .max(12, 'checklist deve ter no máximo 12 itens'),
    pluginData: z.record(z.unknown()).default({}),
    tags: z.array(z.string()).optional(),
  })
  .strict()
  .superRefine((question, ctx) => {
    const seen = new Set<string>();
    question.checklist.forEach((item, index) => {
      if (seen.has(item.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['checklist', index, 'id'],
          message: `id de item duplicado: "${item.id}"`,
        });
      }
      seen.add(item.id);
    });
    if (question.checklist.every((item) => item.optional)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['checklist'],
        message: 'a checklist precisa de pelo menos 1 item obrigatório',
      });
    }
  });

export const PackMetaSchema = z
  .object({
    title: z.string().trim().min(1, 'title é obrigatório').max(120),
    description: z.string().trim().max(500).default(''),
    pluginId: slug('pluginId'),
    version: z
      .string()
      .regex(/^\d+\.\d+\.\d+$/, 'version deve seguir o formato semver "MAJOR.MINOR.PATCH" (ex.: "1.0.0")'),
    tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
    author: z.string().trim().max(120).optional(),
    language: z.string().trim().max(20).optional(),
  })
  .strict();

export const QuestionPackSchema = z
  .object({
    $schema: z.string().optional(),
    pack: PackMetaSchema,
    questions: z.array(QuestionSchema).min(1, 'o pack precisa de pelo menos 1 questão').max(100),
  })
  .strict()
  .superRefine((value, ctx) => {
    const seen = new Set<string>();
    value.questions.forEach((question, index) => {
      if (seen.has(question.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['questions', index, 'id'],
          message: `id de questão duplicado: "${question.id}"`,
        });
      }
      seen.add(question.id);
    });
  });

export type ContainsRule = z.infer<typeof ContainsRuleSchema>;
export type NotContainsRule = z.infer<typeof NotContainsRuleSchema>;
export type RegexRule = z.infer<typeof RegexRuleSchema>;
export type PluginRule = z.infer<typeof PluginRuleSchema>;
export type ChecklistRule = z.infer<typeof ChecklistRuleSchema>;
export type ChecklistItem = z.infer<typeof ChecklistItemSchema>;
export type Question = z.infer<typeof QuestionSchema>;
export type PackMeta = z.infer<typeof PackMetaSchema>;
export type QuestionPack = z.infer<typeof QuestionPackSchema>;
/** Formato de entrada (antes dos defaults do Zod), útil para quem escreve JSON. */
export type QuestionPackInput = z.input<typeof QuestionPackSchema>;
export type QuestionInput = z.input<typeof QuestionSchema>;

/** Questão com o plugin já resolvido (pack.pluginId ou override da questão). */
export type ResolvedQuestion = Question & { pluginId: string };

export function resolveQuestions(pack: QuestionPack): ResolvedQuestion[] {
  return pack.questions.map((question) => ({ ...question, pluginId: question.pluginId ?? pack.pack.pluginId }));
}

/** Questão como enviada aos alunos: sem a solução esperada. */
export type PublicQuestion = Omit<ResolvedQuestion, 'solution'>;

export function toPublicQuestion(question: ResolvedQuestion): PublicQuestion {
  const { solution: _solution, ...rest } = question;
  return rest;
}
