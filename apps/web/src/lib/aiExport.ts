import { z } from 'zod';
import type { CriterionMark, EvaluationEntry, HistoryAnswer, ResolvedQuestion, SessionHistory } from '@codearena/schemas';
import { CAPABILITY_LABEL } from './criteria';
import { answerIndex, answerKey, pseudonym } from './evaluation';

/* ------------------------------------------------------------------ */
/* Arquivo para IA                                                      */
/* ------------------------------------------------------------------ */

const LANGUAGE: Record<string, string> = { 'react-native': 'tsx', 'backend-http': 'js' };

/** Bloco de código com cerca maior que qualquer sequência de crases do conteúdo. */
function fenced(code: string, language: string): string {
  const longest = Math.max(2, ...[...code.matchAll(/`+/g)].map((m) => m[0].length));
  const fence = '`'.repeat(longest + 1);
  return `${fence}${language}\n${code.replace(/\n+$/, '')}\n${fence}`;
}

const cell = (text: string) => text.replace(/\|/g, '\\|').replace(/\n+/g, ' ');

function questionSection(question: ResolvedQuestion, index: number): string {
  const language = LANGUAGE[question.pluginId] ?? '';
  const rows = question.checklist.map((item) => {
    const capability = item.capability ? `${CAPABILITY_LABEL[item.capability.type]}: ${item.capability.name}` : '-';
    return `| \`${item.id}\` | ${item.optional ? 'desejável' : 'crítico'} | ${cell(item.label)} | ${cell(capability)} |`;
  });
  return [
    `### Questão ${index + 1}: ${question.title ?? question.id} (\`${question.id}\`)`,
    '',
    `**Enunciado:** ${question.prompt}`,
    ...(question.starterCode.trim() ? ['', '**Código inicial entregue ao aluno:**', '', fenced(question.starterCode, language)] : []),
    ...(question.solution.trim()
      ? ['', '**Solução de referência** (um exemplo; outras soluções corretas também atendem):', '', fenced(question.solution, language)]
      : []),
    '',
    '**Critérios de avaliação:**',
    '',
    '| id | Tipo | Critério | Capacidade ou conhecimento |',
    '| --- | --- | --- | --- |',
    ...rows,
  ].join('\n');
}

function answerSection(question: ResolvedQuestion, index: number, answer: HistoryAnswer | undefined): string {
  const heading = `#### Questão ${index + 1} (\`${question.id}\`)`;
  if (!answer || answer.status === 'empty') return `${heading}\n\nSem resposta.`;
  const auto = answer.auto
    ? Object.entries(answer.auto)
        .map(([id, passed]) => `\`${id}\` ${passed ? 'passou' : 'não passou'}`)
        .join('; ')
    : '';
  return [
    heading,
    '',
    ...(auto ? [`Testes automáticos do CodeArena (só um indício): ${auto}.`, ''] : []),
    fenced(answer.code, LANGUAGE[question.pluginId] ?? ''),
  ].join('\n');
}

const INSTRUCTIONS = `## Sua tarefa

Você vai avaliar respostas de alunos a uma atividade de programação, seguindo a Metodologia SENAI de Educação
Profissional (MSEP). Para cada aluno e cada questão, decida se a resposta atende a cada critério de avaliação.

- Avalie só o que está escrito no código do aluno.
- Atendido (true) só se a resposta cumpre o critério por completo. Parcial conta como não atendido (false).
- Sem resposta: todos os critérios não atendidos.
- A solução de referência é só um exemplo. Outras soluções corretas também atendem.
- Os testes automáticos são um indício, não a decisão.
- Não calcule nota: o CodeArena calcula a partir das suas decisões. Critérios críticos são obrigatórios; desejáveis
  aumentam a nota.
- Escreva a justificativa em português, em uma frase curta, citando o que viu no código.

## Formato da resposta

Responda somente com um bloco JSON neste formato, com todos os alunos e questões deste arquivo:

\`\`\`json
{
  "avaliacoes": [
    {
      "aluno": "aluno-01",
      "questao": "id-da-questao",
      "criterios": [
        { "id": "id-do-criterio", "atendido": true, "justificativa": "Frase curta." }
      ]
    }
  ]
}
\`\`\``;

/**
 * Arquivo em Markdown para qualquer IA avaliar as respostas: instruções, questões com critérios e o código de cada
 * aluno. Os alunos aparecem só pelo código (aluno-01, aluno-02...): os nomes não saem do CodeArena.
 */
export function buildAiFile(record: SessionHistory, playerIds?: string[]): string {
  const answers = answerIndex(record);
  const players = record.players.filter((p) => !playerIds || playerIds.includes(p.id));
  const date = new Date(record.startedAt).toLocaleDateString('pt-BR');
  return [
    `# Avaliação da atividade "${record.packTitle}"`,
    '',
    `Aplicada em ${date}. ${players.length} ${players.length === 1 ? 'aluno' : 'alunos'}, ${record.questions.length} ${record.questions.length === 1 ? 'questão' : 'questões'}.`,
    '',
    INSTRUCTIONS,
    '',
    '## Questões',
    '',
    record.questions.map(questionSection).join('\n\n'),
    '',
    '## Respostas',
    '',
    players
      .map((player) =>
        [
          `### ${pseudonym(record, player.id)}`,
          '',
          record.questions.map((q, i) => answerSection(q, i, answers.get(answerKey(player.id, q.id)))).join('\n\n'),
        ].join('\n'),
      )
      .join('\n\n'),
    '',
  ].join('\n');
}

/* ------------------------------------------------------------------ */
/* Resposta da IA                                                       */
/* ------------------------------------------------------------------ */

const Verdict = z.union([
  z.boolean(),
  z
    .string()
    .trim()
    .toLowerCase()
    .refine((v) => /^(true|false|sim|não|nao)$/.test(v), 'use true ou false')
    .transform((v) => v === 'true' || v === 'sim'),
]);

const AiReplySchema = z.object({
  avaliacoes: z.array(
    z.object({
      aluno: z.string(),
      questao: z.string(),
      criterios: z.array(z.object({ id: z.string(), atendido: Verdict, justificativa: z.string().optional() })),
    }),
  ),
});

/** Acha o JSON na resposta da IA: num bloco de código ou solto no texto. */
function extractJson(text: string): unknown {
  for (const match of text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)) {
    try {
      return JSON.parse(match[1]!);
    } catch {
      // tenta o próximo bloco
    }
  }
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('Não encontrei um JSON na resposta.');
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new Error('O JSON da resposta está incompleto ou inválido.');
  }
}

export interface AiImport {
  entries: EvaluationEntry[];
  /** Critérios avaliados que serão aplicados. */
  applied: number;
  warnings: string[];
}

/** Converte a resposta da IA em marcas para salvar. Alunos, questões e critérios desconhecidos viram avisos. */
export function parseAiReply(record: SessionHistory, text: string): AiImport {
  const parsed = AiReplySchema.safeParse(extractJson(text));
  if (!parsed.success) {
    const issue = parsed.error.issues[0]!;
    throw new Error(`Formato inesperado em ${issue.path.join('.') || 'resposta'}: ${issue.message}`);
  }
  const players = new Map(record.players.map((p) => [pseudonym(record, p.id), p.id]));
  const questions = new Map(record.questions.map((q) => [q.id, q]));
  const warnings: string[] = [];
  const entries = new Map<string, EvaluationEntry>();
  let applied = 0;

  for (const evaluation of parsed.data.avaliacoes) {
    const playerId = players.get(evaluation.aluno.trim());
    const question = questions.get(evaluation.questao.trim());
    if (!playerId) {
      warnings.push(`Aluno desconhecido: ${evaluation.aluno}`);
      continue;
    }
    if (!question) {
      warnings.push(`Questão desconhecida: ${evaluation.questao}`);
      continue;
    }
    const key = answerKey(playerId, question.id);
    const entry = entries.get(key) ?? { playerId, questionId: question.id, marks: {} };
    for (const criterion of evaluation.criterios) {
      if (!question.checklist.some((item) => item.id === criterion.id)) {
        warnings.push(`Critério desconhecido em ${evaluation.aluno} / ${question.id}: ${criterion.id}`);
        continue;
      }
      const note = criterion.justificativa?.trim().slice(0, 1000);
      const mark: CriterionMark = { met: criterion.atendido, source: 'ia', ...(note ? { note } : {}) };
      entry.marks[criterion.id] = mark;
      applied++;
    }
    entries.set(key, entry);
  }
  return { entries: [...entries.values()].filter((e) => Object.keys(e.marks).length > 0), applied, warnings };
}
