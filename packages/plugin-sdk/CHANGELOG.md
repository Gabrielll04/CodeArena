# @codearena/plugin-sdk

## 0.2.0

### Patch Changes

- 786f954: Atividades avaliadas pela MSEP. Itens da checklist ganham a regra `{ "type": "manual" }` (critério avaliado pelo
  professor ou por uma IA, fora da aceitação automática) e o campo `capability` (capacidade técnica, socioemocional ou
  conhecimento avaliado). Na sala `mode: "assessment"` as respostas são salvas sem validação (`assessment:save`), o aluno
  pode entregar (`assessment:deliver`) e a sala gera o registro do histórico (`historySnapshot`, `onEnded`). Novos tipos do
  histórico (`SessionHistory`, `AnswerEvaluation`) e nota MSEP de 0 a 100 (`msepQuestionGrade`, `msepActivityGrade`),
  limitada a 50 quando falta algum critério crítico. O `kind: "guided"` passa a ser lido como `"build"`; `weight` é ignorado.
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
  - @codearena/schemas@0.2.0
