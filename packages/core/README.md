# @codearena/core

Motor do [CodeArena](https://github.com/Gabrielll04/CodeArena), sem dependência de transporte: avaliação da checklist
(`evaluateChecklist`), cálculo de XP (`calculateXP`), placar, ciclo de vida da sala e avisos de autoria (`lintQuestion`).

Plugins usam este pacote nos testes para conferir que os validadores e os packs de exemplo funcionam:

```ts
import { evaluateChecklist, lintQuestion } from '@codearena/core';
```
