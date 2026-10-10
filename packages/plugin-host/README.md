# @codearena/plugin-host

Carrega os plugins de uma instalação do [CodeArena](https://github.com/Gabrielll04/CodeArena):

- lê `codearena.config.json`, encontra cada pacote e valida o manifesto `codearena` do `package.json`;
- recusa plugins com faixa de SDK incompatível, sem impedir os outros;
- `@codearena/plugin-host/vite`: plugin do Vite que inclui só os plugins configurados e os carrega sob demanda;
- comando `codearena plugins add|remove|list`.

Detalhes: [Arquitetura](https://github.com/Gabrielll04/CodeArena/blob/HEAD/docs/architecture.md#nucleo-plugins-e-packs).
