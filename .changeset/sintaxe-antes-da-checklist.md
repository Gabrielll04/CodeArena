---
'@codearena/plugin-sdk': patch
'@codearena/core': patch
---

Código com erro de sintaxe não conclui nenhum item da checklist. `evaluateChecklist` roda primeiro o validador de
sintaxe do plugin (`QuizPlugin.syntaxValidator`, ou um validador estático terminado em `Compiles`), reaproveitando a
sessão dos outros validadores, e devolve `syntaxError` com a mensagem. `lintQuestion` avisa quando uma regra de texto
parece conferir um componente e sugere o validador do plugin.
