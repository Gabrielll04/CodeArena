import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { definePlugin, type QuizPlugin } from '@codearena/plugin-sdk';
import { QuestionSchema, type PublicQuestion } from '@codearena/schemas';
import { evaluateChecklist, stripComments } from '../src';

function question(checklist: unknown[], pluginId = 'test'): PublicQuestion {
  const parsed = QuestionSchema.parse({ id: 'q', prompt: 'p', timeLimitSeconds: 60, baseXP: 100, speedBonusMax: 100, checklist });
  const { solution: _s, ...rest } = parsed;
  return { ...rest, pluginId };
}

const reactNativeExample = question([
  { id: 'componente-app', label: 'Criar o componente App', rule: { type: 'regex', pattern: 'export\\s+default\\s+function\\s+App\\s*\\(', flags: 'm' } },
  { id: 'usar-button', label: 'Utilizar o componente Button', rule: { type: 'regex', pattern: '<Button\\b' } },
  { id: 'titulo-clique-aqui', label: "Escrever title='Clique aqui'", rule: { type: 'regex', pattern: 'title=["\']Clique aqui["\']' } },
]);

const statusOf = async (code: string, q: PublicQuestion, plugin?: QuizPlugin<any>) =>
  Object.fromEntries((await evaluateChecklist(code, q, { plugin })).items.map((i) => [i.id, i.status]));

describe('evaluateChecklist: exemplo React Native do enunciado', () => {
  it('marca "Criar o componente App" assim que export default function App() é escrito', async () => {
    const result = await statusOf('export default function App()', reactNativeExample);
    expect(result).toEqual({ 'componente-app': 'done', 'usar-button': 'pending', 'titulo-clique-aqui': 'pending' });
  });

  it('completa a checklist com a solução esperada', async () => {
    const code = 'export default function App() {\n  return (\n    <Button title="Clique aqui" />\n  );\n}';
    const result = await evaluateChecklist(code, reactNativeExample);
    expect(result.allRequiredDone).toBe(true);
    expect(result.requiredDone).toBe(3);
  });

  it('aceita aspas simples no title', async () => {
    const result = await statusOf("<Button title='Clique aqui' />", reactNativeExample);
    expect(result['titulo-clique-aqui']).toBe('done');
  });

  it('não confunde <ButtonGroup> com <Button>', async () => {
    const result = await statusOf('<ButtonGroup />', reactNativeExample);
    expect(result['usar-button']).toBe('pending');
  });
});

describe('regras embutidas', () => {
  it('contains respeita caseSensitive', async () => {
    const q = question([
      { id: 'a', label: 'a', rule: { type: 'contains', value: 'Hello' } },
      { id: 'b', label: 'b', rule: { type: 'contains', value: 'Hello', caseSensitive: false } },
    ]);
    expect(await statusOf('hello', q)).toEqual({ a: 'pending', b: 'done' });
  });

  it('notContains fica concluído enquanto o texto não aparece', async () => {
    const q = question([{ id: 'a', label: 'a', rule: { type: 'notContains', value: 'alert(' } }]);
    expect(await statusOf('console.log(1)', q)).toEqual({ a: 'done' });
    expect(await statusOf('alert(1)', q)).toEqual({ a: 'pending' });
  });

  it('ignoreComments evita falso positivo com código comentado', async () => {
    const q = question([
      { id: 'a', label: 'a', rule: { type: 'contains', value: 'useState(', ignoreComments: true } },
      { id: 'b', label: 'b', rule: { type: 'contains', value: 'useState(' } },
    ]);
    expect(await statusOf('// useState(0)\n/* useState( */', q)).toEqual({ a: 'pending', b: 'done' });
  });

  it('stripComments preserva strings com // e /*', () => {
    expect(stripComments('const u = "http://x"; // fim\nconst s = \'/* não */\';')).toBe(
      'const u = "http://x"; \nconst s = \'/* não */\';',
    );
  });

  it('itens opcionais não bloqueiam a conclusão', async () => {
    const q = question([
      { id: 'a', label: 'a', rule: { type: 'contains', value: 'abc' } },
      { id: 'b', label: 'b', rule: { type: 'contains', value: 'xyz' }, optional: true },
    ]);
    const result = await evaluateChecklist('abc', q);
    expect(result.allRequiredDone).toBe(true);
    expect(result.requiredTotal).toBe(1);
  });

  it('código acima do limite falha todos os itens', async () => {
    const q = question([{ id: 'a', label: 'a', rule: { type: 'contains', value: 'abc' } }]);
    const result = await evaluateChecklist('abc'.repeat(20_000), q);
    expect(result.items[0]!.status).toBe('failed');
  });
});

