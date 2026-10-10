# Criando um plugin

Plugins adicionam disciplinas ou ambientes de execução ao CodeArena sem alterar o núcleo (`packages/core`,
`packages/schemas`). Um plugin pode fornecer:

- linguagem e nome de arquivo do editor;
- validadores de checklist (`pluginRule`), estáticos ou dinâmicos;
- painel de preview e/ou painel de ferramentas (React);
- verificação extra no servidor antes de aceitar uma resposta;
- ajudas de regex e código inicial para o editor manual de questões.

O contrato está em `packages/plugin-sdk` (`@codearena/plugin-sdk` e `@codearena/plugin-sdk/ui`).

::: info Plugin é um pacote separado
Pela decisão [0001: Plugins como pacotes separados](../decisoes/0001-plugins-como-pacotes.md), cada plugin é um pacote
npm com repositório próprio, ativado por instalação em `codearena.config.json`. O núcleo não traz as dependências de
nenhum plugin. A migração está planejada (ver [Arquitetura](../architecture.md#etapas-da-migracao)); enquanto ela não
termina, siga a seção "Hoje (durante a migração)" abaixo.
:::

## Anatomia (modelo alvo)

```text
codearena-plugin-meu-plugin/      repositório próprio
  src/index.ts      definição independente de ambiente (roda no navegador e no servidor)
  src/server.ts     opcional: recursos só do servidor (ex.: executor em processo isolado)
  src/ui.tsx        ClientQuizPlugin: plugin + painéis React (só navegador)
  src/sandbox.tsx   opcional: runtime carregado dentro do iframe isolado de preview
  packs/*.json      packs de exemplo do plugin
  docs/agents.md    guia para agentes de IA gerarem questões deste plugin
  test/validators.test.ts
  package.json
```

```json
{
  "name": "codearena-plugin-meu-plugin",
  "version": "1.0.0",
  "type": "module",
  "exports": { ".": "./dist/index.js", "./ui": "./dist/ui.js" },
  "dependencies": { "zod": "^3.25.76" },
  "peerDependencies": { "@codearena/plugin-sdk": "^1.0.0", "@codearena/schemas": "^1.0.0", "react": "^18.3.0" },
  "devDependencies": { "@codearena/core": "^1.0.0" },
  "codearena": {
    "pluginId": "meu-plugin",
    "sdk": "^1.0.0",
    "ui": "./ui",
    "packs": ["./packs/meu-plugin-basico.json"]
  }
}
```

- O campo `codearena` é o manifesto: `pluginId`, faixa do SDK, entradas `server`/`ui`/`sandbox` (opcionais) e packs de exemplo.
- Dependências pesadas (simuladores, parsers, bibliotecas de desenho) ficam **no plugin**. Quem não instala o plugin não as baixa.
- SDK, schemas e React são `peerDependencies`, para existir uma única cópia na instalação.
- Nomes: `@codearena/plugin-<id>` para os oficiais; `codearena-plugin-<id>` para os da comunidade.

### Hoje (durante a migração)

Até a etapa 4 da migração, desenvolva o plugin em `plugins/<id>/` neste repositório, com o mesmo layout e
`"@codearena/plugin-sdk": "workspace:*"` no lugar das versões publicadas. Mantenha o plugin autocontido (nada de
importar de `apps/` nem de outro plugin) para que ele possa sair para um repositório próprio sem mudanças.

## Contrato (`QuizPlugin`)

```ts
interface QuizPlugin<S = unknown> {
  id: string;                 // usado em pack.pluginId
  displayName: string;
  description: string;
  version: string;
  editorLanguage: string;     // linguagem do Monaco
  editorFileName?: string;    // ex.: "App.tsx", "main.py"
  getStarterCode(question): string;
  validators?: Record<string, ChecklistValidator<any, S>>;
  createSession?(input): S | Promise<S>;   // estado compartilhado numa rodada de avaliação
  disposeSession?(session: S): void | Promise<void>;
  validateSubmission?(code, question): Promise<{ valid: boolean; message?: string }>; // só no servidor
  authoring?: { regexHelpers?: RegexHelper[]; defaultStarterCode?: string; docsPath?: string };
}

interface ChecklistValidator<P, S> {
  description: string;
  mode: 'static' | 'dynamic';  // static: só texto/AST (rápido). dynamic: executa código.
  params?: ZodType<P>;         // params inválidos viram item "failed" com explicação
  exampleParams?: object;      // preenchido no editor manual
  validate(ctx: { code; question; item; params: P; session: S; signal? }): boolean | { passed: boolean; message?: string } | Promise<...>;
}

interface ClientQuizPlugin<S> extends QuizPlugin<S> {
  previewTitle?: string;
  sidePanelTitle?: string;
  renderPreview?(ctx: PluginUIContext): ReactNode;
  renderSidePanel?(ctx: PluginUIContext): ReactNode;
}

interface PluginUIContext {
  question: PublicQuestion;    // sem a solução
  code: string;
  readOnly: boolean;
  evaluation: ChecklistEvaluationResult | null;
  mode: 'play' | 'authoring' | 'preview';
}
```

Plugins recebem apenas esses dados: não acessam stores, sockets, tokens nem o estado da sala.

## Exemplo completo: plugin `python-basico`

Validação estática de funções Python (sem executar código).

`plugins/python-basico/src/index.ts`:

```ts
import { z } from 'zod';
import { definePlugin, escapeRegExp, type QuizPlugin } from '@codearena/plugin-sdk';

export const pythonPlugin = definePlugin<QuizPlugin>({
  id: 'python-basico',
  displayName: 'Python básico',
  description: 'Funções e estruturas simples em Python, com validação estática.',
  version: '1.0.0',
  editorLanguage: 'python',
  editorFileName: 'main.py',
  getStarterCode: (question) => question.starterCode,
  validators: {
    pythonDefinesFunction: {
      description: 'Define uma função com o nome e o número de parâmetros indicados.',
      mode: 'static',
      params: z.object({ name: z.string().regex(/^\w+$/), arity: z.number().int().min(0).optional() }),
      exampleParams: { name: 'somar', arity: 2 },
      validate: ({ code, params }) => {
        const match = new RegExp(`^def\\s+${escapeRegExp(params.name)}\\s*\\(([^)]*)\\)\\s*:`, 'm').exec(code);
        if (!match) return false;
        if (params.arity === undefined) return true;
        const count = match[1]!.split(',').map((p) => p.trim()).filter(Boolean).length;
        return count === params.arity ? true : { passed: false, message: `Esperado ${params.arity} parâmetros, encontrado ${count}` };
      },
    },
  },
  authoring: {
    defaultStarterCode: 'def resolver():\n    pass\n',
    regexHelpers: [
      {
        id: 'returns',
        label: 'Usa return',
        build: () => ({ pattern: '^\\s+return\\b', flags: 'm', label: 'Retornar um valor com return' }),
      },
    ],
  },
});
```

`plugins/python-basico/src/ui/index.tsx`:

```tsx
import type { ClientQuizPlugin } from '@codearena/plugin-sdk/ui';
import { pythonPlugin } from '../index';

export const pythonClientPlugin: ClientQuizPlugin = {
  ...pythonPlugin,
  sidePanelTitle: 'Referência',
  renderSidePanel: ({ question }) => (
    <div className="space-y-2 p-4 text-sm text-white/80">
      <p className="font-semibold">Lembretes de Python</p>
      <p>Indente o corpo da função com 4 espaços e termine a assinatura com ":".</p>
      <p className="text-white/50">{question.checklist.length} itens nesta questão.</p>
    </div>
  ),
};
```

## Ativação

**Modelo alvo:** nenhuma linha do núcleo muda. A instalação adiciona o pacote e o lista na configuração:

```bash
pnpm add codearena-plugin-python-basico
```

```json
{ "plugins": ["@codearena/plugin-react-native", "@codearena/plugin-backend-http", "codearena-plugin-python-basico"] }
```

Depois, `pnpm build`. O servidor lê o manifesto, confere a faixa do SDK e registra o plugin; o navegador só baixa a
interface dele ao abrir uma questão `python-basico`. Durante o desenvolvimento, a lista aceita um caminho local
(`"../codearena-plugin-python-basico"`).

**Hoje (durante a migração):** o registro ainda é manual, em dois arquivos.

`apps/server/src/plugins.ts` (validação oficial):

```ts
import { pythonPlugin } from '@codearena/plugin-python-basico';
return new PluginRegistry([reactNativePlugin, createBackendHttpServerPlugin(), pythonPlugin]);
```

`apps/web/src/plugins/registry.tsx` (interface):

```ts
import { pythonClientPlugin } from '@codearena/plugin-python-basico/ui';
export const clientPlugins = new PluginRegistry([..., pythonClientPlugin]);
```

Adicione `"@codearena/plugin-python-basico": "workspace:*"` às dependências de `apps/server` e `apps/web` e rode `pnpm install`.
Se o plugin usa um iframe isolado de preview, registre o runtime em `apps/web/src/plugins/sandboxes.ts`
(veja o plugin `react-native`). Se o painel usa classes Tailwind, elas já são incluídas (`plugins/*/src/**`).

Packs que apontam para um plugin não registrado mostram o erro "Plugin não instalado" na biblioteca, na importação e na sala.

## Packs do plugin

Plugin é código; pack é conteúdo. Os packs de exemplo de um plugin ficam **dentro do pacote** (`packs/*.json`) e são
declarados em `codearena.packs`. O servidor os carrega como somente leitura; o professor pode duplicá-los para editar.

- Packs de exemplo seguem as mesmas regras de qualquer pack: JSON válido para `QuestionPackSchema`, sem código executável
  além de `starterCode` e `solution`.
- Packs de professores não dependem do repositório do plugin: são importados pela interface ou pela API e vivem nos dados da instalação.
- Hoje os packs oficiais ainda estão em `content/packs/`; eles passam para os pacotes dos plugins na etapa 3 da migração.

## Testes

```ts
import { evaluateChecklist } from '@codearena/core';
import { QuestionSchema } from '@codearena/schemas';
import { pythonPlugin } from '../src';

const { solution, ...question } = QuestionSchema.parse({
  id: 'somar', prompt: 'Crie somar(a, b).', timeLimitSeconds: 60, baseXP: 100, speedBonusMax: 100,
  checklist: [{ id: 'def', label: 'Definir somar(a, b)', rule: { type: 'pluginRule', validator: 'pythonDefinesFunction', params: { name: 'somar', arity: 2 } } }],
});
const result = await evaluateChecklist('def somar(a, b):\n    return a + b\n', { ...question, pluginId: 'python-basico' }, { plugin: pythonPlugin });
expect(result.allRequiredDone).toBe(true);
```

Rode também `pnpm validate:packs` com um pack de exemplo do seu plugin depois de registrá-lo no servidor.

## Validadores dinâmicos (que executam código)

- Execute o código fora da thread da interface (Web Worker) e, no servidor, fora do processo principal
  (processo filho, contêiner ou serviço externo), sempre com limite de tempo e memória.
- Use `createSession` para iniciar a execução uma vez por rodada e `disposeSession` para encerrar.
- Se o ambiente não estiver disponível, falhe com mensagem explícita (nunca aprove por padrão).
- Use o plugin `backend-http` como referência: `BackendExecutor` com implementação em Worker (`src/ui/workerExecutor.ts`)
  e em processo Node com permissões restritas (`src/server/childProcessExecutor.ts`), executando apps Express.

## Checklist de publicação

- [ ] `definePlugin` passa (id em kebab-case, validadores com `mode`).
- [ ] Validadores com `params` em Zod e mensagens curtas em português.
- [ ] Mesmo resultado no navegador e no servidor para o mesmo código.
- [ ] Testes no próprio pacote (`test/`).
- [ ] Manifesto `codearena` com `pluginId`, faixa do SDK e packs de exemplo.
- [ ] `docs/agents.md` no pacote com validadores, parâmetros, limites e exemplos de questões.
- [ ] Packs de exemplo em `packs/` aprovados por `pnpm validate:packs`.
- [ ] Nenhuma dependência nova no núcleo.
