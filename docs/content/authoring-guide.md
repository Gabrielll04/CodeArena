# Guia de autoria para professores

## Três formas de criar conteúdo

1. **Importar JSON** - Biblioteca > Importar JSON. Cole o conteúdo ou arraste o arquivo.
   O app valida antes de salvar e lista cada campo incorreto (ex.: `questions[0].checklist[1].rule.pattern: Regex inválida`).
2. **Editor manual** - Biblioteca > Novo pack, ou Duplicar um pack de exemplo.
3. **Agente de IA** - use os prompts de `docs/agents/prompt-templates.md` e importe o JSON gerado.

Packs de exemplo (marcados "Exemplo") são somente leitura: use "Duplicar" para adaptar.
Qualquer pack pode ser exportado como JSON (ícone de download) para versionar, compartilhar ou reimportar.

## Editor manual

Para cada questão:

- **Enunciado, tempo e XP.** O editor mostra quanto XP vale uma resposta com metade do tempo restante.
- **Código inicial e solução esperada.** A solução é revelada aos alunos ao fim da questão.
- **Checklist.** Para cada item: texto (no imperativo), tipo de regra, parâmetros, dica opcional e se é opcional.
  - "Padrões comuns de regex" preenche padrões robustos: exporta componente, usa componente, define prop, cria rota, retorna status, importa módulo, função assíncrona.
  - "Validador do plugin" lista os validadores disponíveis com descrição e parâmetros de exemplo.
- **Testar a checklist.** Edite o código de teste (comece com "Usar solução") e veja cada item marcar ao vivo.
  "Validar no servidor" roda exatamente a validação usada nas salas.
- **Qualidade da questão.** Avisos automáticos: solução que não completa a checklist, código inicial que já completa,
  regex que aceita texto vazio, textos curtos demais.
- **Pré-visualizar como aluno.** Abre a tela do aluno com editor, checklist e preview, sem cronômetro.

## Conduzindo a aula

1. Biblioteca > Abrir sala: escolha as questões e as opções (modo discreto, bônus de sequência).
2. Projete a tela do lobby: ela mostra o endereço e o código de 6 dígitos.
3. "Iniciar questão" dispara uma contagem de 3 s para todos.
4. Durante a questão você vê quantos itens cada aluno concluiu, sem ver o código.
5. A questão termina quando todos os conectados acertam, quando o tempo acaba ou em "Encerrar questão agora".
6. O placar mostra XP ganho, mudança de posição e a solução esperada.
7. "Encerrar sessão" gera o relatório (XP, acertos, tempo médio por aluno e acertos por questão), exportável em CSV e JSON.

**Modo discreto:** alunos veem só o top 3 e a própria posição, sem pódio. Use quando a competição aberta puder constranger.

## Boas práticas

- 3 a 6 questões por aula curta; aumente a dificuldade aos poucos.
- Cada item da checklist deve ser algo que o aluno reconhece no próprio código.
- Teste com a solução **e** com uma resposta errada plausível antes da aula.
- Prefira validadores do plugin a regex quando houver um adequado.
