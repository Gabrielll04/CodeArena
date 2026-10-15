---
'@codearena/plugin-sdk': patch
'@codearena/plugin-host': patch
'@codearena/core': patch
---

Plugins com resposta visual: `answerFormat: "document"`, `answerLabel` e `renderEditor` no SDK permitem que um plugin
desenhe o próprio editor (topologias de rede, circuitos) no lugar do editor de código. A resposta continua sendo texto
e segue o mesmo caminho até o servidor. O modo isolado repassa os campos novos e desenha o editor num iframe sem
acesso ao app. `lintQuestion` avisa sobre regras de texto em respostas visuais. Mudança compatível: plugins sem
`renderEditor` não mudam.
