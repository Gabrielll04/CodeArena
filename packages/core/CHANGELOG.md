# @codearena/core

## 0.1.1

### Patch Changes

- 3e221fa: Integridade da sala: a configuração `allowPaste` permite recusar colar texto no editor; o evento `question:paste`
  informa só o tamanho das colagens; a sala monta a linha do tempo de cada aluno por questão (itens concluídos,
  colagens e resposta aceita, em horários do servidor) e aponta colagens seguidas de vários itens concluídos
  (`buildPlayerTimeline`, `findPasteImpact`). A linha do tempo vai só para o professor e não altera a pontuação.
