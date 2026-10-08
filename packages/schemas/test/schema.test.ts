import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseQuestionPack, parseQuestionPackJson, resolveQuestions, toPublicQuestion } from '../src';

const root = resolve(__dirname, '../../..');
const load = (file: string) => JSON.parse(readFileSync(resolve(root, file), 'utf8'));

const minimalPack = () => ({
  pack: { title: 'Teste', pluginId: 'react-native', version: '1.0.0' },
  questions: [
    {
      id: 'q1',
      prompt: 'Faça algo',
      timeLimitSeconds: 60,
      baseXP: 100,
      speedBonusMax: 100,
      checklist: [{ id: 'a', label: 'Fazer A', rule: { type: 'contains', value: 'abc' } }],
    },
  ],
});

describe('QuestionPackSchema', () => {
  it('aceita os packs de exemplo do repositório', () => {
    for (const file of ['content/packs/react-native-fundamentos.json', 'content/packs/backend-http-basico.json']) {
      const result = parseQuestionPack(load(file));
      expect(result.ok, file).toBe(true);
    }
  });

  it('aplica valores padrão', () => {
    const result = parseQuestionPack(minimalPack());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const q = result.value.questions[0]!;
    expect(q.starterCode).toBe('');
    expect(q.lockOnComplete).toBe(true);
    expect(q.checklist[0]!.optional).toBe(false);
    expect(q.checklist[0]!.rule).toMatchObject({ caseSensitive: true, ignoreComments: false });
    expect(result.value.pack.tags).toEqual([]);
  });

  it('resolve o plugin da questão a partir do pack e remove a solução da versão pública', () => {
    const input = minimalPack();
    (input.questions[0] as Record<string, unknown>).solution = 'segredo';
    const result = parseQuestionPack(input);
    if (!result.ok) throw new Error('pack inválido');
    const [question] = resolveQuestions(result.value);
    expect(question!.pluginId).toBe('react-native');
    expect('solution' in toPublicQuestion(question!)).toBe(false);
  });

  it('reporta caminho e mensagem de cada erro', () => {
    const input = minimalPack() as any;
    delete input.pack.pluginId;
    input.pack.version = '1.0';
    input.questions[0].checklist.push({ id: 'b', label: 'Regex', rule: { type: 'regex', pattern: '(' } });
    input.questions[0].checklist.push({ id: 'a', label: 'Duplicado', rule: { type: 'contains', value: 'x' } });
    input.questions[0].timeLimitSeconds = 5;
    const result = parseQuestionPack(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const paths = result.issues.map((i) => i.path);
    expect(paths).toContain('pack.pluginId');
    expect(paths).toContain('pack.version');
    expect(paths).toContain('questions[0].checklist[1].rule.pattern');
    expect(paths).toContain('questions[0].checklist[2].id');
    expect(paths).toContain('questions[0].timeLimitSeconds');
    expect(result.issues.find((i) => i.path === 'questions[0].checklist[1].rule.pattern')!.message).toMatch(/Regex inválida/);
  });

  it('rejeita tipo de regra desconhecido e campos extras', () => {
    const input = minimalPack() as any;
    input.questions[0].checklist[0].rule = { type: 'magic', value: 'x' };
    input.questions[0].extra = true;
    const result = parseQuestionPack(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.some((i) => /tipo de regra desconhecido/.test(i.message))).toBe(true);
    expect(result.issues.some((i) => /extra/.test(i.message))).toBe(true);
  });

  it('exige pelo menos um item obrigatório e ids únicos de questão', () => {
    const input = minimalPack() as any;
    input.questions[0].checklist[0].optional = true;
    input.questions.push({ ...input.questions[0] });
    const result = parseQuestionPack(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.some((i) => /obrigatório/.test(i.message))).toBe(true);
    expect(result.issues.some((i) => i.path === 'questions[1].id')).toBe(true);
  });

  it('informa erro de sintaxe JSON', () => {
    const result = parseQuestionPackJson('{ "pack": ');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0]!.message).toMatch(/JSON inválido/);
  });
});
