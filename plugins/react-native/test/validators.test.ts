import { describe, expect, it } from 'vitest';
import { evaluateChecklist } from '@codearena/core';
import { QuestionSchema, type PublicQuestion } from '@codearena/schemas';
import { addLoopGuards, reactNativePlugin } from '../src';

function q(checklist: unknown[]): PublicQuestion {
  const { solution: _s, ...rest } = QuestionSchema.parse({ id: 'q', prompt: 'p', timeLimitSeconds: 60, baseXP: 1, speedBonusMax: 1, checklist });
  return { ...rest, pluginId: 'react-native' };
}

let counter = 0;
const rule = (validator: string, params: Record<string, unknown> = {}) => ({
  id: `item-${++counter}`,
  label: validator,
  rule: { type: 'pluginRule', validator, params },
});

const run = async (code: string, items: unknown[]) =>
  (await evaluateChecklist(code, q(items), { plugin: reactNativePlugin })).items.map((i) => ({ status: i.status, message: i.message }));

const APP = `
import { useState } from 'react';
import { View, Text, Button, TextInput, StyleSheet } from 'react-native';

export default function App() {
  const [count, setCount] = useState(0);
  return (
    <View style={styles.box}>
      <Text>Olá,   CodeArena</Text>
      <Text>{'Total: '}{count}</Text>
      <Button title="Clique aqui" onPress={() => setCount(count + 1)} />
      <Button title={'Outro'} />
      <TextInput placeholder={\`Seu nome\`} maxLength={10} />
    </View>
  );
}

const styles = StyleSheet.create({ box: { padding: 16, backgroundColor: '#fff' } });
`;

describe('validadores react-native', () => {
  it('reconhece componentes, props, texto, imports, hooks e estilos', async () => {
    const results = await run(APP, [
      rule('reactNativeCompiles'),
      rule('reactNativeExportsDefaultComponent', { name: 'App' }),
      rule('reactNativeHasComponent', { component: 'Button', min: 2 }),
      rule('reactNativeHasComponentProp', { component: 'Button', prop: 'title', value: 'Clique aqui' }),
      rule('reactNativeHasComponentProp', { component: 'TextInput', prop: 'placeholder', value: 'Seu nome' }),
      rule('reactNativeHasComponentProp', { component: 'TextInput', prop: 'maxLength', value: 10 }),
      rule('reactNativeHasText', { text: 'Olá, CodeArena' }),
      rule('reactNativeImports', { names: ['View', 'Text', 'Button'] }),
      rule('reactNativeUsesHook', { hook: 'useState' }),
      rule('reactNativeHasStyle', { property: 'padding', value: 16 }),
    ]);
    expect(results.map((r) => r.status)).toEqual(Array(10).fill('done'));
  });

  it('não marca prop com valor diferente nem componente com nome parecido', async () => {
    const results = await run('export default function App() { return <ButtonGroup title="Clique" /> }', [
      rule('reactNativeHasComponent', { component: 'Button' }),
      rule('reactNativeHasComponentProp', { component: 'ButtonGroup', prop: 'title', value: 'Clique aqui' }),
    ]);
    expect(results.map((r) => r.status)).toEqual(['pending', 'pending']);
  });

  it('ignora texto em comentários (análise por AST)', async () => {
    const results = await run('// <Button title="Clique aqui" />\nexport default function App() { return null }', [
      rule('reactNativeHasComponent', { component: 'Button' }),
    ]);
    expect(results[0]!.status).toBe('pending');
  });

  it('aceita export default de identificador e de arrow function', async () => {
    const named = await run('const App = () => <View />;\nexport default App;', [rule('reactNativeExportsDefaultComponent', { name: 'App' })]);
    const anon = await run('export default () => <View />', [rule('reactNativeExportsDefaultComponent')]);
    expect(named[0]!.status).toBe('done');
    expect(anon[0]!.status).toBe('done');
  });

  it('informa erro de sintaxe com linha', async () => {
    const results = await run('export default function App() {\n  return <View>\n}', [rule('reactNativeCompiles'), rule('reactNativeHasComponent', { component: 'View' })]);
    expect(results[0]!.status).toBe('pending');
    expect(results[0]!.message).toMatch(/linha \d/);
    expect(results[1]!.message).toMatch(/Erro de sintaxe/);
  });

  it('lista os imports que faltam', async () => {
    const results = await run("import { View } from 'react-native';", [rule('reactNativeImports', { names: ['View', 'Text'] })]);
    expect(results[0]!.message).toBe('Falta importar: Text');
  });
});

describe('addLoopGuards', () => {
  it('insere guardas em laços com e sem bloco', () => {
    const out = addLoopGuards('while (true) {}\nfor (let i = 0; i < 3; i++) x++;\ndo { y() } while (z)');
    expect(out.match(/__codearenaLoopGuard\(\)/g)).toHaveLength(3);
    expect(out).toContain('{__codearenaLoopGuard();x++;}');
  });

  it('mantém o código intacto quando há erro de sintaxe', () => {
    expect(addLoopGuards('while (')).toBe('while (');
  });
});
