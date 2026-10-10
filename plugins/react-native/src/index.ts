import { z } from 'zod';
import { definePlugin, escapeRegExp, type ChecklistValidator, type QuizPlugin } from '@codearena/plugin-sdk';
import { attributeMatches, indexSource, parseSource, type SourceIndex, type SyntaxProblem } from './ast';

export { addLoopGuards, parseSource, indexSource } from './ast';

/** Componentes de react-native disponíveis no preview (via react-native-web). */
export const SUPPORTED_COMPONENTS = [
  'View',
  'Text',
  'Button',
  'TextInput',
  'StyleSheet',
  'Image',
  'ScrollView',
  'Pressable',
  'TouchableOpacity',
  'Switch',
  'FlatList',
  'ActivityIndicator',
  'SafeAreaView',
  'Alert',
] as const;

export const REACT_NATIVE_PLUGIN_ID = 'react-native';

export interface ReactNativeSession {
  error: SyntaxProblem | null;
  index: SourceIndex | null;
}

type V<P> = ChecklistValidator<P, ReactNativeSession>;

function syntaxMessage(error: SyntaxProblem): string {
  return error.line ? `Erro de sintaxe na linha ${error.line}: ${error.message}` : `Erro de sintaxe: ${error.message}`;
}

/** Executa `check` só quando o código compila; caso contrário informa o erro de sintaxe. */
function withIndex<P>(check: (index: SourceIndex, params: P) => boolean | { passed: boolean; message?: string }): V<P>['validate'] {
  return ({ session, params }) => {
    if (!session.index) return { passed: false, message: session.error ? syntaxMessage(session.error) : undefined };
    return check(session.index, params);
  };
}

const literal = z.union([z.string(), z.number(), z.boolean()]);

const validators = {
  reactNativeCompiles: {
    description: 'O código não tem erros de sintaxe (JSX/TypeScript).',
    mode: 'static',
    params: z.object({}).passthrough(),
    exampleParams: {},
    validate: ({ session }) =>
      session.error ? { passed: false, message: syntaxMessage(session.error) } : { passed: true },
  } satisfies V<Record<string, unknown>>,

  reactNativeExportsDefaultComponent: {
    description: 'Exporta por padrão um componente (função ou classe), opcionalmente com o nome indicado.',
    mode: 'static',
    params: z.object({ name: z.string().optional() }),
    exampleParams: { name: 'App' },
    validate: withIndex((index, { name }) => {
      const def = index.defaultExport;
      if (!def || !def.isComponentLike) return false;
      return name ? def.name === name : true;
    }),
  } satisfies V<{ name?: string }>,

  reactNativeHasComponent: {
    description: 'Usa o componente JSX indicado pelo menos `min` vezes (padrão 1).',
    mode: 'static',
    params: z.object({ component: z.string().min(1), min: z.number().int().min(1).default(1) }),
    exampleParams: { component: 'Button' },
    validate: withIndex((index, { component, min }) => index.elements.filter((e) => e.name === component).length >= min),
  } satisfies V<{ component: string; min: number }>,

  reactNativeHasComponentProp: {
    description: 'Algum <component> define a prop indicada; se `value` for informado, o valor precisa ser igual.',
    mode: 'static',
    params: z.object({ component: z.string().min(1), prop: z.string().min(1), value: literal.optional() }),
    exampleParams: { component: 'Button', prop: 'title', value: 'Clique aqui' },
    validate: withIndex((index, { component, prop, value }) =>
      index.elements.some((e) => e.name === component && attributeMatches(e.attributes.get(prop), value)),
    ),
  } satisfies V<{ component: string; prop: string; value?: string | number | boolean }>,

  reactNativeHasText: {
    description: 'Algum <component> (padrão Text) exibe o texto indicado (contém, ou igual com exact: true).',
    mode: 'static',
    params: z.object({
      text: z.string().min(1),
      component: z.string().default('Text'),
      exact: z.boolean().default(false),
      caseSensitive: z.boolean().default(true),
    }),
    exampleParams: { text: 'Olá, mundo', component: 'Text' },
    validate: withIndex((index, { text, component, exact, caseSensitive }) => {
      const norm = (s: string) => (caseSensitive ? s : s.toLowerCase());
      const wanted = norm(text.replace(/\s+/g, ' ').trim());
      return index.elements.some((e) => {
        if (e.name !== component) return false;
        const actual = norm(e.text);
        return exact ? actual === wanted : actual.includes(wanted);
      });
    }),
  } satisfies V<{ text: string; component: string; exact: boolean; caseSensitive: boolean }>,

  reactNativeImports: {
    description: 'Importa do módulo indicado (padrão "react-native") todos os nomes listados.',
    mode: 'static',
    params: z.object({ module: z.string().default('react-native'), names: z.array(z.string()).default([]) }),
    exampleParams: { module: 'react-native', names: ['View', 'Text'] },
    validate: withIndex((index, { module, names }) => {
      const imported = new Set(index.imports.filter((i) => i.source === module).flatMap((i) => i.names));
      const hasModule = index.imports.some((i) => i.source === module);
      const missing = names.filter((n) => !imported.has(n));
      if (!hasModule) return false;
      return missing.length === 0 ? true : { passed: false, message: `Falta importar: ${missing.join(', ')}` };
    }),
  } satisfies V<{ module: string; names: string[] }>,

  reactNativeUsesHook: {
    description: 'Chama o hook indicado (ex.: useState), com ou sem o prefixo React.',
    mode: 'static',
    params: z.object({ hook: z.string().regex(/^use[A-Z]\w*$/, 'hook deve começar com "use" (ex.: useState)') }),
    exampleParams: { hook: 'useState' },
    validate: withIndex((index, { hook }) => index.calls.includes(hook)),
  } satisfies V<{ hook: string }>,

  reactNativeHasStyle: {
    description: 'Algum objeto de estilo (StyleSheet.create ou style inline) define a propriedade, opcionalmente com o valor.',
    mode: 'static',
    params: z.object({ property: z.string().min(1), value: literal.optional() }),
    exampleParams: { property: 'backgroundColor', value: '#fff' },
    validate: withIndex((index, { property, value }) =>
      index.objectKeys.some((entry) => entry.key === property && attributeMatches(entry.value, value)),
    ),
  } satisfies V<{ property: string; value?: string | number | boolean }>,
};

