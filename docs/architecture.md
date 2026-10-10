# Arquitetura

## Visão geral

```
                     navegador do professor                 navegadores dos alunos
                   +-----------------------+            +-----------------------------+
                   | React (Vite)          |            | React (Vite)                |
                   | Biblioteca / Editor   |            | Entrada / Lobby / Questão   |
                   | Sala (host)           |            | Monaco + Checklist + Plugin |
                   +-----------+-----------+            +------+---------------+------+
                               |  REST /api + Socket.IO        |               |
                               v                               v               |
              +-----------------------------------------------------+          | postMessage
              | apps/server (Fastify + Socket.IO)                   |          v
              |  PackStore (JSON em disco)   RoomManager (memória)  |   iframe sandbox (preview RN)
              |  validação oficial = @codearena/core + plugins      |   Web Worker (runner HTTP)
              |  plugins listados em codearena.config.json          |
              +--------------------------+--------------------------+
                                         | stdin/stdout (JSON por linha)
                                         v
                          processo Node filho com --permission
                          (runner do plugin backend-http)
```

## Núcleo, plugins e packs

O CodeArena separa três coisas com ciclos de vida diferentes:

| | O que é | Quem cria | Onde vive | Formato |
| --- | --- | --- | --- | --- |
| **Núcleo** | Sala em tempo real, checklist, XP, interface, SDK | mantenedores | este repositório | código (TypeScript) |
| **Plugin** | Uma disciplina ou ambiente: validadores, preview, ferramentas, execução isolada | desenvolvedores | **pacote npm em repositório próprio** | código |
| **Pack** | Um conjunto de questões | professores e agentes de IA | dados da instalação (ou dentro do pacote do plugin, como exemplo) | JSON |

Regra geral: **o núcleo não conhece nenhum plugin concreto, e pack nunca contém código.** Um pack só aponta para um
`pluginId`; se o plugin não estiver instalado, a biblioteca, a importação e a sala mostram "Plugin não instalado".

Decisão registrada em [0001: Plugins como pacotes separados](./decisoes/0001-plugins-como-pacotes.md).

### Estado atual e modelo alvo

| Aspecto | Hoje | Modelo alvo |
| --- | --- | --- |
| Onde ficam os plugins | `plugins/` neste repositório | um repositório e um pacote npm por plugin |
| Como são ativados | listados em `codearena.config.json` (feito) | igual |
| Carregamento no navegador | sob demanda; plugins não listados nem entram no build (feito) | igual |
| Packs de exemplo | dentro do pacote do plugin (`packs/`), declarados no manifesto (feito) | igual |
| SDK | `schemas`, `plugin-sdk`, `core` e `plugin-host` prontos para o npm (build com tipos, changesets, workflow de publicação); falta a primeira publicação | publicados com versão semântica |
| Compatibilidade | plugin declara a faixa do SDK (`^0.1.0`); incompatível é recusado ao iniciar (feito) | igual, com SDK `1.x` |

Plugins oficiais: **`react-native`** (componentes com preview em celular) e **`backend-http`** (servidores Express validados
por requisições HTTP).

### Pacotes do núcleo

| Pacote | Responsabilidade | Depende de |
| --- | --- | --- |
| `packages/schemas` | Zod do question pack, payloads de eventos, tipos de snapshot, avatares | zod |
| `packages/plugin-sdk` | Contratos `QuizPlugin`/`ClientQuizPlugin`, `definePlugin`, `PluginRegistry`, utilitários | schemas |
| `packages/core` | Motor de checklist, XP, ranking, `Room`/`RoomManager`, lint de autoria | schemas, plugin-sdk |
| `packages/plugin-host` | Lê `codearena.config.json`, valida manifestos e versões, gera o carregamento sob demanda no Vite | zod, semver |
| `apps/server` | REST, Socket.IO, persistência de packs, **carregamento dos plugins configurados** | core, plugin-host |
| `apps/web` | Interface do professor e do aluno, **carregamento sob demanda das interfaces dos plugins** | core, plugin-host (build) |

