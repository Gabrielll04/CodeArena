# 0001: Plugins como pacotes separados; packs como conteúdo

- **Status:** aceita (etapa 1 da migração concluída: `codearena.config.json` e carregamento sob demanda)
- **Data:** 2026-10-10

## Contexto

Os plugins `react-native` e `backend-http` vivem em `plugins/` dentro do repositório principal e são importados de forma
fixa em `apps/web/src/plugins/registry.tsx` e `apps/server/src/plugins.ts`. Consequências:

- **Peso para todos.** As dependências de cada plugin entram no build de quem não o usa. Hoje `react-native-web`,
  `sucrase` e o parser do Babel vão para o bundle mesmo de quem só dá aula de backend.
- **Não escala para outras áreas.** Um plugin de elétrica (simulador e editor de circuito) traria bibliotecas que a maioria
  das instalações nunca usaria.
- **Contribuir exige mexer no núcleo.** Um plugin novo precisa de um PR neste repositório e de linhas em arquivos do app.
- **Pack e plugin se misturam.** Os packs de exemplo ficam em `content/packs/`, no núcleo, embora dependam de plugins específicos.

## Decisão

1. **O repositório principal contém só o núcleo:** `apps/web`, `apps/server`, `packages/schemas`, `packages/plugin-sdk` e
   `packages/core`. Os três pacotes são publicados no npm.
2. **Cada plugin é um pacote npm em repositório próprio.** Os oficiais continuam sendo **`react-native`** e
   **`backend-http`** (servidores Express).
3. **Cada instalação declara os plugins que usa** em `codearena.config.json`. Só eles são instalados, carregados no
   servidor e incluídos no build do navegador. No navegador, cada plugin é carregado sob demanda.
4. **Plugin é código; pack é conteúdo.** Packs são JSON que apontam para um `pluginId`. Os packs de exemplo de um plugin
   são distribuídos **dentro do pacote do plugin**; packs de professores são dados da instalação.
5. **Contrato versionado.** O plugin declara a faixa do SDK que suporta; o núcleo recusa, com mensagem clara, um plugin
   incompatível.

## Consequências

- Quem dá aula de React Native não baixa nada de backend, e vice-versa. Um plugin de elétrica não pesa para ninguém mais.
- Qualquer pessoa cria um plugin sem PR no núcleo: só precisa do SDK publicado.
- Mudanças no SDK passam a exigir versionamento semântico e notas de migração.
- Habilitar um plugin no navegador exige **novo build** do frontend (a lista entra no bundle). Um comando vai automatizar
  `instalar + configurar + build`.
- Os testes E2E do núcleo passam a instalar os plugins oficiais como dependências de desenvolvimento.
- Código de plugin é **código confiável**, como qualquer dependência npm: roda no servidor e na página do app. Só instale
  plugins em que você confia. Plugins de terceiros não confiáveis exigirão o modo iframe (etapa futura).

## Alternativas consideradas

- **Monorepo com plugins opcionais (carregamento sob demanda, tudo no mesmo repositório).** Resolve o peso do bundle, mas
  não o crescimento do repositório nem a necessidade de PR no núcleo. Vira a **primeira etapa** da migração.
- **Plugins carregados em tempo de execução por URL (module federation).** Dispensaria o rebuild, mas executaria código
  remoto sem revisão dentro do app. Adiado até existir o modo iframe.
- **Um único repositório com todos os plugins oficiais.** Mais simples de manter no começo, mas recria o problema de
  dependências para quem contribui. Pode ser reavaliado se os plugins oficiais compartilharem muito código.

Detalhes do modelo e das etapas: [Arquitetura > Núcleo, plugins e packs](../architecture.md#nucleo-plugins-e-packs).
