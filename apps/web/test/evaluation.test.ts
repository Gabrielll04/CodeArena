import { describe, expect, it } from 'vitest';
import { DEFAULT_ROOM_SETTINGS, QuestionSchema, type SessionHistory } from '@codearena/schemas';
import { buildAiFile, parseAiReply } from '../src/lib/aiExport';
import { gradesCsv, pseudonym, studentGrades } from '../src/lib/evaluation';

const question = {
  ...QuestionSchema.parse({
    id: 'botao',
    title: 'Botão',
    prompt: 'Crie um botão "Enviar".',
    timeLimitSeconds: 60,
    baseXP: 100,
    speedBonusMax: 100,
    solution: 'export default function App() { return <Button title="Enviar" />; }',
    checklist: [
      { id: 'app', label: 'Criar o componente App', rule: { type: 'contains', value: 'function App' } },
      {
        id: 'nomes',
        label: 'Usar nomes claros',
        rule: { type: 'manual' },
        optional: true,
        capability: { type: 'capacidade-socioemocional', name: 'Organização' },
      },
    ],
  }),
  pluginId: 'react-native',
};

const record: SessionHistory = {
  id: '00000000-0000-0000-0000-000000000000',
  version: 1,
  mode: 'assessment',
  roomCode: '123456',
  packId: 'pack',
  packTitle: 'Prova 1',
  startedAt: Date.UTC(2026, 10, 9, 13),
  endedAt: Date.UTC(2026, 10, 9, 14),
  settings: { ...DEFAULT_ROOM_SETTINGS, mode: 'assessment' },
  questions: [question],
  players: [
    { id: 'p-ana', name: 'Ana Souza', avatar: 'bolt', delivered: true },
    { id: 'p-bia', name: 'Bia', avatar: 'cube', delivered: false },
  ],
  report: { roomCode: '123456', packTitle: 'Prova 1', startedAt: 0, endedAt: 0, questions: [], players: [] },
  answers: [
    { playerId: 'p-ana', questionId: 'botao', code: 'const s = "```";\nfunction App() {}', status: 'started', xp: 0, savedAt: 1, paste: null, auto: { app: true } },
    { playerId: 'p-bia', questionId: 'botao', code: '', status: 'empty', xp: 0, savedAt: null, paste: null },
  ],
  evaluations: [],
  autoCheck: 'done',
};

describe('arquivo para IA', () => {
  it('traz instruções, critérios e respostas, sem os nomes dos alunos', () => {
    const file = buildAiFile(record);
    expect(file).toContain('Metodologia SENAI de Educação');
    expect(file).toContain('| `app` | crítico | Criar o componente App | - |');
    expect(file).toContain('| `nomes` | desejável | Usar nomes claros | Capacidade socioemocional: Organização |');
    expect(file).toContain('### aluno-01');
    expect(file).toContain('Sem resposta.');
    expect(file).toContain('`app` passou');
    // A cerca do bloco é maior que as crases do código do aluno.
    expect(file).toContain('````tsx\nconst s = "```";');
    expect(file).not.toContain('Ana Souza');
    expect(buildAiFile(record, ['p-bia'])).not.toContain('### aluno-01');
  });

  it('lê a resposta da IA e transforma em marcas', () => {
    const reply = `Aqui está:\n\`\`\`json\n${JSON.stringify({
      avaliacoes: [
        { aluno: 'aluno-01', questao: 'botao', criterios: [{ id: 'app', atendido: true, justificativa: 'Tem function App.' }, { id: 'nomes', atendido: 'não' }] },
        { aluno: 'aluno-09', questao: 'botao', criterios: [] },
        { aluno: 'aluno-02', questao: 'botao', criterios: [{ id: 'inventado', atendido: false }] },
      ],
    })}\n\`\`\``;
    const result = parseAiReply(record, reply);
    expect(result.applied).toBe(2);
    expect(result.entries).toEqual([
      {
        playerId: 'p-ana',
        questionId: 'botao',
        marks: { app: { met: true, source: 'ia', note: 'Tem function App.' }, nomes: { met: false, source: 'ia' } },
      },
    ]);
    expect(result.warnings).toEqual(['Aluno desconhecido: aluno-09', 'Critério desconhecido em aluno-02 / botao: inventado']);
    expect(() => parseAiReply(record, 'não sei')).toThrowError('Não encontrei um JSON');
  });
});

describe('notas da atividade', () => {
  it('calcula pela MSEP e exporta o CSV com questões pendentes em branco', () => {
    const evaluated: SessionHistory = {
      ...record,
      evaluations: [
        { playerId: 'p-ana', questionId: 'botao', marks: { app: { met: true, source: 'professor' }, nomes: { met: false, source: 'ia' } }, updatedAt: 1 },
      ],
    };
    expect(studentGrades(evaluated, 'p-ana').activity).toEqual({ grade: 50, capped: false });
    expect(pseudonym(evaluated, 'p-bia')).toBe('aluno-02');
    expect(gradesCsv(evaluated)).toBe('﻿aluno;q1;nota;faltou_critico\n"Ana Souza";50;50;nao\n"Bia";;;nao');
  });
});
