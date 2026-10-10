# Changesets

Toda mudança em `packages/schemas`, `packages/plugin-sdk`, `packages/core` ou `packages/plugin-host` que vai para o npm
precisa de um arquivo aqui. Crie com:

```bash
pnpm changeset
```

Os quatro pacotes sobem de versão juntos (mesmo número), para o autor de plugin só precisar de uma faixa de SDK.
Escolha os pacotes, o tipo de versão e escreva uma nota curta em português:

- **patch**: correção sem mudar o contrato;
- **minor**: algo novo, compatível com plugins existentes;
- **major**: quebra de contrato. A nota precisa dizer **o que o autor de plugin deve mudar** (nota de migração).

Enquanto os pacotes estão em `0.x`, uma quebra de contrato sobe o `minor` (`0.1.0` para `0.2.0`), e os plugins
declaram `"sdk": "^0.1.0"`.

Os plugins oficiais (`plugins/*`) ficam de fora (`ignore`): pela decisão 0001 eles são publicados a partir dos
próprios repositórios. Quando uma mudança no SDK exigir uma nova faixa (ex.: `0.1.x` para `0.2.0`), atualize no mesmo
PR o `codearena.sdk` e o `peerDependencies` de cada plugin oficial; o CI recusa plugins com faixa incompatível.

Ao chegar na branch principal, o workflow `release.yml` abre um PR "Versionar pacotes"; ao fazer merge dele, os pacotes
são publicados no npm.
