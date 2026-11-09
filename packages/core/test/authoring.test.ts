import { describe, expect, it } from 'vitest';
import { QuestionSchema } from '@codearena/schemas';
import { lintQuestion } from '../src';

const base = {
  id: 'q',
  prompt: 'Corrija o código',
  timeLimitSeconds: 60,
  baseXP: 100,
  speedBonusMax: 100,
  checklist: [
    { id: 'soma', label: 'Somar com +', rule: { type: 'contains', value: 'a + b' } },
    { id: 'func', label: 'Manter a função', rule: { type: 'contains', value: 'function somar' } },
  ],
};

const question = (overrides: Record<string, unknown>) => QuestionSchema.parse({ ...base, ...overrides });
const levels = async (overrides: Record<string, unknown>) => (await lintQuestion(question(overrides))).map((w) => `${w.level}:${w.message}`);

describe('lintQuestion: questões de depuração', () => {
  const buggy = 'function somar(a, b) { return a - b; }';
  const fixed = 'function somar(a, b) { return a + b; }';

  it('aceita um bom exemplo e informa quantos itens detectam o bug', async () => {
    const warnings = await lintQuestion(question({ kind: 'debug', starterCode: buggy, solution: fixed }));
    expect(warnings.filter((w) => w.level === 'error')).toEqual([]);
    const info = warnings.find((w) => w.level === 'info')!;
    expect(info.message).toBe('O bug é detectado por 1 de 2 itens obrigatórios: Somar com +.');
    // Em depuração é esperado que alguns itens já passem no código com bug.
    expect(warnings.some((w) => w.message === 'O código inicial já satisfaz este item.')).toBe(false);
  });

  it('exige código com bug', async () => {
    expect(await levels({ kind: 'debug', starterCode: '', solution: fixed })).toContain(
      'error:Questão de depuração precisa de código inicial: é nele que está o bug.',
    );
  });

  it('recusa solução igual ao código com bug', async () => {
    const result = await levels({ kind: 'debug', starterCode: fixed, solution: fixed });
    expect(result).toContain('error:A solução é igual ao código com bug: não há nada para corrigir.');
  });

  it('recusa quando o código com bug já cumpre toda a checklist (o bug não é detectado)', async () => {
    const result = await levels({ kind: 'debug', starterCode: `${fixed}\n// bug que ninguém verifica`, solution: fixed });
    expect(result).toContain('error:O código com bug já cumpre todos os itens: a checklist não detecta o bug.');
  });

  it('em questões comuns continua avisando que o código inicial já satisfaz itens', async () => {
    const result = await levels({ starterCode: 'function somar(a, b) {', solution: fixed });
    expect(result).toContain('warning:O código inicial já satisfaz este item.');
  });
});

describe('lintQuestion: critérios manuais', () => {
  it('não cobra da solução os critérios manuais e avisa quando nenhum crítico é verificado pelo código', async () => {
    const warnings = await levels({
      solution: 'function somar(a, b) { return a + b; }',
      checklist: [
        { id: 'legivel', label: 'Nomear as variáveis', rule: { type: 'manual' } },
        { id: 'soma', label: 'Somar com +', rule: { type: 'contains', value: 'a + b' }, optional: true },
      ],
    });
    expect(warnings.filter((w) => w.startsWith('error'))).toEqual([]);
    expect(warnings).toContain(
      'warning:Nenhum critério crítico é verificado pelo código: em salas de competição a resposta seria aceita sem conferir nada. Use esta questão em atividades.',
    );
  });
});

describe('lintQuestion: regras de texto para componentes', () => {
  it('sugere o validador do plugin quando a regra de texto confere um componente', async () => {
    const plugin = {
      id: 'rn',
      displayName: 'RN',
      description: '',
      version: '0.0.0',
      editorLanguage: 'typescript',
      getStarterCode: () => '',
      validators: { hasComponent: { description: '', mode: 'static' as const, validate: () => true } },
    };
    const q = question({
      solution: 'function somar(a, b) { return <Text>{a + b}</Text>; }',
      checklist: [
        { id: 'soma', label: 'Somar com +', rule: { type: 'contains', value: 'a + b' } },
        { id: 'texto', label: 'Utilizar o componente Text', rule: { type: 'regex', pattern: '<Text\\b', flags: 'i' } },
      ],
    });
    const warnings = await lintQuestion(q, plugin);
    expect(warnings.filter((w) => w.message.startsWith('Regra de texto para conferir componente')).map((w) => w.itemId)).toEqual(['texto']);
  });
});
