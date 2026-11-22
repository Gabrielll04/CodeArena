---
'@codearena/schemas': patch
'@codearena/core': patch
---

Pausa do professor. `room.pause()` para o cronômetro (contagem regressiva, questão ou atividade) e, enquanto pausada,
a sala recusa envios, salvamentos, mudanças de questão e entregas e ignora progresso e colagens. `room.resume()` adia
os prazos pelo tempo parado. O snapshot ganha `pausedAt`, os eventos `host:pause` e `host:resume` entram no contrato
Socket.IO, e `activeElapsed` (com `pauses` em `buildPlayerTimeline`) desconta as pausas dos tempos de resposta. Estados
gravados antes desta versão continuam sendo retomados.
