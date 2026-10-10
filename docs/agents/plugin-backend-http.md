# Plugin `backend-http`

Questões de backend em Node. O aluno escreve um servidor **Express** ou **Fastify**; a checklist pode verificar o
código-fonte e também o **comportamento HTTP**, enviando requisições ao código em execução.

- `pluginId`: `backend-http`
- Editor: JavaScript (`server.js`); TypeScript e `import` ESM também são aceitos
- Código fonte: `plugins/backend-http/src`

## Como o código é executado (sem simulação de resultado)

O código do aluno é **executado de verdade**: handlers, middlewares e lógica rodam e produzem as respostas.
O que é substituído é o transporte e os módulos:

- `express` e `fastify` são implementações compatíveis em memória (`src/runtime/sandbox-runtime.mjs`).
  As requisições são entregues direto às rotas registradas, sem abrir porta de rede.
- `app.listen(...)` apenas registra a porta e chama o callback.

Onde roda:

| Momento | Ambiente | Limites |
| --- | --- | --- |
| Feedback ao aluno e cliente HTTP | Web Worker no navegador do aluno | carregamento 2,5 s; 2 s por requisição; worker reiniciado em caso de travamento |
| Validação oficial (XP) | Processo Node filho com `--permission` | sem leitura/escrita de arquivos, sem `child_process`, ambiente vazio, 64 MB de memória, 1 s para carregar, 2 s por requisição, 15 s de vida |

### Compatibilidade suportada

- Express: `express()`, `express.json()`, `express.urlencoded()`, `express.Router()`, `app.use`, `app.get/post/put/patch/delete/all`,
  `app.route()`, parâmetros `:id` e `:id?`, `*`, `req.params/query/body/headers/get()`, `res.status/json/send/sendStatus/set/type/redirect/end`,
  middlewares de erro `(err, req, res, next)`, handlers `async`.
- Fastify: `fastify()`, `get/post/put/patch/delete/route`, `register` (plugins), `addHook('onRequest' | 'preHandler')`,
  `request.params/query/body/headers`, `reply.code/status/header/send/type`, retorno de handler `async`, 404 no formato do Fastify.
- Módulos disponíveis em `require`/`import`: `express`, `fastify`, `cors`, `@fastify/cors`, `body-parser`, `crypto` (`randomUUID`, `randomInt`), `http` (`createServer(app).listen`), `dotenv`.
- Sem banco de dados, sistema de arquivos ou rede de saída. Use arrays e objetos em memória.
- Como no Express real, sem `app.use(express.json())` o `req.body` fica `undefined`. A mensagem de falha sugere a correção.

## Validadores (`pluginRule`)

### `httpRequest` (dinâmico)

Envia uma requisição e compara a resposta.

```json
{
  "type": "pluginRule",
  "validator": "httpRequest",
  "params": {
    "setup": [{ "method": "POST", "path": "/todos", "body": { "title": "Revisar" } }],
    "request": { "method": "GET", "path": "/todos", "headers": {}, "query": { "page": "1" } },
    "expect": {
      "status": 200,
      "json": [{ "title": "Revisar" }],
      "jsonIncludes": { "title": "Revisar" },
      "bodyContains": "Revisar",
      "headers": { "content-type": "application/json" }
    }
  }
}
```

| Campo | Descrição |
| --- | --- |
| `request.method` | `GET` (padrão), `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS` |
| `request.path` | começa com `/`; pode incluir query string |
| `request.body` | objeto (enviado como JSON com `content-type: application/json`) ou string |
| `setup` | requisições executadas antes (até 10), para preparar estado |
| `expect.status` | status exato |
| `expect.json` | body JSON **idêntico** (comparação profunda) |
| `expect.jsonIncludes` | body JSON **contém** estes campos (objetos parciais) |
| `expect.bodyContains` | body (texto) contém a string |
| `expect.headers` | cada header recebido contém o valor informado (nome sem diferenciar maiúsculas) |

Pelo menos um critério em `expect` é obrigatório. Atalho aceito: `{ "method": "GET", "path": "/health", "expectStatus": 200, "expectJson": {...} }`.

Mensagens de falha mostradas ao aluno: "Esperado status 200, recebido 404", "JSON diferente do esperado. Recebido: ...",
"A rota não respondeu em 2000 ms. Faltou chamar res.send()/res.json()?".

