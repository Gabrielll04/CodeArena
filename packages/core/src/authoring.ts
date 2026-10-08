import { toPublicQuestion, type ChecklistItem, type Question, type ResolvedQuestion } from '@codearena/schemas';
import type { QuizPlugin } from '@codearena/plugin-sdk';
import { evaluateChecklist } from './checklist';

export interface AuthoringWarning {
  level: 'error' | 'warning';
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

  const starter = await evaluateChecklist(question.starterCode, publicQuestion, { plugin, modes: ['static'] });
  if (starter.allRequiredDone) {
    warnings.push({ level: 'error', message: 'O código inicial já completa a checklist: a resposta seria aceita sem esforço.' });
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
