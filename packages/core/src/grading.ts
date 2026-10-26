import type { ChecklistItem } from '@codearena/schemas';

/** Nota máxima das atividades avaliativas. */
export const MAX_GRADE = 10;

/** Arredonda para uma casa decimal (7.45 vira 7.5). */
export function roundGrade(value: number): number {
  return Math.round(value * 10 + Number.EPSILON) / 10;
}

/**
 * Nota de uma questão, de 0 a 10: itens obrigatórios confirmados pelo servidor, ponderados pelo `weight` de cada item.
 * Itens opcionais não entram na nota. Sem itens obrigatórios, a nota é 0.
 */
export function questionGrade(checklist: ChecklistItem[], passedIds: ReadonlySet<string>): number {
  let total = 0;
  let earned = 0;
  for (const item of checklist) {
    if (item.optional) continue;
    const weight = item.weight ?? 1;
    total += weight;
    if (passedIds.has(item.id)) earned += weight;
  }
  return total > 0 ? roundGrade((earned / total) * MAX_GRADE) : 0;
}

/** Nota da atividade: média das notas das questões, com uma casa decimal. */
export function activityGrade(questionGrades: number[]): number {
  if (!questionGrades.length) return 0;
  return roundGrade(questionGrades.reduce((sum, grade) => sum + grade, 0) / questionGrades.length);
}

/** "7,5": formato usado em diários e planilhas em português. */
export function formatGrade(grade: number): string {
  return grade.toFixed(1).replace('.', ',');
}
