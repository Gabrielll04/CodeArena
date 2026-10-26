import { describe, expect, it } from 'vitest';
import { ChecklistItemSchema } from '@codearena/schemas';
import { activityGrade, formatGrade, questionGrade, roundGrade } from '../src';

const item = (id: string, extra: Record<string, unknown> = {}) =>
  ChecklistItemSchema.parse({ id, label: 'Item', rule: { type: 'contains', value: id }, ...extra });

describe('notas', () => {
  it('pondera os itens obrigatórios pelo peso', () => {
    const checklist = [item('a', { weight: 3 }), item('b'), item('c', { optional: true })];
    expect(questionGrade(checklist, new Set(['a']))).toBe(7.5);
    expect(questionGrade(checklist, new Set(['b', 'c']))).toBe(2.5);
    expect(questionGrade(checklist, new Set(['a', 'b']))).toBe(10);
  });

  it('dá zero sem itens obrigatórios', () => {
    expect(questionGrade([item('a', { optional: true })], new Set(['a']))).toBe(0);
  });

  it('arredonda a média para uma casa decimal', () => {
    expect(roundGrade(7.45)).toBe(7.5);
    expect(activityGrade([10, 6.7, 5])).toBe(7.2);
    expect(activityGrade([])).toBe(0);
  });

  it('formata com vírgula decimal', () => {
    expect(formatGrade(7.5)).toBe('7,5');
    expect(formatGrade(10)).toBe('10,0');
  });
});
