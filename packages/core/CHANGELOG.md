# @codearena/core

## 0.1.1

### Patch Changes

- a283f14: Atividade avaliativa e projeto guiado. Nova configuração de sala `mode: "assessment"` (com `assessmentMinutes`): todas as
  questões abrem juntas, cada aluno navega no próprio ritmo, sem XP nem placar, e o professor recebe a nota de 0 a 10 de cada
  aluno (`grades`, evento `assessment:row`, `formatGrade`/`questionGrade`/`activityGrade`). Novo `kind: "guided"`, campo
  `goalImage` na questão e `weight` nos itens da checklist. Os envios de aluno aceitam `questionId`, e o novo evento
  `assessment:goto` muda a questão atual.
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
- 7c092dc: Código com erro de sintaxe não conclui nenhum item da checklist. `evaluateChecklist` roda primeiro o validador de
  sintaxe do plugin (`QuizPlugin.syntaxValidator`, ou um validador estático terminado em `Compiles`), reaproveitando a
  sessão dos outros validadores, e devolve `syntaxError` com a mensagem. `lintQuestion` avisa quando uma regra de texto
  parece conferir um componente e sugere o validador do plugin.
