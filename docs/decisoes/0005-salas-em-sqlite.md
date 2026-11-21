# 0005: Salas abertas gravadas em SQLite para retomar depois de uma queda

- **Status:** aceita e implementada.
- **Data:** 2026-11-21

## Contexto

O estado de uma sala (alunos, tokens, respostas salvas, prazos, placar) vivia só na memória do servidor. Um travamento,
uma falta de energia ou uma atualização no meio de uma prova perdia a sessão inteira, e os alunos não tinham como
continuar. O histórico só recebia a sessão quando ela terminava.

## Decisão

1. **O núcleo sabe salvar e recriar uma sala.** `room.toState()` devolve o estado completo em JSON e
   `Room.fromState(state, options)` (ou `rooms.restore`) recria a sala com o mesmo código e os mesmos tokens. A opção
   `onChange` avisa a cada mudança. Validações em andamento ficam de fora: o aluno envia de novo.
2. **O servidor grava as salas abertas num SQLite local**, `<dataDir>/codearena.db`, uma linha por sala, no máximo uma
   gravação por segundo por sala. Usa o `node:sqlite` do próprio Node (22.13+): nenhuma dependência nativa para compilar,
   e o arquivo fica no mesmo volume dos packs e do histórico. WAL com `synchronous = NORMAL`, que sobrevive à queda do
   processo.
3. **Ao iniciar, as salas voltam.** Os alunos e o professor reconectam sozinhos pelos tokens (o cliente já reenvia
   `room:join` e `room:host` ao reconectar), e o que o aluno escreveu durante a queda é salvo ao reconectar.
4. **O tempo fora do ar não conta.** Os prazos abertos (atividade e questão em andamento) são adiados pelo tempo em que
   o servidor ficou parado.
5. **Desligar o servidor não encerra as salas.** Elas ficam gravadas e voltam no próximo início (útil para atualizar no
   meio da aula). Sala parada há mais de 6 horas não volta: a sessão é encerrada e vai para o histórico, como a limpeza
   de salas inativas já fazia.
6. **O histórico continua em JSON** (`<dataDir>/history`). Só as salas abertas usam o SQLite por enquanto.

## Consequências

- Uma queda perde no máximo o último segundo de mudanças; o aluno não perde o que digitou, porque o rascunho fica no
  navegador e é salvo ao reconectar.
- O arquivo `codearena.db` guarda tokens de professor e alunos: fica só no servidor e entra no backup junto com `/data`.
- Packs e histórico podem migrar para o mesmo banco depois, sem mudar a API.
