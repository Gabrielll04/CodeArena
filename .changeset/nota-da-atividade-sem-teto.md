---
'@codearena/core': minor
---

A nota da atividade (`msepActivityGrade`) passa a ser a média simples das notas das questões, sem o teto de 50 quando
falta um crítico em alguma questão: o teto continua valendo só dentro de cada questão. O campo `capped` foi trocado por
`missingCritical`, que só informa se faltou algum crítico.

Com todos os críticos atendidos, a questão agora vai de 70 a 100 (antes, de 50 a 100), conforme os desejáveis: os
críticos valem 70 e os desejáveis, 30. Nova constante `CRITICAL_BASE`.
