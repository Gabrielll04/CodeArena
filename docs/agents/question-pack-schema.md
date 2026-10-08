# Schema do question pack

Fonte da verdade: `packages/schemas/src/question-pack.ts` (Zod). Este documento descreve o mesmo contrato.

## Estrutura

```json
{
  "pack": {
    "title": "Título do conjunto",
    "description": "Descrição curta",
    "pluginId": "react-native",
    "version": "1.0.0",
    "tags": ["mobile", "react-native"]
  },
  "questions": []
}
```

Campos desconhecidos são **rejeitados** em todos os níveis (objetos estritos). Isso evita erros silenciosos de digitação.

## `pack`

| Campo | Tipo | Obrigatório | Regras |
| --- | --- | --- | --- |
| `title` | string | sim | 1 a 120 caracteres |
| `description` | string | não (padrão `""`) | até 500 caracteres |
| `pluginId` | string | sim | `kebab-case`; precisa estar instalado (`react-native`, `backend-http`) |
| `version` | string | sim | semver `MAJOR.MINOR.PATCH`, ex.: `"1.0.0"` |
| `tags` | string[] | não (padrão `[]`) | até 20 tags de até 40 caracteres |
| `author` | string | não | até 120 caracteres |
| `language` | string | não | ex.: `"pt-BR"` |

## `questions[]`

Entre 1 e 100 questões. Cada questão:

| Campo | Tipo | Obrigatório | Regras |
| --- | --- | --- | --- |
| `id` | string | sim | `kebab-case` (`a-z`, `0-9`, `-`, `_`), único no pack, até 64 caracteres |
| `title` | string | não | título curto exibido acima do enunciado, até 80 caracteres |
| `prompt` | string | sim | enunciado, 1 a 2000 caracteres; trechos entre crases aparecem como código |
| `pluginId` | string | não | sobrescreve `pack.pluginId` para esta questão |
| `kind` | `"build"` ou `"debug"` | não (padrão `"build"`) | `debug`: o `starterCode` é um código com bug e a checklist verifica o comportamento corrigido (ver `debug-questions.md`) |
| `timeLimitSeconds` | inteiro | sim | 10 a 3600 |
| `baseXP` | inteiro | sim | 0 a 10000; XP por acertar |
| `speedBonusMax` | inteiro | sim | 0 a 10000; bônus máximo por velocidade |
| `starterCode` | string | não (padrão `""`) | código inicial do editor |
| `solution` | string | não (padrão `""`) | solução esperada; **recomendada sempre** |
| `lockOnComplete` | boolean | não (padrão `true`) | trava o editor após a resposta ser aceita |
| `checklist` | item[] | sim | 1 a 12 itens, ao menos 1 obrigatório |
| `pluginData` | objeto | não (padrão `{}`) | metadados livres do plugin |
| `tags` | string[] | não | |

## `checklist[]`

| Campo | Tipo | Obrigatório | Regras |
| --- | --- | --- | --- |
| `id` | string | sim | `kebab-case`, único na questão |
| `label` | string | sim | 1 a 140 caracteres, no imperativo |
| `rule` | objeto | sim | ver `checklist-rules.md` |
| `optional` | boolean | não (padrão `false`) | itens opcionais não bloqueiam a resposta |
| `hint` | string | não | dica exibida enquanto o item está pendente, até 280 caracteres |

### Formas de `rule`

```json
{ "type": "contains",    "value": "texto", "caseSensitive": true, "ignoreComments": false }
{ "type": "notContains", "value": "texto", "caseSensitive": true, "ignoreComments": false }
{ "type": "regex",       "pattern": "padrão", "flags": "m", "ignoreComments": false }
{ "type": "pluginRule",  "validator": "nomeDoValidador", "params": { } }
```

- `flags` aceita apenas `i`, `m`, `s`, `u`.
- A regex precisa compilar em JavaScript. Lembre que em JSON a barra invertida é escapada: `\\s` no arquivo vira `\s` na regex.

## Exemplo válido mínimo

```json
{
  "pack": { "title": "Mínimo", "pluginId": "react-native", "version": "1.0.0" },
  "questions": [
    {
      "id": "usar-text",
      "prompt": "Mostre um componente Text.",
      "timeLimitSeconds": 60,
      "baseXP": 300,
      "speedBonusMax": 300,
      "solution": "export default function App() {\n  return <Text>Oi</Text>;\n}",
      "checklist": [
        {
          "id": "text",
          "label": "Usar o componente Text",
          "rule": { "type": "pluginRule", "validator": "reactNativeHasComponent", "params": { "component": "Text" } }
        }
      ]
    }
  ]
}
```

Exemplos completos: `content/packs/react-native-fundamentos.json` e `content/packs/backend-http-basico.json`.

## Exemplos inválidos (e a mensagem que o app mostra)

| Erro | Caminho | Mensagem |
| --- | --- | --- |
| `"version": "1.0"` | `pack.version` | version deve seguir o formato semver "MAJOR.MINOR.PATCH" |
| `pluginId` ausente | `pack.pluginId` | campo obrigatório ausente |
| `"id": "Questão 1"` | `questions[0].id` | id da questão deve usar apenas letras minúsculas, números, "-" ou "_" |
| `"timeLimitSeconds": 5` | `questions[0].timeLimitSeconds` | timeLimitSeconds mínimo é 10 |
| `"pattern": "("` | `questions[0].checklist[0].rule.pattern` | Regex inválida: ... Unterminated group |
| `"type": "equals"` | `questions[0].checklist[0].rule.type` | tipo de regra desconhecido. Use um de: contains, notContains, regex, pluginRule |
| dois itens com `"id": "a"` | `questions[0].checklist[1].id` | id de item duplicado: "a" |
| todos os itens `optional` | `questions[0].checklist` | a checklist precisa de pelo menos 1 item obrigatório |
| `"kind": "quiz"` | `questions[0].kind` | Invalid enum value. Expected 'build' \| 'debug' |
| campo extra `"answer"` | `questions[0]` | campos não reconhecidos: answer |
| `checklist: []` | `questions[0].checklist` | checklist precisa de pelo menos 1 item |

Além do schema, o comando `pnpm validate:packs` e o editor do app avisam quando:

- a `solution` não satisfaz algum item obrigatório (**erro**);
- o `starterCode` já completa a checklist (**erro**);
- uma regex aceita texto vazio (**erro**);
- um validador de plugin não existe (**erro**);
- em `kind: "debug"`: o código com bug já cumpre todos os itens, falta código inicial ou a solução é igual ao código com bug (**erro**); a lista de itens que detectam o bug é informada como `INFO`;
- um texto de `contains` é curto demais, há espaço literal junto de pontuação numa regex, ou o `starterCode` já satisfaz um item (**aviso**).

## Versionamento de packs

Use semver em `pack.version`:

- **PATCH** (`1.0.0` -> `1.0.1`): correção de texto, dica ou regex que não muda o que é exigido do aluno.
- **MINOR** (`1.0.1` -> `1.1.0`): novas questões ou itens opcionais; questões existentes continuam respondíveis da mesma forma.
- **MAJOR** (`1.1.0` -> `2.0.0`): mudança no que é exigido (novo item obrigatório, rota diferente, troca de plugin), remoção ou troca de `id` de questão.

Não reaproveite o `id` de uma questão para um conteúdo diferente: relatórios exportados referenciam questões pelo `id`.
