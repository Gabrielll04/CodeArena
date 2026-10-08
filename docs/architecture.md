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
              +--------------------------+--------------------------+
                                         | stdin/stdout (JSON por linha)
                                         v
                          processo Node filho com --permission
                          (runner do plugin backend-http)
```

## Pacotes

| Pacote | Responsabilidade | Depende de |
| --- | --- | --- |
| `packages/schemas` | Zod do question pack, payloads de eventos, tipos de snapshot, avatares | zod |
| `packages/plugin-sdk` | Contratos `QuizPlugin`/`ClientQuizPlugin`, `definePlugin`, `PluginRegistry`, utilitários | schemas |
| `packages/core` | Motor de checklist, XP, ranking, `Room`/`RoomManager`, lint de autoria | schemas, plugin-sdk |
| `plugins/react-native` | Validadores AST, preview em iframe com react-native-web | plugin-sdk |
| `plugins/backend-http` | Runtime Express/Fastify, executores Worker e processo filho, cliente HTTP | plugin-sdk |
| `apps/server` | REST, Socket.IO, persistência de packs, registro de plugins do servidor | core, plugins |
| `apps/web` | Interface do professor e do aluno, registro de plugins do navegador | core, plugins |

O núcleo (`core`, `schemas`, `plugin-sdk`) não conhece nenhum plugin concreto. Os plugins são registrados em
`apps/server/src/plugins.ts` e `apps/web/src/plugins/registry.tsx`.

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
| `question:progress` | aluno | `{ done, total }` (contagem, sem código) |
| `question:submit` | aluno | `{ code }` -> `{ answer }` |

Servidor -> cliente:

| Evento | Destino | Conteúdo |
| --- | --- | --- |
| `room:update` | cada participante | snapshot da sala na visão de quem recebe (professor: progresso; aluno: `me`) |
| `player:joined` / `player:left` | todos | jogador |
| `question:loaded` | todos | questão pública (sem `solution`), `startsAt`, `endsAt` |
| `question:started` | todos | início efetivo (fim da contagem) |
| `question:progress` | professor | `{ playerId, done, total, answered }` |
| `question:submitted` | professor | quem enviou e se foi aceito |
| `question:validated` | o aluno | resultado da validação oficial por item |
| `question:finished` | todos | resultados, placar e `solution` |
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
atômica (arquivo temporário + rename). Packs de `content/packs/` são carregados como exemplos somente leitura.
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
| Exposição do código | O professor recebe apenas contagens de progresso |

Limitação documentada: o modelo de permissões do Node não bloqueia rede de saída. Em ambiente público, rode o servidor
(ou só o runner) em contêiner sem rede.
