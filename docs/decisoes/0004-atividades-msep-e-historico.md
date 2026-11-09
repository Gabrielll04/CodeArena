# 0004: Atividades avaliadas pela MSEP e histórico do professor

- **Status:** aceita. Substitui em parte a [0003](0003-atividades-avaliativas.md).
- **Data:** 2026-11-09

## Contexto

A primeira versão das atividades (0003) dava a nota pela checklist automática e trazia o "projeto guiado", com cada
passo marcado sozinho. Em aula, quase todos tiraram 10: o objetivo virou seguir a checklist, e quem não completava não
avançava. A checklist automática ensina bem na competição, mas não avalia.

Os professores usam a Metodologia SENAI de Educação Profissional (MSEP): critérios críticos e desejáveis, ligados a
capacidades e conhecimentos. Querem avaliar à mão ou com a IA de sua preferência, e guardar as respostas e o
desempenho de todas as sessões.

## Decisão

1. **Atividade sem correção automática.** Na sala `mode: "assessment"`, o aluno vê o problema e os critérios, mas nada é
   marcado sozinho e nada é validado durante a atividade. A resposta é salva como está (`assessment:save`) e o aluno
   pode entregar (`assessment:deliver`). Sem placar e sem XP, como antes.
2. **Critérios MSEP na própria checklist.** Item obrigatório é crítico; item opcional é desejável. O campo `capability`
   diz o que o critério avalia (capacidade técnica, socioemocional ou conhecimento). A regra `{ "type": "manual" }`
   marca critérios que só uma pessoa decide; ela nunca é marcada sozinha e fica fora da aceitação automática das
   competições.
3. **Quem avalia é o professor.** Ele marca cada critério como atendido ou não. Pode usar como ponto de partida:
   - os testes automáticos: depois do encerramento, o servidor roda a checklist oficial no código salvo; o resultado é
     só uma sugestão;
   - uma IA: o CodeArena gera um arquivo Markdown (turma ou aluno) com instruções, questões, critérios e respostas, e lê
     a resposta em JSON. Os alunos vão para a IA só como `aluno-01`, `aluno-02`; os nomes não saem do CodeArena.
4. **Nota MSEP de 0 a 100.** Por questão: todos os críticos atendidos dão de 50 a 100, conforme a fração de desejáveis
   atendidos (100 sem desejáveis); faltou algum crítico, a fração de todos os critérios aplicada a 50, nunca acima de
   50. Atividade: média das questões, limitada a 50 se faltou crítico em alguma questão. Questão com critério sem marca
   fica pendente. As constantes ficam em `packages/core/src/grading.ts`.
5. **Histórico persistido.** Toda sessão encerrada (competição ou atividade, inclusive as abandonadas ou interrompidas
   pelo desligamento do servidor) vira um arquivo JSON em `<dataDir>/history`, com questões, alunos, placar, último
   código de cada aluno em cada questão e as avaliações.
6. **Histórico por professor, sem login.** O navegador do professor gera uma chave aleatória e a envia ao criar a sala;
   o servidor guarda só o hash. A API do histórico exige a chave no cabeçalho `x-teacher-key` e responde 404 para
   sessões de outra chave. Para usar outro navegador, o professor copia a chave.
7. **O tipo "guided" sai.** Packs antigos continuam abrindo: `"guided"` é lido como `"build"` e `weight` é ignorado.

## Consequências

- Nenhuma nota depende do navegador do aluno: marcas vêm do professor (ou da IA que ele escolheu e revisou) e a conta é
  feita pelas mesmas funções no servidor e no navegador.
- O código dos alunos fica guardado em disco. Quem administra o servidor deve tratar `<dataDir>/history` como dado
  pessoal (backup e acesso restrito). O professor pode excluir uma sessão do histórico.
- A chave no navegador não é uma conta: quem copiar a chave vê o histórico. Login de verdade fica para quando houver
  vários professores no mesmo servidor com necessidade de separar acesso.
- A verificação automática roda em segundo plano, duas respostas por vez, e retoma se o servidor reiniciar.
