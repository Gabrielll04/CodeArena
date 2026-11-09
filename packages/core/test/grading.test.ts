import { describe, expect, it } from 'vitest';
import { msepActivityGrade, msepQuestionGrade } from '../src';

// 2 críticos (a, b) e 2 desejáveis (c, d).
const checklist = [
  { id: 'a', optional: false },
  { id: 'b', optional: false },
  { id: 'c', optional: true },
  { id: 'd', optional: true },
];
const marks = (met: string[], unmet: string[] = []) =>
  Object.fromEntries([...met.map((id) => [id, { met: true }]), ...unmet.map((id) => [id, { met: false }])]);

describe('nota MSEP', () => {
  it('com todos os críticos, vai de 50 a 100 conforme os desejáveis', () => {
    expect(msepQuestionGrade(checklist, marks(['a', 'b'], ['c', 'd'])).grade).toBe(50);
    expect(msepQuestionGrade(checklist, marks(['a', 'b', 'c'], ['d'])).grade).toBe(75);
    expect(msepQuestionGrade(checklist, marks(['a', 'b', 'c', 'd'])).grade).toBe(100);
    expect(msepQuestionGrade(checklist.slice(0, 2), marks(['a', 'b'])).grade).toBe(100);
  });

  it('sem todos os críticos, nunca passa de 50', () => {
    const result = msepQuestionGrade(checklist, marks(['a', 'c', 'd'], ['b']));
    expect(result).toMatchObject({ grade: 38, allCriticalMet: false, criticalMet: 1, desirableMet: 2 });
    expect(msepQuestionGrade(checklist, marks([], ['a', 'b', 'c', 'd'])).grade).toBe(0);
  });

  it('fica pendente enquanto algum critério não foi avaliado', () => {
    expect(msepQuestionGrade(checklist, marks(['a', 'b', 'c']))).toMatchObject({ grade: null, allCriticalMet: true, pending: 1 });
    expect(msepQuestionGrade(checklist, marks(['c'], ['a']))).toMatchObject({ grade: null, allCriticalMet: false, pending: 2 });
  });

  it('a atividade é a média, limitada a 50 se faltou crítico em alguma questão', () => {
    const full = msepQuestionGrade(checklist, marks(['a', 'b', 'c', 'd']));
    const half = msepQuestionGrade(checklist, marks(['a', 'b', 'c'], ['d']));
    const missing = msepQuestionGrade(checklist, marks(['a', 'c', 'd'], ['b']));
    expect(msepActivityGrade([full, half])).toEqual({ grade: 88, capped: false });
    expect(msepActivityGrade([full, full, missing])).toEqual({ grade: 50, capped: true });
    expect(msepActivityGrade([full, msepQuestionGrade(checklist, {})])).toEqual({ grade: null, capped: false });
  });
});
