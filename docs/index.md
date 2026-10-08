---
layout: home
title: CodeArena

hero:
  name: CodeArena
  text: Escreva o código. A checklist confirma. O relógio decide.
  tagline: Desafios de programação ao vivo para a turma inteira, no estilo Kahoot, validados automaticamente.
  actions:
    - theme: brand
      text: Primeiros passos
      link: /guia/comecar
    - theme: alt
      text: Guia do professor
      link: /content/authoring-guide
    - theme: alt
      text: Criar um plugin
      link: /plugins/creating-a-plugin

features:
  - title: Checklist que se marca sozinha
    details: Cada passo da questão é uma regra verificável. O aluno vê o progresso enquanto escreve e a resposta é enviada quando tudo estiver concluído.
    link: /agents/checklist-rules
    linkText: Regras de checklist
  - title: O servidor decide
    details: Tempo, pontuação e validação são do servidor. O XP combina corretude e velocidade, e o código do aluno nunca roda no processo principal.
    link: /architecture
    linkText: Arquitetura e segurança
  - title: Plugins por disciplina
    details: React Native com preview em celular, backend com cliente HTTP e um SDK para criar o seu, sem tocar no núcleo.
    link: /plugins/creating-a-plugin
    linkText: Criar um plugin
  - title: Questões de depuração
    details: O aluno recebe um código com bug e a checklist verifica o comportamento corrigido, com diff do que ele mudou.
    link: /agents/debug-questions
    linkText: Depuração
  - title: Revisão da turma
    details: Veja ao vivo quantos alunos concluíram cada item e, no relatório, onde a turma travou.
    link: /content/authoring-guide#revisao-da-turma-onde-cada-item-travou
    linkText: Revisão da turma
  - title: Feito para IA ajudar
    details: Schema em Zod, validador de packs e prompts prontos para agentes gerarem questões válidas em segundos.
    link: /agents/prompt-templates
    linkText: Prompts prontos
---

<section class="ca-section">

## Como funciona na prática

<div class="ca-grid">
  <figure>
    <img src="./images/rn-02-erro-no-preview.png" alt="Checklist com três itens concluídos e erro de sintaxe no preview" />
    <figcaption>React Native: erros aparecem no preview e a checklist mostra a linha do problema.</figcaption>
  </figure>
  <figure>
    <img src="./images/backend-01-requisicao-falhando.png" alt="Cliente HTTP mostrando status 503 e item da checklist falhando" />
    <figcaption>Backend: o cliente HTTP executa o código do aluno e a checklist testa o comportamento.</figcaption>
  </figure>
  <figure>
    <img src="./images/14-onde-a-turma-travou.png" alt="Painel Onde a turma travou, com o item mais difícil destacado" />
    <figcaption>Revisão da turma: o item que mais travou e a mediana de tempo de cada passo.</figcaption>
  </figure>
  <figure>
    <img src="./images/17-depuracao-o-que-mudei.png" alt="Diff entre o código com bug e o código do aluno" />
    <figcaption>Depuração: o aluno confere o que mudou em relação ao código com bug.</figcaption>
  </figure>
</div>

</section>
