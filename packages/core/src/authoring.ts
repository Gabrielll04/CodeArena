import { toPublicQuestion, type ChecklistItem, type Question, type ResolvedQuestion } from '@codearena/schemas';
import type { QuizPlugin } from '@codearena/plugin-sdk';
import { evaluateChecklist } from './checklist';

export interface AuthoringWarning {
  /** error bloqueia a entrega; warning é fragilidade; info é só um resumo útil. */
  level: 'error' | 'warning' | 'info';
  /** Item da checklist relacionado, se houver. */
  itemId?: string;
  message: string;
}

/** Avisos de fragilidade de uma regra, sem executar código. */
export function lintChecklistItem(item: ChecklistItem): AuthoringWarning[] {
  const warnings: AuthoringWarning[] = [];
  const { rule } = item;
  const push = (level: AuthoringWarning['level'], message: string) => warnings.push({ level, itemId: item.id, message });

  if ((rule.type === 'contains' || rule.type === 'notContains') && rule.value.trim().length < 3) {
    push('warning', `"${rule.value}" é curto demais e pode aparecer por acaso no código (falso positivo).`);
  }
  if (rule.type === 'regex') {
    let re: RegExp | null = null;
    try {
      re = new RegExp(rule.pattern, rule.flags);
    } catch {
      push('error', 'A regex não compila.');
    }
    if (re && re.test('')) push('error', 'A regex aceita texto vazio: o item seria marcado sem o aluno escrever nada.');
    if (/ (?:[=({,]|\\\()|(?:[=({,]|\\\() | {2,}/.test(rule.pattern)) {
      push('warning', 'Espaço literal junto de pontuação na regex: prefira \\s* para aceitar formatações diferentes.');
    }
    if (/(\.\*){2,}|\(\.\*\)\+|\(\.\+\)\+/.test(rule.pattern)) {
      push('warning', 'Padrões como (.*)+ ou .*.* podem ficar lentos com códigos grandes.');
    }
    if (/^\^/.test(rule.pattern) && !rule.flags.includes('m')) {
      push('warning', '"^" sem a flag "m" só casa com o início do arquivo inteiro.');
    }
  }
  if (rule.type === 'regex' && /^[A-Za-z]+$/.test(rule.pattern) && rule.pattern.length < 4) {
    push('warning', 'Regex muito genérica; inclua contexto (ex.: "<Button\\b" em vez de "Button").');
  }
  return warnings;
}

/**
 * Verifica a questão inteira: regras frágeis, solução que não completa a checklist
 * e código inicial que já completa itens.
 */
export async function lintQuestion(
  question: Question | ResolvedQuestion,
  plugin?: QuizPlugin<any>,
): Promise<AuthoringWarning[]> {
  const warnings = question.checklist.flatMap(lintChecklistItem);
  const resolved = { ...question, pluginId: question.pluginId ?? plugin?.id ?? '' } as ResolvedQuestion;
  const publicQuestion = toPublicQuestion(resolved);

  for (const item of question.checklist) {
    if (item.rule.type === 'pluginRule' && plugin && !plugin.validators?.[item.rule.validator]) {
      warnings.push({
        level: 'error',
        itemId: item.id,
        message: `O validador "${item.rule.validator}" não existe no plugin "${plugin.id}".`,
      });
    }
  }

  if (!question.solution.trim()) {
    warnings.push({ level: 'warning', message: 'Sem solução esperada: não dá para provar que a checklist é alcançável.' });
  } else {
    const result = await evaluateChecklist(question.solution, publicQuestion, { plugin });
    result.items.forEach((item) => {
      if (item.status !== 'done' && !item.optional) {
        warnings.push({
          level: 'error',
          itemId: item.id,
          message: `A solução esperada não satisfaz este item${item.message ? ` (${item.message})` : ''}.`,
        });
      }
    });
  }

  const debug = question.kind === 'debug';
  if (debug) {
    if (!question.starterCode.trim()) {
      warnings.push({ level: 'error', message: 'Questão de depuração precisa de código inicial: é nele que está o bug.' });
    } else if (question.solution.trim() && question.starterCode.trim() === question.solution.trim()) {
      warnings.push({ level: 'error', message: 'A solução é igual ao código com bug: não há nada para corrigir.' });
    }
  }

  // Avalia o código inicial inteiro (inclusive regras que executam o código): é isso que o aluno recebe.
  const starter = await evaluateChecklist(question.starterCode, publicQuestion, { plugin });
  if (starter.allRequiredDone) {
    warnings.push({
      level: 'error',
      message: debug
        ? 'O código com bug já cumpre todos os itens: a checklist não detecta o bug.'
        : 'O código inicial já completa a checklist: a resposta seria aceita sem esforço.',
    });
  } else if (debug) {
    const failing = starter.items.filter((item) => !item.optional && item.status !== 'done');
    const labels = failing.map((item) => question.checklist.find((i) => i.id === item.id)?.label ?? item.id);
    warnings.push({
      level: 'info',
      message: `O bug é detectado por ${failing.length} de ${starter.requiredTotal} itens obrigatórios: ${labels.join('; ')}.`,
    });
    if (!question.checklist.some((item) => item.rule.type === 'pluginRule')) {
      warnings.push({
        level: 'warning',
        message: 'Questões de depuração ficam mais justas quando a checklist verifica comportamento (pluginRule), não só texto.',
      });
    }
  } else {
    starter.items.forEach((item) => {
      const original = question.checklist.find((i) => i.id === item.id);
      if (item.status === 'done' && original && original.rule.type !== 'notContains') {
        warnings.push({ level: 'warning', itemId: item.id, message: 'O código inicial já satisfaz este item.' });
      }
    });
  }
  return warnings;
}