### Anatomia de um pacote de plugin

```text
codearena-plugin-react-native/        repositório próprio
  src/index.ts        definição independente de ambiente (validadores), roda no navegador e no servidor
  src/server.ts       opcional: recursos só do servidor (ex.: executor em processo isolado)
  src/ui.tsx          ClientQuizPlugin: painéis React (preview, ferramentas)
  src/sandbox.tsx     opcional: runtime carregado dentro do iframe isolado
  packs/*.json        packs de exemplo do plugin
  docs/agents.md      guia para agentes de IA gerarem questões deste plugin
  test/
  package.json
```

O `package.json` declara o manifesto no campo `codearena`:

```json
{
  "name": "@codearena/plugin-react-native",
  "version": "1.0.0",
  "type": "module",
  "exports": {
    ".": "./dist/index.js",
    "./server": "./dist/server.js",
    "./ui": "./dist/ui.js",
    "./sandbox": "./dist/sandbox.js"
  },
  "peerDependencies": {
    "@codearena/plugin-sdk": "^1.0.0",
    "react": "^18.3.0"
  },
  "codearena": {
    "pluginId": "react-native",
    "displayName": "React Native",
    "sdk": "^1.0.0",
    "server": "./server",
    "ui": "./ui",
    "sandbox": "./sandbox",
    "packs": ["./packs/react-native-fundamentos.json", "./packs/depuracao-react-native.json"]
  }
}
```

- `server` é opcional: sem ele, o servidor usa a definição de `.` (suficiente para validadores estáticos).
- `ui` é opcional: sem ele, o navegador usa `.` sem painéis.
- `sandbox` só existe para plugins com preview em iframe isolado.
- Cada entrada tem `export default`: o plugin ou uma função que o cria (`PluginEntry`, `ClientPluginEntry` e
  `SandboxEntry` em `@codearena/plugin-sdk`). O `id` do plugin precisa ser igual a `codearena.pluginId`.
- `packs` lista os packs de exemplo, arquivos JSON dentro do pacote. O servidor os carrega como somente leitura.
- As dependências pesadas (react-native-web, simuladores, parsers) são dependências **do plugin**, nunca do núcleo.
- O SDK e o React são `peerDependencies`, para existir uma única cópia na instalação.

### Configuração da instalação

Cada instalação lista os plugins em `codearena.config.json`, na raiz:

```json
{
  "plugins": ["@codearena/plugin-react-native", "@codearena/plugin-backend-http"]
}
```

- Nomes de pacote são procurados nos `node_modules` da raiz: instale com `pnpm add -w <pacote>`.
- Caminhos locais (`"../codearena-plugin-eletrica"`), relativos ao arquivo, servem para desenvolver um plugin sem publicar.
- `CODEARENA_CONFIG=/caminho/config.json` troca o arquivo, no servidor, no build e em `pnpm validate:packs`.
- Sem o arquivo, a instalação não tem plugins (e o terminal avisa).

Ativar um plugin: `pnpm codearena plugins add <pacote ou caminho>` instala, valida o manifesto e a faixa do SDK,
grava a configuração e roda o build (desfaz tudo se o plugin for incompatível). Também há `plugins list` e
`plugins remove`. Em `pnpm dev`, o Vite reinicia sozinho quando a configuração muda.

### Carregamento

```text
codearena.config.json
   |                                    servidor (ao iniciar)
   +--> para cada plugin: lê o manifesto -> confere pluginId e faixa do SDK -> import(server ou .)
   |                       -> confere o id -> registra na PluginRegistry
   |                       (falha em um plugin: erro no log, servidor continua, packs dele ficam "não instalado")
   |                       -> carrega os packs de exemplo do manifesto (somente leitura)
   |
   +--> build do navegador (codearenaPlugins, de @codearena/plugin-host/vite)
          gera o módulo virtual "virtual:codearena/plugins":
            installedPlugins  id, nome e descrição de cada plugin, sem carregar o código
            uiLoaders         { "react-native": () => import(".../ui"), ... }
            sandboxLoaders    runtimes do iframe isolado (sandbox.html)
          a interface só chama import() quando abre uma questão daquele plugin
          (o aluno baixa durante a contagem regressiva; o editor de packs, ao escolher o plugin)
```

