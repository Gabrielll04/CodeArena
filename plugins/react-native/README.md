# @codearena/plugin-react-native

Plugin oficial do [CodeArena](https://github.com/Gabrielll04/CodeArena) para questões de **React Native**: o aluno
escreve um componente e vê o resultado numa moldura de celular (react-native-web, num iframe isolado). A checklist usa
validadores de AST (`reactNativeHasComponent`, `reactNativeHasComponentProp`, `reactNativeUsesHook`,
`reactNativeCompiles`, entre outros).

```bash
pnpm codearena plugins add @codearena/plugin-react-native
```

| Arquivo | Conteúdo |
| --- | --- |
| `src/index.ts` | Validadores (navegador e servidor) |
| `src/ui/` | Preview em moldura de celular |
| `src/sandbox/` | Runtime carregado no iframe isolado do preview |
| `packs/` | Packs de exemplo (fundamentos e depuração) |
| `docs/agents.md` | Guia para agentes de IA gerarem questões |

Desenvolvimento: `pnpm install`, `pnpm test`, `pnpm build`.
