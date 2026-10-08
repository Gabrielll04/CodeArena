# CodeArena

Desafios de programação ao vivo, no estilo Kahoot. O professor abre uma sala; os alunos entram com um código de 6 dígitos
e respondem **escrevendo código**. Uma **checklist automática** marca cada passo conforme o aluno escreve; quando todos os itens
obrigatórios estão concluídos, a resposta é enviada, o servidor valida de novo e concede XP por corretude e velocidade.

- Motor de checklist determinístico (`contains`, `regex`, `notContains`, `pluginRule`), o mesmo no navegador e no servidor.
- Multiplayer em tempo real (Socket.IO) com servidor como fonte oficial de tempo e pontuação.
- Arquitetura de plugins: `react-native` (preview em celular) e `backend-http` (cliente HTTP e validação por requisições).
- Importação/exportação de packs em JSON validados com Zod, editor manual com teste ao vivo e avisos de qualidade.
- Documentação para agentes de IA gerarem questões e plugins (`AGENTS.md`, `docs/agents/`).

## Como funciona (telas)

Todas as imagens são geradas por uma sessão real com `pnpm screenshots` (ver [Atualizando as imagens](#atualizando-as-imagens)).

### Plugin `react-native`: checklist por AST e preview em celular

| Checklist parcial | Erro mostrado no preview |
| --- | --- |
| ![Primeiro item concluído ao escrever export default function App](docs/images/rn-01-checklist-parcial.png) | ![Erro de sintaxe no preview e item de sintaxe pendente](docs/images/rn-02-erro-no-preview.png) |
| Escrever `export default function App()` marca o item na hora. | Erro de sintaxe aparece no preview sem derrubar o app, e a checklist mostra a linha do erro. |

| Resposta aceita | Preview interativo com estado |
| --- | --- |
| ![Resposta registrada com XP e botão renderizado no preview](docs/images/rn-03-resposta-aceita.png) | ![Contador com useState funcionando no preview](docs/images/rn-04-contador-com-estado.png) |
| Checklist completa: o servidor valida de novo, concede XP e trava o editor. | O preview executa o código do aluno (iframe isolado); aqui o botão foi tocado 3 vezes. |

### Plugin `backend-http`: cliente HTTP e validação por requisições

| Requisição falhando | Resposta aceita |
| --- | --- |
| ![Cliente HTTP mostrando status 503 e item da checklist falhando](docs/images/backend-01-requisicao-falhando.png) | ![Cliente HTTP com status 200, console e resposta aceita](docs/images/backend-02-resposta-aceita.png) |
| O item dinâmico falha com a explicação ("Esperado status 200, recebido 503"). | Rotas detectadas, resposta (status, headers, body) e console do servidor do aluno. |

![Resposta fixa recusada por teste com outro id](docs/images/backend-03-resposta-decorada-recusada.png)

Uma resposta "decorada" (sempre `{ "id": "42" }`) passa em `/users/42`, mas falha em `/users/7`: a checklist testa comportamento, não só texto.

### Sala ao vivo

| Lobby do aluno | Lobby do professor |
| --- | --- |
| ![Lobby com alunos entrando](docs/images/06-lobby-aluno.png) | ![Código da sala e lista de alunos](docs/images/07-lobby-professor.png) |

| Professor acompanhando | Placar do professor |
| --- | --- |
| ![Progresso por aluno sem mostrar código](docs/images/09-professor-acompanhando.png) | ![Placar com XP ganho e posições](docs/images/10-placar-professor.png) |

Mais telas: [`docs/images`](docs/images) (home, biblioteca, importação com erros, editor de questões, relatório final).

## Rodando localmente

Requisitos: **Node.js 22.13+** e **pnpm 10** (`corepack enable`).

```bash
pnpm install

# desenvolvimento: API + Socket.IO em :3001 e Vite em :5173 (com proxy)
pnpm dev
# abra http://localhost:5173

# produção: build do frontend + servidor único em :3000
pnpm build
pnpm start
# abra http://localhost:3000 (alunos na mesma rede usam o IP exibido no log)
```

Variáveis opcionais: `PORT`, `HOST`, `CODEARENA_DATA_DIR` (packs criados; padrão `./data`),
`CODEARENA_CONTENT_DIR` (packs de exemplo; padrão `./content/packs`), `CODEARENA_LOG=silent`.

## Usando

**Professor:** `/teacher` - importe um JSON ou crie um pack, clique em **Abrir sala**, projete o código, inicie as questões e
acompanhe o progresso. Ao final, exporte o relatório (CSV/JSON).

**Aluno:** `/join` - código da sala, nome e avatar. Responda no editor; a checklist marca sozinha e a resposta é enviada ao completar.

Packs de exemplo: `content/packs/react-native-fundamentos.json` (5 questões) e `content/packs/backend-http-basico.json` (4 questões).

## Estrutura

```text
apps/
  server/          Fastify + Socket.IO, PackStore, validação oficial
  web/             React + Vite + Tailwind + Zustand + Framer Motion + Monaco
packages/
  schemas/         Zod do question pack e contratos de eventos
  plugin-sdk/      Contratos e registro de plugins
  core/            Checklist, XP, ranking, ciclo de vida da sala, lint de autoria
plugins/
  react-native/    Validadores AST + preview isolado (react-native-web)
  backend-http/    Runtime Express/Fastify + Worker + processo Node restrito + cliente HTTP
content/packs/     Packs de exemplo (seed)
docs/
  agents/          Instruções para agentes de IA gerarem conteúdo
  plugins/         Como criar plugins
  content/         Guia de autoria para professores
  architecture.md  Arquitetura, eventos, estados, segurança
e2e/               Testes Playwright dos fluxos críticos
scripts/           validate-packs
AGENTS.md
```

Detalhes em [`docs/architecture.md`](docs/architecture.md).

## Testes e qualidade

```bash
pnpm typecheck          # TypeScript estrito em todos os pacotes
pnpm test               # Vitest: schema, checklist, XP, ciclo da sala, plugins, servidor Socket.IO
pnpm test:e2e           # Playwright: build de produção + sala com 2 alunos, backend, importação
pnpm validate:packs     # valida content/packs (ou arquivos passados) contra schema e solução
```

Para o Playwright usar um Chromium já instalado: `PLAYWRIGHT_CHROMIUM_PATH=/caminho/chromium pnpm test:e2e`.

### Atualizando as imagens

```bash
pnpm build
pnpm screenshots   # sobe um servidor temporário na porta 3200 e regrava docs/images/*.png
```

O script (`scripts/screenshots.mjs`) conduz uma sessão completa com Playwright; rode-o depois de mudar a interface.

## Criando conteúdo com IA

Use os prompts de [`docs/agents/prompt-templates.md`](docs/agents/prompt-templates.md) com `AGENTS.md` e os guias de
`docs/agents/` como contexto, depois rode `pnpm validate:packs pack.json` ou importe pelo app.

## Criando um plugin

Veja [`docs/plugins/creating-a-plugin.md`](docs/plugins/creating-a-plugin.md). Um plugin é um pacote em `plugins/<id>`
registrado em `apps/server/src/plugins.ts` e `apps/web/src/plugins/registry.tsx`; o núcleo não muda.

## Limitações conhecidas do MVP

- Salas ficam em memória: reiniciar o servidor encerra as sessões em andamento (packs ficam salvos em disco).
- Sem autenticação de professor: quem cria a sala recebe um token guardado no navegador.
- O runner de backend executa o código do aluno com Express/Fastify compatíveis em memória (sem rede, banco ou arquivos).
  A validação oficial roda em processo Node isolado pelo modelo de permissões do Node, que não bloqueia rede de saída;
  em ambiente público, use contêiner sem rede.
- O preview React Native usa react-native-web; APIs nativas não estão disponíveis.

## Licença

MIT
