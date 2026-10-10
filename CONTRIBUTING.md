# Contribuindo com o CodeArena

Obrigado por querer ajudar. O CodeArena é feito para professores: cada plugin, pack de questões ou correção ajuda
outras turmas. Este guia mostra como começar em poucos minutos.

## Formas de contribuir

| Contribuição | Dificuldade | Onde começar |
| --- | --- | --- |
| **Pack de questões** (JSON) | baixa | [`docs/agents/question-pack-schema.md`](docs/agents/question-pack-schema.md) e os packs dos plugins oficiais |
| **Plugin** de uma disciplina ou linguagem | média | [`docs/plugins/creating-a-plugin.md`](docs/plugins/creating-a-plugin.md) |
| **Documentação** e traduções | baixa | `docs/` e `README.md` |
| **Bug** ou melhoria na interface | média | issues com a label `ajuda desejada` |
| **Acessibilidade** | média | issues com a label `acessibilidade` |

Procure as issues com as labels **`bom primeiro plugin`**, **`bom primeiro pack`** e **`good first issue`**: elas descrevem
o que construir, onde mexer e como saber que terminou.

## Preparando o ambiente

Requisitos: **Node.js 22.13+** e **pnpm 10** (`corepack enable`).

```bash
git clone https://github.com/Gabrielll04/CodeArena.git
cd CodeArena
pnpm install
pnpm dev        # API em :3001 e interface em :5173
```

Antes de abrir um pull request, rode:

```bash
pnpm typecheck        # TypeScript estrito em todos os pacotes
pnpm test             # Vitest: schema, checklist, XP, sala, plugins e servidor
pnpm validate:packs   # packs de exemplo dos plugins contra o schema e a própria solução
pnpm test:e2e         # Playwright: fluxos de sala (precisa de um build; roda sozinho)
pnpm docs:build       # site de documentação (acusa links quebrados)
```

O `test:e2e` usa Chromium. Se ele já estiver instalado: `PLAYWRIGHT_CHROMIUM_PATH=/caminho/chromium pnpm test:e2e`.
Para instalar: `npx playwright install chromium`.

## Estrutura

Leia [`docs/architecture.md`](docs/architecture.md) (pacotes, estados da sala, eventos e segurança). Resumo:

```text
packages/schemas      contratos Zod (packs e eventos)
packages/plugin-sdk   contrato dos plugins
packages/core         checklist, XP, ranking, sala, lint de autoria
apps/server           Fastify + Socket.IO
apps/web              React + Vite + Tailwind
docs/                 documentação (também publicada como site, VitePress)
```

## Regras do projeto

- **O servidor é a fonte oficial** de tempo, pontuação e validação. Nunca confie em dados do cliente para XP.
- **Código de aluno nunca roda no processo principal do servidor.** Use Web Worker no navegador e processo isolado no servidor.
- **O núcleo não conhece plugins.** Plugins novos não alteram `packages/core` nem `packages/schemas`.
- **Interface em português**, com textos curtos e funcionais. **Sem emojis** na interface, nos exemplos e nas questões.
- **Identidade visual:** use os tokens do Tailwind (`ink`, `lime`, `violet`, `coral`, `cyan`, `amber`), `font-display`
  (Space Grotesk) para títulos e `font-mono` para números e código. Reaproveite `components/ui.tsx`.
- **Animações curtas** e que respeitem `prefers-reduced-motion`; sons só depois de interação do usuário.
- **Checklists** de questões: objetivas, verificáveis por máquina, com labels no imperativo (veja `AGENTS.md`).

## Fluxo de trabalho

1. Faça um fork e crie uma branch: `feature/plugin-python`, `fix/preview-vazio`, `docs/traducao-en`.
2. Faça commits pequenos, no imperativo, explicando o **porquê** no corpo da mensagem
   (ex.: `Fix settings dialog stuck in navbar`). Português ou inglês, mas seja consistente no PR.
3. Adicione ou atualize **testes** para o que mudou. Mudou algo da sala ou da interface do professor/aluno? Cubra com um
   teste em `e2e/`.
4. Mudou a aparência? Regrave as imagens afetadas: `pnpm build && SHOTS_ONLY="10-,14-" pnpm screenshots`
   (e, se o fluxo da aula mudou, o vídeo: `pnpm demo:video`, que precisa do `ffmpeg`).
5. Abra o pull request preenchendo o modelo. O CI roda os mesmos comandos acima.

### Contribuindo com um pack

1. Gere ou escreva o JSON seguindo `docs/agents/question-pack-schema.md` (os prompts de `docs/agents/prompt-templates.md` ajudam).
2. Valide aqui: `pnpm validate:packs seu-pack.json`. Não pode haver `ERRO`.
3. Packs de exemplo ficam no repositório do plugin ([react-native](https://github.com/Gabrielll04/codearena-plugin-react-native), [backend-http](https://github.com/Gabrielll04/codearena-plugin-backend-http)): abra o PR lá, com o
   arquivo em `packs/`, o caminho em `codearena.packs` e `pack.author` preenchido.
4. Inclua `solution` em toda questão e use `kind: "debug"` quando for questão de depuração.

### Contribuindo com um plugin

Plugins são **pacotes separados**, cada um em seu próprio repositório
([decisão 0001](docs/decisoes/0001-plugins-como-pacotes.md)). Este repositório recebe só mudanças no núcleo e no SDK.
Os plugins oficiais são `react-native` e `backend-http` (Express).

1. Crie o repositório com `npm create @codearena/plugin@latest` e siga
   [`docs/plugins/creating-a-plugin.md`](docs/plugins/creating-a-plugin.md).
2. Teste numa instalação do CodeArena com `pnpm codearena plugins add ../seu-plugin` e publique no npm. Nenhum PR aqui
   é necessário. Mudanças nos plugins oficiais vão para os repositórios deles.
3. Coloque os packs de exemplo dentro do plugin (`packs/`) e o guia para agentes em `docs/agents.md` do plugin.
4. Se o plugin executa código, o isolamento é obrigatório e precisa estar descrito no PR (veja `SECURITY.md`).
5. Precisa de algo novo no SDK? Abra uma issue aqui: mudanças no contrato seguem versionamento semântico.

### Mudanças no SDK e nos pacotes publicados

`packages/schemas`, `packages/plugin-sdk`, `packages/core` e `packages/plugin-host` são publicados no npm e usados por
plugins de outros repositórios. Ao mudar um deles:

1. Rode `pnpm changeset` e descreva a mudança em português. Quebra de contrato precisa de nota dizendo o que o autor
   de plugin deve mudar (veja `.changeset/README.md`).
2. Rode `pnpm check:packages`: ele empacota os pacotes, instala fora do monorepo e compila um plugin de teste.
3. A publicação é automática: o merge do PR "Versionar pacotes" publica no npm.

## Revisão

- Respondemos em alguns dias. PRs pequenos e focados são revisados mais rápido.
- Prefira abrir uma issue antes de mudanças grandes (novos tipos de regra, mudanças no protocolo de eventos).
- Ao contribuir, você concorda em licenciar sua contribuição sob a [licença MIT](LICENSE) do projeto.

Dúvidas? Abra uma issue com a label `pergunta`. Participar significa seguir o [Código de Conduta](CODE_OF_CONDUCT.md).
