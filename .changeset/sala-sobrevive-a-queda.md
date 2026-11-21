---
'@codearena/schemas': patch
'@codearena/plugin-sdk': patch
'@codearena/core': patch
---

`Room.historySnapshot()` também funciona durante a sessão (antes só depois do encerramento): devolve as respostas
salvas até o momento e o placar parcial, para o servidor gravar pontos de recuperação. Antes do início continua `null`.
`SessionHistory` e `SessionHistorySummary` ganham o campo opcional `interrupted`, para sessões recuperadas depois de uma
queda do servidor. Nada muda para quem só chama `historySnapshot()` no `onEnded`.
