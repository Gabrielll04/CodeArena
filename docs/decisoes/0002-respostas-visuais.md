# 0002: Respostas visuais com editor do plugin

- **Status:** aceita e implementada (SDK 0.1.1).
- **Data:** 2026-10-15

## Contexto

Até aqui toda resposta era código escrito no editor de código do app (Monaco). Matérias como redes (montar topologias
no estilo do Cisco Packet Tracer) ou eletrônica (montar circuitos no estilo do Tinkercad) precisam de outra forma de
responder: arrastar aparelhos, ligar cabos, configurar endereços, posicionar componentes.

Tudo o que vem depois do editor já funciona bem e não pode piorar: o envio da resposta por Socket.IO, o rascunho que
sobrevive a recarregar a página, a checklist que roda igual no navegador e no servidor, a validação oficial no
servidor, a pontuação e o modo isolado para plugins de terceiros.

## Decisão

1. **A resposta continua sendo texto.** Um plugin visual declara `answerFormat: "document"` e guarda o estado do editor
   como texto, em geral JSON (ex.: `{ "devices": [...], "links": [...] }`). O limite continua 50 mil caracteres.
2. **O plugin desenha o editor.** `ClientQuizPlugin.renderEditor(context)` substitui o editor de código em todos os
   lugares onde o aluno ou o professor editam ou veem uma resposta: na sala, na pré-visualização, no editor de questões
   (estado inicial, solução esperada e área de teste), no "Ver o que mudei" das questões de depuração e na solução
   esperada mostrada no fim da questão. O editor é controlado: recebe a resposta em `code` e devolve a nova por
   `onChange`, que fica ausente quando a resposta é somente leitura.
3. **Nada muda no pack nem no servidor.** `starterCode` e `solution` guardam o documento do plugin. A checklist usa
   validadores do plugin (`pluginRule`), que leem o documento. O servidor valida a resposta com os mesmos validadores,
   como já fazia com código.
4. **Mesmo modelo de segurança.** Plugin confiável desenha o editor na página, como já desenhava preview e painéis.
   Plugin no modo isolado desenha o editor num iframe `sandbox="allow-scripts"` (papel `editor` de `plugin-frame.html`),
   que só pode devolver texto por `postMessage`. O app confere a origem da mensagem, o tipo e o tamanho, e ignora
   mudanças quando a resposta está travada.
5. **Compatível com o que existe.** Os campos novos são opcionais. Plugin sem `renderEditor` continua com o editor de
   código, sem nenhuma mudança. Um CodeArena antigo, que não conhece `renderEditor`, mostra o documento no editor de
   código (o JSON), e a validação continua correta.

## Alternativas consideradas

- **Um tipo de resposta novo (objeto JSON) no schema e nos eventos.** Daria tipos mais precisos, mas mudaria o formato
  dos packs, os eventos da sala, a persistência e o modo isolado de uma vez, e quebraria os plugins publicados.
- **Simulação rodando no servidor durante a aula** (estado vivo da rede no servidor). Mais fiel a um simulador completo,
  mas cada aluno passaria a ocupar o servidor o tempo todo e o modo isolado precisaria de processos de longa duração.
  Com o documento, a simulação roda dentro dos validadores (funções puras), só quando a checklist é avaliada.
- **Embutir aplicativos externos (Packet Tracer, Tinkercad) em iframe.** Não há como ler a resposta para validar, e
  dependeria de contas e serviços de terceiros na sala de aula.

## Consequências

- Um plugin de redes ou de circuitos é um pacote npm comum: `answerFormat: "document"`, `renderEditor` e validadores
  que leem o documento. Não precisa de mudanças no núcleo.
- Validadores de plugins visuais devem ser funções puras sobre o documento. Assim rodam iguais no navegador e no
  servidor, e funcionam no modo isolado. A "simulação" (ex.: ping entre dois PCs) é feita pelo validador.
- Regras de texto (`contains`, `regex`) numa resposta visual geram aviso no editor de questões e no `validate:packs`:
  o JSON é gerado pelo editor e pode mudar de formato.
- O editor do plugin deve chamar `onChange` só em mudanças concluídas (soltar, ligar, confirmar), não a cada movimento,
  porque cada chamada reavalia a checklist.
- Referência funcionando: `e2e/fixtures/plugin-topologia` (PCs, switches, roteadores, cabos, IPs e ping simulado),
  testada no modo isolado pelo E2E "plugin visual no modo isolado".
