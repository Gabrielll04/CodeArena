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

describe('lintQuestion: plugins com resposta visual', () => {
  const visual = {
    id: 'redes',
    displayName: 'Redes',
    description: '',
    version: '1.0.0',
    editorLanguage: 'json',
    answerFormat: 'document' as const,
    answerLabel: 'Topologia',
    getStarterCode: (q: { starterCode: string }) => q.starterCode,
    validators: { temPc: { description: '', mode: 'static' as const, validate: ({ code }: { code: string }) => code.includes('"pc"') } },
  };

  it('avisa quando a checklist usa regra de texto sobre o documento do editor', async () => {
    const q = question({
      starterCode: '{"devices":[]}',
      solution: '{"devices":[{"type":"pc"}]}',
      checklist: [
        { id: 'pc', label: 'Adicionar um PC', rule: { type: 'pluginRule', validator: 'temPc' } },
        { id: 'texto', label: 'Ter o texto pc', rule: { type: 'contains', value: 'pc"' } },
      ],
    });
    const warnings = await lintQuestion(q, visual);
    expect(warnings.filter((w) => w.itemId === 'texto').map((w) => w.message)).toContain(
      'Regra de texto numa resposta visual: o conteúdo é gerado pelo editor de topologia e pode mudar de formato. Prefira um validador do plugin.',
    );
    expect(warnings.some((w) => w.itemId === 'pc' && w.level !== 'info')).toBe(false);
  });
});
