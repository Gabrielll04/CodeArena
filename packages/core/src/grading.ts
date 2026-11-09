import type { ChecklistItem } from '@codearena/schemas';

/**
 * Notas das atividades, pela Metodologia SENAI de Educação Profissional (MSEP), de 0 a 100.
 *
 * Itens obrigatórios da checklist são critérios críticos; itens opcionais são critérios desejáveis.
 * - Todos os críticos atendidos: de 50 a 100, conforme a fração de desejáveis atendidos (100 sem desejáveis).
 * - Algum crítico não atendido: a fração de todos os critérios atendidos aplicada a 50, nunca acima de 50.
 * - Atividade: média das questões; se faltou algum crítico em alguma questão, nunca acima de 50.
 */
export const MAX_GRADE = 100;
/** Teto quando falta algum critério crítico. */
export const CRITICAL_CAP = 50;

export interface CriterionState {
  met: boolean;
}

export interface QuestionGradeResult {
  /** null enquanto algum critério não foi avaliado. */
  grade: number | null;
  /** null enquanto algum crítico não foi avaliado. */
  allCriticalMet: boolean | null;
  criticalTotal: number;
  criticalMet: number;
  desirableTotal: number;
  desirableMet: number;
  /** Critérios ainda sem avaliação. */
  pending: number;
}

/** Nota de uma questão a partir das marcas de cada critério (por id). */
export function msepQuestionGrade(
  checklist: Pick<ChecklistItem, 'id' | 'optional'>[],
  marks: Readonly<Record<string, CriterionState | null | undefined>>,
): QuestionGradeResult {
  const critical = checklist.filter((item) => !item.optional);
  const desirable = checklist.filter((item) => item.optional);
  const met = (items: typeof checklist) => items.filter((item) => marks[item.id]?.met === true).length;
  const pending = checklist.filter((item) => !marks[item.id]).length;
  const result = {
    criticalTotal: critical.length,
    criticalMet: met(critical),
    desirableTotal: desirable.length,
    desirableMet: met(desirable),
    pending,
  };
  // Um crítico não atendido já decide; sem isso, só se sabe quando todos os críticos foram avaliados.
  const allCriticalMet = critical.some((item) => marks[item.id]?.met === false)
    ? false
    : critical.some((item) => !marks[item.id])
      ? null
      : true;
  if (pending > 0) return { ...result, grade: null, allCriticalMet };

  if (allCriticalMet) {
    const share = result.desirableTotal ? result.desirableMet / result.desirableTotal : 1;
    return { ...result, allCriticalMet, grade: Math.round(CRITICAL_CAP + (MAX_GRADE - CRITICAL_CAP) * share) };
  }
  const total = result.criticalTotal + result.desirableTotal;
  const share = total ? (result.criticalMet + result.desirableMet) / total : 0;
  return { ...result, allCriticalMet: false, grade: Math.min(CRITICAL_CAP, Math.round(CRITICAL_CAP * share)) };
}

export interface ActivityGradeResult {
  /** null enquanto alguma questão não foi avaliada por completo. */
  grade: number | null;
  /** Faltou algum crítico em alguma questão: a nota fica limitada a 50. */
  capped: boolean;
}

/** Nota da atividade: média das questões, limitada a 50 se faltou algum crítico. */
export function msepActivityGrade(questions: QuestionGradeResult[]): ActivityGradeResult {
  const capped = questions.some((q) => q.allCriticalMet === false);
  if (!questions.length || questions.some((q) => q.grade === null)) return { grade: null, capped };
  const mean = Math.round(questions.reduce((sum, q) => sum + q.grade!, 0) / questions.length);
  return { grade: capped ? Math.min(mean, CRITICAL_CAP) : mean, capped };
}
