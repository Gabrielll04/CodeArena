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
  it('com todos os críticos, vai de 75 a 100 conforme os desejáveis', () => {
    expect(msepQuestionGrade(checklist, marks(['a', 'b'], ['c', 'd'])).grade).toBe(75);
    expect(msepQuestionGrade(checklist, marks(['a', 'b', 'c'], ['d'])).grade).toBe(88);
    expect(msepQuestionGrade(checklist, marks(['a', 'b', 'c', 'd'])).grade).toBe(100);
    expect(msepQuestionGrade(checklist.slice(0, 2), marks(['a', 'b'])).grade).toBe(100);
  });

  it('sem todos os críticos, nunca passa de 50: faltou só um e o resto foi feito, 50', () => {
    const result = msepQuestionGrade(checklist, marks(['a', 'c', 'd'], ['b']));
    expect(result).toMatchObject({ grade: 50, allCriticalMet: false, criticalMet: 1, desirableMet: 2 });
    // Faltou um crítico e um desejável: 37,5 + 12,5 de 62,5 possíveis.
    expect(msepQuestionGrade(checklist, marks(['a', 'c'], ['b', 'd'])).grade).toBe(40);
    // Faltaram os dois críticos: só os desejáveis contam.
    expect(msepQuestionGrade(checklist, marks(['c', 'd'], ['a', 'b'])).grade).toBe(20);
    // Caso da tela: 3 críticos e 1 desejável, faltou só um crítico.
    const four = [{ id: 'x', optional: false }, { id: 'y', optional: false }, { id: 'z', optional: false }, { id: 'w', optional: true }];
    expect(msepQuestionGrade(four, marks(['x', 'y', 'w'], ['z'])).grade).toBe(50);
    // Sem desejáveis, os críticos valem tudo.
    expect(msepQuestionGrade(checklist.slice(0, 2), marks(['a'], ['b'])).grade).toBe(50);
    expect(msepQuestionGrade(checklist, marks([], ['a', 'b', 'c', 'd'])).grade).toBe(0);
  });

  it('fica pendente enquanto algum critério não foi avaliado', () => {
    expect(msepQuestionGrade(checklist, marks(['a', 'b', 'c']))).toMatchObject({ grade: null, allCriticalMet: true, pending: 1 });
    expect(msepQuestionGrade(checklist, marks(['c'], ['a']))).toMatchObject({ grade: null, allCriticalMet: false, pending: 2 });
  });

  it('a atividade é a média das questões, sem teto: o crítico que faltou pesa só na própria questão', () => {
    const full = msepQuestionGrade(checklist, marks(['a', 'b', 'c', 'd']));
    const half = msepQuestionGrade(checklist, marks(['a', 'b', 'c'], ['d']));
    const missing = msepQuestionGrade(checklist, marks(['a', 'c', 'd'], ['b']));
    expect(msepActivityGrade([full, half])).toEqual({ grade: 94, missingCritical: false });
    // missing vale no máximo 50 sozinha; a atividade é (100 + 100 + 50) / 3.
    expect(missing.grade).toBe(50);
    expect(msepActivityGrade([full, full, missing])).toEqual({ grade: 83, missingCritical: true });
    // Nove questões completas e uma com crítico faltando: 95, e não 50.
    expect(msepActivityGrade([...Array(9).fill(full), missing]).grade).toBe(95);
    expect(msepActivityGrade([full, msepQuestionGrade(checklist, {})])).toEqual({ grade: null, missingCritical: false });
  });
});
