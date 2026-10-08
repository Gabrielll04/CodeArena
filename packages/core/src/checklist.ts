import { MAX_CODE_LENGTH, type ChecklistItem, type ChecklistRule, type PublicQuestion } from '@codearena/schemas';
import type {
  ChecklistEvaluationResult,
  ChecklistItemResult,
  ChecklistItemStatus,
  QuizPlugin,
  ValidatorMode,
  ValidatorOutcome,
} from '@codearena/plugin-sdk';
import { stripComments } from './comments';

export type BuiltinRule = Exclude<ChecklistRule, { type: 'pluginRule' }>;

export function isBuiltinRule(rule: ChecklistRule): rule is BuiltinRule {
  return rule.type !== 'pluginRule';
}

/** Avalia de forma síncrona e determinística as regras contains, notContains e regex. */
export function evaluateBuiltinRule(code: string, rule: BuiltinRule): boolean {
  const source = rule.ignoreComments ? stripComments(code) : code;
  switch (rule.type) {
    case 'contains':
    case 'notContains': {
      const found = rule.caseSensitive
        ? source.includes(rule.value)
        : source.toLowerCase().includes(rule.value.toLowerCase());
      return rule.type === 'contains' ? found : !found;
    }
    case 'regex':
      return new RegExp(rule.pattern, rule.flags).test(source);
  }
}

export interface EvaluateChecklistOptions {
  plugin?: QuizPlugin<any>;
  /** Modos de validador a executar. Itens de modos não incluídos ficam "running". Padrão: todos. */
  modes?: ValidatorMode[];
  signal?: AbortSignal;
  /** Tempo máximo por validador de plugin. */
  validatorTimeoutMs?: number;
}

function normalizeOutcome(outcome: ValidatorOutcome): { passed: boolean; message?: string } {
  return typeof outcome === 'boolean' ? { passed: outcome } : outcome;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Validador excedeu o tempo limite de ${ms} ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

export function summarize(items: ChecklistItemResult[]): ChecklistEvaluationResult {
  const required = items.filter((item) => !item.optional);
  const requiredDone = required.filter((item) => item.status === 'done').length;
  return {
    items,
    requiredTotal: required.length,
    requiredDone,
    allRequiredDone: required.length > 0 && requiredDone === required.length,
  };
}

/** Estado inicial (tudo pendente) para exibir antes da primeira avaliação. */
export function pendingChecklist(checklist: ChecklistItem[]): ChecklistEvaluationResult {
  return summarize(checklist.map((item) => ({ id: item.id, status: 'pending', optional: item.optional })));
}

/**
 * Avalia a checklist de uma questão. A mesma função roda no navegador (feedback imediato)
 * e no servidor (validação oficial), garantindo resultados idênticos para as mesmas entradas.
 */
export async function evaluateChecklist(
  code: string,
  question: PublicQuestion,
  options: EvaluateChecklistOptions = {},
): Promise<ChecklistEvaluationResult> {
  const { plugin, signal, validatorTimeoutMs = 8000 } = options;
  const modes = new Set<ValidatorMode>(options.modes ?? ['static', 'dynamic']);

  if (code.length > MAX_CODE_LENGTH) {
    return summarize(
      question.checklist.map((item) => ({
        id: item.id,
        optional: item.optional,
        status: 'failed',
        message: `Código maior que o limite de ${MAX_CODE_LENGTH} caracteres`,
      })),
    );
  }

  const results: ChecklistItemResult[] = [];
  const pluginItems: { index: number; item: ChecklistItem & { rule: { type: 'pluginRule' } } }[] = [];

  question.checklist.forEach((item, index) => {
    const base = { id: item.id, optional: item.optional };
    const { rule } = item;
    if (rule.type !== 'pluginRule') {
      let status: ChecklistItemStatus = 'pending';
      let message: string | undefined;
      try {
        status = evaluateBuiltinRule(code, rule) ? 'done' : 'pending';
      } catch (err) {
        status = 'failed';
        message = `Regra inválida: ${err instanceof Error ? err.message : String(err)}`;
      }
      results[index] = message ? { ...base, status, message } : { ...base, status };
      return;
    }
    if (!plugin) {
      results[index] = { ...base, status: 'failed', message: `Plugin da questão não está disponível` };
      return;
    }
    const validator = plugin.validators?.[rule.validator];
    if (!validator) {
      results[index] = {
        ...base,
        status: 'failed',
        message: `Validador "${rule.validator}" não existe no plugin "${plugin.id}"`,
      };
      return;
    }
    if (!modes.has(validator.mode)) {
      results[index] = { ...base, status: 'running' };
      return;
    }
    pluginItems.push({ index, item: item as ChecklistItem & { rule: { type: 'pluginRule' } } });
  });

  if (pluginItems.length > 0 && plugin) {
    let session: unknown;
    try {
      session = plugin.createSession ? await plugin.createSession({ code, question, modes, signal }) : undefined;
      for (const { index, item } of pluginItems) {
        const base = { id: item.id, optional: item.optional };
        if (signal?.aborted) {
          results[index] = { ...base, status: 'running' };
          continue;
        }
        const rule = item.rule as Extract<ChecklistRule, { type: 'pluginRule' }>;
        const validator = plugin.validators![rule.validator]!;
        const parsed = validator.params ? validator.params.safeParse(rule.params) : { success: true as const, data: rule.params };
        if (!parsed.success) {
          const detail = parsed.error.issues.map((i) => `${i.path.join('.') || 'params'}: ${i.message}`).join('; ');
          results[index] = { ...base, status: 'failed', message: `Parâmetros inválidos: ${detail}` };
          continue;
        }
        try {
          const outcome = normalizeOutcome(
            await withTimeout(
              Promise.resolve(validator.validate({ code, question, item, params: parsed.data, session, signal })),
              validatorTimeoutMs,
            ),
          );
          const failStatus: ChecklistItemStatus = validator.mode === 'dynamic' ? 'failed' : 'pending';
          const status: ChecklistItemStatus = outcome.passed ? 'done' : failStatus;
          results[index] = outcome.message ? { ...base, status, message: outcome.message } : { ...base, status };
        } catch (err) {
          results[index] = { ...base, status: 'failed', message: err instanceof Error ? err.message : String(err) };
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      for (const { index, item } of pluginItems) {
        results[index] = { id: item.id, optional: item.optional, status: 'failed', message };
      }
    } finally {
      if (session !== undefined && plugin.disposeSession) {
        try {
          await plugin.disposeSession(session);
        } catch {
          // falha ao liberar a sessão não altera o resultado
        }
      }
    }
  }

  return summarize(results);
}
