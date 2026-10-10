# @codearena/create-plugin

Cria um plugin do [CodeArena](https://github.com/Gabrielll04/CodeArena) num repositório novo, já com validador de
exemplo, painel React, pack de exemplo, testes, guia para agentes de IA e CI.

```bash
npm create @codearena/plugin@latest
# ou, sem perguntas:
npm create @codearena/plugin@latest codearena-plugin-eletrica -- --id eletrica --name "Circuitos elétricos"
```

Depois: `npm install && npm test`. Para testar numa instalação do CodeArena, na pasta dela:
`pnpm codearena plugins add ../codearena-plugin-eletrica`.
