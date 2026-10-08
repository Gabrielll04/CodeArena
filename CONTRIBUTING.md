# Contribuindo com o CodeArena

Obrigado por querer ajudar. O CodeArena é feito para professores: cada plugin, pack de questões ou correção ajuda
outras turmas. Este guia mostra como começar em poucos minutos.

## Formas de contribuir

| Contribuição | Dificuldade | Onde começar |
| --- | --- | --- |
| **Pack de questões** (JSON) | baixa | [`docs/agents/question-pack-schema.md`](docs/agents/question-pack-schema.md) e `content/packs/` |
| **Plugin** de uma disciplina ou linguagem | média | [`docs/plugins/creating-a-plugin.md`](docs/plugins/creating-a-plugin.md) |
| **Documentação** e traduções | baixa | `docs/` e `README.md` |
| **Bug** ou melhoria na interface | média | issues com a label `ajuda desejada` |
| **Acessibilidade** | média | issues com a label `acessibilidade` |

Procure as issues com as labels **`bom primeiro plugin`**, **`bom primeiro pack`** e **`good first issue`**: elas descrevem
o que construir, onde mexer e como saber que terminou.

## Preparando o ambiente

Requisitos: **Node.js 22.13+** e **pnpm 10** (`corepack enable`).

```bash
git clone https://github.com/Gabrielll04/kahoot-ti.git
cd kahoot-ti
pnpm install
pnpm dev        # API em :3001 e interface em :5173
```

Antes de abrir um pull request, rode:

```bash
pnpm typecheck        # TypeScript estrito em todos os pacotes
pnpm test             # Vitest: schema, checklist, XP, sala, plugins e servidor
pnpm validate:packs   # packs de content/packs contra o schema e a própria solução
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
plugins/*             react-native, backend-http (e os seus)
apps/server           Fastify + Socket.IO
apps/web              React + Vite + Tailwind
content/packs         packs de exemplo
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
4. Mudou a aparência? Regrave as imagens afetadas: `pnpm build && SHOTS_ONLY="10-,14-" pnpm screenshots`.
5. Abra o pull request preenchendo o modelo. O CI roda os mesmos comandos acima.

### Contribuindo com um pack

1. Gere ou escreva o JSON seguindo `docs/agents/question-pack-schema.md` (os prompts de `docs/agents/prompt-templates.md` ajudam).
2. Salve em `content/packs/<disciplina>-<tema>.json` e preencha `pack.author`.
3. Rode `pnpm validate:packs content/packs/seu-pack.json`. Não pode haver `ERRO`.
4. Inclua `solution` em toda questão e use `kind: "debug"` quando for questão de depuração.

### Contribuindo com um plugin

1. Siga o exemplo completo de [`docs/plugins/creating-a-plugin.md`](docs/plugins/creating-a-plugin.md).
2. Crie `plugins/<id>/` com `src/index.ts`, `src/ui/index.tsx` e `test/`.
3. Registre o plugin em `apps/server/src/plugins.ts` e em `apps/web/src/plugins/registry.tsx` (as únicas linhas fora do plugin).
4. Escreva `docs/agents/plugin-<id>.md` com validadores, parâmetros, limites e exemplos, e um pack de exemplo em `content/packs/`.
5. Se o plugin executa código, o isolamento é obrigatório e precisa estar descrito no PR (veja `SECURITY.md`).

## Revisão

- Respondemos em alguns dias. PRs pequenos e focados são revisados mais rápido.
- Prefira abrir uma issue antes de mudanças grandes (novos tipos de regra, mudanças no protocolo de eventos).
- Ao contribuir, você concorda em licenciar sua contribuição sob a [licença MIT](LICENSE) do projeto.

Dúvidas? Abra uma issue com a label `pergunta`. Participar significa seguir o [Código de Conduta](CODE_OF_CONDUCT.md).
