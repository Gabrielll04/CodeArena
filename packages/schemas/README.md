# @codearena/schemas

Schemas [Zod](https://zod.dev) e tipos compartilhados do [CodeArena](https://github.com/Gabrielll04/CodeArena):
o formato JSON dos question packs (`QuestionPackSchema`), a versão pública das questões (sem a solução) e os eventos
em tempo real entre servidor e navegador.

```ts
import { parseQuestionPack } from '@codearena/schemas';

const result = parseQuestionPack(json);
if (!result.ok) console.log(result.issues); // [{ path: 'questions[0].checklist[1].rule.pattern', message: 'Regex inválida' }]
```

Formato completo: [Schema do question pack](https://github.com/Gabrielll04/CodeArena/blob/HEAD/docs/agents/question-pack-schema.md).
