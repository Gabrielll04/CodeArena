import { formatZodError, type ValidationIssue } from './issues';
import { QuestionPackSchema, QuestionSchema, type Question, type QuestionPack } from './question-pack';

export type ParseResult<T> = { ok: true; value: T } | { ok: false; issues: ValidationIssue[] };

/** Valida um question pack já convertido de JSON. */
export function parseQuestionPack(input: unknown): ParseResult<QuestionPack> {
  const result = QuestionPackSchema.safeParse(input);
  return result.success ? { ok: true, value: result.data } : { ok: false, issues: formatZodError(result.error) };
}

/** Valida o texto de um arquivo JSON, reportando erros de sintaxe com posição. */
export function parseQuestionPackJson(text: string): ParseResult<QuestionPack> {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, issues: [{ path: '(arquivo)', message: `JSON inválido: ${message}` }] };
  }
  return parseQuestionPack(data);
}

export function parseQuestion(input: unknown): ParseResult<Question> {
  const result = QuestionSchema.safeParse(input);
  return result.success ? { ok: true, value: result.data } : { ok: false, issues: formatZodError(result.error) };
}
