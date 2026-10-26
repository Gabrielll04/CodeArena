# 0003: Atividades avaliativas e projetos guiados

- **Status:** aceita.
- **Data:** 2026-10-26

## Contexto

O CodeArena foi feito para aulas competitivas: todos na mesma questão, placar, XP por velocidade. Professores também
querem usá-lo em atividades que valem nota, feitas em aula, sem a pressão do placar, mas mantendo a sensação de
evolução (checklist e torre subindo) e com a nota de cada aluno registrada no fim, para lançar no diário ou no Google
Classroom. Querem também questões em que o aluno constrói algo maior seguindo passos ("crie o componente", "importe as
funções"...), vendo o resultado esperado.

## Decisão

1. **Tudo no próprio CodeArena, não num projeto à parte.** Editor, plugins, checklist, validação no servidor, linha do
   tempo e relatório já existem; um projeto separado duplicaria tudo isso.
2. **Modo da sala: "Atividade avaliativa"** (`settings.mode = "assessment"`), escolhido ao abrir a sala, com uma
   duração em minutos:
   - todas as questões abrem juntas e cada aluno navega entre elas no próprio ritmo, até o prazo ou até o professor
     encerrar;
   - sem placar, sem XP, sem bônus de velocidade e sem pódio;
   - a resposta de cada questão é salva automaticamente enquanto o aluno progride; o servidor valida cada envio e guarda
     a melhor versão de cada questão;
   - o professor acompanha cada aluno em cada questão e, no fim, recebe as notas e exporta em CSV.
3. **Nota de 0 a 10, com uma casa decimal** (ex.: 7,5). Nota da questão = itens obrigatórios confirmados pelo servidor,
   ponderados pelo `weight` de cada item (padrão 1), na melhor versão enviada. Nota da atividade = média das questões.
   Só o professor vê as notas; o aluno vê quais questões concluiu.
4. **Tipo de questão "Projeto guiado"** (`kind: "guided"`): a checklist vira uma sequência de passos, cada um com a sua
   instrução (`hint`), e a questão pode mostrar uma imagem do resultado esperado (`goalImage`). Funciona nos dois modos
   e com todos os plugins, porque usa o mesmo motor de checklist.
5. **Em aula, sem persistência nova.** A atividade vive enquanto a sala vive, como hoje. Atividades de casa com prazo de
   dias (sala salva em disco) ficam para depois, se forem necessárias.

## Consequências

- A pontuação continua sendo do servidor: a nota usa só itens confirmados pela validação oficial, nunca o progresso
  informado pelo navegador.
- O envio automático aumenta o número de validações por aluno (uma por avanço na checklist). O limite de envios por
  aluno continua valendo.
- O CSV de notas usa `;` como separador e vírgula decimal, o formato que planilhas em português abrem direto.
- Integração direta com o Google Classroom (login Google e API) não faz parte desta decisão; o CSV cobre o lançamento.
