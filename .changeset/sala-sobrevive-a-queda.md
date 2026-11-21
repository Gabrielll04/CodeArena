---
'@codearena/schemas': patch
'@codearena/plugin-sdk': patch
'@codearena/core': patch
---

Retomar a sala depois de o servidor reiniciar. `room.toState()` devolve o estado completo da sala em JSON (inclui os
tokens: guarde só no servidor) e `Room.fromState(state, options)` ou `rooms.restore(state, options)` recria a sala com o
mesmo código; os prazos abertos são adiados pelo tempo em que o servidor ficou parado e os alunos voltam desconectados
até reconectarem pelo token. A nova opção `onChange` avisa a cada mudança da sala, e `historySnapshot()` também funciona
durante a sessão, com o placar parcial. Nada muda para quem não usa essas opções.