export type ReactNativeValidatorName = keyof typeof validators;

const DEFAULT_STARTER = `import { View, Text } from 'react-native';

export default function App() {
  return (
    <View>
      <Text>Comece aqui</Text>
    </View>
  );
}
`;

export const reactNativePlugin = definePlugin<QuizPlugin<ReactNativeSession>>({
  id: REACT_NATIVE_PLUGIN_ID,
  displayName: 'React Native',
  description: 'Componentes React Native com preview em moldura de celular (react-native-web).',
  version: '1.0.0',
  editorLanguage: 'typescript',
  editorFileName: 'App.tsx',
  getStarterCode: (question) => question.starterCode,
  createSession: ({ code }) => {
    const parsed = parseSource(code);
    return parsed.ok ? { error: null, index: indexSource(parsed.ast, code) } : { error: parsed.error, index: null };
  },
  validators,
  authoring: {
    defaultStarterCode: DEFAULT_STARTER,
    docsPath: 'docs/agents.md',
    regexHelpers: [
      {
        id: 'export-default-component',
        label: 'Exporta componente',
        inputLabel: 'Nome do componente',
        defaultInput: 'App',
        build: (name) => ({
          pattern: `export\\s+default\\s+function\\s+${escapeRegExp(name)}\\s*\\(`,
          flags: 'm',
          label: `Criar o componente ${name}`,
        }),
      },
      {
        id: 'uses-component',
        label: 'Usa componente',
        inputLabel: 'Componente',
        defaultInput: 'Button',
        build: (name) => ({ pattern: `<${escapeRegExp(name)}\\b`, label: `Utilizar o componente ${name}` }),
      },
      {
        id: 'defines-prop',
        label: 'Define prop com valor',
        inputLabel: 'prop=valor',
        defaultInput: 'title=Clique aqui',
        build: (input) => {
          const [prop = 'title', ...rest] = input.split('=');
          const value = rest.join('=');
          return {
            pattern: `${escapeRegExp(prop.trim())}\\s*=\\s*\\{?\\s*["'\`]${escapeRegExp(value)}["'\`]\\s*\\}?`,
            label: `Definir ${prop.trim()}="${value}"`,
          };
        },
      },
      {
        id: 'imports-from-rn',
        label: 'Importa de react-native',
        inputLabel: 'Nome importado',
        defaultInput: 'Button',
        build: (name) => ({
          pattern: `import\\s*\\{[^}]*\\b${escapeRegExp(name)}\\b[^}]*\\}\\s*from\\s*["']react-native["']`,
          label: `Importar ${name} de react-native`,
        }),
      },
      {
        id: 'uses-hook',
        label: 'Usa hook',
        inputLabel: 'Hook',
        defaultInput: 'useState',
        build: (name) => ({ pattern: `\\b${escapeRegExp(name)}\\s*\\(`, label: `Usar o hook ${name}` }),
      },
    ],
  },
});

export default reactNativePlugin;