describe('pluginRule', () => {
  let sessions = 0;
  let disposed = 0;
  const plugin = definePlugin<QuizPlugin<{ upper: string }>>({
    id: 'test',
    displayName: 'Teste',
    description: '',
    version: '1.0.0',
    editorLanguage: 'javascript',
    getStarterCode: (q) => q.starterCode,
    createSession: ({ code }) => {
      sessions++;
      return { upper: code.toUpperCase() };
    },
    disposeSession: () => {
      disposed++;
    },
    validators: {
      hasWord: {
        description: 'contém palavra',
        mode: 'static',
        params: z.object({ word: z.string() }),
        validate: ({ session, params }) => session.upper.includes(params.word.toUpperCase()),
      },
      runs: {
        description: 'dinâmico',
        mode: 'dynamic',
        validate: async ({ code }) => (code.includes('ok') ? true : { passed: false, message: 'Resposta errada' }),
      },
      throws: {
        description: 'lança erro',
        mode: 'static',
        validate: () => {
          throw new Error('quebrou');
        },
      },
    },
  });
  const q = question([
    { id: 'a', label: 'a', rule: { type: 'pluginRule', validator: 'hasWord', params: { word: 'foo' } } },
    { id: 'b', label: 'b', rule: { type: 'pluginRule', validator: 'runs' } },
  ]);

  it('usa uma única sessão por avaliação e a libera no fim', async () => {
    sessions = 0;
    disposed = 0;
    await evaluateChecklist('foo ok', q, { plugin });
    expect(sessions).toBe(1);
    expect(disposed).toBe(1);
  });

  it('marca dinâmicos como running quando só o modo estático é avaliado', async () => {
    const result = await evaluateChecklist('foo', q, { plugin, modes: ['static'] });
    expect(result.items.map((i) => i.status)).toEqual(['done', 'running']);
    expect(result.allRequiredDone).toBe(false);
  });

  it('falha dinâmica vira "failed" com mensagem; falha estática vira "pending"', async () => {
    const result = await evaluateChecklist('bar', q, { plugin });
    expect(result.items[0]).toMatchObject({ status: 'pending' });
    expect(result.items[1]).toMatchObject({ status: 'failed', message: 'Resposta errada' });
  });

  it('valida parâmetros com o schema do validador', async () => {
    const bad = question([{ id: 'a', label: 'a', rule: { type: 'pluginRule', validator: 'hasWord', params: { word: 1 } } }]);
    const result = await evaluateChecklist('foo', bad, { plugin });
    expect(result.items[0]!.status).toBe('failed');
    expect(result.items[0]!.message).toMatch(/Parâmetros inválidos/);
  });

  it('erros do validador, validador inexistente e plugin ausente viram "failed"', async () => {
    const odd = question([
      { id: 'a', label: 'a', rule: { type: 'pluginRule', validator: 'throws' } },
      { id: 'b', label: 'b', rule: { type: 'pluginRule', validator: 'naoExiste' } },
    ]);
    const result = await evaluateChecklist('x', odd, { plugin });
    expect(result.items[0]).toMatchObject({ status: 'failed', message: 'quebrou' });
    expect(result.items[1]!.message).toMatch(/não existe/);
    const missing = await evaluateChecklist('x', odd);
    expect(missing.items.every((i) => i.status === 'failed')).toBe(true);
  });
});
