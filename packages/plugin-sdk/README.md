# @codearena/plugin-sdk

Contrato para criar plugins do [CodeArena](https://github.com/Gabrielll04/CodeArena): validadores de checklist,
painéis de preview e ferramentas para uma disciplina nova.

```ts
import { definePlugin, type QuizPlugin } from '@codearena/plugin-sdk';
import type { ClientPluginEntry } from '@codearena/plugin-sdk/ui';
```

- `@codearena/plugin-sdk`: `QuizPlugin`, `ChecklistValidator`, `definePlugin`, `PluginRegistry`, utilitários.
- `@codearena/plugin-sdk/ui`: `ClientQuizPlugin` (painéis React), `ClientPluginEntry`, `SandboxEntry`.

Comece pelo gerador: `npm create codearena-plugin@latest`. Guia completo:
[Criando um plugin](https://github.com/Gabrielll04/CodeArena/blob/HEAD/docs/plugins/creating-a-plugin.md).
