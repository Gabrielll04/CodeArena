# {{package}}

Plugin **{{name}}** (`{{id}}`) para o [CodeArena](https://github.com/Gabrielll04/CodeArena).

## Desenvolvimento

```bash
npm install
npm test          # validadores e packs de exemplo
npm run dev       # build contínuo em dist/
```

Para testar numa instalação do CodeArena sem publicar, na pasta do CodeArena:

```bash
pnpm codearena plugins add ../{{dir}}
pnpm dev
```

## Estrutura

| Arquivo | Conteúdo |
| --- | --- |
| `src/index.ts` | Definição do plugin e validadores (navegador e servidor) |
| `src/ui.tsx` | Painéis React mostrados ao lado do editor |
| `packs/*.json` | Packs de exemplo, listados em `codearena.packs` no `package.json` |
| `docs/agents.md` | Guia para agentes de IA gerarem packs deste plugin |

Guia completo: [Criando um plugin](https://github.com/Gabrielll04/CodeArena/blob/HEAD/docs/plugins/creating-a-plugin.md).

## Publicar

```bash
npm publish --access public
```

Quem usa o CodeArena instala com `pnpm codearena plugins add {{package}}`.
