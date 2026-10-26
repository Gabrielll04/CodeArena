---
'@codearena/schemas': patch
'@codearena/core': patch
---

Atividade avaliativa e projeto guiado. Nova configuração de sala `mode: "assessment"` (com `assessmentMinutes`): todas as
questões abrem juntas, cada aluno navega no próprio ritmo, sem XP nem placar, e o professor recebe a nota de 0 a 10 de cada
aluno (`grades`, evento `assessment:row`, `formatGrade`/`questionGrade`/`activityGrade`). Novo `kind: "guided"`, campo
`goalImage` na questão e `weight` nos itens da checklist. Os envios de aluno aceitam `questionId`, e o novo evento
`assessment:goto` muda a questão atual.
