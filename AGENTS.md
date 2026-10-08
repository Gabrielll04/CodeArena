# AGENTS.md

Guia para agentes de IA (e pessoas) que geram conteúdo ou código para o **CodeArena**.

## Propósito do projeto

CodeArena é um app web multiplayer, no estilo Kahoot, para aprender programação com desafios práticos.
O professor abre uma sala com um conjunto de questões (question pack). Os alunos entram com um código de
6 dígitos e respondem **escrevendo código**. Cada questão tem uma **checklist automática**: os itens são marcados
sozinhos conforme o aluno escreve. Quando todos os itens obrigatórios estão concluídos, a resposta é enviada,
o servidor valida de novo e concede XP (base + bônus por velocidade).

## Arquivos importantes

| Caminho | Conteúdo |
| --- | --- |
| `packages/schemas/src/question-pack.ts` | Schema Zod oficial do question pack (fonte da verdade do formato JSON) |
| `packages/core/src/checklist.ts` | Motor da checklist (`contains`, `regex`, `notContains`, `pluginRule`) |
| `packages/core/src/scoring.ts` | Fórmula de XP e ordenação do placar |
| `packages/core/src/authoring.ts` | Avisos de qualidade de questões (`lintQuestion`) |
| `packages/plugin-sdk/src/types.ts` | Contrato de plugins (`QuizPlugin`, `ChecklistValidator`) |
| `plugins/react-native/src/index.ts` | Validadores do plugin `react-native` |
| `plugins/backend-http/src/index.ts` | Validadores do plugin `backend-http` |
| `content/packs/*.json` | Packs de exemplo válidos |
| `docs/agents/` | Instruções detalhadas para gerar conteúdo |
| `scripts/validate-packs.ts` | Validador de packs (schema + checklist contra a solução) |

Leia nesta ordem antes de gerar questões:

1. `docs/agents/overview.md`
2. `docs/agents/question-pack-schema.md`
3. `docs/agents/checklist-rules.md`
4. O guia do plugin alvo: `docs/agents/plugin-react-native.md` ou `docs/agents/plugin-backend-http.md`
5. `docs/agents/prompt-templates.md` (prompts prontos)

## Regras obrigatórias para gerar questões

1. **Saída em JSON válido**, compatível com `QuestionPackSchema`. Sem comentários, sem vírgula sobrando, sem texto fora do JSON.
2. **Todo pack declara `pack.pluginId`** e toda questão usa esse plugin (ou declara `pluginId` próprio). Plugins disponíveis: `react-native`, `backend-http`.
3. **Checklists objetivas e verificáveis por máquina.** Cada item tem uma regra determinística (`contains`, `regex`, `notContains` ou `pluginRule`).
4. **Proibido** item vago ("Escrever código limpo", "Fazer um bom layout", "Usar boas práticas").
5. **Proibido** qualquer critério que dependa de interpretação humana para validar a resposta.
6. **Labels curtos e no imperativo**: "Criar o componente App", "Retornar status 201".
7. **Inclua `solution`** em toda questão. A solução precisa satisfazer todos os itens obrigatórios.
8. O **`starterCode` não pode completar a checklist** sozinho.
9. Não use emojis em enunciados, labels ou dicas.
10. Ids em `kebab-case` minúsculo, únicos no pack (questões) e na questão (itens).

## Como verificar o que você gerou

```bash
pnpm validate:packs caminho/do/pack.json
```

O comando valida o schema, executa a checklist contra a `solution` (inclusive regras que executam código)
e aponta regras frágeis. Saída com `ERRO` significa que o pack não deve ser entregue.

## Regras para código do repositório

- TypeScript estrito; mensagens de interface em português, curtas e funcionais, sem emojis.
- O servidor é a fonte oficial de tempo, pontuação e validação; nunca confie em dados do cliente para XP.
- Código de aluno nunca roda no processo principal do servidor (ver `plugins/backend-http/src/server`).
- Novos plugins seguem `docs/plugins/creating-a-plugin.md` e não alteram `packages/core`.
- Rode `pnpm typecheck && pnpm test` antes de propor mudanças; `pnpm test:e2e` para fluxos de sala.
