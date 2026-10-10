# Criando um plugin

Plugins adicionam disciplinas ou ambientes de execução ao CodeArena sem alterar o núcleo (`packages/core`,
`packages/schemas`). Um plugin pode fornecer:

- linguagem e nome de arquivo do editor;
- validadores de checklist (`pluginRule`), estáticos ou dinâmicos;
- painel de preview e/ou painel de ferramentas (React);
- verificação extra no servidor antes de aceitar uma resposta;
- ajudas de regex e código inicial para o editor manual de questões.

Para o lado de quem usa o plugin (instalar e criar packs com ele), veja
[Plugins e packs: como funciona](../guia/plugins-e-packs.md).

O contrato está em `packages/plugin-sdk` (`@codearena/plugin-sdk` e `@codearena/plugin-sdk/ui`).

::: info Plugin é um pacote separado
Pela decisão [0001: Plugins como pacotes separados](../decisoes/0001-plugins-como-pacotes.md), cada plugin é um pacote
npm com repositório próprio, ativado por instalação em `codearena.config.json`. O núcleo não traz as dependências de
nenhum plugin. A ativação por `codearena.config.json` e o carregamento sob demanda já funcionam; a saída dos plugins
para repositórios próprios ainda está em andamento (ver [Arquitetura](../architecture.md#etapas-da-migracao)).
Enquanto isso, siga as seções "Hoje (durante a migração)".
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
    "displayName": "Meu plugin",
    "sdk": "^1.0.0",
    "ui": "./ui",
    "packs": ["./packs/meu-plugin-basico.json"]
  }
}
```

- O campo `codearena` é o manifesto: `pluginId`, `displayName`, faixa do SDK (`sdk`), entradas `server`/`ui`/`sandbox`
  (opcionais, subcaminhos de `exports`) e packs de exemplo (`packs`, lido a partir da etapa 3 da migração).
- Cada entrada tem um `export default`:
  - `.` e `server`: o plugin (`QuizPlugin`) ou uma função sem argumentos que o cria (tipo `PluginEntry`).
  - `ui`: o `ClientQuizPlugin` ou uma função que recebe `{ sandboxUrl }` e o cria (tipo `ClientPluginEntry`).
  - `sandbox`: a função que monta o preview dentro do iframe isolado (tipo `SandboxEntry`).
- Sem `server`, o servidor usa `.`; sem `ui`, o navegador usa `.` sem painéis.
- Dependências pesadas (simuladores, parsers, bibliotecas de desenho) ficam **no plugin**. Quem não instala o plugin não as baixa.
- SDK, schemas e React são `peerDependencies`, para existir uma única cópia na instalação.
- Nomes: `@codearena/plugin-<id>` para os oficiais; `codearena-plugin-<id>` para os da comunidade.

### Hoje (durante a migração)

Até a etapa 4 da migração, desenvolva o plugin em `plugins/<id>/` neste repositório, com o mesmo manifesto e
`"@codearena/plugin-sdk": "workspace:*"` no lugar das versões publicadas. Enquanto o SDK está em `0.x`, declare
`"sdk": "^0.1.0"`. Mantenha o plugin autocontido (nada de importar de `apps/` nem de outro plugin) para que ele possa
sair para um repositório próprio sem mudanças. Os plugins `react-native` e `backend-http` já seguem esse formato.

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

const pythonClientPlugin: ClientQuizPlugin = {
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

export default pythonClientPlugin;
```

E no fim de `src/index.ts`: `export default pythonPlugin;`.

## Ativação

Nenhuma linha do núcleo muda. A instalação adiciona o pacote **na raiz** e o lista em `codearena.config.json`:

```bash
pnpm add -w codearena-plugin-python-basico
```

```json
{ "plugins": ["@codearena/plugin-react-native", "@codearena/plugin-backend-http", "codearena-plugin-python-basico"] }
```

Depois, `pnpm build` (em `pnpm dev`, o Vite reinicia sozinho quando a configuração muda). O servidor lê o manifesto,
confere a faixa do SDK e registra o plugin; o navegador só baixa a interface dele ao abrir uma questão `python-basico`.
A lista também aceita um caminho local, relativo ao arquivo de configuração (`"../codearena-plugin-python-basico"`),
para desenvolver sem publicar.

**Hoje (durante a migração),** com o plugin em `plugins/python-basico/`:

```bash
pnpm add -w @codearena/plugin-python-basico@workspace:*
```

e acrescente `"@codearena/plugin-python-basico"` em `codearena.config.json`. O runtime de preview (entrada `sandbox`) e
as classes Tailwind dos painéis são incluídos automaticamente a partir do manifesto.

Problemas ao carregar (pacote não instalado, manifesto inválido, SDK incompatível, id diferente do manifesto) aparecem
no log do servidor e no terminal do Vite; os outros plugins continuam funcionando. Packs que apontam para um plugin
não carregado mostram "Plugin não instalado" na biblioteca, na importação e na sala.

## Packs do plugin

Plugin é código; pack é conteúdo. Os packs de exemplo de um plugin ficam **dentro do pacote** (`packs/*.json`) e são
declarados em `codearena.packs`. O servidor os carrega como somente leitura; o professor pode duplicá-los para editar.

- Packs de exemplo seguem as mesmas regras de qualquer pack: JSON válido para `QuestionPackSchema`, sem código executável
  além de `starterCode` e `solution`.
- Packs de professores não dependem do repositório do plugin: são importados pela interface ou pela API e vivem nos dados da instalação.
- O id de um pack de exemplo é `exemplo-<nome do arquivo>`: use nomes de arquivo que não colidam com os de outros plugins
  (ex.: prefixe com o id do plugin).
- O teste `test/packs.test.ts` dos plugins oficiais valida cada pack do manifesto com `lintQuestion`; copie-o para o seu plugin.

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

Rode também `pnpm validate:packs` com um pack de exemplo do seu plugin depois de ativá-lo em `codearena.config.json`.

## Validadores dinâmicos (que executam código)

- Execute o código fora da thread da interface (Web Worker) e, no servidor, fora do processo principal
  (processo filho, contêiner ou serviço externo), sempre com limite de tempo e memória.
- Use `createSession` para iniciar a execução uma vez por rodada e `disposeSession` para encerrar.
- Se o ambiente não estiver disponível, falhe com mensagem explícita (nunca aprove por padrão).
- Use o plugin `backend-http` como referência: `BackendExecutor` com implementação em Worker (`src/ui/workerExecutor.ts`)
  e em processo Node com permissões restritas (`src/server/childProcessExecutor.ts`), executando apps Express.

## Checklist de publicação

- [ ] `definePlugin` passa (id em kebab-case, validadores com `mode`).
- [ ] Cada entrada do manifesto tem `export default`, e o `id` do plugin é igual a `codearena.pluginId`.
- [ ] Validadores com `params` em Zod e mensagens curtas em português.
- [ ] Mesmo resultado no navegador e no servidor para o mesmo código.
- [ ] Testes no próprio pacote (`test/`).
- [ ] Manifesto `codearena` com `pluginId`, faixa do SDK e packs de exemplo.
- [ ] `docs/agents.md` no pacote com validadores, parâmetros, limites e exemplos de questões.
- [ ] Packs de exemplo em `packs/`, listados em `codearena.packs` e aprovados por `pnpm validate:packs`.
- [ ] Nenhuma dependência nova no núcleo.
