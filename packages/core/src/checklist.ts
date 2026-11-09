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

export type BuiltinRule = Exclude<ChecklistRule, { type: 'pluginRule' } | { type: 'manual' }>;

export function isBuiltinRule(rule: ChecklistRule): rule is BuiltinRule {
  return rule.type !== 'pluginRule' && rule.type !== 'manual';
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
  // Critérios manuais não são marcados sozinhos: ficam fora da aceitação automática.
  const required = items.filter((item) => !item.optional && !item.manual);
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
  return summarize(checklist.map((item) => ({ id: item.id, status: 'pending', ...baseResult(item) })));
}

function baseResult(item: ChecklistItem): { optional: boolean; manual?: true } {
  return item.rule.type === 'manual' ? { optional: item.optional, manual: true } : { optional: item.optional };
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
        ...baseResult(item),
        status: 'failed',
        message: `Código maior que o limite de ${MAX_CODE_LENGTH} caracteres`,
      })),
    );
  }

  // Itens de plugin que vão rodar nesta avaliação (validador existe e o modo foi pedido).
  const runnable = (item: ChecklistItem) =>
    item.rule.type === 'pluginRule' && Boolean(plugin?.validators?.[item.rule.validator]) && modes.has(plugin!.validators![item.rule.validator]!.mode);
  const gate = modes.has('static') ? syntaxValidatorOf(plugin) : null;

  // Uma sessão por avaliação (ex.: a AST parseada uma vez), compartilhada pela sintaxe e pelos validadores.
  let session: unknown;
  let sessionError: string | null = null;
  if (plugin?.createSession && (gate || question.checklist.some(runnable))) {
    try {
      session = await plugin.createSession({ code, question, modes, signal });
    } catch (err) {
      sessionError = err instanceof Error ? err.message : String(err);
    }
  }

  try {
    // Código com erro de sintaxe não conclui nenhum item: texto solto, chaves e aspas não contam como resposta.
    if (gate && sessionError === null) {
      const syntaxError = await checkSyntax(plugin!, gate, { code, question, session, signal, validatorTimeoutMs });
      if (syntaxError !== null) {
        return {
          ...summarize(question.checklist.map((item) => ({ id: item.id, status: 'pending' as const, ...baseResult(item) }))),
          syntaxError,
        };
      }
    }

    const results: ChecklistItemResult[] = [];
    const pluginItems: { index: number; item: ChecklistItem & { rule: { type: 'pluginRule' } } }[] = [];

    question.checklist.forEach((item, index) => {
      const base = { id: item.id, ...baseResult(item) };
      const { rule } = item;
      if (rule.type === 'manual') {
        results[index] = { ...base, status: 'pending' };
        return;
      }
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

    for (const { index, item } of pluginItems) {
      const base = { id: item.id, ...baseResult(item) };
      if (sessionError !== null) {
        results[index] = { ...base, status: 'failed', message: sessionError };
        continue;
      }
      if (signal?.aborted) {
        results[index] = { ...base, status: 'running' };
        continue;
      }
      const rule = item.rule as Extract<ChecklistRule, { type: 'pluginRule' }>;
      const validator = plugin!.validators![rule.validator]!;
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

    return summarize(results);
  } finally {
    if (session !== undefined && plugin?.disposeSession) {
      try {
        await plugin.disposeSession(session);
      } catch {
        // falha ao liberar a sessão não altera o resultado
      }
    }
  }
}

/**
 * Validador estático que confere a sintaxe do código: o declarado pelo plugin em `syntaxValidator` ou, enquanto o
 * plugin não declara, um validador estático cujo nome termina em "Compiles" (convenção dos plugins oficiais).
 * `syntaxValidator: false` desliga a verificação.
 */
export function syntaxValidatorOf(plugin?: QuizPlugin<any>): string | null {
  const validators = plugin?.validators;
  if (!validators || plugin.syntaxValidator === false) return null;
  if (plugin.syntaxValidator) return validators[plugin.syntaxValidator]?.mode === 'static' ? plugin.syntaxValidator : null;
  return Object.entries(validators).find(([name, v]) => v.mode === 'static' && name.endsWith('Compiles'))?.[0] ?? null;
}

/** Devolve a mensagem do erro de sintaxe, ou null se o código está bem formado (ou a verificação falhou por outro motivo). */
async function checkSyntax(
  plugin: QuizPlugin<any>,
  name: string,
  input: { code: string; question: PublicQuestion; session: unknown; signal?: AbortSignal; validatorTimeoutMs: number },
): Promise<string | null> {
  const validator = plugin.validators![name]!;
  const params = validator.params ? validator.params.safeParse({}) : { success: true as const, data: {} };
  if (!params.success) return null;
  const item: ChecklistItem = { id: 'sintaxe', label: 'Código sem erros de sintaxe', optional: false, rule: { type: 'pluginRule', validator: name, params: {} } };
  try {
    const outcome = normalizeOutcome(
      await withTimeout(
        Promise.resolve(validator.validate({ ...input, item, params: params.data })),
        input.validatorTimeoutMs,
      ),
    );
    return outcome.passed ? null : (outcome.message ?? 'O código tem erro de sintaxe');
  } catch {
    // Falha da própria verificação não bloqueia a checklist: os itens seguem com as regras deles.
    return null;
  }
}