- **O servidor continua sendo a fonte oficial.** A validação de uma resposta usa a definição de servidor do plugin.
- **Mesmo resultado nos dois lados:** os validadores vêm do mesmo pacote no navegador e no servidor.
- **Código de aluno nunca roda no processo principal.** Plugins que executam código usam o padrão de executor isolado
  (Worker no navegador, processo restrito no servidor), como o `backend-http`.

### Packs

Passo a passo para professores (instalar um plugin, criar e compartilhar packs):
[Plugins e packs: como funciona](./guia/plugins-e-packs.md).

- **Origem:** packs de exemplo distribuídos pelos plugins (somente leitura, podem ser duplicados) e packs criados ou
  importados pelos professores (`data/packs/`). No futuro, um catálogo comunitário de packs em repositório próprio,
  também só com JSON.
- **Ligação com o plugin:** `pack.pluginId` (e `question.pluginId`, se uma questão usar outro plugin).
- **Planejado:** `pack.requires` com a faixa de versão do plugin (ex.: `{ "react-native": ">=1.2.0" }`), para avisar
  quando um pack usa validadores que só existem em versões mais novas. Ainda não faz parte do schema.

### Versionamento e compatibilidade

- Os quatro pacotes do núcleo (`schemas`, `plugin-sdk`, `core`, `plugin-host`) sobem de versão juntos, com
  [changesets](https://github.com/changesets/changesets) (`pnpm changeset`). No workspace eles apontam para `src/`;
  no npm, para `dist/` com tipos (campo `publishConfig.exports`).
- `pnpm check:packages` (também no CI) empacota os quatro, instala num projeto vazio e compila um plugin de teste com
  `moduleResolution: NodeNext`, para garantir que o que vai para o npm funciona fora do monorepo.
- O workflow `.github/workflows/release.yml` abre o PR "Versionar pacotes" e, depois do merge, publica no npm com
  proveniência.

- `@codearena/plugin-sdk`, `@codearena/schemas` e `@codearena/core` seguem versionamento semântico. Quebra de contrato
  só em versão major, com nota de migração.
- O plugin declara `codearena.sdk`; o servidor e o build recusam plugin com faixa incompatível, informando as duas versões.
- O formato de pack é versionado pelo schema; packs antigos continuam importáveis enquanto a major do schema for a mesma.

### Segurança dos plugins

Por padrão, plugin é **código confiável**, como qualquer dependência npm: roda no processo do servidor e na página do
app. Para um plugin de terceiro que você não revisou, use o **modo isolado**:

```json
{ "plugins": ["@codearena/plugin-react-native", { "package": "codearena-plugin-eletrica", "isolated": true }] }
```

ou `pnpm codearena plugins add codearena-plugin-eletrica --isolated`.

| Onde | Modo normal | Modo isolado |
| --- | --- | --- |
| Servidor | importado no processo do servidor | processo Node filho com `--permission`: lê só a pasta do plugin e `node_modules`, não escreve em disco, não cria processos nem workers, ambiente vazio, 128 MB, 5 s por chamada (travou: o processo é encerrado e reiniciado) |
| Navegador | módulo carregado na página do app | iframe `sandbox="allow-scripts"` (origem opaca) servido por `plugin-frame.html`: sem acesso ao DOM, cookies, armazenamento ou sessão do app |
| Comunicação | chamadas diretas | mensagens (IPC no servidor, `postMessage` no navegador) com dados simples: questão pública, código, item, parâmetros |

O app nunca importa um plugin isolado: o módulo `virtual:codearena/plugins` não tem loader para ele, e só
`plugin-frame.html` importa `virtual:codearena/isolated-plugins`. O app usa um proxy (`createPluginProxy`, em
`@codearena/plugin-host/isolation`) que encaminha cada chamada; os painéis do plugin aparecem como iframes.

Limitações do modo isolado:

- O plugin precisa estar compilado (entradas `.js`).
- `getStarterCode` não é chamado: o código inicial é o `starterCode` da questão. As ajudas de regex do plugin não
  aparecem no editor manual (há chamadas síncronas que não atravessam o isolamento).
- O plugin não pode criar processos no servidor (um executor como o do `backend-http` não funciona isolado).
- O Node 22 não bloqueia a rede no modelo de permissões; para impedir acesso à rede, rode o servidor num contêiner
  ou com firewall.
- No navegador, um laço infinito num validador é cortado em 5 s (o iframe é recarregado), mas pode travar a aba nesse
  intervalo se o navegador rodar o iframe na mesma thread da página.

Plugins que executam código de alunos precisam, além disso, do isolamento descrito em
[`SECURITY.md`](https://github.com/Gabrielll04/CodeArena/blob/HEAD/SECURITY.md).

### Etapas da migração

Cada etapa mantém o app funcionando e os testes passando.

| # | Etapa | Resultado |
| --- | --- | --- |
| 1 | `codearena.config.json` e carregamento sob demanda, ainda com os plugins em `plugins/` (**concluída**) | Bundle sem plugins não usados; o app não importa nenhum plugin diretamente |
| 2 | Build (`dist` + tipos) e publicação de `schemas`, `plugin-sdk`, `core` e `plugin-host` (**pronta**; falta criar a organização `@codearena` no npm e o segredo `NPM_TOKEN`) | Plugins podem depender das versões publicadas |
| 3 | Packs de exemplo para dentro dos plugins, com `codearena.packs` no manifesto (**concluída**) | `content/packs/` sai do núcleo |
| 4 | `react-native` e `backend-http` para repositórios próprios | O núcleo os instala como dependências; E2E usa as versões publicadas |
| 5 | Modelo `create-codearena-plugin` e `pnpm codearena plugins add` (**concluída**) | Criar e instalar plugin sem tocar no núcleo |
| 6 | Modo isolado para plugins de terceiros (**concluída**) | Plugins não revisados sem acesso ao app nem ao servidor |

Enquanto a migração não termina, um plugin novo segue o caminho atual descrito em
[Criando um plugin](./plugins/creating-a-plugin.md).

## Estados da sala

```
lobby --start--> countdown --(startsAt)--> question --(todos acertaram | tempo | professor)--> review
                                                                                          |
                     review --start (há próxima)--> countdown                              |
                     qualquer fase --end-session--> ended  <-------------------------------+
```

- O servidor define `startsAt = agora + countdownSeconds` e `endsAt = startsAt + timeLimitSeconds`.
- Os clientes calculam o deslocamento do relógio a partir de `serverNow` em cada snapshot; o timer exibido usa o relógio do servidor.
- Respostas antes de `startsAt` são recusadas; depois de `endsAt` recebem status `late` e 0 XP.
- O horário de chegada é registrado **antes** da validação; o tempo de validação não penaliza o aluno.
  Ao encerrar, o servidor espera validações em andamento que chegaram dentro do prazo.
- Encerramento automático quando todos os alunos **conectados** têm resposta aceita.

## Pontuação

```
xp = baseXP + round(speedBonusMax * tempoRestanteMs / tempoTotalMs)   (+ bônus de sequência, se ligado)
```

O XP é provisório na aceitação e somado ao total no encerramento da questão. Placar ordenado por XP total e,
no empate, pelo horário da última resposta correta (mais cedo primeiro). Empate total compartilha a posição.

## Eventos em tempo real

Cliente -> servidor (todos com ack `{ ok: true, ... } | { ok: false, error, code }`, payload validado com Zod):

| Evento | Quem | Payload |
| --- | --- | --- |
| `room:create` | professor | `{ packId, questionIds?, settings? }` -> `{ code, hostToken, snapshot }` |
| `room:host` | professor | `{ code, hostToken }` (retomar após recarregar) |
| `room:join` | aluno | `{ code, name, avatar, playerToken? }` -> `{ playerId, playerToken, snapshot }` |
| `room:leave` | aluno | - |
| `host:start-question` / `host:finish-question` / `host:end-session` | professor | `{ code, hostToken }` |
| `host:update-settings` | professor | `{ code, hostToken, settings }` |
| `host:kick` | professor | `{ code, hostToken, playerId }` |
| `question:progress` | aluno | `{ done, total, doneIds? }` (contagem e ids dos itens concluídos, sem código; informativo) |
| `question:submit` | aluno | `{ code }` -> `{ answer }` |

Servidor -> cliente:

| Evento | Destino | Conteúdo |
| --- | --- | --- |
| `room:update` | cada participante | snapshot da sala na visão de quem recebe (professor: progresso; aluno: `me`) |
| `player:joined` / `player:left` | todos | jogador |
| `question:loaded` | todos | questão pública (sem `solution`), `startsAt`, `endsAt` |
| `question:started` | todos | início efetivo (fim da contagem) |
| `question:progress` | professor | `{ playerId, done, total, answered, doneIds }` |
| `question:submitted` | professor | quem enviou e se foi aceito |
| `question:validated` | o aluno | resultado da validação oficial por item |
| `question:finished` | todos | resultados (incluindo `items`: conclusão e tempo mediano por item), placar e `solution` |
| `leaderboard:update` | todos | placar |
| `session:ended` | todos | relatório final |
| `room:closed` | aluno removido | motivo |

Canais Socket.IO: `room:<code>` (todos), `host:<code>`, `player:<code>:<playerId>`.

## Reconexão

- Aluno: `playerToken` fica no `localStorage`. Ao reconectar (ou recarregar), o cliente reenvia `room:join` com o token e
  recebe o mesmo jogador, com XP e resposta atual. O rascunho do código fica no `sessionStorage` por questão.
- Professor: `hostToken` fica no `localStorage` por sala; `/host/<code>` retoma a sala.
- O estado das salas fica em memória do servidor. Reiniciar o servidor encerra as salas (packs ficam em disco).
  Salas inativas por 6 h são removidas.

## Persistência

`PackStore` grava um arquivo JSON por pack em `data/packs/` (configurável com `CODEARENA_DATA_DIR`), com escrita
atômica (arquivo temporário + rename). Os packs de exemplo vêm do manifesto (`codearena.packs`) de cada plugin
carregado, somente leitura, com id `exemplo-<nome do arquivo>`. `CODEARENA_CONTENT_DIR` acrescenta uma pasta de exemplos
própria da instalação.
A interface de armazenamento é pequena (`list/get/create/update/delete`) para permitir trocar por SQLite depois.

## Segurança

| Risco | Medida |
| --- | --- |
| Aluno alterar pontuação | XP, tempo e validação calculados no servidor; o cliente só envia o código |
| Resposta forjada | O servidor reexecuta a checklist completa com os mesmos plugins |
| Código do aluno no servidor | Processo Node filho com `--permission` (sem fs, child_process, workers), env vazio, 64 MB, timeouts; APIs de rede removidas do escopo |
| Código do aluno no navegador | Preview em iframe `sandbox="allow-scripts"` (origem opaca: sem cookies, localStorage ou DOM do app); runner HTTP em Web Worker descartável; guarda contra loops infinitos no preview |
| Entrada maliciosa | Todos os payloads validados com Zod; código limitado a 50 000 caracteres; Socket.IO com limite de 256 KB por mensagem |
| XSS | React escapa todo conteúdo; enunciados são texto (crases viram `<code>` sem HTML) |
| Controle da sala | Ações de professor exigem `hostToken` |
| Exposição do código | O professor recebe apenas contagens e ids de itens concluídos; os ids informados pelo cliente só alimentam a revisão da turma e nunca a pontuação |

Limitação documentada: o modelo de permissões do Node não bloqueia rede de saída. Em ambiente público, rode o servidor
(ou só o runner) em contêiner sem rede.
