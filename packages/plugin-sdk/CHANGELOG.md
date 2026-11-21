# @codearena/plugin-sdk

## 0.1.1

### Patch Changes

- 786f954: Atividades avaliadas pela MSEP. Itens da checklist ganham a regra `{ "type": "manual" }` (critério avaliado pelo
  professor ou por uma IA, fora da aceitação automática) e o campo `capability` (capacidade técnica, socioemocional ou
  conhecimento avaliado). Na sala `mode: "assessment"` as respostas são salvas sem validação (`assessment:save`), o aluno
  pode entregar (`assessment:deliver`) e a sala gera o registro do histórico (`historySnapshot`, `onEnded`). Novos tipos do
  histórico (`SessionHistory`, `AnswerEvaluation`) e nota MSEP de 0 a 100 (`msepQuestionGrade`, `msepActivityGrade`),
  limitada a 50 quando falta algum critério crítico. O `kind: "guided"` passa a ser lido como `"build"`; `weight` é ignorado.
- 7c092dc: Código com erro de sintaxe não conclui nenhum item da checklist. `evaluateChecklist` roda primeiro o validador de
  sintaxe do plugin (`QuizPlugin.syntaxValidator`, ou um validador estático terminado em `Compiles`), reaproveitando a
  sessão dos outros validadores, e devolve `syntaxError` com a mensagem. `lintQuestion` avisa quando uma regra de texto
  parece conferir um componente e sugere o validador do plugin.
