---
'@codearena/schemas': patch
'@codearena/core': patch
---

Na atividade, o snapshot do aluno traz só ele mesmo em `players` e a contagem em `playerCount` (novo); entradas e saídas
(`player:joined`, `player:left`) vão só para o professor. O nome do aluno aceita até 60 caracteres e apóstrofo, para nome
completo ou RA.
