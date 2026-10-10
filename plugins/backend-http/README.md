# @codearena/plugin-backend-http

Plugin oficial do [CodeArena](https://github.com/Gabrielll04/CodeArena) para questões de **backend com Express**: o aluno
escreve um servidor, testa com o cliente HTTP ao lado do editor e a checklist faz requisições reais ao código dele
(`httpRequest`, `httpRouteDefined`, `backendCompiles`).

O código do aluno roda num Web Worker no navegador e, na validação oficial, num processo Node filho com permissões
restritas, ambiente vazio e limites de memória e tempo (`src/server/childProcessExecutor.ts`).

```bash
pnpm codearena plugins add @codearena/plugin-backend-http
```

| Arquivo | Conteúdo |
| --- | --- |
| `src/index.ts` | Validadores (navegador e servidor) |
| `src/ui/` | Cliente HTTP e executor em Web Worker |
| `src/server/` | Executor em processo isolado (validação oficial) |
| `src/runtime/` | Runtime Express em memória usado pelos dois executores |
| `packs/` | Packs de exemplo (básico e depuração) |
| `docs/agents.md` | Guia para agentes de IA gerarem questões |

Desenvolvimento: `pnpm install`, `pnpm test`, `pnpm build`.
