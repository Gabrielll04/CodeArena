# @codearena/schemas

## 0.1.1

### Patch Changes

- a283f14: Atividade avaliativa e projeto guiado. Nova configuração de sala `mode: "assessment"` (com `assessmentMinutes`): todas as
  questões abrem juntas, cada aluno navega no próprio ritmo, sem XP nem placar, e o professor recebe a nota de 0 a 10 de cada
  aluno (`grades`, evento `assessment:row`, `formatGrade`/`questionGrade`/`activityGrade`). Novo `kind: "guided"`, campo
  `goalImage` na questão e `weight` nos itens da checklist. Os envios de aluno aceitam `questionId`, e o novo evento
  `assessment:goto` muda a questão atual.
- 3e221fa: Integridade da sala: a configuração `allowPaste` permite recusar colar texto no editor; o evento `question:paste`
  informa só o tamanho das colagens; a sala monta a linha do tempo de cada aluno por questão (itens concluídos,
  colagens e resposta aceita, em horários do servidor) e aponta colagens seguidas de vários itens concluídos
  (`buildPlayerTimeline`, `findPasteImpact`). A linha do tempo vai só para o professor e não altera a pontuação.