**Estado compartilhado:** numa mesma avaliação, todos os itens dinâmicos usam a mesma execução do servidor do aluno,
na ordem da checklist. Um `POST` em um item afeta o `GET` do item seguinte. Para não depender da ordem, use `setup`.

### `httpRouteDefined` (dinâmico)

```json
{ "type": "pluginRule", "validator": "httpRouteDefined", "params": { "method": "POST", "path": "/echo" } }
```

Concluído quando a rota foi registrada (o caminho é comparado como foi declarado, ex.: `/users/:id`; rotas de `Router` montado incluem o prefixo).

### `backendCompiles` (estático)

`{}`. Concluído quando o código não tem erro de sintaxe.

## Como validar rotas, status e body

| Requisito do enunciado | Item recomendado |
| --- | --- |
| "Crie a rota GET /x" | `httpRouteDefined` (aceita qualquer estilo de código) |
| "Retorne status 201" | `httpRequest` com `expect.status` |
| "Retorne o JSON { ... }" | `httpRequest` com `expect.json` |
| "Inclua o campo id na resposta" | `expect.jsonIncludes` |
| "Leia o parâmetro da URL" | dois `httpRequest` com valores diferentes (evita resposta fixa) |
| "Use express.json()" | `regex` `express\\.json\\(\\s*\\)` |

## Exemplos de questões

Implementadas em `plugins/backend-http/packs/backend-http-basico.json`:

1. **Health check** - GET /health retorna 200 e `{ "status": "ok" }`.
2. **Eco de JSON** - POST /echo devolve o body com 201 (exige `express.json()`).
3. **Parâmetro de rota** - GET /users/:id responde `{ "id": "<id>" }`, testado com 42 e 7.
4. **Lista em memória** - POST /todos cria (201) e GET /todos lista (usa `setup`).

```json
{
  "id": "health-endpoint",
  "prompt": "Crie um servidor com um endpoint GET /health que retorna status 200 e o JSON { \"status\": \"ok\" }.",
  "timeLimitSeconds": 300,
  "baseXP": 500,
  "speedBonusMax": 500,
  "starterCode": "const express = require('express');\nconst app = express();\n\n// escreva aqui\n\napp.listen(3000);",
  "solution": "const express = require('express');\nconst app = express();\n\napp.get('/health', (req, res) => {\n  res.status(200).json({ status: 'ok' });\n});\n\napp.listen(3000);",
  "checklist": [
    { "id": "rota-health", "label": "Criar rota GET /health", "rule": { "type": "pluginRule", "validator": "httpRouteDefined", "params": { "method": "GET", "path": "/health" } } },
    {
      "id": "health-responde-ok",
      "label": "GET /health responde 200 com { \"status\": \"ok\" }",
      "rule": { "type": "pluginRule", "validator": "httpRequest", "params": { "request": { "method": "GET", "path": "/health" }, "expect": { "status": 200, "json": { "status": "ok" } } } }
    }
  ]
}
```

## Como fica na prática

O painel "Cliente HTTP" mostra as rotas detectadas no código, permite montar a requisição (método, caminho, headers, body)
e exibe status, headers, body e console da resposta. Quando um item dinâmico falha, a mensagem diz o que diferiu.

![Requisição retornando 503 e item falhando](../images/backend-01-requisicao-falhando.png)

Com o código corrigido, o item passa, a resposta é validada pelo servidor e o editor trava. O console mostra o que o
código do aluno imprimiu durante a requisição.

![Resposta aceita no plugin backend-http](../images/backend-02-resposta-aceita.png)

Dois casos de teste evitam respostas "decoradas": o código abaixo responde sempre `"42"`, passa em `/users/42` e é
recusado em `/users/7`.

![Resposta fixa recusada](../images/backend-03-resposta-decorada-recusada.png)

## Limites do runner (o que não usar em questões)

- Banco de dados, arquivos, variáveis de ambiente reais, chamadas HTTP de saída (`fetch`, `axios`).
- Streams, WebSocket, upload de arquivos, cookies assinados, sessões.
- Timers longos: cada requisição tem 2 s.
- Middlewares de terceiros além dos listados.

## Segurança

O isolamento do servidor está em `plugins/backend-http/src/server/childProcessExecutor.ts` e `src/runtime/runner.mjs`.
O processo filho usa o modelo de permissões do Node (Node 22.13+). Ele **não** restringe rede de saída; as APIs
globais de rede são removidas do escopo, mas para ambientes hostis a recomendação é executar o runner em contêiner sem rede.
