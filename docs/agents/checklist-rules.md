# Regras de checklist

A checklist é o coração do CodeArena. Cada item precisa ser **objetivo**, **determinístico** e **verificável por máquina**.
O mesmo motor (`packages/core/src/checklist.ts`) roda no navegador do aluno e no servidor.

## Estados de um item

| Estado | Quando |
| --- | --- |
| `pending` | Ainda não satisfeito. Sem destaque negativo. |
| `running` | Regra dinâmica (executa código) sendo avaliada. |
| `done` | Satisfeito. |
| `failed` | Regra dinâmica executou e falhou (com mensagem, ex.: "Esperado status 200, recebido 404"), ou a regra está mal configurada. |

## `contains`

```json
{ "type": "contains", "value": "useState(", "caseSensitive": true, "ignoreComments": false }
```

Concluído quando o código contém `value`. Use para trechos inequívocos e longos o suficiente para não aparecer por acaso.

## `notContains`

```json
{ "type": "notContains", "value": "alert(" }
```

Concluído enquanto o código **não** contém `value`. Use para proibir atalhos (ex.: `alert(`, `eval(`, `var `).
Não use como único item obrigatório: o código vazio já o satisfaz.

## `regex`

```json
{ "type": "regex", "pattern": "export\\s+default\\s+function\\s+App\\s*\\(", "flags": "m" }
```

Concluído quando `new RegExp(pattern, flags).test(código)` é verdadeiro.

### Como escrever regex segura

- Use `\\s+` entre palavras obrigatoriamente separadas e `\\s*` onde o espaço é opcional (`App\\s*\\(`).
- Aceite os dois tipos de aspas: `[\"']Clique aqui[\"']`.
- Use limites de palavra para não casar nomes maiores: `<Button\\b` não casa `<ButtonGroup`.
- Escape caracteres especiais: `\\.`, `\\(`, `\\)`, `\\[`, `\\{`, `\\/`.
- Evite `.*` encadeado (`.*.*`) e grupos repetidos aninhados (`(.+)+`): ficam lentos em códigos grandes.
- `^` e `$` sem a flag `m` só casam início e fim do arquivo inteiro.
- Não exija formatação específica (quebras de linha, ponto e vírgula, indentação).
- Lembre do escape em JSON: para a regex `\s` escreva `"\\s"` no arquivo.

### Padrões prontos

| Objetivo | `pattern` |
| --- | --- |
| Exporta componente App | `export\\s+default\\s+function\\s+App\\s*\\(` |
| Usa componente X | `<X\\b` |
| Define prop title com valor | `title\\s*=\\s*\\{?\\s*[\"'\`]Clique aqui[\"'\`]\\s*\\}?` |
| Cria rota GET /health | `\\.get\\(\\s*[\"'\`]/health[\"'\`]` |
| Retorna status 200 | `\\.(status\|code\|sendStatus)\\(\\s*200\\s*\\)` |
| Usa função assíncrona | `\\basync\\s+(function\\b\|\\(\|[A-Za-z_$][\\w$]*\\s*=>)` |
| Importa módulo | `require\\(\\s*[\"']express[\"']\\s*\\)\|from\\s+[\"']express[\"']` |

O editor manual do app oferece esses padrões no seletor "Padrões comuns de regex".

## Evitando falsos positivos

| Problema | Exemplo | Solução |
| --- | --- | --- |
| Texto dentro de comentário conta | `// <Button title="Clique aqui" />` | use `pluginRule` (AST) ou `"ignoreComments": true` |
| Nome parecido conta | `<ButtonGroup>` casa `<Button` | `<Button\\b` |
| Resposta decorada | sempre responder `{ "id": "42" }` | dois casos `httpRequest` com ids diferentes |
| Texto curto aparece por acaso | `contains "id"` | trecho mais específico (`req.params.id`) |
| Item satisfeito pelo código inicial | starter já tem `require('express')` | não exija o que já está pronto, ou aceite como passo gratuito conscientemente |
| Regra só olha texto, mas o código não compila | três regex satisfeitas com erro de sintaxe | adicione `reactNativeCompiles` / `backendCompiles` |

`ignoreComments` remove `//` e `/* */` respeitando strings, mas não entende regex literais nem texto JSX contendo `//`.
Por isso é opcional; para React Native prefira os validadores de AST, que ignoram comentários naturalmente.

## `pluginRule`

```json
{
  "type": "pluginRule",
  "validator": "httpRequest",
  "params": {
    "request": { "method": "GET", "path": "/health" },
    "expect": { "status": 200, "json": { "status": "ok" } }
  }
}
```

Delega a verificação a um validador do plugin da questão. `params` é validado pelo schema do validador;
parâmetros inválidos aparecem como item `failed` com a explicação. Validadores disponíveis:

| Plugin | Validador | Modo |
| --- | --- | --- |
| `react-native` | `reactNativeCompiles`, `reactNativeExportsDefaultComponent`, `reactNativeHasComponent`, `reactNativeHasComponentProp`, `reactNativeHasText`, `reactNativeImports`, `reactNativeUsesHook`, `reactNativeHasStyle` | estático (AST) |
| `backend-http` | `backendCompiles` | estático |
| `backend-http` | `httpRequest`, `httpRouteDefined` | dinâmico (executa o código) |

Detalhes e parâmetros nos guias de cada plugin. A lista atualizada também está em `GET /api/plugins`.

## Labels

- No imperativo e com o resultado verificável: "Criar rota GET /health", "Retornar status 201", "Usar o componente Button".
- Mencione nomes, textos e valores exatos que a regra exige.
- Um conceito por item. "Criar a rota e retornar JSON" vira dois itens.
- Evite: "Fazer corretamente", "Código organizado", "Usar boas práticas", "Deixar bonito".

## `optional` e `hint`

- `optional: true` cria um item bônus visual: aparece, mas não bloqueia o envio. Use pouco.
- `hint` aparece abaixo do item enquanto pendente. Deve ajudar sem entregar a resposta: "Procure a prop que define o texto do botão".
