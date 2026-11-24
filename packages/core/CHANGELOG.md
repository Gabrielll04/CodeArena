# @codearena/core

## 0.2.0

### Minor Changes

- e7215b6: Mapa de capacidades: `buildCapabilityMap` junta as avaliações de várias atividades e dá a situação de cada capacidade
  por aluno (desenvolvida, recuperada, em desenvolvimento ou a recuperar), pela evidência mais recente.
  `capabilitiesToRecover` lista o que recuperar e `recoveryQuestions` escolhe as questões de uma atividade de recuperação.
- 75a996f: A nota da atividade (`msepActivityGrade`) passa a ser a média simples das notas das questões, sem o teto de 50 quando
  falta um crítico em alguma questão: o teto continua valendo só dentro de cada questão. O campo `capped` foi trocado por
  `missingCritical`, que só informa se faltou algum crítico.

  Com todos os críticos atendidos, a questão agora vai de 75 a 100 (antes, de 50 a 100), conforme os desejáveis: os
  críticos valem 75 e os desejáveis, 25. Nova constante `CRITICAL_BASE`.

### Patch Changes

- a283f14: Atividade avaliativa e projeto guiado. Nova configuração de sala `mode: "assessment"` (com `assessmentMinutes`): todas as
  questões abrem juntas, cada aluno navega no próprio ritmo, sem XP nem placar, e o professor recebe a nota de 0 a 10 de cada
  aluno (`grades`, evento `assessment:row`, `formatGrade`/`questionGrade`/`activityGrade`). Novo `kind: "guided"`, campo
  `goalImage` na questão e `weight` nos itens da checklist. Os envios de aluno aceitam `questionId`, e o novo evento
  `assessment:goto` muda a questão atual.
- c3cd2ab: Na atividade, o snapshot do aluno traz só ele mesmo em `players` e a contagem em `playerCount` (novo); entradas e saídas
  (`player:joined`, `player:left`) vão só para o professor. O nome do aluno aceita até 60 caracteres e apóstrofo, para nome
  completo ou RA.
- 786f954: Atividades avaliadas pela MSEP. Itens da checklist ganham a regra `{ "type": "manual" }` (critério avaliado pelo
  professor ou por uma IA, fora da aceitação automática) e o campo `capability` (capacidade técnica, socioemocional ou
  conhecimento avaliado). Na sala `mode: "assessment"` as respostas são salvas sem validação (`assessment:save`), o aluno
  pode entregar (`assessment:deliver`) e a sala gera o registro do histórico (`historySnapshot`, `onEnded`). Novos tipos do
  histórico (`SessionHistory`, `AnswerEvaluation`) e nota MSEP de 0 a 100 (`msepQuestionGrade`, `msepActivityGrade`),
  limitada a 50 quando falta algum critério crítico. O `kind: "guided"` passa a ser lido como `"build"`; `weight` é ignorado.
- 3e221fa: Integridade da sala: a configuração `allowPaste` permite recusar colar texto no editor; o evento `question:paste`
  informa só o tamanho das colagens; a sala monta a linha do tempo de cada aluno por questão (itens concluídos,
  colagens e resposta aceita, em horários do servidor) e aponta colagens seguidas de vários itens concluídos
  (`buildPlayerTimeline`, `findPasteImpact`). A linha do tempo vai só para o professor e não altera a pontuação.
- 02c61e4: Questão com crítico faltando: a nota passa a ser os pontos feitos (com os pesos 75/25) sobre o melhor caso com um só
  crítico faltando, limitada a 50. Faltou só um crítico e todo o resto foi feito: 50 (antes podia ficar abaixo, como 38).
- b20b496: Pausa do professor. `room.pause()` para o cronômetro (contagem regressiva, questão ou atividade) e, enquanto pausada,
  a sala recusa envios, salvamentos, mudanças de questão e entregas e ignora progresso e colagens. `room.resume()` adia
  os prazos pelo tempo parado. O snapshot ganha `pausedAt`, os eventos `host:pause` e `host:resume` entram no contrato
  Socket.IO, e `activeElapsed` (com `pauses` em `buildPlayerTimeline`) desconta as pausas dos tempos de resposta. Estados
  gravados antes desta versão continuam sendo retomados.
- 9f1b72d: Retomar a sala depois de o servidor reiniciar. `room.toState()` devolve o estado completo da sala em JSON (inclui os
  tokens: guarde só no servidor) e `Room.fromState(state, options)` ou `rooms.restore(state, options)` recria a sala com o
  mesmo código; os prazos abertos são adiados pelo tempo em que o servidor ficou parado e os alunos voltam desconectados
  até reconectarem pelo token. A nova opção `onChange` avisa a cada mudança da sala, e `historySnapshot()` também funciona
  durante a sessão, com o placar parcial. O tipo `ActiveRoomSummary` descreve uma sala aberta
  listada no histórico do professor. Nada muda para quem não usa essas opções.
- 7c092dc: Código com erro de sintaxe não conclui nenhum item da checklist. `evaluateChecklist` roda primeiro o validador de
  sintaxe do plugin (`QuizPlugin.syntaxValidator`, ou um validador estático terminado em `Compiles`), reaproveitando a
  sessão dos outros validadores, e devolve `syntaxError` com a mensagem. `lintQuestion` avisa quando uma regra de texto
  parece conferir um componente e sugere o validador do plugin.
- Updated dependencies [a283f14]
- Updated dependencies [c3cd2ab]
- Updated dependencies [786f954]
- Updated dependencies [3e221fa]
- Updated dependencies [b20b496]
- Updated dependencies [9f1b72d]
- Updated dependencies [7c092dc]
  - @codearena/schemas@0.2.0
  - @codearena/plugin-sdk@0.2.0
