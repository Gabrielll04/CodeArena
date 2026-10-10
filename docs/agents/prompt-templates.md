# Prompts prontos

Copie, ajuste os trechos entre `<>` e envie para o agente. Anexe (ou cole) os arquivos indicados em "Contexto".
Depois de receber o JSON, valide com `pnpm validate:packs arquivo.json` ou importe pelo app (Biblioteca > Importar JSON).

## 1. Gerar um pack de React Native

Contexto: `AGENTS.md`, `docs/agents/question-pack-schema.md`, `docs/agents/checklist-rules.md`, `docs/agents/plugin-react-native.md`.

```text
Você é um autor de questões técnicas para o CodeArena.

Gere um arquivo JSON válido compatível com o schema do CodeArena.

Regras:
- Use pluginId "react-native".
- Crie 5 questões progressivas sobre <tema, ex.: listas e estado>.
- Cada questão deve ter enunciado curto (até 3 frases) com nomes e textos exatos.
- Cada questão deve ter checklist objetiva.
- Cada checklist deve ter entre 2 e 5 itens, com labels no imperativo.
- Use regex, contains ou validadores do plugin (pluginRule) para validação.
- Prefira pluginRule (reactNativeHasComponent, reactNativeHasComponentProp, reactNativeHasText,
  reactNativeImports, reactNativeUsesHook, reactNativeHasStyle) quando houver um validador adequado.
- Não use regras dependentes de interpretação humana.
- Inclua "solution" que satisfaça todos os itens e "starterCode" que não complete a checklist.
- Use timeLimitSeconds entre 120 e 300, baseXP 500 e speedBonusMax 500.
- Use version "1.0.0" e ids em kebab-case.
- Não use emojis.
- Não inclua comentários dentro do JSON.
- Responda apenas com JSON válido.
```

## 2. Gerar um pack de backend HTTP

Contexto: `AGENTS.md`, `docs/agents/question-pack-schema.md`, `docs/agents/checklist-rules.md`, `docs/agents/plugin-backend-http.md`.

```text
Você é um autor de questões técnicas para o CodeArena.

Gere um arquivo JSON válido compatível com o schema do CodeArena.

Regras:
- Use pluginId "backend-http".
- Crie <4> questões progressivas de Express sobre <tema, ex.: CRUD de produtos em memória>.
- O código roda em um runner sem banco de dados, sem arquivos e sem rede: use arrays em memória.
- Cada enunciado deve citar método, rota, status e formato do JSON esperado.
- Cada checklist deve ter entre 2 e 5 itens.
- Valide o comportamento com pluginRule "httpRequest" (request + expect) e rotas com "httpRouteDefined".
- Quando a resposta depender de um parâmetro, crie dois itens httpRequest com valores diferentes.
- Quando um item depender de estado criado antes, use "setup".
- Inclua "starterCode" com o esqueleto do servidor (require, express(), listen) e "solution" completa.
- Não use regras dependentes de interpretação humana.
- Não use emojis.
- Não inclua comentários dentro do JSON.
- Responda apenas com JSON válido.
```

## 3. Converter uma lista de exercícios existente

```text
Converta os exercícios abaixo em um question pack do CodeArena (JSON válido, pluginId "<plugin>").
Para cada exercício:
- reescreva o enunciado de forma curta e objetiva;
- quebre o que é pedido em 2 a 5 itens de checklist verificáveis por regra (contains, regex, notContains ou pluginRule);
- descarte ou reescreva requisitos que dependam de avaliação humana (ex.: "código bem organizado");
- escreva uma "solution" que satisfaça todos os itens.
Responda apenas com JSON válido, sem comentários.

Exercícios:
<cole aqui>
```

## 4. Revisar um pack antes de usar em aula

```text
Revise o question pack abaixo seguindo docs/agents/checklist-rules.md.
Para cada questão, aponte:
1. itens vagos ou que dependem de interpretação humana;
2. regex frágeis (espaços literais, aspas fixas, sem limite de palavra, aceitam texto vazio);
3. respostas "decoradas" que passariam na checklist sem resolver o problema;
4. itens que o starterCode já satisfaz;
5. se a solution satisfaz todos os itens.
Depois, devolva o pack corrigido em JSON válido, incrementando pack.version (PATCH ou MINOR conforme docs/agents/question-pack-schema.md).

<cole o JSON>
```

## 5. Gerar uma única questão para o editor manual

```text
Gere apenas um objeto de questão (não o pack inteiro) do CodeArena para o plugin "<plugin>":
<descrição do que o aluno deve construir>.
Campos: id, title, prompt, timeLimitSeconds, baseXP, speedBonusMax, starterCode, solution, checklist.
Checklist com 3 itens objetivos. Responda apenas com o objeto JSON.
```

## 6. Gerar um pack de depuração

Contexto: `AGENTS.md`, `docs/agents/question-pack-schema.md`, `docs/agents/checklist-rules.md`, `docs/agents/debug-questions.md`
e o guia do plugin escolhido.

```text
Você é um autor de questões de depuração para o CodeArena.

Gere um arquivo JSON válido compatível com o schema do CodeArena.

Regras:
- Use pluginId "<react-native ou backend-http>" e "kind": "debug" em todas as questões.
- Crie <3> questões, cada uma com UM bug realista para estudantes de nível <iniciante>: <tipos de bug desejados>.
- "starterCode" é o código com o bug e deve compilar; "solution" é a correção mínima.
- O enunciado descreve o sintoma (o que deveria acontecer e o que acontece), nunca a causa nem a linha.
- Cada checklist tem entre 3 e 5 itens:
  - pelo menos 1 item obrigatório deve FALHAR no código com bug;
  - pelo menos 1 item de proteção deve passar no código com bug (o que já funciona e não pode quebrar);
  - labels descrevem comportamento esperado, nunca o conserto.
- No backend-http, use "httpRequest" com dois casos de teste quando uma resposta fixa poderia passar.
- No react-native, inclua "reactNativeCompiles" e prefira validadores de AST.
- Use timeLimitSeconds entre 180 e 300, baseXP 500 e speedBonusMax 500.
- Não use emojis. Não inclua comentários dentro do JSON.
- Responda apenas com JSON válido.
```

Depois rode `pnpm validate:packs arquivo.json`: cada questão deve mostrar `INFO ... O bug é detectado por N de M itens`.

## 7. Criar um plugin novo

Contexto: `docs/plugins/creating-a-plugin.md`, `packages/plugin-sdk/src/types.ts`, `plugins/react-native/src/index.ts`.

```text
Crie um plugin do CodeArena para <disciplina/ambiente, ex.: SQL com SQLite em memória>.
Siga docs/plugins/creating-a-plugin.md:
- pacote em plugins/<id>/ com package.json (manifesto "codearena"), src/index.ts (definição com definePlugin) e
  src/ui/index.tsx (ClientQuizPlugin), cada entrada com export default;
- validadores com schema Zod de params, modo "static" ou "dynamic" e mensagens curtas em português;
- testes em plugins/<id>/test usando evaluateChecklist de @codearena/core;
- ativação com pnpm add -w e uma linha em codearena.config.json (nenhum arquivo de apps/ muda);
- documentação para agentes em docs/agents/plugin-<id>.md e um pack de exemplo em content/packs/.
Não altere packages/core, packages/schemas nem apps/.
```
